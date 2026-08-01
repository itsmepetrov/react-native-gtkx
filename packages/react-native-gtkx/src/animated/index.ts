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
export { AnimatedValueXY } from "./value-xy"
export type { ValueXYListener, ValueXYLiteral } from "./value-xy"
