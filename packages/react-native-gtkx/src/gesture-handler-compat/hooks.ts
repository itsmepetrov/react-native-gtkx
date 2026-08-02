// Spelling two: `usePanGesture` / `useTapGesture` / `useLongPressGesture`,
// the hooks.
//
// The replacement upstream is migrating to — a 6,763-line tree of hooks that
// deprecated all twelve builder statics in 3.1.0. Nothing here reimplements
// the recognizer; it normalises a config object onto the same
// `RecognizerConfig` the builder writes and returns the same `GestureSpec`.
// That the file is this short is the evidence that the internal shape was
// picked correctly: upstream had to rewrite its internals for this migration
// because its builder WAS its internals.
//
// Four real differences from the builder spelling, all upstream's:
//   - `onStart` is `onActivate`, `onEnd` is `onDeactivate`;
//   - `onTouchesCancelled` is `onTouchesCancel`, and the touch callbacks take
//     the event alone, with no state manager;
//   - the ending callbacks take one argument, and read `canceled` off the
//     event rather than a second `success` parameter;
//   - there is no `onChange` at all — `changeX`/`changeY` are always on the
//     update payload instead.
import {
  exclusiveGestures,
  raceGestures,
  simultaneousGestures,
} from "./composition"
import type {
  AnyGestureSpec,
  ComposedGestureSpec,
  GestureEndEventPayload,
  GestureEventPayload,
  GestureHitSlop,
  GestureRef,
  GestureSpec,
  GestureTouchEvent,
  OffsetBound,
  RecognizerConfig,
} from "./types"

/**
 * The relations, in the hook spelling's names.
 *
 * The same three lists the builder's three methods write, renamed and moved
 * into the config object — `simultaneousWithExternalGesture` is
 * `simultaneousWith`, `requireExternalGestureToFail` is `requireToFail`, and
 * `blocksExternalGesture` is `block`. One gesture or several, because
 * upstream accepts both and an app writing one should not have to wrap it.
 */
type RelationHookConfig = {
  simultaneousWith?: GestureRef | GestureRef[]
  requireToFail?: GestureRef | GestureRef[]
  block?: GestureRef | GestureRef[]
}

/** What every hook spelling accepts, which is upstream's `CommonGestureConfig`. */
type CommonGestureHookConfig = RelationHookConfig & {
  enabled?: boolean
  hitSlop?: GestureHitSlop
  shouldCancelWhenOutside?: boolean
  manualActivation?: boolean
  runOnJS?: boolean
  testID?: string
  onBegin?: (event: GestureEventPayload) => void
  onActivate?: (event: GestureEventPayload) => void
  onDeactivate?: (event: GestureEndEventPayload) => void
  onFinalize?: (event: GestureEndEventPayload) => void
  onTouchesDown?: (event: GestureTouchEvent) => void
  onTouchesMove?: (event: GestureTouchEvent) => void
  onTouchesUp?: (event: GestureTouchEvent) => void
  onTouchesCancel?: (event: GestureTouchEvent) => void
}

const asList = (
  value: GestureRef | GestureRef[] | undefined,
): GestureRef[] | undefined => {
  if (value === undefined) {
    return undefined
  }
  return Array.isArray(value) ? value : [value]
}

/** The config object `usePanGesture` accepts. */
export type PanGestureHookConfig = CommonGestureHookConfig & {
  activeOffsetX?: OffsetBound
  activeOffsetY?: OffsetBound
  failOffsetX?: OffsetBound
  failOffsetY?: OffsetBound
  minDistance?: number
  minVelocity?: number
  minVelocityX?: number
  minVelocityY?: number
  minPointers?: number
  maxPointers?: number
  activateAfterLongPress?: number
  /**
   * Only a CONTINUOUS gesture has one. Upstream's discrete hooks omit
   * `onUpdate` from their config type by name (`BaseDiscreteGestureConfig` is
   * `Omit<…, "onUpdate">`), which is the same statement in the other
   * direction.
   */
  onUpdate?: (event: GestureEventPayload) => void
}

/** The config object `useTapGesture` accepts, in upstream's external names. */
export type TapGestureHookConfig = CommonGestureHookConfig & {
  numberOfTaps?: number
  maxDuration?: number
  maxDelay?: number
  maxDistance?: number
  maxDeltaX?: number
  maxDeltaY?: number
  minPointers?: number
}

