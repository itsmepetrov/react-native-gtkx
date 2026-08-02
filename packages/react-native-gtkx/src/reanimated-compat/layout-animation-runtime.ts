// Driving a built layout-animation config against a real GTK widget.
//
// The builders in layout-animation.ts produce upstream's own
// `{ initialValues, animations, callback }`, keyed by style property. This
// file is the half that knows where each of those properties can actually go
// on this platform, and it is the same three doors every other animated write
// here uses — `gtk_widget_set_opacity`, the rect store's transform, and (new)
// the rect store's layout offset. No React render, no Yoga pass, no second
// clock: every animation is built with the platform's own engine on the
// platform's own frame scheduler, exactly as `withTiming` on a shared value
// is.
//
// WHAT IS HONOURED, and the one thing that is not:
//
//   `opacity`             → the widget, per frame.
//   `transform`           → the rect store's transform slot, per frame.
//   `originX` / `originY` → the rect store's LAYOUT offset, per frame, as the
//                           distance still to travel from where the child was
//                           to where the engine put it. This is what makes
//                           `LinearTransition` a paint-only animation.
//   `width` / `height`    → applied by the layout engine immediately, not
//                           animated. `LinearTransition` always emits them,
//                           and animating a size means a Yoga pass per frame
//                           whose cost is the tree's rather than the value's
//                           (63.9 µs at five children, 496.3 µs at three
//                           hundred — docs/research/animated-colors.md). This
//                           is the same refusal `useAnimatedStyle` already
//                           makes for layout properties, and it is the reason
//                           the position is animated with a translation.
//
// Anything else is named once, per property, per session — the platform's
// standing rule that an undriveable property must be visible rather than
// dropped.
import {
  clearStoredLayoutOffset,
  deferDuringAllocate,
  setStoredLayoutOffset,
  setStoredTransform,
} from "../components/rect-store"
import { parseAngle } from "../style/transform"
import type { TransformPart } from "../contracts"
import type { Gtk } from "../gtkx/bridge/index"
import { queueAllocate } from "../gtkx/bridge/index"
import {
  buildAnimation,
  isAnimationSpec,
  type AnimationEngine,
  type AnimationSpec,
} from "./animation"
import type {
  BuiltLayoutAnimation,
  LayoutAnimationValues,
} from "./layout-animation"

export type LayoutAnimationTarget = {
  widget: Gtk.Widget
  parentWidget: Gtk.Widget | null
}

export type RunningLayoutAnimation = {
  /** Cuts the animation short. The callback still fires, with `false`. */
  stop(): void
}

// Emitted by LinearTransition on every run and honoured by the layout engine
// on the next commit rather than per frame — see the header.
const SIZE_PROPERTIES = new Set(["width", "height"])

const warned = new Set<string>()

const warnUndriveable = (property: string): void => {
  if (warned.has(property)) {
    return
  }
  warned.add(property)
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production"
  if (isProduction) {
    return
  }
  console.warn(
    `react-native-reanimated: a layout animation asked for \`${property}\`, which react-native-gtkx cannot ` +
      "write to a mounted widget without a React render. Layout animations drive `opacity`, `transform` and " +
      "position here. See docs/api.md.",
  )
}

/** @internal Test seam: the warning is once per property per session. */
export const resetLayoutAnimationWarnings = (): void => {
  warned.clear()
}

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

