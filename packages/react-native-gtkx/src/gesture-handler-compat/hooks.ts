// Spelling two: `usePanGesture(config)`, the hook.
//
// The replacement upstream is migrating to — a 6,763-line tree of hooks that
// deprecated all twelve builder statics in 3.1.0. Nothing here reimplements
// the recognizer; it normalises a config object onto the same
// `PanRecognizerConfig` the builder writes and returns the same `GestureSpec`.
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
import type {
  GestureHitSlop,
  GestureSpec,
  GestureTouchEvent,
  OffsetBound,
  PanEndEventPayload,
  PanEventPayload,
  PanRecognizerConfig,
} from "./types"

/** The config object `usePanGesture` accepts. */
export type PanGestureHookConfig = {
  enabled?: boolean
  hitSlop?: GestureHitSlop
  shouldCancelWhenOutside?: boolean
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
  manualActivation?: boolean
  runOnJS?: boolean
  testID?: string
  onBegin?: (event: PanEventPayload) => void
  onActivate?: (event: PanEventPayload) => void
  onUpdate?: (event: PanEventPayload) => void
  onDeactivate?: (event: PanEndEventPayload) => void
  onFinalize?: (event: PanEndEventPayload) => void
  onTouchesDown?: (event: GestureTouchEvent) => void
  onTouchesMove?: (event: GestureTouchEvent) => void
  onTouchesUp?: (event: GestureTouchEvent) => void
  onTouchesCancel?: (event: GestureTouchEvent) => void
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

const EMPTY: PanGestureHookConfig = {}

/**
 * The hook spelling. Rebuilds its spec every render, exactly as the builder
 * chained in a component body does, because the callbacks it closes over are
 * rebuilt every render too — `GestureDetector` reads the config through a ref
 * rather than resubscribing, which is what makes that free.
 */
export const usePanGesture = (
  config: PanGestureHookConfig = EMPTY,
): GestureSpec => {
  validate(config)

  const normalised: PanRecognizerConfig = {
    enabled: config.enabled,
    hitSlop: config.hitSlop,
    shouldCancelWhenOutside: config.shouldCancelWhenOutside,
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
    manualActivation: config.manualActivation,
    onBegin: config.onBegin,
    onActivate: config.onActivate,
    onUpdate: config.onUpdate,
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

  return { kind: "pan", config: normalised }
}
