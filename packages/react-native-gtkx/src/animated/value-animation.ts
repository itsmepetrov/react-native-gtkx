// Shared lifecycle for animations that drive a single AnimatedValue (timing,
// spring). Implements the RN semantics: a value runs at most one animation —
// a newer start() preempts the previous one with { finished: false }; natural
// completion reports { finished: true }; a finished or stopped run drops its
// frame subscription immediately (no idle ticks).
//
// t = 0 IS THE MOMENT start() WAS CALLED, read off the scheduler's own clock.
// It used to be the first frame that arrived, which cost every animation on
// this platform a frame it never used: the first callback lands ~16 ms after
// start(), evaluates step(0) — the start value by definition — and writes it
// back unchanged, so nothing MOVES until the second frame, ~32 ms in. A 300 ms
// fade also RAN for 316 ms rather than 300. Anchoring at start() is what RN's
// own TimingAnimation (`_startTime = Date.now()` inside start()) and
// Reanimated both do, and it is time-based in the way a stalled main loop
// demands: a late frame resumes the curve where the clock says, instead of
// stretching the animation by the length of the stall.
//
// There is still no wall clock in this module — `scheduler.now()` reads the
// same clock the frame stamps come from, so `timeMs - startTime` stays
// coherent. A scheduler that offers no clock keeps the first-frame anchoring.

import { createFrameLoop } from "./frame-loop"
import type { CompositeAnimation, EndCallback, FrameScheduler } from "./types"
import type { AnimatedValue } from "./value"

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
    let startTime: number | null = scheduler.now?.() ?? null
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
