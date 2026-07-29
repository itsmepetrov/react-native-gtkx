// Factory wiring the frame driver into the whole Animated API. The GTK side
// passes a scheduler backed by the frame clock (orchestrator, task 009);
// tests pass a manual scheduler and drive frames by hand.

import { createDelay, loop, parallel, sequence } from "./composite.js"
import { createSpring } from "./spring.js"
import { createTiming } from "./timing.js"
import type {
  CompositeAnimation,
  FrameScheduler,
  LoopConfig,
  ParallelConfig,
  SpringConfig,
  TimingConfig,
} from "./types.js"
import { AnimatedValue } from "./value.js"

export type AnimatedApi = {
  Value: typeof AnimatedValue
  timing(value: AnimatedValue, config: TimingConfig): CompositeAnimation
  spring(value: AnimatedValue, config: SpringConfig): CompositeAnimation
  sequence(animations: CompositeAnimation[]): CompositeAnimation
  parallel(
    animations: CompositeAnimation[],
    config?: ParallelConfig,
  ): CompositeAnimation
  delay(ms: number): CompositeAnimation
  loop(animation: CompositeAnimation, config?: LoopConfig): CompositeAnimation
}

export const createAnimated = (scheduler: FrameScheduler): AnimatedApi => ({
  Value: AnimatedValue,
  timing: (value, config) => createTiming(scheduler, value, config),
  spring: (value, config) => createSpring(scheduler, value, config),
  sequence,
  parallel,
  delay: (ms) => createDelay(scheduler, ms),
  loop,
})
