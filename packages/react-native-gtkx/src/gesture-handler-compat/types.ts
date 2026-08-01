// The internal shape of a gesture, and the vocabulary its callbacks speak.
//
// THIS is the implementation. `Gesture.Pan()` and `usePanGesture()` are two
// spellings that both produce a `GestureSpec` and nothing else, which is the
// one architectural decision this module is not free to get wrong: upstream
// deprecated all twelve `Gesture.*` statics in 3.1.0 in favour of a hook tree
// and had to rewrite the internals because the builder WAS the internals.
//
// The two spellings are not cosmetic variants of each other, and that is the
// reason this middle layer earns its keep. Upstream's hook renamed `onStart`
// to `onActivate` and `onEnd` to `onDeactivate`, dropped `onChange`, renamed
// `onTouchesCancelled` to `onTouchesCancel`, and replaced the
// `(event, success)` ending signature with a `canceled` field on the event.
// Neither naming is privileged here: the internal callbacks use the newer
// names because that is the shape upstream is migrating towards, and both
// public spellings adapt onto them.
//
// Config is plain data on purpose. A builder that accumulated behaviour
// rather than values would make the hook spelling a reimplementation instead
// of a second constructor, and would leave nothing for the orchestrator
// (slice 3) to read.

/**
 * RNGH's gesture states, as numbers, because its event payloads carry `state`
 * and consumers compare it.
 *
 * The `State` enum is NOT exported from this package yet — that is slice 2,
 * with `Tap` and `LongPress`. The values live here so payloads can be
 * faithful in the meantime.
 */
export const GESTURE_STATE = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
} as const

export type GestureStateValue =
  (typeof GESTURE_STATE)[keyof typeof GESTURE_STATE]

/** RNGH's `TouchEventType`, for the `onTouches*` callbacks. */
export const TOUCH_EVENT_TYPE = {
  UNDETERMINED: 0,
  TOUCHES_DOWN: 1,
  TOUCHES_MOVE: 2,
  TOUCHES_UP: 3,
  TOUCHES_CANCEL: 4,
} as const

export type TouchEventTypeValue =
  (typeof TOUCH_EVENT_TYPE)[keyof typeof TOUCH_EVENT_TYPE]

/**
 * RNGH's `PointerType`. Every event here is `MOUSE`: the responder system
 * fabricates one touch per pointer and this platform has no touch input to
 * distinguish it from (`docs/research/gestures.md` — wlroots offers no
 * virtual-touch protocol, so there is nothing to test a `TOUCH` path with).
 */
export const POINTER_TYPE = {
  TOUCH: 0,
  STYLUS: 1,
  MOUSE: 2,
  KEY: 3,
  OTHER: 4,
} as const

/**
 * An activation or failure bound.
 *
 * The single-number spelling is directional, and the direction is the SIGN:
 * `activeOffsetX(20)` bounds the positive side only and leaves the negative
 * side unbounded, `activeOffsetX(-20)` the other way round. Reading it as a
 * symmetric ±20 turns a one-way drawer into a two-way one, silently.
 */
export type OffsetBound = number | readonly [number, number]

/**
 * Extra area in which a press still counts, in RNGH's gesture spelling rather
 * than RN's View one — and note that it can SHRINK the area, which RN's
 * cannot: a negative number pulls every edge inwards.
 *
 * `width`/`height` anchor the box to whichever side was named:
 * `{ left: 0, width: 32 }` is "the leftmost 32px", which is exactly how
 * `react-native-drawer-layout` catches an edge swipe on a closed drawer.
 */
export type GestureHitSlop =
  | number
  | null
  | {
      left?: number
      right?: number
      top?: number
      bottom?: number
      width?: number
      height?: number
      vertical?: number
      horizontal?: number
    }

/**
 * One event payload, carrying the union of what both spellings read.
 *
 * The legacy spelling's `GestureUpdateEvent`/`GestureStateChangeEvent` and
 * the hook spelling's `GestureEvent`/`GestureEndEvent` are subsets of this,
 * so the recognizer builds it once and each facade hands it over as-is. The
 * extra fields a given spelling does not document are harmless; inventing a
 * second payload so each could be exactly minimal would be two things to keep
 * correct instead of one.
 */
