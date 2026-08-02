// Spelling one: `Gesture.Pan()` / `.Tap()` / `.LongPress()`, the chainable
// builders.
//
// Deprecated upstream since 3.1.0 — every one of the twelve `Gesture.*`
// statics carries an `@deprecated` tag pointing at a hook — and it is still
// what every shipped consumer calls, which is why it is the spelling that had
// to work first. It is a facade: each method writes one value into a
// `RecognizerConfig` and returns `this`, and the object it builds is a
// `GestureSpec` and nothing more.
//
// The class split mirrors upstream's. `BaseGestureBuilder` is its
// `BaseGesture` — everything the three kinds share — and `onUpdate`/`onChange`
// live on `PanGestureBuilder` alone because upstream puts them on
// `ContinousBaseGesture`, which `TapGesture` and `LongPressGesture` do not
// extend. A discrete gesture has no travel to report.
//
// The callback renames are where the two spellings genuinely differ.
// `onStart` and `onEnd` here are `onActivate` and `onDeactivate` internally,
// `onTouchesCancelled` is `onTouchesCancel`, and `onChange` — which the hook
// spelling dropped — is an ordinary callback over the same payload, because
// the payload already carries `changeX`/`changeY`.
import { createUnsupportedFactory } from "../unsupported-export"
import {
  exclusiveGestures,
  raceGestures,
  simultaneousGestures,
} from "./composition"
import type {
  AnyGestureSpec,
  ComposedGestureSpec,
  GestureEventPayload,
  GestureHitSlop,
  GestureKind,
  GestureRef,
  GestureSpec,
  GestureStateManagerApi,
  GestureTouchEvent,
  OffsetBound,
  RecognizerConfig,
} from "./types"

type TouchHandler = (
  event: GestureTouchEvent,
  manager: GestureStateManagerApi,
) => void

const unsupported = createUnsupportedFactory(
  "react-native-gesture-handler",
  "Pan, Tap, LongPress, Native, Pinch, Rotation, GestureDetector, the cross-gesture " +
    "relations and the three composers are implemented. See docs/api.md.",
)

/**
 * Everything upstream's `BaseGesture` has, which is everything the three
 * implemented kinds share. Not a port of it: it holds no handler tag and no
 * worklet machinery, because on this platform there is one runtime and a
 * handler tag identifies a MOUNTED gesture rather than a built one. The
 * relations it does hold are lists of references and nothing else — the maps
 * that read them live in ./relations, and the loop that acts on them in
 * ./orchestrator.
 *
 * `onUpdate` and `onChange` are deliberately NOT here. Upstream puts them on
 * `ContinousBaseGesture`, which `Tap` and `LongPress` do not extend — they are
 * discrete, they have no travel to report, and offering the methods would
 * invite a callback that never fires.
 */
abstract class BaseGestureBuilder implements GestureSpec {
  abstract readonly kind: GestureKind
  readonly config: RecognizerConfig = {}

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
  manualActivation(value: boolean): this {
    this.config.manualActivation = value
    return this
  }