/** The config object `useLongPressGesture` accepts. */
export type LongPressGestureHookConfig = CommonGestureHookConfig & {
  minDuration?: number
  maxDistance?: number
  numberOfPointers?: number
}

/** The config object `useNativeGesture` accepts. */
export type NativeGestureHookConfig = CommonGestureHookConfig & {
  shouldActivateOnStart?: boolean
  disallowInterruption?: boolean
  yieldsToContinuousGestures?: boolean
  /** A native view is continuous upstream, so it reports travel. */
  onUpdate?: (event: GestureEventPayload) => void
}

/**
 * The config object `usePinchGesture` and `useRotationGesture` accept.
 *
 * Nothing of their own, and that is upstream's shape rather than an omission:
 * `PinchGestureNativeProperties` and `RotationGestureNativeProperties` are
 * both `Record<string, never>` in 3.1.0's `src/v3`, and the builder classes
 * add no methods either. Both are continuous, so `onUpdate` is here.
 */
export type TouchpadGestureHookConfig = CommonGestureHookConfig & {
  onUpdate?: (event: GestureEventPayload) => void
}

/**
 * Upstream's dev-time validation, reproduced because both messages describe
 * configs that look reasonable and silently never activate.
 */
const validate = (config: PanGestureHookConfig): void => {
  for (const [name, bound] of [
    ["activeOffsetX", config.activeOffsetX],
    ["activeOffsetY", config.activeOffsetY],
    ["failOffsetX", config.failOffsetX],
    ["failOffsetY", config.failOffsetY],
  ] as const) {
    if (Array.isArray(bound) && (bound[0] > 0 || bound[1] < 0)) {
      throw new Error(
        `react-native-gtkx: first element of ${name} should be negative, ` +
          "and the second one should be positive.",
      )
    }
  }
  if (config.minDistance === undefined) {
    return
  }
  if (config.failOffsetX !== undefined || config.failOffsetY !== undefined) {
    throw new Error(
      "react-native-gtkx: it is not supported to use minDistance with " +
        "failOffsetX or failOffsetY; use activeOffsetX and activeOffsetY instead.",
    )
  }
  if (
    config.activeOffsetX !== undefined ||
    config.activeOffsetY !== undefined
  ) {
    throw new Error(
      "react-native-gtkx: it is not supported to use minDistance with " +
        "activeOffsetX or activeOffsetY.",
    )
  }
}

/**
 * Everything the three hooks normalise identically: the common knobs, the
 * ending callbacks' `canceled` shape, and the touch callbacks' missing state
 * manager. The per-kind hooks below add their own fields and nothing else.
 */
const adaptCommon = (config: CommonGestureHookConfig): RecognizerConfig => {
  const normalised: RecognizerConfig = {
    enabled: config.enabled,
    hitSlop: config.hitSlop,
    shouldCancelWhenOutside: config.shouldCancelWhenOutside,
    manualActivation: config.manualActivation,
    runOnJS: config.runOnJS,
    testId: config.testID,
    onBegin: config.onBegin,
    onActivate: config.onActivate,
    // The relations land in the map names, from either spelling. That both
    // spellings normalise onto one set of lists rather than each carrying its
    // own is the same claim slice 1 made about the callbacks, tested the same
    // way: one orchestrator test drives both.
    simultaneousHandlers: asList(config.simultaneousWith),
    waitFor: asList(config.requireToFail),
    blocksHandlers: asList(config.block),
  }

  // The ending callbacks are the one place the two spellings disagree about
  // shape rather than about names: this one reads `canceled` off the event.
  const { onDeactivate, onFinalize } = config
  if (onDeactivate) {
    normalised.onDeactivate = (event, success) => {
      onDeactivate({ ...event, canceled: !success })
    }
  }
  if (onFinalize) {
    normalised.onFinalize = (event, success) => {
      onFinalize({ ...event, canceled: !success })
    }
  }

  // And the touch callbacks take no state manager in this spelling.
  const { onTouchesDown, onTouchesMove, onTouchesUp, onTouchesCancel } = config
  if (onTouchesDown) {
    normalised.onTouchesDown = (event) => {
      onTouchesDown(event)
    }
  }
  if (onTouchesMove) {
    normalised.onTouchesMove = (event) => {
      onTouchesMove(event)
    }
  }
  if (onTouchesUp) {
    normalised.onTouchesUp = (event) => {
      onTouchesUp(event)
    }
  }
  if (onTouchesCancel) {
    normalised.onTouchesCancel = (event) => {
      onTouchesCancel(event)
    }
  }

  return normalised
}

