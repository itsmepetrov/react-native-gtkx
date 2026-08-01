// The shared value: an observable box, and the single place where the
// worklet architecture actually collapses into something.
//
// On mobile a SharedValue is a bridge between two runtimes, with guest/host
// decorators and a serializer behind `.value`. Here it is a closure over a
// number with two kinds of subscriber — mappers (re-run on write) and
// listeners (notified on write) — because GTK's main loop IS the JS thread,
// so a write is a synchronous function call that walks its subscribers.
//
// The one deliberate shape decision, and it is load-bearing:
// `addListener`/`removeListener` accept BOTH calling conventions.
//
//   - Upstream's is `addListener(listenerID, listener)` with the listener
//     called with the raw value. Library code written against Reanimated
//     uses that one.
//   - This platform's animated nodes use `addListener(callback) => id` with
//     `{ value }`, and `src/components/animated.tsx` recognises an animated
//     node STRUCTURALLY (`addListener` + `__getValue`). Supporting it is what
//     makes a shared value drivable by the existing `Animated.View` with no
//     change to the view layer — the load-bearing discovery behind this whole
//     epic (docs/research/reanimated.md).
//
// Implementing only one of the two would not fail loudly; it would fail
// silently, which this repo treats as the worst outcome. The convention is
// picked from what actually arrived, and the two id spaces are kept apart so
// a caller-chosen numeric id cannot collide with a generated one.
import type { AnimatedApi, AnimatedValue } from "../animated/index"
import {
  buildAnimation,
  isAnimationSpec,
  type AnimationSpec,
} from "./animation"
import { trackRead, type Mapper, type Trackable } from "./tracking"

/** The platform's animated-node listener shape. */
export type NodeListener<T> = (state: { value: T }) => void

/** Upstream's shared-value listener shape. */
export type ValueListener<T> = (value: T) => void

export type SharedValue<T = unknown> = Trackable & {
  value: T
  get(): T
  set(next: T | ((current: T) => T)): void
  modify(modifier?: (current: T) => T, forceUpdate?: boolean): void
  addListener(listener: NodeListener<T>): string
  addListener(listenerID: number | string, listener: ValueListener<T>): string
  removeListener(listenerID: number | string): void
  /** @internal The platform's animated-node read. Never registers a mapper. */
  __getValue(): T
  /** @internal Stops a running animation, leaving the value where it is. */
  __cancelAnimation(): void
  /** Upstream's brand, which `isSharedValue` and consumer libraries check. */
  _isReanimatedSharedValue: true
}

/** A shared value a `useDerivedValue` owns: readable, not writable. */
export type DerivedValue<T = unknown> = Readonly<SharedValue<T>>

type RunningAnimation = { stop(): void }

export const createMakeMutable = (api: AnimatedApi) => {
  const makeMutable = <T>(initial: T): SharedValue<T> => {
    let current = initial
    const mappers = new Set<Mapper>()
    const listeners = new Map<string, ValueListener<T>>()
    let nextNodeListenerId = 1
    let running: RunningAnimation | null = null

    const notify = (): void => {
      // Copied before iterating: a listener or a mapper may subscribe or
      // unsubscribe while the write is being published.
      for (const listener of [...listeners.values()]) {
        listener(current)
      }
      for (const mapper of [...mappers]) {
        mapper.run()
      }
    }

    const commit = (next: T): void => {
      if (Object.is(next, current)) {
        return
      }
      current = next
      notify()
    }

    const stopAnimation = (): void => {
      const animation = running
      running = null
      animation?.stop()
    }

    const startAnimation = (spec: AnimationSpec): void => {
      stopAnimation()
      if (typeof current !== "number") {
        throw new Error(
          "react-native-reanimated: an animation can only be assigned to a shared value holding a number " +
            `(this one holds ${typeof current}). Colors and layout values cannot be animated on this platform yet — see docs/api.md.`,
        )
      }
      // A fresh driver per run, constructed at the current value: restarting
      // an animation must pick up from wherever the value is now, and the
      // platform's engine derives its start value from the node it drives.
      const driver: AnimatedValue = new api.Value(current)
      const driverListener = driver.addListener(({ value }) => {
        commit(value as T)
      })
      const animation = buildAnimation(api, driver, spec)
      const handle: RunningAnimation = { stop: () => animation.stop() }
      running = handle
      animation.start(() => {
        driver.removeListener(driverListener)
        if (running === handle) {
          running = null
        }
      })
    }

    const write = (next: T): void => {
      if (isAnimationSpec(next)) {
        startAnimation(next)
        return
      }
      // A plain write cancels whatever was running, exactly as upstream's
      // valueSetter does — assigning a value is how you stop an animation.
      stopAnimation()
      commit(next)
    }

    const shared: SharedValue<T> = {
      _isReanimatedSharedValue: true,

      get value() {
        trackRead(shared)
        return current
      },
      set value(next: T) {
        write(next)
      },

      get() {
        trackRead(shared)
        return current
      },
      set(next) {
        write(
          typeof next === "function"
            ? (next as (currentValue: T) => T)(current)
            : next,
        )
      },

      modify(modifier, forceUpdate = true) {
        const next = modifier ? modifier(current) : current
        if (!forceUpdate) {
          commit(next)
          return
        }
        // forceUpdate republishes even when the modifier mutated the value in
        // place and `Object.is` therefore still holds — the case the method
        // exists for.
        current = next
        notify()
      },

      addListener(
        first: NodeListener<T> | number | string,
        second?: ValueListener<T>,
      ): string {
        if (typeof first === "function") {
          const id = `#${nextNodeListenerId++}`
          listeners.set(id, (value) => first({ value }))
          return id
        }
        const id = String(first)
        if (second) {
          listeners.set(id, second)
        }
        return id
      },

      removeListener(listenerID) {
        listeners.delete(String(listenerID))
      },

      __getValue() {
        return current
      },

      __addMapper(mapper) {
        mappers.add(mapper)
      },

      __removeMapper(mapper) {
        mappers.delete(mapper)
      },

      __cancelAnimation() {
        stopAnimation()
      },
    }

    return shared
  }

  return makeMutable
}

export const isSharedValue = <T = unknown>(
  value: unknown,
): value is SharedValue<T> =>
  (value as Record<string, unknown> | null | undefined)
    ?._isReanimatedSharedValue === true

/** Stops the animation running on a shared value, leaving it where it is. */
export const cancelAnimation = (sharedValue: unknown): void => {
  if (isSharedValue(sharedValue)) {
    sharedValue.__cancelAnimation()
  }
}
