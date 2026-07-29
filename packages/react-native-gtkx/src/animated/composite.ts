// Composition operators over CompositeAnimation with RN finished-semantics:
// sequence aborts on the first unfinished child; parallel (stopTogether on by
// default) stops the siblings when one child ends unfinished and reports
// finished only when every child finished; loop restarts on natural
// completion, resetting the child before each iteration, and propagates an
// unfinished child result. delay(ms) is RN's own trick: a zero-duration
// timing with the given delay on a throwaway value.

import { Easing } from "./easing"
import { createTiming } from "./timing"
import type {
  CompositeAnimation,
  EndResult,
  FrameScheduler,
  LoopConfig,
  ParallelConfig,
} from "./types"
import { AnimatedValue } from "./value"

export const sequence = (
  animations: CompositeAnimation[],
): CompositeAnimation => {
  // Index of the running child, -1 while idle.
  let current = -1
  return {
    start(callback) {
      if (current !== -1) {
        // Restart: abort the previous run first (its callback fires with
        // { finished: false } synchronously).
        animations[current]!.stop()
      }
      const startFrom = (index: number): void => {
        if (index >= animations.length) {
          current = -1
          callback?.({ finished: true })
          return
        }
        current = index
        animations[index]!.start((result) => {
          if (!result.finished) {
            current = -1
            callback?.(result)
            return
          }
          startFrom(index + 1)
        })
      }
      startFrom(0)
    },
    stop() {
      if (current !== -1) {
        animations[current]!.stop()
      }
    },
    reset() {
      current = -1
      for (const animation of animations) {
        animation.reset()
      }
    },
  }
}

export const parallel = (
  animations: CompositeAnimation[],
  config?: ParallelConfig,
): CompositeAnimation => {
  const stopTogether = config?.stopTogether ?? true
  const stopAll = (): void => {
    for (const animation of animations) {
      animation.stop()
    }
  }
  return {
    start(callback) {
      if (animations.length === 0) {
        callback?.({ finished: true })
        return
      }
      let remaining = animations.length
      let allFinished = true
      let done = false
      let stopping = false
      for (const animation of animations) {
        animation.start((result) => {
          remaining--
          if (!result.finished) {
            allFinished = false
            if (stopTogether && !stopping && !done) {
              stopping = true
              // Stops fire the sibling callbacks synchronously, so remaining
              // reaches zero within this call chain.
              stopAll()
            }
          }
          if (remaining === 0 && !done) {
            done = true
            callback?.({ finished: allFinished })
          }
        })
      }
    },
    stop: stopAll,
    reset() {
      for (const animation of animations) {
        animation.reset()
      }
    },
  }
}

export const createDelay = (
  scheduler: FrameScheduler,
  ms: number,
): CompositeAnimation =>
  createTiming(scheduler, new AnimatedValue(0), {
    toValue: 0,
    duration: 0,
    delay: ms,
    easing: Easing.linear,
  })

export const loop = (
  animation: CompositeAnimation,
  config?: LoopConfig,
): CompositeAnimation => {
  const iterations = config?.iterations ?? -1
  const resetBeforeIteration = config?.resetBeforeIteration ?? true
  let stopped = false
  return {
    start(callback) {
      stopped = false
      let iterationsDone = 0
      const onIteration = (result: EndResult): void => {
        if (stopped || !result.finished || iterationsDone === iterations) {
          callback?.(result)
          return
        }
        iterationsDone++
        if (resetBeforeIteration) {
          animation.reset()
        }
        animation.start(onIteration)
      }
      onIteration({ finished: true })
    },
    stop() {
      stopped = true
      animation.stop()
    },
    reset() {
      animation.reset()
    },
  }
}