const EMPTY_PAN: PanGestureHookConfig = {}
const EMPTY_TAP: TapGestureHookConfig = {}
const EMPTY_LONG_PRESS: LongPressGestureHookConfig = {}
const EMPTY_NATIVE: NativeGestureHookConfig = {}

/**
 * The hook spelling. Rebuilds its spec every render, exactly as the builder
 * chained in a component body does, because the callbacks it closes over are
 * rebuilt every render too — `GestureDetector` reads the config through a ref
 * rather than resubscribing, which is what makes that free.
 */
export const usePanGesture = (
  config: PanGestureHookConfig = EMPTY_PAN,
): GestureSpec => {
  validate(config)

  return {
    kind: "pan",
    config: {
      ...adaptCommon(config),
      activeOffsetX: config.activeOffsetX,
      activeOffsetY: config.activeOffsetY,
      failOffsetX: config.failOffsetX,
      failOffsetY: config.failOffsetY,
      minDistance: config.minDistance,
      minVelocity: config.minVelocity,
      minVelocityX: config.minVelocityX,
      minVelocityY: config.minVelocityY,
      minPointers: config.minPointers,
      maxPointers: config.maxPointers,
      activateAfterLongPress: config.activateAfterLongPress,
      onUpdate: config.onUpdate,
    },
  }
}

/**
 * `useTapGesture`, the hook spelling of `Gesture.Tap()`.
 *
 * `shouldCancelWhenOutside` defaults to true here, matching the builder.
 * Upstream's own hook does NOT do this even though its builder's constructor
 * does and its native handler config does — `useLongPressGesture` remembers it
 * (`transformLongPressProps`) and `useTapGesture` forgets. Two spellings of
 * one gesture disagreeing about whether a press may wander off the view is a
 * slip rather than a semantic, and reproducing it would make this module's own
 * "two spellings, one implementation" claim false.
 */
export const useTapGesture = (
  config: TapGestureHookConfig = EMPTY_TAP,
): GestureSpec => ({
  kind: "tap",
  config: {
    ...adaptCommon(config),
    shouldCancelWhenOutside: config.shouldCancelWhenOutside ?? true,
    numberOfTaps: config.numberOfTaps,
    maxDuration: config.maxDuration,
    maxDelay: config.maxDelay,
    maxDistance: config.maxDistance,
    maxDeltaX: config.maxDeltaX,
    maxDeltaY: config.maxDeltaY,
    minPointers: config.minPointers,
  },
})

/** `useLongPressGesture`, the hook spelling of `Gesture.LongPress()`. */
export const useLongPressGesture = (
  config: LongPressGestureHookConfig = EMPTY_LONG_PRESS,
): GestureSpec => ({
  kind: "longPress",
  config: {
    ...adaptCommon(config),
    shouldCancelWhenOutside: config.shouldCancelWhenOutside ?? true,
    minDuration: config.minDuration,
    maxDistance: config.maxDistance,
    numberOfPointers: config.numberOfPointers,
  },
})

/** `useNativeGesture`, the hook spelling of `Gesture.Native()`. */
export const useNativeGesture = (
  config: NativeGestureHookConfig = EMPTY_NATIVE,
): GestureSpec => ({
  kind: "native",
  config: {
    ...adaptCommon(config),
    shouldCancelWhenOutside: config.shouldCancelWhenOutside ?? true,
    shouldActivateOnStart: config.shouldActivateOnStart,
    disallowInterruption: config.disallowInterruption,
    yieldsToContinuousGestures: config.yieldsToContinuousGestures,
    onUpdate: config.onUpdate,
  },
})

const EMPTY_TOUCHPAD: TouchpadGestureHookConfig = {}

/**
 * `usePinchGesture`, the hook spelling of `Gesture.Pinch()` — and the spelling
 * upstream's own `@deprecated` tag on `Gesture.Pinch()` points at.
 *
 * `shouldCancelWhenOutside` defaults to FALSE, matching the builder and
 * matching `PinchGestureHandler.init`: a pinch is not addressed to a point the
 * way a tap is, and a focal point that drifts off the view mid-gesture is not
 * a reason to cancel it.
 */