export type PanEventPayload = {
  handlerTag: number
  numberOfPointers: number
  pointerType: (typeof POINTER_TYPE)[keyof typeof POINTER_TYPE]
  state: GestureStateValue
  /** Only meaningful on the state-change callbacks; the legacy spelling reads it. */
  oldState: GestureStateValue
  /** Relative to the GESTURE's view, not to whatever widget carried the event. */
  x: number
  y: number
  /** Window coordinates — RN's `pageX`/`pageY`. */
  absoluteX: number
  absoluteY: number
  /** Measured from the point of ACTIVATION, not from the press. */
  translationX: number
  translationY: number
  velocityX: number
  velocityY: number
  /** Delta of TRANSLATION since the previous update; equal to it on the first. */
  changeX: number
  changeY: number
}

/** The ending payload the hook spelling reads, which says `canceled` instead. */
export type PanEndEventPayload = PanEventPayload & { canceled: boolean }

/** One pointer, as the `onTouches*` callbacks see it. */
export type GestureTouchData = {
  id: number
  x: number
  y: number
  absoluteX: number
  absoluteY: number
}

export type GestureTouchEvent = {
  handlerTag: number
  numberOfTouches: number
  eventType: TouchEventTypeValue
  allTouches: GestureTouchData[]
  changedTouches: GestureTouchData[]
  state: GestureStateValue
  pointerType: (typeof POINTER_TYPE)[keyof typeof POINTER_TYPE]
}

/**
 * The imperative handle handed to `onTouches*` by the legacy spelling.
 *
 * `activate()` from here is a second reason the responder system grew an
 * out-of-event grant channel: a callback that decides mid-press to take the
 * gesture is in exactly the position `activateAfterLongPress`'s timer is in.
 */
export type GestureStateManagerApi = {
  begin: () => void
  activate: () => void
  fail: () => void
  end: () => void
}

/**
 * The internal callback set, in the hook spelling's names. Both facades
 * normalise onto this; the recognizer knows no other names.
 */
export type PanRecognizerCallbacks = {
  onBegin?: (event: PanEventPayload) => void
  onActivate?: (event: PanEventPayload) => void
  onUpdate?: (event: PanEventPayload) => void
  onChange?: (event: PanEventPayload) => void
  onDeactivate?: (event: PanEventPayload, success: boolean) => void
  onFinalize?: (event: PanEventPayload, success: boolean) => void
  onTouchesDown?: (
    event: GestureTouchEvent,
    manager: GestureStateManagerApi,
  ) => void
  onTouchesMove?: (
    event: GestureTouchEvent,
    manager: GestureStateManagerApi,
  ) => void
  onTouchesUp?: (
    event: GestureTouchEvent,
    manager: GestureStateManagerApi,
  ) => void
  onTouchesCancel?: (
    event: GestureTouchEvent,
    manager: GestureStateManagerApi,
  ) => void
}

/** Everything both spellings configure, normalised. */
export type PanRecognizerConfig = PanRecognizerCallbacks & {
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
  /** Only the `onTouches*` state manager may activate the gesture. */
  manualActivation?: boolean

  // Recorded, and deliberately not acted on. Each is either platform-specific
  // upstream and inert off its platform (`averageTouches` is Android-only,
  // `enableTrackpadTwoFingerGesture` and `cancelsTouchesInView` iOS-only,
  // `activeCursor` and `mouseButton` Web-only) or asks for something this
  // platform already gives it (`runOnJS` — there is one runtime here, so every
  // callback already runs on the JS one). Keeping them in the config means it
  // describes what the app asked for rather than only what was honoured.
  runOnJS?: boolean
  averageTouches?: boolean
  enableTrackpadTwoFingerGesture?: boolean
  cancelsTouchesInView?: boolean
  activeCursor?: string
  mouseButton?: number
  testId?: string
}

export type GestureKind = "pan"

/**
 * What a `GestureDetector` consumes. Both spellings produce exactly this.
 *
 * No `handlerTag`: a tag identifies a MOUNTED gesture, and both spellings
 * rebuild their object on every render (upstream's do too — the builder is
 * called in the component body, the hook returns a fresh config). The
 * detector mints one stable tag for as long as it is mounted, which is the
 * identity that means something.
 */
export type GestureSpec = {
  readonly kind: GestureKind
  readonly config: PanRecognizerConfig
}

let nextHandlerTag = 1

/** RNGH's `handlerTag`: an identity for one mounted gesture. */
export const mintHandlerTag = (): number => {
  const tag = nextHandlerTag
  nextHandlerTag += 1
  return tag
}

/** Whether a value is something a `GestureDetector` can drive. */
export const isGestureSpec = (value: unknown): value is GestureSpec =>
  typeof value === "object" &&
  value !== null &&
  (value as GestureSpec).kind === "pan" &&
  typeof (value as GestureSpec).config === "object"