  // --- callbacks ---
  onBegin(callback: (event: GestureEventPayload) => void): this {
    this.config.onBegin = callback
    return this
  }
  onStart(callback: (event: GestureEventPayload) => void): this {
    this.config.onActivate = callback
    return this
  }
  onEnd(
    callback: (event: GestureEventPayload, success: boolean) => void,
  ): this {
    this.config.onDeactivate = callback
    return this
  }
  onFinalize(
    callback: (event: GestureEventPayload, success: boolean) => void,
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
  toGestureArray(): BaseGestureBuilder[] {
    return [this]
  }

  // --- the relations ---
  //
  // Three methods, three lists, one place they are read: the maps in
  // ./relations. Each of them writes a list of REFERENCES rather than tags —
  // an app names another gesture with the gesture object it built, and the
  // tag that identifies a mounted one does not exist until a detector mounts
  // it. `withRef()` and a raw tag are accepted in the same position, as
  // upstream's `GestureRef` is.
  //
  // Appending rather than replacing: `.simultaneousWithExternalGesture(a)`
  // followed by `.simultaneousWithExternalGesture(b)` means both, which is
  // what chaining reads like. The builder is rebuilt every render by every
  // app that follows upstream's own advice, so nothing accumulates across
  // renders — and composition computes rather than writes back here, so it
  // cannot accumulate either.
  simultaneousWithExternalGesture(...gestures: GestureRef[]): this {
    this.config.simultaneousHandlers = [
      ...(this.config.simultaneousHandlers ?? []),
      ...gestures,
    ]
    return this
  }
  requireExternalGestureToFail(...gestures: GestureRef[]): this {
    this.config.waitFor = [...(this.config.waitFor ?? []), ...gestures]
    return this
  }
  blocksExternalGesture(...gestures: GestureRef[]): this {
    this.config.blocksHandlers = [
      ...(this.config.blocksHandlers ?? []),
      ...gestures,
    ]
    return this
  }
}

/** `Gesture.Pan()`, and the only one of the three that reports travel. */
export class PanGestureBuilder extends BaseGestureBuilder {
  readonly kind = "pan" as const

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

  // --- the continuous callbacks, which only a continuous gesture has ---
  onUpdate(callback: (event: GestureEventPayload) => void): this {
    this.config.onUpdate = callback
    return this
  }
  onChange(callback: (event: GestureEventPayload) => void): this {
    this.config.onChange = callback
    return this
  }
}

/**
 * `Gesture.Tap()`.
 *
 * `shouldCancelWhenOutside` is on by default, set from the constructor exactly
 * as upstream's `TapGesture` does — a press that wanders off the view is not a
 * tap on it, and the native `TapGestureHandler` config says the same.
 */
export class TapGestureBuilder extends BaseGestureBuilder {
  readonly kind = "tap" as const

  constructor() {
    super()
    this.shouldCancelWhenOutside(true)
  }

  numberOfTaps(count: number): this {
    this.config.numberOfTaps = count
    return this
  }
  maxDuration(duration: number): this {
    this.config.maxDuration = duration
    return this
  }
  maxDelay(delay: number): this {
    this.config.maxDelay = delay
    return this
  }
  maxDistance(distance: number): this {
    this.config.maxDistance = distance
    return this
  }
  maxDeltaX(delta: number): this {
    this.config.maxDeltaX = delta
    return this
  }
  maxDeltaY(delta: number): this {
    this.config.maxDeltaY = delta
    return this
  }
  minPointers(count: number): this {
    this.config.minPointers = count
    return this
  }
}

/** `Gesture.LongPress()`, with upstream's default of `shouldCancelWhenOutside`. */
export class LongPressGestureBuilder extends BaseGestureBuilder {
  readonly kind = "longPress" as const

  constructor() {
    super()
    this.shouldCancelWhenOutside(true)
  }

  minDuration(duration: number): this {
    this.config.minDuration = duration
    return this
  }
  maxDistance(distance: number): this {
    this.config.maxDistance = distance
    return this
  }
  numberOfPointers(count: number): this {
    this.config.numberOfPointers = count
    return this
  }
}

/**
 * `Gesture.Native()` — the widget underneath, put into the arbitration.
 *
 * `shouldCancelWhenOutside` defaults to true from the constructor, which is
 * where upstream's `NativeViewGestureHandler.init` sets it rather than its
 * builder. See ./native for what the recognizer does and, more to the point,
 * what it deliberately does not do: it never takes the responder, because
 * taking it is what switches the native scroller off.
 */
export class NativeGestureBuilder extends BaseGestureBuilder {
  readonly kind = "native" as const

  constructor() {
    super()
    this.shouldCancelWhenOutside(true)
  }

  shouldActivateOnStart(value: boolean): this {
    this.config.shouldActivateOnStart = value
    return this
  }
  disallowInterruption(value: boolean): this {
    this.config.disallowInterruption = value
    return this
  }
  yieldsToContinuousGestures(value: boolean): this {
    this.config.yieldsToContinuousGestures = value
    return this
  }

