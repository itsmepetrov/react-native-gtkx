// Minimal requestAnimationFrame-style pump over the injected scheduler: keeps
// re-booking one-shot frame callbacks while step() returns true. stop()
// cancels the pending booking, so a stopped loop holds no scheduler
// subscription (no idle ticks).

import type { FrameScheduler } from "./types.js"

export type FrameLoop = {
  start(): void
  stop(): void
}

export const createFrameLoop = (
  scheduler: FrameScheduler,
  step: (timeMs: number) => boolean,
): FrameLoop => {
  let cancel: (() => void) | null = null

  const onFrame = (timeMs: number): void => {
    cancel = null
    if (step(timeMs)) {
      cancel = scheduler.schedule(onFrame)
    }
  }

  return {
    start: () => {
      if (cancel === null) {
        cancel = scheduler.schedule(onFrame)
      }
    },
    stop: () => {
      cancel?.()
      cancel = null
    },
  }
}
