// Animated module entry point (task 009, stream "animated"). Pure by
// contract: everything is driven by an injected FrameScheduler — the
// orchestrator connects the GTK frame clock and the Animated.* components.

export type { AnimatedApi } from "./create-animated.js"
export { createAnimated } from "./create-animated.js"
export type { EasingFunction } from "./easing.js"
export { Easing } from "./easing.js"
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
} from "./types.js"
export { AnimatedInterpolation, AnimatedValue } from "./value.js"
