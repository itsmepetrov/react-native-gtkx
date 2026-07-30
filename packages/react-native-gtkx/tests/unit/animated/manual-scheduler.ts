// Deterministic frame driver for the Animated tests: advance(ms) moves the
// virtual clock and delivers exactly one frame to every subscription that was
// pending before the call. Callbacks re-scheduled during a frame run on the
// NEXT advance, and a subscription cancelled mid-frame never fires — both
// mirroring the one-shot semantics of the real GTK frame-clock scheduler.

import type { FrameScheduler } from "../../../src/animated/index"

export type ManualScheduler = {
  scheduler: FrameScheduler
  advance(ms: number): void
  activeCount(): number
  now(): number
}

type Entry = { cb: (timeMs: number) => void; cancelled: boolean }

export const createManualScheduler = (): ManualScheduler => {
  let now = 0
  const pending = new Set<Entry>()
  return {
    scheduler: {
      schedule(cb) {
        const entry: Entry = { cb, cancelled: false }
        pending.add(entry)
        return () => {
          entry.cancelled = true
          pending.delete(entry)
        }
      },
    },
    advance(ms) {
      now += ms
      const batch = [...pending]
      pending.clear()
      for (const entry of batch) {
        if (!entry.cancelled) {
          entry.cb(now)
        }
      }
    },
    activeCount: () => pending.size,
    now: () => now,
  }
}
