// Animated module entry point. Pure by contract: everything is driven by an
// injected FrameScheduler — the GTK frame clock is connected where the
// Animated.* components are built.

export type { AnimatedApi } from "./create-animated"
export { createAnimated } from "./create-animated"
export type { EasingFunction } from "./easing"
export { Easing } from "./easing"
export type {
  CompositeAnimation,
  EndCallback,
  EndResult,
  ExtrapolateType,
  FrameScheduler,
  InterpolationConfig,
  InterpolationListener,
  LoopConfig,
  ParallelConfig,
  SpringConfig,
  TimingConfig,
  ValueListener,
} from "./types"
export { AnimatedInterpolation, AnimatedValue } from "./value"
// The frame-driven lifecycle every single-value animation shares. Not part of
// `AnimatedApi` — RN's `Animated` has no such method and this object is spread
// into the public one — but exported because a layer built ON this engine may
// need a per-frame step RN itself does not have: `withDecay` is the first.
export { createValueAnimation } from "./value-animation"
export type { MakeStep, StepFn, StepResult } from "./value-animation"
export { AnimatedValueXY } from "./value-xy"
export type { ValueXYListener, ValueXYLiteral } from "./value-xy"
