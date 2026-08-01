// A flattened `Gesture.Pan()` + `GestureDetector`, built on React Native's
// own responder system — NOT a port of react-native-gesture-handler.
//
// The whole point of the spike is which SUBSTRATE this sits on. RNGH's own
// `NativeDetector.tsx` sets `onStartShouldSetResponder`, i.e. it layers on
// the Gesture Responder System rather than replacing it — and that system
// is shipped here, on GTK4 controllers, with the negotiation in JS.
//
// The seam that makes a faithful `activeOffsetY` reachable is a property of
// RN's model that reads like a footnote and is actually the load-bearing
// part: **View touch props fire independently of responder status**. So the
// recognizer runs off `onTouchStart`/`onTouchMove`, keeps its own
// UNDETERMINED -> BEGAN -> ACTIVE/FAILED state machine, and only returns
// `true` from `onMoveShouldSetResponder` at the instant it decides to
// activate. Until then it holds no lock, blocks nobody, and — probe 1 —
// GTK has claimed nothing either.
//
// The arithmetic is deliberately RNGH's, restated from its behaviour rather
// than copied from its source: activation when translation crosses an
// `activeOffset*` bound or `minDistance`; failure when it crosses a
// `failOffset*` bound; with `activateAfterLongPress` set, any movement past
// the default minimum distance before the timer fires is a failure.
import {
  cloneElement,
  isValidElement,
  useMemo,
  useRef,
  type ReactElement,
} from "react"
import type { GestureResponderEvent } from "react-native"

export type PanUpdate = {
  x: number
  y: number
  absoluteX: number
  absoluteY: number
  translationX: number
  translationY: number
  velocityX: number
  velocityY: number
}

export type GestureState =
  "UNDETERMINED" | "BEGAN" | "ACTIVE" | "END" | "FAILED" | "CANCELLED"

type Bound = number | [number, number]

const asRange = (value: Bound): [number, number] =>
  typeof value === "number"
    ? value < 0
      ? [value, Number.MAX_SAFE_INTEGER]
      : [-Number.MAX_SAFE_INTEGER, value]
    : value

/** RNGH's default minimum distance before an unconfigured pan activates. */
const DEFAULT_MIN_DIST = 10

/**
 * The deliberately broken build. `GD_BREAK=1` makes the detector take the
 * responder on PRESS and activate immediately — the naive implementation,
 * and the one every "just wire it to PanResponder" sketch produces. Running
 * the spike this way is what shows its assertions are sensitive to the thing
 * they claim to measure rather than passing for some other reason.
 */
const BROKEN = process.env.GD_BREAK === "1"

type PanConfig = {
  activeOffsetX?: [number, number]
  activeOffsetY?: [number, number]
  failOffsetX?: [number, number]
  failOffsetY?: [number, number]
  minDistance?: number
  activateAfterLongPress?: number
  enabled: boolean
  onBegin?: (update: PanUpdate) => void
  onStart?: (update: PanUpdate) => void
  onUpdate?: (update: PanUpdate) => void
  onEnd?: (update: PanUpdate, success: boolean) => void
  onFinalize?: (update: PanUpdate, success: boolean) => void
}

export class PanGesture {
  config: PanConfig = { enabled: true }

  activeOffsetX(value: Bound): this {
    this.config.activeOffsetX = asRange(value)
    return this
  }
  activeOffsetY(value: Bound): this {
    this.config.activeOffsetY = asRange(value)
    return this
  }
  failOffsetX(value: Bound): this {
    this.config.failOffsetX = asRange(value)
    return this
  }
  failOffsetY(value: Bound): this {
    this.config.failOffsetY = asRange(value)
    return this
  }
  minDistance(value: number): this {
    this.config.minDistance = value
    return this
  }
  activateAfterLongPress(ms: number): this {
    this.config.activateAfterLongPress = ms
    return this
  }
  enabled(value: boolean): this {
    this.config.enabled = value
    return this
  }
  onBegin(fn: (update: PanUpdate) => void): this {
    this.config.onBegin = fn
    return this
  }
  onStart(fn: (update: PanUpdate) => void): this {
    this.config.onStart = fn
    return this
  }
  onUpdate(fn: (update: PanUpdate) => void): this {
    this.config.onUpdate = fn
    return this
  }
  onEnd(fn: (update: PanUpdate, success: boolean) => void): this {
    this.config.onEnd = fn
    return this
  }
  onFinalize(fn: (update: PanUpdate, success: boolean) => void): this {
    this.config.onFinalize = fn
    return this
  }
}

