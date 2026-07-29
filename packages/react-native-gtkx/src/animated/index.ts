// Animated module entry point (task 009, stream "animated"). Pure by
// contract: everything is driven by an injected FrameScheduler — the
// orchestrator connects the GTK frame clock and the Animated.* components.

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
