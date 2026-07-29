// Shared lifecycle for animations that drive a single AnimatedValue (timing,
// spring). Implements the RN semantics: a value runs at most one animation —
// a newer start() preempts the previous one with { finished: false }; natural
// completion reports { finished: true }; a finished or stopped run drops its
// frame subscription immediately (no idle ticks). The first frame after
// start() establishes t = 0 — there is no wall clock in this module, time
// only ever comes from the scheduler.

import { createFrameLoop } from "./frame-loop.js"
import type {
  CompositeAnimation,
  EndCallback,
  FrameScheduler,
} from "./types.js"
import type { AnimatedValue } from "./value.js"

// Per-frame step: elapsed ms since the first frame of this run → the next
// position (null while waiting out a delay: the value is not touched) and
// whether the run is done. makeStep is invoked on every start() with the
// value captured at that moment, so restarts pick up from wherever the value
// currently is.
export type StepResult = { position: number | null; done: boolean }
export type StepFn = (elapsedMs: number) => StepResult
export type MakeStep = (startValue: number) => StepFn

export const createValueAnimation = (
  scheduler: FrameScheduler,
  value: AnimatedValue,
  makeStep: MakeStep,
): CompositeAnimation => {
  let stopActiveRun: (() => void) | null = null

  const start = (callback?: EndCallback): void => {
    const step = makeStep(value.__getValue())
    let startTime: number | null = null
    let ended = false

    const loop = createFrameLoop(scheduler, (timeMs) => {
      if (ended) {
        return false
      }
      if (startTime === null) {
        startTime = timeMs
      }
      const { position, done } = step(timeMs - startTime)
      if (position !== null) {
        value.__updateValue(position)
      }
      if (done) {
        end(true)
        return false
      }
      return true
    })

    const handle = { stop: (): void => end(false) }

    const end = (finished: boolean): void => {
      if (ended) {
        return
      }
      ended = true
      loop.stop()
      if (stopActiveRun === handle.stop) {
        stopActiveRun = null
      }
      value.__endAnimation(handle)
      callback?.({ finished })
    }

    stopActiveRun = handle.stop
    // Attaching preempts whatever ran on this value before (this animation's
    // own previous run included) — the preempted run ends { finished: false }.
    value.__startAnimation(handle)
    if (!ended) {
      loop.start()
    }
  }

  return {
    start,
    stop: () => {
      stopActiveRun?.()
    },
    // RN parity: composite reset stops the run and snaps the value back to
    // its construction-time value (loop() relies on this between iterations).
    reset: () => {
      value.resetAnimation()
    },
  }
}