export const Gesture = {
  Pan: (): PanGesture => new PanGesture(),
}

type Runtime = {
  state: GestureState
  startX: number
  startY: number
  lastX: number
  lastY: number
  lastTime: number
  velocityX: number
  velocityY: number
  timer: ReturnType<typeof setTimeout> | null
  /** Set by the long-press timer; consumed by the next touch event. */
  longPressElapsed: boolean
}

const newRuntime = (): Runtime => ({
  state: "UNDETERMINED",
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  lastTime: 0,
  velocityX: 0,
  velocityY: 0,
  timer: null,
  longPressElapsed: false,
})

/**
 * The responder props a `GestureDetector` puts on its child.
 *
 * `onStartShouldSetResponder` deliberately returns FALSE. A pan with
 * `activeOffsetY` must not hold the interaction lock while it is still
 * making up its mind — that is the entire behaviour under test, and it is
 * what lets a sibling or an ancestor win instead.
 */
export const useGestureHandlers = (gesture: PanGesture) => {
  const runtimeRef = useRef<Runtime>(newRuntime())
  const gestureRef = useRef(gesture)
  gestureRef.current = gesture

  return useMemo(() => {
    const updateOf = (event: GestureResponderEvent): PanUpdate => {
      const runtime = runtimeRef.current
      const { pageX, pageY, locationX, locationY } = event.nativeEvent
      return {
        x: locationX,
        y: locationY,
        absoluteX: pageX,
        absoluteY: pageY,
        translationX: pageX - runtime.startX,
        translationY: pageY - runtime.startY,
        velocityX: runtime.velocityX,
        velocityY: runtime.velocityY,
      }
    }

    const clearTimer = (): void => {
      const runtime = runtimeRef.current
      if (runtime.timer !== null) {
        clearTimeout(runtime.timer)
        runtime.timer = null
      }
    }

    const finalize = (event: GestureResponderEvent, success: boolean): void => {
      const config = gestureRef.current.config
      const update = updateOf(event)
      clearTimer()
      if (runtimeRef.current.state === "ACTIVE") {
        config.onEnd?.(update, success)
      }
      config.onFinalize?.(update, success)
      runtimeRef.current = newRuntime()
    }

    // RNGH's shouldActivate, restated: any configured activation bound that
    // the translation has crossed activates; with no bound at all, plain
    // distance does.
    const shouldActivate = (dx: number, dy: number): boolean => {
      const config = gestureRef.current.config
      const hasCustom =
        config.activeOffsetX !== undefined ||
        config.activeOffsetY !== undefined ||
        config.failOffsetX !== undefined ||
        config.failOffsetY !== undefined
      if (
        config.activeOffsetX &&
        (dx < config.activeOffsetX[0] || dx > config.activeOffsetX[1])
      ) {
        return true
      }
      if (
        config.activeOffsetY &&
        (dy < config.activeOffsetY[0] || dy > config.activeOffsetY[1])
      ) {
        return true
      }
      const minDistance =
        config.minDistance ??
        (hasCustom ? Number.MAX_SAFE_INTEGER : DEFAULT_MIN_DIST)
      return Math.hypot(dx, dy) >= minDistance
    }

    const shouldFail = (dx: number, dy: number): boolean => {
      const config = gestureRef.current.config
      // With activateAfterLongPress, moving before the timer fires is a
      // failure — the gesture was a drag, not a long press.
      if (
        config.activateAfterLongPress !== undefined &&
        !runtimeRef.current.longPressElapsed &&
        Math.hypot(dx, dy) > DEFAULT_MIN_DIST
      ) {
        return true
      }
      if (
        config.failOffsetX &&
        (dx < config.failOffsetX[0] || dx > config.failOffsetX[1])
      ) {
        return true
      }
      return Boolean(
        config.failOffsetY &&
        (dy < config.failOffsetY[0] || dy > config.failOffsetY[1]),
      )
    }

    const track = (event: GestureResponderEvent): void => {
      const runtime = runtimeRef.current
      const { pageX, pageY, timestamp } = event.nativeEvent
      const elapsed = timestamp - runtime.lastTime
      if (elapsed > 0) {
        runtime.velocityX = ((pageX - runtime.lastX) / elapsed) * 1000
        runtime.velocityY = ((pageY - runtime.lastY) / elapsed) * 1000
      }
      runtime.lastX = pageX
      runtime.lastY = pageY
      runtime.lastTime = timestamp
    }

    return {
      onStartShouldSetResponder: () => BROKEN,

      onTouchStart: (event: GestureResponderEvent) => {
        const config = gestureRef.current.config
        if (!config.enabled) {
          return
        }
        const runtime = newRuntime()
        runtimeRef.current = runtime
        const { pageX, pageY, timestamp } = event.nativeEvent
        runtime.startX = pageX
        runtime.startY = pageY
        runtime.lastX = pageX
        runtime.lastY = pageY
        runtime.lastTime = timestamp
        runtime.state = "BEGAN"
        config.onBegin?.(updateOf(event))

        if (config.activateAfterLongPress !== undefined) {
          runtime.timer = setTimeout(() => {
            // Only marks eligibility. Taking the interaction lock is a
            // negotiation, and RN's responder system negotiates on touch
            // events only — see docs/research/gesture-detector.md, "the one
            // extension the epic needs".
            runtime.longPressElapsed = true
            runtime.timer = null
          }, config.activateAfterLongPress)
        }
      },

      onTouchMove: (event: GestureResponderEvent) => {
        const runtime = runtimeRef.current
        if (BROKEN || runtime.state !== "BEGAN") {
          return
        }
        track(event)
        const update = updateOf(event)
        const config = gestureRef.current.config
        if (shouldFail(update.translationX, update.translationY)) {
          clearTimer()
          runtime.state = "FAILED"
          // RNGH finalizes at the moment of failure, not at release — and
          // then the press is over as far as this gesture is concerned, so
          // the runtime is retired here rather than at touch end.
          config.onFinalize?.(update, false)
          runtimeRef.current = newRuntime()
        }
      },

      // The instant of decision. Returning true here is what asks the
      // responder system for the interaction; everything above ran without
      // holding anything.
      onMoveShouldSetResponder: (event: GestureResponderEvent) => {
        const runtime = runtimeRef.current
        const config = gestureRef.current.config
        if (runtime.state !== "BEGAN" || !config.enabled) {
          return false
        }
        const update = updateOf(event)
        if (BROKEN) {
          return true
        }
        if (config.activateAfterLongPress !== undefined) {
          return runtime.longPressElapsed
        }
        return shouldActivate(update.translationX, update.translationY)
      },

      onResponderGrant: (event: GestureResponderEvent) => {
        const runtime = runtimeRef.current
        runtime.state = "ACTIVE"
        clearTimer()
        // RNGH resets progress on activation: translation is measured from
        // where the gesture became active, not from the press.
        runtime.startX = event.nativeEvent.pageX
        runtime.startY = event.nativeEvent.pageY
        gestureRef.current.config.onStart?.(updateOf(event))
      },

      onResponderMove: (event: GestureResponderEvent) => {
        if (runtimeRef.current.state !== "ACTIVE") {
          return
        }
        track(event)
        gestureRef.current.config.onUpdate?.(updateOf(event))
      },

      onResponderRelease: (event: GestureResponderEvent) => {
        finalize(event, true)
      },

      onResponderTerminate: (event: GestureResponderEvent) => {
        runtimeRef.current.state = "CANCELLED"
        finalize(event, false)
      },

      onTouchEnd: (event: GestureResponderEvent) => {
        // A press that never activated ends here — the responder callbacks
        // never fire for a gesture that took no lock.
        const runtime = runtimeRef.current
        if (runtime.state === "BEGAN" || runtime.state === "FAILED") {
          finalize(event, false)
        }
      },

      onTouchCancel: (event: GestureResponderEvent) => {
        const runtime = runtimeRef.current
        if (runtime.state !== "UNDETERMINED") {
          finalize(event, false)
        }
      },
    }
    // The handler set is built once and reads everything current through
    // refs, so a re-render never swaps the props mid-drag.
  }, [])
}

export type GestureDetectorProps = {
  gesture: PanGesture
  children: ReactElement
}

/**
 * Not a view: exactly one child, whose props it extends. Upstream attaches a
 * ref and subscribes the child's native view; here it spreads the responder
 * props the child already accepts, which is the same idea with the platform
 * substituted.
 */
export const GestureDetector = ({
  gesture,
  children,
}: GestureDetectorProps): ReactElement => {
  const handlers = useGestureHandlers(gesture)
  if (!isValidElement(children)) {
    throw new Error("GestureDetector expects exactly one element child")
  }
  return cloneElement(children, handlers as never)
}
