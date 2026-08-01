// Spelling one: `Gesture.Pan()`, the chainable builder.
//
// Deprecated upstream since 3.1.0 — every one of the twelve `Gesture.*`
// statics carries an `@deprecated` tag pointing at a hook — and it is still
// what every shipped consumer calls, which is why it is the spelling that had
// to work first. It is a facade: each method writes one value into a
// `PanRecognizerConfig` and returns `this`, and the object it builds is a
// `GestureSpec` and nothing more.
//
// The callback renames are where the two spellings genuinely differ.
// `onStart` and `onEnd` here are `onActivate` and `onDeactivate` internally,
// `onTouchesCancelled` is `onTouchesCancel`, and `onChange` — which the hook
// spelling dropped — is an ordinary callback over the same payload, because
// the payload already carries `changeX`/`changeY`.
import { createUnsupportedFactory } from "../unsupported-export"
import type {
  GestureHitSlop,
  GestureSpec,
  GestureStateManagerApi,
  GestureTouchEvent,
  OffsetBound,
  PanEventPayload,
  PanRecognizerConfig,
} from "./types"

type TouchHandler = (
  event: GestureTouchEvent,
  manager: GestureStateManagerApi,
) => void

const unsupported = createUnsupportedFactory(
  "react-native-gesture-handler",
  "Pan and GestureDetector are implemented; cross-gesture relations and the " +
    "composers arrive with the arbitration registry. See docs/api.md.",
)

/**
 * Refuses one relation method, naming it and the gestures it was handed —
 * which is how an app finds WHICH pairing it was relying on when several are
 * configured across a screen.
 */
const refuseRelation = (name: string, gestures: unknown[]): never => {
  // The stand-in is deliberately `any` so an app's call still type-checks
  // against the real package; naming its return type here is what lets the
  // builder methods keep declaring `this`.
  const fail = unsupported(`PanGesture.${name}`) as (
    ...args: unknown[]
  ) => never
  return fail(...gestures)
}

/**
 * The builder. Not a port of upstream's `PanGesture`: it holds no handler
 * tag, no relation bookkeeping and no worklet machinery, because on this
 * platform there is one runtime and the arbitration registry does not exist
 * yet.
 */
export class PanGestureBuilder implements GestureSpec {
  readonly kind = "pan" as const
  readonly config: PanRecognizerConfig = {}

  // --- activation and failure bounds ---
  activeOffsetX(offset: OffsetBound): this {
    this.config.activeOffsetX = offset
    return this
  }
  activeOffsetY(offset: OffsetBound): this {
    this.config.activeOffsetY = offset
    return this
  }
  failOffsetX(offset: OffsetBound): this {
    this.config.failOffsetX = offset
    return this
  }
  failOffsetY(offset: OffsetBound): this {
    this.config.failOffsetY = offset
    return this
  }
  minDistance(distance: number): this {
    this.config.minDistance = distance
    return this
  }
  minVelocity(velocity: number): this {
    this.config.minVelocity = velocity
    return this
  }
  minVelocityX(velocity: number): this {
    this.config.minVelocityX = velocity
    return this
  }
  minVelocityY(velocity: number): this {
    this.config.minVelocityY = velocity
    return this
  }
  minPointers(count: number): this {
    this.config.minPointers = count
    return this
  }
  maxPointers(count: number): this {
    this.config.maxPointers = count
    return this
  }
  activateAfterLongPress(duration: number): this {
    this.config.activateAfterLongPress = duration
    return this
  }
  manualActivation(value: boolean): this {
    this.config.manualActivation = value
    return this
  }

  // --- common configuration ---
  enabled(value: boolean): this {
    this.config.enabled = value
    return this
  }
  shouldCancelWhenOutside(value: boolean): this {
    this.config.shouldCancelWhenOutside = value
    return this
  }
  hitSlop(value: GestureHitSlop): this {
    this.config.hitSlop = value
    return this
  }

