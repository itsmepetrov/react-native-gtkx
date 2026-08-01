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
// `useAnimatedStyle` and `Animated.View` are implemented. Everything else
// throws through the `unsupported()` proxy, naming itself. The boundary is
// not arbitrary: `opacity` and `transform` are the only two things this
// platform can write to a mounted widget without a React render. Colours,
// borders and radii reach GTK as a CSS class computed during render, and
// layout properties additionally need a Yoga pass — closing that gap is its
// own slice of work. See docs/api.md.
import type { ReactNode } from "react"
import { Animated as PlatformAnimated } from "../components/animated"
import type {
  AnimatedViewStyle,
  AnimatedViewProps as PlatformAnimatedViewProps,
} from "../components/animated"
import { glibScheduler } from "../components/frame-scheduler"
import { createUnsupportedFactory } from "../unsupported-export"
import { measure, useAnimatedRef } from "./animated-ref"
import {
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "./animation"
import { Easing } from "./easing"
import { createHooks } from "./hooks"
import { clamp, Extrapolation, interpolate } from "./interpolation"
import { cancelAnimation, createMakeMutable, isSharedValue } from "./mutable"
import type { StyleObject } from "./style"
import { createThreads, isWorkletFunction } from "./threads"
import { createMapper, type Mapper } from "./tracking"

// --- the one clock -------------------------------------------------------

// Both halves are wired to the SAME frame scheduler the platform's own
// `Animated` uses. That is the point: this layer adds no timer, no scheduler
// and no second clock — it sits on top of what already ships.
const makeMutable = createMakeMutable(PlatformAnimated)

const {
  useSharedValue,
  useDerivedValue,
  useAnimatedReaction,
  useAnimatedStyle,
} = createHooks(makeMutable)

const { runOnUI, scheduleOnUI, runOnJS, scheduleOnRN } =
  createThreads(glibScheduler)

// --- the implemented surface --------------------------------------------

export {
  cancelAnimation,
  clamp,
  Easing,
  Extrapolation,
  interpolate,
  isSharedValue,
  isWorkletFunction,
  makeMutable,
  measure,
  runOnJS,
  runOnUI,
  scheduleOnRN,
  scheduleOnUI,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
}

export type {
  AnimationCallback,
  WithSpringConfig,
  WithTimingConfig,
} from "./animation"
export type { EasingFunction, EasingFunctionFactory } from "./easing"
export type { AnimatedRef, MeasuredDimensions } from "./animated-ref"
export type { DependencyList } from "./hooks"
export type { ExtrapolationConfig, ExtrapolationType } from "./interpolation"
export type { DerivedValue, SharedValue } from "./mutable"

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

/**
 * On the single-runtime path there is nothing to clone: upstream's own
 * non-native serializer is a file of identity functions, because a value
 * never leaves the runtime it was made in.
 */
export const makeShareableCloneRecursive = <T,>(value: T): T => value

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

export type AnimatedViewProps = Omit<PlatformAnimatedViewProps, "style"> & {
  style?: StyleEntry | readonly (StyleEntry | false | null | undefined)[]
}

/**
 * The platform's own `Animated.View`, unchanged and untouched.
 *
 * This is the load-bearing discovery of the epic: `isAnimatedNode` in
 * src/components/animated.tsx recognises an animated node STRUCTURALLY
 * (`addListener` + `__getValue`), so the nodes `useAnimatedStyle` produces
 * already ARE animated nodes and reach GTK through the path that has always
 * been there — `setStoredTransform` plus `queueAllocate` for transforms,
 * `widget.setOpacity` for opacity. No new view layer, and no React render per
 * frame.
 */
const View = PlatformAnimated.View as (props: AnimatedViewProps) => ReactNode

const unsupported = createUnsupportedFactory(
  "react-native-reanimated",
  "Implemented here: shared values, useAnimatedStyle/useDerivedValue/useAnimatedReaction, " +
    "withTiming/withSpring/withSequence/withRepeat/withDelay, interpolate, Easing, " +
    "useAnimatedRef + measure, runOnUI/runOnJS and Animated.View. See docs/api.md for what is not, and why.",
)

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Documented no-ops upstream too — the allow-lists they wrote to are gone
 * from Reanimated itself. Kept callable so startup code does not fail on a
 * line that already did nothing.
 */
const addWhitelistedNativeProps = (): void => {}
const addWhitelistedUIProps = (): void => {}

const Animated = {
  View,
  // Every other host component needs the imperative write path generalised
  // beyond the animated box — the same widget-and-parent seam, reached from
  // components that do not currently expose one. That is the next slice, not
  // a silent partial.
  Text: unsupported("Animated.Text") as any,
  ScrollView: unsupported("Animated.ScrollView") as any,
  Image: unsupported("Animated.Image") as any,
  FlatList: unsupported("Animated.FlatList") as any,
  createAnimatedComponent: unsupported("createAnimatedComponent") as any,
  addWhitelistedNativeProps,
  addWhitelistedUIProps,
}

export default Animated

export const createAnimatedComponent: any = unsupported(
  "createAnimatedComponent",
)

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
export const withClamp: any = unsupported("withClamp")
export const withDecay: any = unsupported("withDecay")

// --- colours: the property gap, not the runtime ---
export const convertToRGBA: any = unsupported("convertToRGBA")
export const isColor: any = unsupported("isColor")
export const interpolateColor: any = unsupported("interpolateColor")
export const processColor: any = unsupported("processColor")
export const PlatformColor: any = unsupported("PlatformColor")
export const DynamicColorIOS: any = unsupported("DynamicColorIOS")

// --- layout animations (entering/exiting/layout) and the preset catalog ---
export const LayoutAnimationConfig: any = unsupported("LayoutAnimationConfig")
export const BaseAnimationBuilder: any = unsupported("BaseAnimationBuilder")
export const ComplexAnimationBuilder: any = unsupported(
  "ComplexAnimationBuilder",
)
export const Keyframe: any = unsupported("Keyframe")
export const Layout: any = unsupported("Layout")
export const LinearTransition: any = unsupported("LinearTransition")
export const CurvedTransition: any = unsupported("CurvedTransition")
export const EntryExitTransition: any = unsupported("EntryExitTransition")
export const FadingTransition: any = unsupported("FadingTransition")
export const JumpingTransition: any = unsupported("JumpingTransition")
export const SequencedTransition: any = unsupported("SequencedTransition")
export const SharedTransition: any = unsupported("SharedTransition")
export const SharedTransitionBoundary: any = unsupported(
  "SharedTransitionBoundary",
)
export const FadeIn: any = unsupported("FadeIn")
export const FadeInDown: any = unsupported("FadeInDown")
export const FadeInLeft: any = unsupported("FadeInLeft")
export const FadeInRight: any = unsupported("FadeInRight")
export const FadeInUp: any = unsupported("FadeInUp")
export const FadeOut: any = unsupported("FadeOut")
export const FadeOutDown: any = unsupported("FadeOutDown")
export const FadeOutLeft: any = unsupported("FadeOutLeft")
export const FadeOutRight: any = unsupported("FadeOutRight")
export const FadeOutUp: any = unsupported("FadeOutUp")
export const BounceIn: any = unsupported("BounceIn")
export const BounceInDown: any = unsupported("BounceInDown")
export const BounceInLeft: any = unsupported("BounceInLeft")
export const BounceInRight: any = unsupported("BounceInRight")
export const BounceInUp: any = unsupported("BounceInUp")
export const BounceOut: any = unsupported("BounceOut")
export const BounceOutDown: any = unsupported("BounceOutDown")
export const BounceOutLeft: any = unsupported("BounceOutLeft")
export const BounceOutRight: any = unsupported("BounceOutRight")
export const BounceOutUp: any = unsupported("BounceOutUp")
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
export const PinwheelIn: any = unsupported("PinwheelIn")
export const PinwheelOut: any = unsupported("PinwheelOut")
export const RollInLeft: any = unsupported("RollInLeft")
export const RollInRight: any = unsupported("RollInRight")
export const RollOutLeft: any = unsupported("RollOutLeft")
export const RollOutRight: any = unsupported("RollOutRight")
export const RotateInDownLeft: any = unsupported("RotateInDownLeft")
export const RotateInDownRight: any = unsupported("RotateInDownRight")
export const RotateInUpLeft: any = unsupported("RotateInUpLeft")
export const RotateInUpRight: any = unsupported("RotateInUpRight")
export const RotateOutDownLeft: any = unsupported("RotateOutDownLeft")
export const RotateOutDownRight: any = unsupported("RotateOutDownRight")
export const RotateOutUpLeft: any = unsupported("RotateOutUpLeft")
export const RotateOutUpRight: any = unsupported("RotateOutUpRight")
export const SlideInDown: any = unsupported("SlideInDown")
export const SlideInLeft: any = unsupported("SlideInLeft")
export const SlideInRight: any = unsupported("SlideInRight")
export const SlideInUp: any = unsupported("SlideInUp")
export const SlideOutDown: any = unsupported("SlideOutDown")
export const SlideOutLeft: any = unsupported("SlideOutLeft")
export const SlideOutRight: any = unsupported("SlideOutRight")
export const SlideOutUp: any = unsupported("SlideOutUp")
export const StretchInX: any = unsupported("StretchInX")
export const StretchInY: any = unsupported("StretchInY")
export const StretchOutX: any = unsupported("StretchOutX")
export const StretchOutY: any = unsupported("StretchOutY")
export const ZoomIn: any = unsupported("ZoomIn")
export const ZoomInDown: any = unsupported("ZoomInDown")
export const ZoomInEasyDown: any = unsupported("ZoomInEasyDown")
export const ZoomInEasyUp: any = unsupported("ZoomInEasyUp")
export const ZoomInLeft: any = unsupported("ZoomInLeft")
export const ZoomInRight: any = unsupported("ZoomInRight")
export const ZoomInRotate: any = unsupported("ZoomInRotate")
export const ZoomInUp: any = unsupported("ZoomInUp")
export const ZoomOut: any = unsupported("ZoomOut")
export const ZoomOutDown: any = unsupported("ZoomOutDown")
export const ZoomOutEasyDown: any = unsupported("ZoomOutEasyDown")
export const ZoomOutEasyUp: any = unsupported("ZoomOutEasyUp")
export const ZoomOutLeft: any = unsupported("ZoomOutLeft")
export const ZoomOutRight: any = unsupported("ZoomOutRight")
export const ZoomOutRotate: any = unsupported("ZoomOutRotate")
export const ZoomOutUp: any = unsupported("ZoomOutUp")
export const enableLayoutAnimations: any = unsupported("enableLayoutAnimations")

// --- Reanimated 4's CSS animations ---
export const css: any = unsupported("css")
export const createCSSAnimatedComponent: any = unsupported(
  "createCSSAnimatedComponent",
)
export const cubicBezier: any = unsupported("cubicBezier")
export const linear: any = unsupported("linear")
export const steps: any = unsupported("steps")

// --- hooks built on the event system, sensors and the keyboard ---
export const useAnimatedProps: any = unsupported("useAnimatedProps")
export const useAnimatedKeyboard: any = unsupported("useAnimatedKeyboard")
export const useAnimatedScrollHandler: any = unsupported(
  "useAnimatedScrollHandler",
)
export const useAnimatedSensor: any = unsupported("useAnimatedSensor")
export const useComposedEventHandler: any = unsupported(
  "useComposedEventHandler",
)
export const useEvent: any = unsupported("useEvent")
export const useFrameCallback: any = unsupported("useFrameCallback")
export const useHandler: any = unsupported("useHandler")
export const useScrollOffset: any = unsupported("useScrollOffset")
export const useScrollViewOffset: any = unsupported("useScrollViewOffset")
export const useTimestamp: any = unsupported("useTimestamp")

// --- a worklet runtime, which is structural by definition ---
// Upstream's own non-native runtimes.ts throws for these too.
export const createWorkletRuntime: any = unsupported("createWorkletRuntime")
export const runOnRuntime: any = unsupported("runOnRuntime")
export const executeOnUIRuntimeSync: any = unsupported("executeOnUIRuntimeSync")

// --- platform functions with no analogue here ---
export const dispatchCommand: any = unsupported("dispatchCommand")
export const getRelativeCoords: any = unsupported("getRelativeCoords")
export const scrollTo: any = unsupported("scrollTo")
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
export const KeyboardState: any = unsupported("KeyboardState")
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

// --- the Jest helpers, which drive upstream's own mock ---
export const advanceAnimationByFrame: any = unsupported(
  "advanceAnimationByFrame",
)
export const advanceAnimationByTime: any = unsupported("advanceAnimationByTime")
export const getAnimatedStyle: any = unsupported("getAnimatedStyle")
export const setUpTests: any = unsupported("setUpTests")
export const withReanimatedTimer: any = unsupported("withReanimatedTimer")
