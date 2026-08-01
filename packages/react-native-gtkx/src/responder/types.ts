// The responder system's public vocabulary: the touch-history shape RN's
// PanResponder expects, and the props a View accepts.
//
// The touch-history shape is not ours to design. react-native-web proved
// that RN's own PanResponder runs unmodified on a foreign platform provided
// this structure is reproduced exactly — field for field, including the
// three-way current/previous/start split and the millisecond timestamps —
// so it is transcribed from ResponderTouchHistoryStore rather than invented.
import type { NativeTouch, PressEvent } from "../components/press-event"

/** One tracked touch. Field names are RN's; do not "tidy" them. */
export type TouchRecord = {
  touchActive: boolean
  startPageX: number
  startPageY: number
  startTimeStamp: number
  currentPageX: number
  currentPageY: number
  currentTimeStamp: number
  previousPageX: number
  previousPageY: number
  previousTimeStamp: number
}

export type TouchHistory = {
  // Sparse: indexed by touch identifier, exactly as RN does it.
  touchBank: TouchRecord[]
  numberActiveTouches: number
  // Only meaningful when numberActiveTouches === 1; TouchHistoryMath's fast
  // path reads it directly.
  indexOfSingleActiveTouch: number
  mostRecentTimeStamp: number
}

/**
 * What every responder callback receives. PanResponder reads `touchHistory`
 * off the EVENT, not off `nativeEvent` — an easy detail to get wrong, and it
 * silently zeroes every gesture if you do.
 */
export type GestureResponderEvent = PressEvent & {
  touchHistory: TouchHistory
}

export type ShouldSetResponder = (event: GestureResponderEvent) => boolean

/**
 * RN's responder and touch props. The touch props fire regardless of who
 * holds the responder; the rest are the negotiation.
 */
export type ResponderProps = {
  onStartShouldSetResponder?: ShouldSetResponder
  onStartShouldSetResponderCapture?: ShouldSetResponder
  onMoveShouldSetResponder?: ShouldSetResponder
  onMoveShouldSetResponderCapture?: ShouldSetResponder
  // RN lets onResponderGrant return a boolean (onShouldBlockNativeResponder);
  // PanResponder's does. Nothing consumes it here yet — see docs/api.md.
  onResponderGrant?: (event: GestureResponderEvent) => void | boolean
  onResponderStart?: (event: GestureResponderEvent) => void
  onResponderMove?: (event: GestureResponderEvent) => void
  onResponderEnd?: (event: GestureResponderEvent) => void
  onResponderRelease?: (event: GestureResponderEvent) => void
  onResponderTerminate?: (event: GestureResponderEvent) => void
  onResponderTerminationRequest?: ShouldSetResponder
  onResponderReject?: (event: GestureResponderEvent) => void

  onTouchStart?: (event: GestureResponderEvent) => void
  onTouchStartCapture?: (event: GestureResponderEvent) => void
  onTouchMove?: (event: GestureResponderEvent) => void
  onTouchMoveCapture?: (event: GestureResponderEvent) => void
  onTouchEnd?: (event: GestureResponderEvent) => void
  onTouchEndCapture?: (event: GestureResponderEvent) => void
  onTouchCancel?: (event: GestureResponderEvent) => void
  onTouchCancelCapture?: (event: GestureResponderEvent) => void
}

const RESPONDER_PROP_NAMES = [
  "onStartShouldSetResponder",
  "onStartShouldSetResponderCapture",
  "onMoveShouldSetResponder",
  "onMoveShouldSetResponderCapture",
  "onResponderGrant",
  "onResponderStart",
  "onResponderMove",
  "onResponderEnd",
  "onResponderRelease",
  "onResponderTerminate",
  "onResponderTerminationRequest",
  "onResponderReject",
  "onTouchStart",
  "onTouchStartCapture",
  "onTouchMove",
  "onTouchMoveCapture",
  "onTouchEnd",
  "onTouchEndCapture",
  "onTouchCancel",
  "onTouchCancelCapture",
] as const satisfies readonly (keyof ResponderProps)[]

/**
 * Whether a component needs an event source at all. A View with no responder
 * props gets no GTK controller: RN only ever asks views that declare
 * handlers, so attaching one everywhere would be pure cost.
 */
export const hasResponderProps = (props: ResponderProps): boolean =>
  RESPONDER_PROP_NAMES.some((name) => props[name] !== undefined)

/** A single touch as PanResponder's `touches`/`changedTouches` see it. */
export type { NativeTouch }