  // --- callbacks ---
  onBegin(callback: (event: PanEventPayload) => void): this {
    this.config.onBegin = callback
    return this
  }
  onStart(callback: (event: PanEventPayload) => void): this {
    this.config.onActivate = callback
    return this
  }
  onUpdate(callback: (event: PanEventPayload) => void): this {
    this.config.onUpdate = callback
    return this
  }
  onChange(callback: (event: PanEventPayload) => void): this {
    this.config.onChange = callback
    return this
  }
  onEnd(callback: (event: PanEventPayload, success: boolean) => void): this {
    this.config.onDeactivate = callback
    return this
  }
  onFinalize(
    callback: (event: PanEventPayload, success: boolean) => void,
  ): this {
    this.config.onFinalize = callback
    return this
  }
  onTouchesDown(callback: TouchHandler): this {
    this.config.onTouchesDown = callback
    return this
  }
  onTouchesMove(callback: TouchHandler): this {
    this.config.onTouchesMove = callback
    return this
  }
  onTouchesUp(callback: TouchHandler): this {
    this.config.onTouchesUp = callback
    return this
  }
  onTouchesCancelled(callback: TouchHandler): this {
    this.config.onTouchesCancel = callback
    return this
  }

  /**
   * Recorded and not acted on, exactly as upstream does not act on it off its
   * worklet platforms: gesture callbacks are worklets by default there and
   * this asks for the JS runtime instead. There is one runtime here, so every
   * callback already runs where this is asking it to. `@gorhom/bottom-sheet`
   * sets it twice; making it throw would refuse code that is already correct.
   *
   * Recorded rather than discarded so the config still describes what the app
   * asked for — the orchestrator and any devtools read this object.
   */
  runOnJS(value: boolean): this {
    this.config.runOnJS = value
    return this
  }

  /**
   * Platform-specific upstream and inert here, which is upstream's own
   * treatment of them off their platforms: `averageTouches` is Android-only,
   * `enableTrackpadTwoFingerGesture` and `cancelsTouchesInView` are iOS-only,
   * `activeCursor` and `mouseButton` are Web-only. Accepting them keeps
   * portable source portable; docs/api.md records that they do nothing.
   */
  averageTouches(value: boolean): this {
    this.config.averageTouches = value
    return this
  }
  enableTrackpadTwoFingerGesture(value: boolean): this {
    this.config.enableTrackpadTwoFingerGesture = value
    return this
  }
  cancelsTouchesInView(value: boolean): this {
    this.config.cancelsTouchesInView = value
    return this
  }
  activeCursor(value: string): this {
    this.config.activeCursor = value
    return this
  }
  mouseButton(value: number): this {
    this.config.mouseButton = value
    return this
  }

  /** Upstream stores a ref for the relation APIs; harmless to honour early. */
  withRef(ref: { current: unknown }): this {
    ref.current = this
    return this
  }
  withTestId(id: string): this {
    this.config.testId = id
    return this
  }

  /** Upstream's flattening hook for composed gestures; a lone gesture is a list of one. */
  toGestureArray(): PanGestureBuilder[] {
    return [this]
  }

  // --- the relations, which are a later slice ---
  //
  // Stored nowhere and refused loudly. A relation that silently did nothing
  // would produce exactly the failure this repo refuses elsewhere: two
  // gestures that were meant to cooperate racing instead, with no error and
  // a drag that works on mobile and not here.
  simultaneousWithExternalGesture(...gestures: unknown[]): this {
    return refuseRelation("simultaneousWithExternalGesture", gestures)
  }
  requireExternalGestureToFail(...gestures: unknown[]): this {
    return refuseRelation("requireExternalGestureToFail", gestures)
  }
  blocksExternalGesture(...gestures: unknown[]): this {
    return refuseRelation("blocksExternalGesture", gestures)
  }
}

/**
 * `Gesture`, the namespace of statics.
 *
 * `Pan` is real. The other eleven throw by name, and that is the point:
 * docs/research/gestures.md records the failure mode this repo most wants to
 * avoid — a component that accepts its props, renders, and does nothing.
 */
export const Gesture = {
  Pan: (): PanGestureBuilder => new PanGestureBuilder(),
  Tap: unsupported("Gesture.Tap"),
  LongPress: unsupported("Gesture.LongPress"),
  Native: unsupported("Gesture.Native"),
  Pinch: unsupported("Gesture.Pinch"),
  Rotation: unsupported("Gesture.Rotation"),
  Fling: unsupported("Gesture.Fling"),
  Hover: unsupported("Gesture.Hover"),
  Manual: unsupported("Gesture.Manual"),
  ForceTouch: unsupported("Gesture.ForceTouch"),
  Race: unsupported("Gesture.Race"),
  Simultaneous: unsupported("Gesture.Simultaneous"),
  Exclusive: unsupported("Gesture.Exclusive"),
}