type Channel = {
  /** Applies an immediate value from `initialValues`. */
  apply(value: unknown): void
  /** The value an animation on this property should start from. */
  start(value: unknown): number | null
  /** Pushes a driven value. */
  push(value: number): void
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * Runs one built config against one widget.
 *
 * `values` is what the builder was handed, and the runtime needs it back:
 * `originX`/`originY` animate towards `target*`, so the offset to write is
 * the driven value minus that target.
 */
export const runLayoutAnimation = (
  engine: AnimationEngine,
  target: LayoutAnimationTarget,
  config: BuiltLayoutAnimation,
  values: LayoutAnimationValues,
  onEnd?: (finished: boolean) => void,
): RunningLayoutAnimation => {
  const { widget, parentWidget } = target

  // --- the three doors ---------------------------------------------------

  // A `layout` transition's first write happens INSIDE a GTK allocation pass
  // — the engine flushes there, the commit hands the new rect to the rect
  // store, and the observer that starts this animation runs on that write —
  // and queueing an allocation from inside one is what `deferDuringAllocate`
  // exists to stop. Keyed on a token private to this animation so it can
  // never displace the commit's own deferred job for the same widget.
  const allocateToken = {}

  // The container to re-allocate, and it is NOT always the one the caller
  // named. An `entering` animation starts from a layout effect, and React
  // attaches refs from the leaves up — so a view mounting in the same commit
  // as its container sees `parentWidget` null, because the container's own
  // ref has not been assigned yet. The widget is already PARENTED by then
  // (the reconciler's mutation phase runs before any layout effect), so GTK
  // itself has the answer. Without this, every transform- or position-driven
  // entering animation wrote its frames into the rect store and never asked
  // anyone to draw them: the first allocation picked up the initial value and
  // the view froze there — a `ZoomIn` that mounts at scale 0 and stays.
  let container: Gtk.Widget | null = parentWidget
  const requestAllocate = (): void => {
    container ??= widget.getParent() as Gtk.Widget | null
    const containerWidget = container
    if (!containerWidget) {
      return
    }
    const queue = (): void => queueAllocate(containerWidget)
    if (!deferDuringAllocate(allocateToken, queue)) {
      queue()
    }
  }

  // The live transform array, mutated in place and re-published whole, the
  // same shape src/components/animated.tsx keeps for a driven style.
  let transformParts: Record<string, number | string>[] = []
  const flushTransform = (): void => {
    setStoredTransform(widget, transformParts as unknown as TransformPart[])
    requestAllocate()
  }

  let offsetX = 0
  let offsetY = 0
  let hasOffset = false
  const flushOffset = (): void => {
    hasOffset = true
    setStoredLayoutOffset(widget, offsetX, offsetY)
    requestAllocate()
  }

  const opacityChannel: Channel = {
    apply(value) {
      const numeric = numberOrNull(value)
      if (numeric !== null) {
        widget.setOpacity(clamp01(numeric))
      }
    },
    start(value) {
      return numberOrNull(value)
    },
    push(value) {
      widget.setOpacity(clamp01(value))
    },
  }

  const originChannel = (axis: "x" | "y"): Channel => {
    const targetValue =
      axis === "x" ? values.targetOriginX : values.targetOriginY
    const write = (offset: number): void => {
      if (axis === "x") {
        offsetX = offset
      } else {
        offsetY = offset
      }
      flushOffset()
    }
    return {
      apply(value) {
        const numeric = numberOrNull(value)
        if (numeric !== null) {
          write(numeric - targetValue)
        }
      },
      start(value) {
        return numberOrNull(value)
      },
      push(value) {
        write(value - targetValue)
      },
    }
  }

  // An angle slot takes upstream's own spelling as well as a number: the
  // catalogue emits degrees (a numeric animation cannot carry a unit), but
  // `.withInitialValues({ transform: [{ rotate: "45deg" }] })` is written by
  // hand and would otherwise be dropped as "not a number". `parseAngle` is
  // the same reader src/style/transform.ts uses to build the matrix, so both
  // spellings land on the same rotation.
  const ANGLE_KEYS = new Set(["rotate", "rotateZ"])

  const transformChannel = (index: number, key: string): Channel => {
    const read = ANGLE_KEYS.has(key)
      ? (value: unknown): number | null => parseAngle(value)
      : numberOrNull
    return {
      apply(value) {
        const numeric = read(value)
        if (numeric !== null) {
          transformParts[index] = { [key]: numeric }
          flushTransform()
        }
      },
      start(value) {
        return read(value)
      },
      push(value) {
        transformParts[index] = { [key]: value }
        flushTransform()
      },
    }
  }

  // --- initial values ----------------------------------------------------

  const channelFor = (property: string): Channel | null => {
    if (property === "opacity") {
      return opacityChannel
    }
    if (property === "originX") {
      return originChannel("x")
    }
    if (property === "originY") {
      return originChannel("y")
    }
    if (SIZE_PROPERTIES.has(property)) {
      return null
    }
    warnUndriveable(property)
    return null
  }

  const eachTransformEntry = (
    source: unknown,
    visit: (index: number, key: string, value: unknown) => void,
  ): void => {
    if (!Array.isArray(source)) {
      return
    }
    source.forEach((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        return
      }
      for (const [key, value] of Object.entries(entry)) {
        visit(index, key, value)
      }
    })
  }

  // The transform array is seeded whole from the initial values so a static
  // entry beside an animated one keeps its place in the composition order.
  const initialTransform = config.initialValues.transform
  if (Array.isArray(initialTransform)) {
    transformParts = initialTransform.map((entry) =>
      typeof entry === "object" && entry !== null
        ? ({ ...entry } as Record<string, number | string>)
        : {},
    )
    flushTransform()
  }

  for (const [property, value] of Object.entries(config.initialValues)) {
    if (property === "transform") {
      continue
    }
    channelFor(property)?.apply(value)
  }

  // --- the animations ----------------------------------------------------

  type Job = { channel: Channel; spec: AnimationSpec; from: number }
  const jobs: Job[] = []

  const collect = (
    property: string,
    value: unknown,
    channel: Channel | null,
    initial: unknown,
  ): void => {
    if (channel === null) {
      return
    }
    if (!isAnimationSpec(value)) {
      channel.apply(value)
      return
    }
    const from = channel.start(initial)
    if (from === null) {
      warnUndriveable(property)
      return
    }
    jobs.push({ channel, spec: value, from })
  }

  for (const [property, value] of Object.entries(config.animations)) {
    if (property === "transform") {
      eachTransformEntry(value, (index, key, entry) => {
        const initial = transformParts[index]?.[key]
        collect(
          `transform.${key}`,
          entry,
          transformChannel(index, key),
          initial,
        )
      })
      continue
    }
    collect(
      property,
      value,
      channelFor(property),
      config.initialValues[property],
    )
  }

  const running: { stop(): void }[] = []
  let settled = false
  let pending = jobs.length
  let allFinished = true

  const finish = (): void => {
    if (settled) {
      return
    }
    settled = true
    if (hasOffset) {
      clearStoredLayoutOffset(widget)
      requestAllocate()
    }
    config.callback?.(allFinished)
    onEnd?.(allFinished)
  }

  for (const job of jobs) {
    const driver = new engine.api.Value(job.from)
    const listener = driver.addListener(({ value }) => {
      job.channel.push(value)
    })
    const animation = buildAnimation(engine, driver, job.spec)
    running.push({
      stop: () => {
        animation.stop()
        driver.removeListener(listener)
      },
    })
    animation.start((result) => {
      driver.removeListener(listener)
      if (!result.finished) {
        allFinished = false
      }
      pending -= 1
      if (pending === 0) {
        finish()
      }
    })
  }

  if (jobs.length === 0) {
    // Nothing to drive is still a completed animation: whoever is holding a
    // widget for this must be released, or it is held until the timer.
    finish()
  }

  return {
    stop() {
      if (settled) {
        return
      }
      allFinished = false
      for (const animation of running) {
        animation.stop()
      }
      finish()
    },
  }
}
