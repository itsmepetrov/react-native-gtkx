// A deliberately tiny "flattened Reanimated": the whole point of the spike.
//
// Reanimated exists to move work off the JS thread, because on mobile JS and
// UI are separate threads and crossing between them is expensive. Here GTK's
// main loop IS the JS thread, so every mechanism that exists to cross a
// thread boundary collapses into nothing:
//
//   - a "worklet" is an ordinary function — it is already on the right thread;
//   - runOnUI / runOnJS are direct calls;
//   - a SharedValue is an ordinary observable box;
//   - measure() is synchronous because there is nothing to synchronise with.
//
// The one thing that does NOT collapse is dependency tracking: something has
// to re-run a mapper when a shared value is written. Reanimated solves it
// statically, with the __closure object its Babel plugin emits. With one
// runtime we can do better and track dynamically — record which shared
// values a mapper actually reads while it runs. That is strictly more
// precise (a conditional read is tracked correctly) and needs no plugin.
//
// SCOPE: this is a spike, not an implementation. It covers the load-bearing
// core only, and it deliberately does not handle re-entrancy, style shapes
// that change between runs, or anything the platform cannot drive
// imperatively (see FINDINGS.md).
import { useRef } from "react"
import { Animated } from "react-native"

type AnimatedLeaf = number | string

type Listener = (state: { value: AnimatedLeaf }) => void

// The whole thesis in one module-level variable. No runtime, no threads: the
// mapper currently running, so reads of `.value` can register a dependency.
let activeMapper: (() => void) | null = null

const track = <T,>(mapper: () => void, read: () => T): T => {
  const previous = activeMapper
  activeMapper = mapper
  try {
    return read()
  } finally {
    activeMapper = previous
  }
}

// withTiming() returns a description, not a value — exactly as upstream does,
// where assigning it to `sv.value` is what starts the animation. Upstream
// types it as the animated type itself, so consumer source reads naturally;
// the cast below mirrors that trick rather than inventing a different API.
type AnimationSpec = {
  __flatAnimation: true
  toValue: number
  duration: number
}

const isAnimationSpec = (value: unknown): value is AnimationSpec =>
  typeof value === "object" &&
  value !== null &&
  (value as AnimationSpec).__flatAnimation === true

export const withTiming = (
  toValue: number,
  config?: { duration?: number },
): number =>
  ({
    __flatAnimation: true,
    toValue,
    duration: config?.duration ?? 300,
  }) as unknown as number

// The frame driver is the platform's OWN Animated engine — the point being
// that this layer adds no timer, no scheduler and no second clock. It sits
// on top of what already ships.
const drive = (
  from: number,
  spec: AnimationSpec,
  onValue: (value: number) => void,
): (() => void) => {
  const driver = new Animated.Value(from)
  const id = driver.addListener(({ value }) => {
    onValue(value)
  })
  const animation = Animated.timing(driver, {
    toValue: spec.toValue,
    duration: spec.duration,
  })
  animation.start(() => {
    driver.removeListener(id)
  })
  return () => {
    animation.stop()
    driver.removeListener(id)
  }
}

export type SharedValue<T> = {
  value: T
  get(): T
  set(next: T): void
  // These three are what make a SharedValue a platform AnimatedNode. The
  // platform recognises animated nodes STRUCTURALLY (isAnimatedNode in
  // src/components/animated.tsx checks for addListener + __getValue), so a
  // shared value shaped like this is driven by the existing Animated.View
  // with no change to library code whatsoever. That is the single most
  // important finding of this spike.
  addListener(callback: Listener): string
  removeListener(id: string): void
  __getValue(): T
}

export const makeMutable = <T,>(initial: T): SharedValue<T> => {
  let current = initial
  const mappers = new Set<() => void>()
  const listeners = new Map<string, Listener>()
  let nextListenerId = 1
  let cancelAnimation: (() => void) | null = null

  const commit = (next: T): void => {
    if (Object.is(next, current)) {
      return
    }
    current = next
    for (const listener of [...listeners.values()]) {
      listener({ value: current as AnimatedLeaf })
    }
    for (const mapper of [...mappers]) {
      mapper()
    }
  }

  const shared: SharedValue<T> = {
    get value() {
      if (activeMapper) {
        mappers.add(activeMapper)
      }
      return current
    },
    set value(next: T) {
      cancelAnimation?.()
      cancelAnimation = null
      if (isAnimationSpec(next)) {
        cancelAnimation = drive(current as number, next, (value) => {
          commit(value as T)
        })
        return
      }
      commit(next)
    },
    get() {
      return shared.value
    },
    set(next: T) {
      shared.value = next
    },
    addListener(callback) {
      const id = String(nextListenerId++)
      listeners.set(id, callback)
      return id
    },
    removeListener(id) {
      listeners.delete(id)
    },
    __getValue() {
      return current
    },
  }

  return shared
}

export const useSharedValue = <T,>(initial: T): SharedValue<T> => {
  const ref = useRef<SharedValue<T> | null>(null)
  if (ref.current === null) {
    ref.current = makeMutable(initial)
  }
  return ref.current
}

