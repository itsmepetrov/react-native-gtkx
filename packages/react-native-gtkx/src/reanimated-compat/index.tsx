// react-native-gtkx/reanimated — `react-native-reanimated`'s SEMANTICS on a
// platform that has none of its architecture, because it needs none of it.
//
// Reanimated exists to cross a thread boundary: on mobile, JS and UI are
// separate runtimes and the worklet machinery, shared values, `runOnUI` and
// the Babel plugin all exist to move work across. Here GTK's main loop IS the
// JS thread — a widget call is a synchronous C call on the same stack — so
// every one of those mechanisms flattens. That is not our reinterpretation:
// upstream ships the flattened version itself, selected by `SHOULD_BE_USE_WEB
// = IS_JEST || IS_WEB || IS_WINDOWS`, and routes react-native-windows (no
// DOM, no second runtime) down it. Full evidence and the cost analysis:
// docs/research/reanimated.md.
//
// This is a reimplementation, not a vendoring. Upstream's `src/` is ~35,700
// lines with 21 DOM-bound files and a `Platform.OS` gate that does not know
// about `linux`, and it moves fast; forking it is the trap
// docs/research/gestures.md already identified for RNGH's `src/web/`. The web
// path is the blueprint — every behaviour here was read off it — and the
// pure-JS parts (`interpolate`, `Easing`, the spring solver's config
// normalisation) are ported rather than imported.
//
// THE BABEL PLUGIN IS NOT NEEDED, and cannot be relied on either. Its output
// is an ordinary lexical closure with metadata properties and no injected
// runtime import, so a worklet is directly callable and `'worklet'` is an
// inert directive. This platform never runs Babel at all (vite/rolldown; the
// Metro path uses the app's own stock preset), while an app that also targets
// iOS or Android keeps the plugin for those builds. Both configurations
// therefore have to work: dependency tracking here is DYNAMIC — recorded from
// the reads a mapper actually performs — so it never consults `__closure`,
// and `dependencies` arrays are honoured but never required.
//
// WHAT IS AND IS NOT HERE. Shared values, animations, the mapper core,
// `useAnimatedStyle`, `useAnimatedProps`, `interpolateColor`,
// `createAnimatedComponent`, `Animated.View`/`Text`/`Image`/`ScrollView`, the
// `entering`/`exiting`/`layout` props with the layout-animation catalogue —
// `FadeIn`/`FadeOut`/`Keyframe`, the five `*Transition` builders and sixty of
// the seventy-six presets (the sixteen that are not are `Flip*`, which needs
// a 3D rotation, and `LightSpeed*`, which needs a skew) — `LayoutAnimationConfig`,
// and the test helpers that drive the frame clock
// are implemented. Everything else throws through the `unsupported()` proxy,
// naming itself. The boundary is `opacity`, `transform` and colours — the
// things this platform can write to a mounted widget without a React render
// (plus the numeric SVG props, whose components subscribe to an animated node
// themselves). What is deliberately outside it is LAYOUT: `width`, `top`,
// `flex` and the rest go through Yoga, and a Yoga pass costs what the tree
// costs rather than what the animated value costs, so it is refused by name
// with the transform to use instead. Both halves of that are measured in
// docs/research/animated-colors.md. See docs/api.md.
import { useState, type ElementType, type ReactNode } from "react"
import { Animated as PlatformAnimated } from "../components/animated"
import type {
  AnimatedViewStyle,
  AnimatedViewProps as PlatformAnimatedViewProps,
} from "../components/animated"
import { glibScheduler } from "../components/frame-scheduler"
import { createUnsupportedFactory } from "../unsupported-export"
// The worklet surface lives one package over now (see src/worklets-compat),
// and these are re-exported from there rather than built again: upstream
// re-exports them from that package too, and a second `createThreads` would
// be a second batch queue behind one name.
import {
  makeShareableCloneRecursive,
  runOnJS,
  runOnUI,
  scheduleOnRN,
  scheduleOnUI,
} from "../worklets-compat/index"
import { measure, useAnimatedRef } from "./animated-ref"
import {
  withClamp,
  withDecay,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "./animation"
import {
  convertToRGBA,
  interpolateColor,
  isColor,
  rgbaArrayToRGBAColor,
} from "./color"
import { Easing } from "./easing"
import { createHooks } from "./hooks"
import { clamp, Extrapolation, interpolate } from "./interpolation"
import {
  FadeIn,
  FadeOut,
  Keyframe,
  AnimationBuilder as LayoutAnimationBuilder,
  LinearTransition,
} from "./layout-animation"
import {
  withLayoutAnimations,
  type LayoutAnimationProps,
} from "./layout-animation-view"
import {
  cancelAnimation,
  createMakeMutable,
  isSharedValue,
  type SharedValue,
} from "./mutable"
import {
  scrollTo,
  useAnimatedScrollHandler,
  useEvent,
  useHandler,
  type AnimatedScrollEvent,
  type ScrollHandlerCallback,
  type ScrollHandlers,
  type UseHandlerContext,
} from "./scroll-handler"
import { createScrollOffsetHooks } from "./scroll-offset"
import type { StyleObject } from "./style"
import { isWorkletFunction } from "./threads"
import { createMapper, type Mapper } from "./tracking"

// --- the one clock -------------------------------------------------------

// Both halves are wired to the SAME frame scheduler the platform's own
// `Animated` uses. That is the point: this layer adds no timer, no scheduler
// and no second clock — it sits on top of what already ships.
// The frame scheduler is handed to the mutable factory as well as to the
// Animated api built on it: `withDecay` is the first animation whose maths
// upstream owns rather than the platform, so it drives the frame loop
// directly instead of reaching for `api.timing`/`api.spring`.
const makeMutable = createMakeMutable(PlatformAnimated, glibScheduler)

const {
  useSharedValue,
  useDerivedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useAnimatedProps,
} = createHooks(makeMutable, {
  api: PlatformAnimated,
  scheduler: glibScheduler,
})

const { useScrollOffset, useScrollViewOffset } =
  createScrollOffsetHooks(makeMutable)

// --- the implemented surface --------------------------------------------

export {
  cancelAnimation,
  clamp,
  convertToRGBA,
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  isColor,
  isSharedValue,
  isWorkletFunction,
  makeMutable,
  makeShareableCloneRecursive,
  measure,
  rgbaArrayToRGBAColor,
  runOnJS,
  runOnUI,
  scheduleOnRN,
  scheduleOnUI,
  scrollTo,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useEvent,
  useHandler,
  useScrollOffset,
  useScrollViewOffset,
  useSharedValue,
  withClamp,
  withDecay,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
}

/**
 * RN's `PlatformColor`, which Reanimated re-exports. This is the platform's
 * own — theme colours by name, resolved by GTK against the live Adwaita
 * palette (`var(--accent-bg-color)`). It can be written to a style, animated
 * BETWEEN by a shared value, and not interpolated THROUGH: see
 * {@link interpolateColor}.
 */
export { PlatformColor } from "../style/colors"

export type {
  AnimationCallback,
  WithDecayConfig,
  WithSpringConfig,
  WithTimingConfig,
} from "./animation"
export type {
  ColorInterpolationOptions,
  ColorSpace,
  ParsedColorArray,
} from "./color"
export type { EasingFunction, EasingFunctionFactory } from "./easing"
export type { AnimatedRef, MeasuredDimensions } from "./animated-ref"
export type {
  AnimatedScrollEvent,
  ScrollHandlerCallback,
  ScrollHandlers,
  UseHandlerContext,
}
export type { DependencyList } from "./hooks"
export type { ExtrapolationConfig, ExtrapolationType } from "./interpolation"
export type { DerivedValue, SharedValue } from "./mutable"
export type { PropsObject as AnimatedProps } from "./props"
export type {
  KeyframeDefinitions,
  LayoutAnimationCallback,
  BuiltLayoutAnimation,
  LayoutAnimationValues,
} from "./layout-animation"
export type { LayoutAnimationProps } from "./layout-animation-view"

/** Deprecated upstream alias of {@link Extrapolation}, kept for source parity. */
export const Extrapolate = Extrapolation

/**
 * Upstream's spring presets, which are plain data and therefore free to
 * mirror exactly. `GentleSpringConfig` is `withSpring`'s default.
 */
export const Reanimated3DefaultSpringConfig = {
  damping: 10,
  mass: 1,
  stiffness: 100,
} as const
export const Reanimated3DefaultSpringConfigWithDuration = {
  duration: 1333,
  dampingRatio: 0.5,
} as const
export const WigglySpringConfig = {
  damping: 90,
  mass: 4,
  stiffness: 900,
} as const
export const WigglySpringConfigWithDuration = {
  duration: 550,
  dampingRatio: 0.75,
} as const
export const GentleSpringConfig = {
  damping: 120,
  mass: 4,
  stiffness: 900,
} as const
export const GentleSpringConfigWithDuration = {
  duration: 550,
  dampingRatio: 1,
} as const
export const SnappySpringConfig = {
  damping: 110,
  mass: 4,
  stiffness: 900,
  overshootClamping: true,
} as const
export const SnappySpringConfigWithDuration = {
  duration: 550,
  dampingRatio: 0.92,
  overshootClamping: true,
} as const

/**
 * How an animation should respond to the OS "reduce motion" setting. The
 * enum is mirrored so a config carrying it type-checks and runs; the setting
 * itself is not wired up on this platform yet, so every value behaves as
 * `Never` and {@link useReducedMotion} reports false. GNOME's
 * `gtk-enable-animations` is the signal to read when it is.
 */
export enum ReduceMotion {
  System = "system",
  Always = "always",
  Never = "never",
}

export enum ReanimatedLogLevel {
  warn = 1,
  error = 2,
}

/**
 * Accepted and ignored: there is no Reanimated logger to configure here.
 * Warnings come from the platform's own one-per-session channel, which is not
 * routed through this object. Refusing would break apps that call it at
 * startup for a setting that changes nothing.
 */
export const configureReanimatedLogger = (): void => {}

/** No reduce-motion source is wired on this platform yet — see {@link ReduceMotion}. */
export const useReducedMotion = (): boolean => false

/**
 * Upstream's keyboard states. Mirrored because {@link useAnimatedKeyboard}
 * returns one of them, and because a caller comparing against
 * `KeyboardState.CLOSED` should type-check and be right.
 */
export enum KeyboardState {
  UNKNOWN = 0,
  OPENING = 1,
  OPEN = 2,
  CLOSING = 3,
  CLOSED = 4,
}

/**
 * The keyboard's height and state as shared values — **honoured and never
 * updated**, which is the same shape and the same reason as RN's `Keyboard`
 * (src/apis/keyboard.ts): every number this hook reports describes a software
 * panel sliding over the app and taking screen space from it, and a desktop
 * has no such panel. The height a caller reads is 0 because the keyboard
 * occupies nothing, and the state is `CLOSED` because it is.
 *
 * Both values are REAL shared values, so a `useAnimatedStyle` reading them
 * subscribes, computes and settles exactly once, and a layout that offsets
 * itself by `keyboard.height.value` lands where it should instead of
 * throwing. That is the whole of the difference from refusing: an app written
 * for three platforms keeps one source and gets the right answer here.
 *
 * `UNKNOWN` is deliberately not the state. Upstream seeds `UNKNOWN` and
 * replaces it the moment the native side reports; here nothing ever will, so
 * a permanent "we do not know" would be false — the state IS known.
 *
 * The measured caller is `@gorhom/bottom-sheet`, which has its own
 * `useAnimatedKeyboard` over RN's `Keyboard` and never reaches this one; the
 * hook is here for apps, which do.
 */
export const useAnimatedKeyboard = (
  // Upstream's Android translucency options. Accepted and ignored: they
  // describe how the keyboard's rectangle relates to a system bar, and there
  // is neither.
  options?: unknown,
): { height: SharedValue<number>; state: SharedValue<KeyboardState> } => {
  void options
  const [keyboard] = useState(() => ({
    height: makeMutable(0),
    state: makeMutable(KeyboardState.CLOSED),
  }))
  return keyboard
}

/**
 * Both are deprecated warn-only aliases upstream, and libraries call them to
 * ask "is Reanimated present and modern". Here the answer is yes.
 */
export const isConfigured = (): boolean => true
export const isReanimated3 = (): boolean => true

/**
 * The upstream version whose API this surface mirrors — NOT a claim to be
 * that package. Libraries read it to gate on API level, which is exactly what
 * it answers.
 */
export const reanimatedVersion = "4.5.3"

// `startMapper`/`stopMapper` are the primitive `useAnimatedReaction` and
// `useDerivedValue` are built on, and a few libraries reach for them
// directly. `inputs` is accepted and ignored: it is upstream's static
// candidate list from the Babel plugin, and tracking here is dynamic, so the
// mapper subscribes to what it reads instead of what it was told.
const runningMappers = new Map<number, Mapper>()
let nextMapperId = 1

export const startMapper = (mapper: () => void): number => {
  const id = nextMapperId++
  const created = createMapper(mapper)
  runningMappers.set(id, created)
  created.run()
  return id
}

export const stopMapper = (id: number): void => {
  runningMappers.get(id)?.dispose()
  runningMappers.delete(id)
}

// --- Animated.View ------------------------------------------------------

/** A style object whose animatable leaves `useAnimatedStyle` has replaced with nodes. */
export type AnimatedStyleProp = StyleObject

type StyleEntry = AnimatedViewStyle | AnimatedStyleProp

export type AnimatedViewProps = Omit<PlatformAnimatedViewProps, "style"> &
  LayoutAnimationProps & {
    style?: StyleEntry | readonly (StyleEntry | false | null | undefined)[]
  }

/**
 * The platform's own `Animated.View`, with `entering`/`exiting`/`layout`
 * added around it.
 *
 * The style half is the load-bearing discovery of the epic: `isAnimatedNode`
 * in src/components/animated.tsx recognises an animated node STRUCTURALLY
 * (`addListener` + `__getValue`), so the nodes `useAnimatedStyle` produces
 * already ARE animated nodes and reach GTK through the path that has always
 * been there — `setStoredTransform` plus `queueAllocate` for transforms,
 * `widget.setOpacity` for opacity. No new view layer, and no React render per
 * frame.
 *
 * The layout-animation half adds no widget either: `withLayoutAnimations`
 * renders the component it wraps and reaches the widget through the ref that
 * component already exposes. See layout-animation-view.tsx for why `exiting`
 * has to live one component ABOVE the one that owns the widget.
 */
const View = withLayoutAnimations(PlatformAnimated.View) as (
  props: AnimatedViewProps,
) => ReactNode

const unsupported = createUnsupportedFactory(
  "react-native-reanimated",
  "Implemented here: shared values, useAnimatedStyle/useAnimatedProps/useDerivedValue/useAnimatedReaction, " +
    "withTiming/withSpring/withDecay/withClamp/withSequence/withRepeat/withDelay, interpolate, " +
    "interpolateColor, Easing, useAnimatedRef + measure, " +
    "useAnimatedScrollHandler + scrollTo, runOnUI/runOnJS, " +
    "the entering/exiting/layout props with Keyframe, the five *Transition builders and 60 of the 76 " +
    "presets (Flip* and LightSpeed* are the exceptions), LayoutAnimationConfig, " +
    "withReanimatedTimer/advanceAnimationByTime, " +
    "Animated.View/Text/Image/ScrollView and createAnimatedComponent. " +
    "See docs/api.md for what is not, and why.",
)

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Documented no-ops upstream too — the allow-lists they wrote to are gone
 * from Reanimated itself. Kept callable so startup code does not fail on a
 * line that already did nothing.
 */
const addWhitelistedNativeProps = (): void => {}
const addWhitelistedUIProps = (): void => {}

/**
 * Wrapping in the layout-animation half is what makes `entering`/`exiting`/
 * `layout` work on ANY animated component rather than only on
 * `Animated.View`. Neither wrapper adds a widget: both render what they were
 * given and reach the real widget through the ref it already exposes.
 */
const createLayoutAnimatedComponent = (component: ElementType) =>
  withLayoutAnimations(PlatformAnimated.createAnimatedComponent(component))

/**
 * The rest of the host components, and the factory behind them. All four are
 * the platform's own, because the imperative write path never needed to know
 * what it was writing to: it needs the child's widget and its parent's, and
 * `createAnimatedComponent` reads the first back out of the ref the wrapped
 * component exposes. It adds NO widget to the tree — wrapping in an
 * `Animated.View` would change flex layout and change what `measureLayout` is
 * relative to, which is a different tree, not a shim.
 *
 * `FlatList` is the one refusal, and it is a decision rather than an
 * omission: it is a composite over the windowed core over a ScrollView, and
 * its ref is a scroll API, so no widget is reachable. It throws on render,
 * naming itself and naming the workaround.
 */
const Animated = {
  View,
  Text: withLayoutAnimations(PlatformAnimated.Text) as any,
  ScrollView: withLayoutAnimations(PlatformAnimated.ScrollView) as any,
  Image: withLayoutAnimations(PlatformAnimated.Image) as any,
  FlatList: PlatformAnimated.FlatList as any,
  createAnimatedComponent: createLayoutAnimatedComponent as any,
  addWhitelistedNativeProps,
  addWhitelistedUIProps,
}

export default Animated

export const createAnimatedComponent: any = createLayoutAnimatedComponent

// --- the refusals -------------------------------------------------------
//
// Enumerated by hand rather than produced by a Proxy over the module,
// because ESM named imports resolve statically: a symbol missing from this
// list fails at BUILD time with "no export named X", which is loud in its own
// right — but only the names here can produce the descriptive runtime
// message, so the list is worth keeping complete. Measured against
// react-native-reanimated 4.5.3.

// --- animations not implemented ---
export const defineAnimation: any = unsupported("defineAnimation")

// --- colours: what is left after the gap closed ---
// `processColor` returns RN's packed AARRGGBB integer, whose only purpose is
// to cross to a native module. There is no native side here — a colour's
// destination is a GTK stylesheet, which takes strings — so a number handed
// back from this function would be accepted by nothing downstream, including
// this platform's own styles. Refusing beats returning a value that only
// fails later.
export const processColor: any = unsupported("processColor")
export const DynamicColorIOS: any = unsupported("DynamicColorIOS")

// --- layout animations: the four written by hand ---
//
// `BaseAnimationBuilder` and `ComplexAnimationBuilder` are upstream's two
// halves of one hierarchy — the plain chain and the chain plus the spring
// parameters — and this platform has a single class doing both, exported
// under both names so a library subclassing either one keeps working.
export { FadeIn, FadeOut, Keyframe, LinearTransition }
export const BaseAnimationBuilder = LayoutAnimationBuilder
export const ComplexAnimationBuilder = LayoutAnimationBuilder
/** Upstream's own deprecated alias of {@link LinearTransition}. */
export const Layout = LinearTransition

// --- layout animations: the catalogue ---
//
// Sixty presets over the same base class, minted from upstream's own
// parameters — see layout-animation-presets.ts, which is the table, and
// layout-transitions.ts for the four `*Transition` builders beside
// `LinearTransition`. What is NOT here is directly below.
export {
  BounceIn,
  BounceInDown,
  BounceInLeft,
  BounceInRight,
  BounceInUp,
  BounceOut,
  BounceOutDown,
  BounceOutLeft,
  BounceOutRight,
  BounceOutUp,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  FadeOutDown,
  FadeOutLeft,
  FadeOutRight,
  FadeOutUp,
  PinwheelIn,
  PinwheelOut,
  RollInLeft,
  RollInRight,
  RollOutLeft,
  RollOutRight,
  RotateInDownLeft,
  RotateInDownRight,
  RotateInUpLeft,
  RotateInUpRight,
  RotateOutDownLeft,
  RotateOutDownRight,
  RotateOutUpLeft,
  RotateOutUpRight,
  SlideInDown,
  SlideInLeft,
  SlideInRight,
  SlideInUp,
  SlideOutDown,
  SlideOutLeft,
  SlideOutRight,
  SlideOutUp,
  StretchInX,
  StretchInY,
  StretchOutX,
  StretchOutY,
  ZoomIn,
  ZoomInDown,
  ZoomInEasyDown,
  ZoomInEasyUp,
  ZoomInLeft,
  ZoomInRight,
  ZoomInRotate,
  ZoomInUp,
  ZoomOut,
  ZoomOutDown,
  ZoomOutEasyDown,
  ZoomOutEasyUp,
  ZoomOutLeft,
  ZoomOutRight,
  ZoomOutRotate,
  ZoomOutUp,
} from "./layout-animation-presets"
export {
  CurvedTransition,
  EntryExitTransition,
  FadingTransition,
  JumpingTransition,
  SequencedTransition,
} from "./layout-transitions"
export {
  enableLayoutAnimations,
  LayoutAnimationConfig,
} from "./layout-animation-config"
export type { LayoutAnimationConfigProps } from "./layout-animation-config"

// --- layout animations: what the catalogue cannot reach ---
//
// Two refusals, both structural, both named rather than approximated — a
// `FlipInEasyX` that quietly rotated in the plane instead of out of it is
// exactly the "compiled, ran, did the wrong thing" failure this surface
// exists to avoid.
//
// The twelve `Flip*` builders are `perspective` plus `rotateX`/`rotateY`: a
// real 3D rotation with a projection. This platform folds a transform array
// into ONE 2D affine matrix and hands it to `gsk_transform_matrix2d()`, which
// is 3.2x cheaper than a GskTransform chain (docs/research/transforms.md) and
// has no third axis in it.
//
// The four `LightSpeed*` builders need `skewX`, which a 2D affine matrix
// COULD carry — it is left out on purpose, across the whole platform's
// transform surface (docs/api.md, src/style/README.md), and the catalogue is
// not the place to reverse that.
export const FlipInEasyX: any = unsupported("FlipInEasyX")
export const FlipInEasyY: any = unsupported("FlipInEasyY")
export const FlipInXDown: any = unsupported("FlipInXDown")
export const FlipInXUp: any = unsupported("FlipInXUp")
export const FlipInYLeft: any = unsupported("FlipInYLeft")
export const FlipInYRight: any = unsupported("FlipInYRight")
export const FlipOutEasyX: any = unsupported("FlipOutEasyX")
export const FlipOutEasyY: any = unsupported("FlipOutEasyY")
export const FlipOutXDown: any = unsupported("FlipOutXDown")
export const FlipOutXUp: any = unsupported("FlipOutXUp")
export const FlipOutYLeft: any = unsupported("FlipOutYLeft")
export const FlipOutYRight: any = unsupported("FlipOutYRight")
export const LightSpeedInLeft: any = unsupported("LightSpeedInLeft")
export const LightSpeedInRight: any = unsupported("LightSpeedInRight")
export const LightSpeedOutLeft: any = unsupported("LightSpeedOutLeft")
export const LightSpeedOutRight: any = unsupported("LightSpeedOutRight")

// --- shared element transitions ---
//
// A different mechanism, not a preset: it matches two views in two different
// screens by a `sharedTransitionTag`, lifts one into an overlay above both,
// and interpolates it towards the other while a navigator drives the screen
// change. None of those three pieces exists here — there is no
// `sharedTransitionTag` prop on any component, no overlay layer above the
// navigation stack, and the retention primitive an exit animation rides on
// deliberately holds a widget in its OWN parent (src/components/
// widget-retention.ts) rather than reparenting it, which is the one thing a
// shared element has to do. Upstream's own web path does not implement it
// either.
export const SharedTransition: any = unsupported("SharedTransition")
export const SharedTransitionBoundary: any = unsupported(
  "SharedTransitionBoundary",
)

// --- Reanimated 4's CSS animations ---
export const css: any = unsupported("css")
export const createCSSAnimatedComponent: any = unsupported(
  "createCSSAnimatedComponent",
)
export const cubicBezier: any = unsupported("cubicBezier")
export const linear: any = unsupported("linear")
export const steps: any = unsupported("steps")

// --- hooks built on the event system, sensors and the keyboard ---
export const useAnimatedSensor: any = unsupported("useAnimatedSensor")
export const useComposedEventHandler: any = unsupported(
  "useComposedEventHandler",
)
export const useFrameCallback: any = unsupported("useFrameCallback")
export const useTimestamp: any = unsupported("useTimestamp")

// --- a worklet runtime, which is structural by definition ---
// Upstream's own non-native runtimes.ts throws for these too.
export const createWorkletRuntime: any = unsupported("createWorkletRuntime")
export const runOnRuntime: any = unsupported("runOnRuntime")
export const executeOnUIRuntimeSync: any = unsupported("executeOnUIRuntimeSync")

// --- platform functions with no analogue here ---
export const dispatchCommand: any = unsupported("dispatchCommand")
export const getRelativeCoords: any = unsupported("getRelativeCoords")
export const setGestureState: any = unsupported("setGestureState")
export const setNativeProps: any = unsupported("setNativeProps")
export const getViewProp: any = unsupported("getViewProp")
export const createAnimatedPropAdapter: any = unsupported(
  "createAnimatedPropAdapter",
)
export const NativeEventsManager: any = unsupported("NativeEventsManager")
export const getUseOfValueInStyleWarning: any = unsupported(
  "getUseOfValueInStyleWarning",
)

// --- enums with no source of truth on a desktop ---
export const InterfaceOrientation: any = unsupported("InterfaceOrientation")
export const IOSReferenceFrame: any = unsupported("IOSReferenceFrame")
export const SensorType: any = unsupported("SensorType")

// --- screen transitions ---
export const ScreenTransition: any = unsupported("ScreenTransition")
export const startScreenTransition: any = unsupported("startScreenTransition")
export const finishScreenTransition: any = unsupported("finishScreenTransition")

// --- dev tooling ---
export const PerformanceMonitor: any = unsupported("PerformanceMonitor")
export const ReducedMotionConfig: any = unsupported("ReducedMotionConfig")
export const getDynamicFeatureFlag: any = unsupported("getDynamicFeatureFlag")
export const getStaticFeatureFlag: any = unsupported("getStaticFeatureFlag")
export const setDynamicFeatureFlag: any = unsupported("setDynamicFeatureFlag")

// --- the test helpers ---
//
// The three that control TIME are real, and they are not an emulation:
// upstream fakes Jest's timers and synthesises frames on top of them, while
// the frame driver every animation on this platform runs on is this repo's
// own, so a test simply takes it. See test-timers.ts.
export {
  advanceAnimationByFrame,
  advanceAnimationByTime,
  withReanimatedTimer,
} from "./test-timers"

// The two that read a STYLE BACK are refused, and it is the same refusal
// twice. Upstream's `getAnimatedStyle` returns the style object its updater
// produced, which exists on mobile only because its Jest path keeps a mirror
// of it on the component (`props.animatedStyle.value`). There is no such
// object here at any point after bind time: `useAnimatedStyle`'s result is
// taken apart into per-property channels — opacity to the widget, colours to
// a private CSS provider, and the whole `transform` array folded into ONE 2D
// matrix in the rect store, from which the array cannot be recovered. A
// `getAnimatedStyle` here would therefore answer a different question than
// the one it was asked, silently.
//
// What to assert instead is what every GTK test in this repo already
// asserts, and it is strictly stronger — the widget itself:
// `widget.getOpacity()`, `widget.computeBounds(stage)`, `widget.measure()`.
// Drive the clock with `withReanimatedTimer` + `advanceAnimationByTime` and
// those reads are deterministic.
//
// `setUpTests` exists only to install `toHaveAnimatedStyle` /
// `toHaveAnimatedProps`, both of which are `getAnimatedStyle` in a matcher.
export const getAnimatedStyle: any = unsupported("getAnimatedStyle")
export const setUpTests: any = unsupported("setUpTests")