export const usePinchGesture = (
  config: TouchpadGestureHookConfig = EMPTY_TOUCHPAD,
): GestureSpec => ({
  kind: "pinch",
  config: {
    ...adaptCommon(config),
    shouldCancelWhenOutside: config.shouldCancelWhenOutside ?? false,
    onUpdate: config.onUpdate,
  },
})

/** `useRotationGesture`, the hook spelling of `Gesture.Rotation()`. */
export const useRotationGesture = (
  config: TouchpadGestureHookConfig = EMPTY_TOUCHPAD,
): GestureSpec => ({
  kind: "rotation",
  config: {
    ...adaptCommon(config),
    shouldCancelWhenOutside: config.shouldCancelWhenOutside ?? false,
    onUpdate: config.onUpdate,
  },
})

/**
 * The config object `useFlingGesture` accepts.
 *
 * No `onUpdate`, matching upstream: `FlingGestureInternalConfig` is a
 * `BaseDiscreteGestureConfig`, which omits it by name. A fling activates and
 * ends in one breath and has nothing to update with.
 */
export type FlingGestureHookConfig = CommonGestureHookConfig & {
  direction?: number
  numberOfPointers?: number
}

/** The config object `useManualGesture` accepts, which is only the common one. */
export type ManualGestureHookConfig = CommonGestureHookConfig & {
  onUpdate?: (event: GestureEventPayload) => void
}

/** The config object `useHoverGesture` accepts. */
export type HoverGestureHookConfig = CommonGestureHookConfig & {
  /**
   * iOS's own pointer effect. Upstream's hook maps `effect` onto the native
   * `hoverEffect` prop; both names arrive at the same inert field here.
   */
  effect?: number
  onUpdate?: (event: GestureEventPayload) => void
}

const EMPTY_FLING: FlingGestureHookConfig = {}
const EMPTY_MANUAL: ManualGestureHookConfig = {}
const EMPTY_HOVER: HoverGestureHookConfig = {}

/** `useFlingGesture`, the hook spelling of `Gesture.Fling()`. */
export const useFlingGesture = (
  config: FlingGestureHookConfig = EMPTY_FLING,
): GestureSpec => ({
  kind: "fling",
  config: {
    ...adaptCommon(config),
    direction: config.direction,
    numberOfPointers: config.numberOfPointers,
  },
})

/** `useManualGesture`, the hook spelling of `Gesture.Manual()`. */
export const useManualGesture = (
  config: ManualGestureHookConfig = EMPTY_MANUAL,
): GestureSpec => ({
  kind: "manual",
  config: {
    ...adaptCommon(config),
    onUpdate: config.onUpdate,
  },
})

/** `useHoverGesture`, the hook spelling of `Gesture.Hover()`. */
export const useHoverGesture = (
  config: HoverGestureHookConfig = EMPTY_HOVER,
): GestureSpec => ({
  kind: "hover",
  config: {
    ...adaptCommon(config),
    hoverEffect: config.effect,
    onUpdate: config.onUpdate,
  },
})

// There is deliberately NO `useForceTouchGesture`, and that is upstream's own
// boundary rather than this platform's: `src/v3/hooks/gestures/` has nine
// directories and no `forceTouch`, `SingleGesture` omits it from its union,
// and no such hook is exported anywhere in 3.1.0. Inventing one would be the
// only place in this module where the hook spelling is richer than the
// spelling it was migrated from. `Gesture.ForceTouch()` is the whole API
// upstream offers, so it is the whole API offered here.

// --- the composers, in the hook spelling ---
//
// Not hooks in any real sense — upstream's are not either, past a `useMemo`
// it does not need — and exported under these names because that is what
// upstream's `src/v3` calls them and what an app migrating off the deprecated
// statics will write. `useCompetingGestures` is `Gesture.Race()` under the
// better name: the gestures compete, and they would have anyway.

export const useCompetingGestures = (
  ...gestures: AnyGestureSpec[]
): ComposedGestureSpec => raceGestures(...gestures)

export const useSimultaneousGestures = (
  ...gestures: AnyGestureSpec[]
): ComposedGestureSpec => simultaneousGestures(...gestures)

export const useExclusiveGestures = (
  ...gestures: AnyGestureSpec[]
): ComposedGestureSpec => exclusiveGestures(...gestures)