  /**
   * A native view is CONTINUOUS upstream (`isContinuous = true`), so it
   * reports travel like `Pan` does and unlike `Tap`. These are here rather
   * than on the base class for the same reason they are on
   * `PanGestureBuilder`: upstream puts them on `ContinousBaseGesture`.
   */
  onUpdate(callback: (event: GestureEventPayload) => void): this {
    this.config.onUpdate = callback
    return this
  }
  onChange(callback: (event: GestureEventPayload) => void): this {
    this.config.onChange = callback
    return this
  }
}

/**
 * `Gesture.Pinch()` and `Gesture.Rotation()`, which have no configuration of
 * their own at all — verified against 3.1.0, where `PinchGesture` and
 * `RotationGesture` add zero builder methods over `ContinousBaseGesture`, and
 * where v3's `PinchGestureNativeProperties` is literally
 * `Record<string, never>`. Both are CONTINUOUS, so `onUpdate`/`onChange` are
 * here for the same reason they are on `PanGestureBuilder`.
 *
 * `shouldCancelWhenOutside` is off, set from the constructor because upstream
 * sets it from `PinchGestureHandler.init`/`RotationGestureHandler.init` — a
 * pinch whose focal point wanders off the view keeps running, unlike a tap.
 *
 * What they do NOT have is a pointer: see ./touchpad. Their numbers come from
 * `GtkGestureZoom`/`GtkGestureRotate`, and everything else about them — the
 * states, the callbacks, the arbitration — is the machine every other kind
 * runs on.
 */
export class PinchGestureBuilder extends BaseGestureBuilder {
  readonly kind = "pinch" as const

  constructor() {
    super()
    this.shouldCancelWhenOutside(false)
  }

  onUpdate(callback: (event: GestureEventPayload) => void): this {
    this.config.onUpdate = callback
    return this
  }
  onChange(callback: (event: GestureEventPayload) => void): this {
    this.config.onChange = callback
    return this
  }
}

/** `Gesture.Rotation()`. Same shape as `Pinch`, same reasons. */
export class RotationGestureBuilder extends BaseGestureBuilder {
  readonly kind = "rotation" as const

  constructor() {
    super()
    this.shouldCancelWhenOutside(false)
  }

  onUpdate(callback: (event: GestureEventPayload) => void): this {
    this.config.onUpdate = callback
    return this
  }
  onChange(callback: (event: GestureEventPayload) => void): this {
    this.config.onChange = callback
    return this
  }
}

/**
 * `Gesture`, the namespace of statics.
 *
 * `Pan`, `Tap`, `LongPress`, `Native`, `Pinch`, `Rotation` and the three
 * composers are real. The other four throw by name, and that is the point:
 * docs/research/gestures.md records the failure mode this repo most wants to
 * avoid — a component that accepts its props, renders, and does nothing.
 */
export const Gesture = {
  Pan: (): PanGestureBuilder => new PanGestureBuilder(),
  Tap: (): TapGestureBuilder => new TapGestureBuilder(),
  LongPress: (): LongPressGestureBuilder => new LongPressGestureBuilder(),
  Native: (): NativeGestureBuilder => new NativeGestureBuilder(),
  // List-builders over the same three maps the relation methods write, with
  // no mechanism of their own — see ./composition.
  Race: (...gestures: AnyGestureSpec[]): ComposedGestureSpec =>
    raceGestures(...gestures),
  Simultaneous: (...gestures: AnyGestureSpec[]): ComposedGestureSpec =>
    simultaneousGestures(...gestures),
  Exclusive: (...gestures: AnyGestureSpec[]): ComposedGestureSpec =>
    exclusiveGestures(...gestures),
  Pinch: (): PinchGestureBuilder => new PinchGestureBuilder(),
  Rotation: (): RotationGestureBuilder => new RotationGestureBuilder(),
  Fling: unsupported("Gesture.Fling"),
  Hover: unsupported("Gesture.Hover"),
  Manual: unsupported("Gesture.Manual"),
  ForceTouch: unsupported("Gesture.ForceTouch"),
}