// A style leaf produced by a mapper. It is an AnimatedNode too, so the value
// reaches GTK through the same path Animated.Value already uses.
type DerivedLeaf = {
  addListener(callback: Listener): string
  removeListener(id: string): void
  __getValue(): AnimatedLeaf
  push(value: AnimatedLeaf): void
}

const makeDerivedLeaf = (initial: AnimatedLeaf): DerivedLeaf => {
  let current = initial
  const listeners = new Map<string, Listener>()
  let nextListenerId = 1
  return {
    addListener(callback) {
      const id = String(nextListenerId++)
      listeners.set(id, callback)
      return id
    },
    removeListener(id) {
      listeners.delete(id)
    },
    __getValue() {
      return current
    },
    push(value) {
      if (Object.is(value, current)) {
        return
      }
      current = value
      for (const listener of [...listeners.values()]) {
        listener({ value: current })
      }
    },
  }
}

type StyleObject = Record<string, unknown>

const leafKey = (index: number, key: string): string =>
  `transform.${index}.${key}`

const isLeaf = (value: unknown): value is AnimatedLeaf =>
  typeof value === "number" || typeof value === "string"

// The mapper returns plain numbers, so on the first run we replace every
// animatable leaf with a node and keep the mapping; later runs only push new
// values into those nodes. Nothing re-renders React.
//
// Only `opacity` and `transform` are converted, because those are the only
// two things this platform can currently write to a widget imperatively.
// Everything else stays a literal and is therefore frozen at first render —
// the real cost boundary, measured and written up in FINDINGS.md.
const buildNodeBackedStyle = (
  source: StyleObject,
  nodes: Map<string, DerivedLeaf>,
): StyleObject => {
  const style: StyleObject = { ...source }

  if (typeof source.opacity === "number") {
    const node = makeDerivedLeaf(source.opacity)
    nodes.set("opacity", node)
    style.opacity = node
  }

  if (Array.isArray(source.transform)) {
    style.transform = (source.transform as StyleObject[]).map((part, index) => {
      const key = Object.keys(part)[0]
      if (key === undefined || !isLeaf(part[key])) {
        return part
      }
      const node = makeDerivedLeaf(part[key])
      nodes.set(leafKey(index, key), node)
      return { [key]: node }
    })
  }

  return style
}

const pushLeaves = (
  source: StyleObject,
  nodes: Map<string, DerivedLeaf>,
): void => {
  if (typeof source.opacity === "number") {
    nodes.get("opacity")?.push(source.opacity)
  }
  if (Array.isArray(source.transform)) {
    ;(source.transform as StyleObject[]).forEach((part, index) => {
      const key = Object.keys(part)[0]
      if (key !== undefined && isLeaf(part[key])) {
        nodes.get(leafKey(index, key))?.push(part[key])
      }
    })
  }
}

export const useAnimatedStyle = (updater: () => StyleObject): StyleObject => {
  const ref = useRef<StyleObject | null>(null)
  if (ref.current === null) {
    const nodes = new Map<string, DerivedLeaf>()
    let style: StyleObject | null = null
    const run = (): void => {
      const next = track(run, updater)
      if (style === null) {
        style = buildNodeBackedStyle(next, nodes)
      } else {
        pushLeaves(next, nodes)
      }
    }
    run()
    ref.current = style
  }
  return ref.current
}

export const useDerivedValue = <T,>(updater: () => T): SharedValue<T> => {
  const ref = useRef<SharedValue<T> | null>(null)
  if (ref.current === null) {
    const derived = makeMutable<T>(undefined as T)
    const run = (): void => {
      derived.value = track(run, updater)
    }
    run()
    ref.current = derived
  }
  return ref.current
}

export const useAnimatedReaction = <T,>(
  prepare: () => T,
  react: (current: T, previous: T | null) => void,
): void => {
  const ref = useRef<boolean>(false)
  if (!ref.current) {
    ref.current = true
    let previous: T | null = null
    const run = (): void => {
      const current = track(run, prepare)
      if (Object.is(current, previous)) {
        return
      }
      const before = previous
      previous = current
      react(current, before)
    }
    run()
  }
}

// There is one thread, so "schedule onto the other one" is just "call it".
export const runOnUI =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A): R =>
    fn(...args)

export const runOnJS =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A): R =>
    fn(...args)

type MeasureLike = {
  measureInWindow(
    callback: (x: number, y: number, width: number, height: number) => void,
  ): void
}

export const useAnimatedRef = <T,>() => useRef<T | null>(null)

export type Measurement = {
  x: number
  y: number
  width: number
  height: number
  pageX: number
  pageY: number
}

// Upstream's measure() is synchronous and may only be called inside a
// worklet, because only the UI thread holds the current shadow tree. Here it
// is synchronous for a simpler reason: there is only one thread, and the
// platform's measureInWindow already invokes its callback before returning.
export const measure = (ref: {
  current: MeasureLike | null
}): Measurement | null => {
  const handle = ref.current
  if (!handle) {
    return null
  }
  let result: Measurement | null = null
  handle.measureInWindow((x, y, width, height) => {
    result = { x, y, width, height, pageX: x, pageY: y }
  })
  return result
}
