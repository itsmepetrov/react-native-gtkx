// `runOnUI` / `runOnJS` — the thread hop, on a platform with one thread.
//
// The spike called these direct synchronous calls, on the reasoning that
// GTK's main loop IS the JS thread so there is nowhere to schedule to. That
// reasoning is right about the DESTINATION and wrong about the CONTRACT, and
// the implementation corrects it: upstream's own single-runtime path is
// asynchronous even though it, too, has only one thread.
// `react-native-worklets/src/threads.ts` (the file react-native-windows and
// the web both run) batches `runOnUI` calls into a microtask plus one frame,
// and `runOnJS` into a microtask — and both return void rather than the
// function's result.
//
// Matching that is the safe direction. Code written for Reanimated assumes
// these do NOT run inline: `runOnJS(setState)()` inside a gesture callback is
// written expecting to finish the callback first. Making them synchronous
// would re-enter in places the author never allowed for, and would hand back
// a return value upstream never has — a difference that only shows up as a
// bug on a real device. Deferring costs one frame of latency for an API whose
// whole purpose is a hop that already costs one.
import type { FrameScheduler } from "../animated/index"

type Job = () => void

export const createThreads = (scheduler: FrameScheduler) => {
  // Batched exactly as upstream: everything queued in one tick runs in one
  // frame, in order, so two runOnUI calls cannot be split across frames.
  let queue: Job[] = []

  const flush = (): void => {
    queueMicrotask(() => {
      const batch = queue
      queue = []
      scheduler.schedule(() => {
        for (const job of batch) {
          job()
        }
      })
    })
  }

  const scheduleOnUI = <A extends unknown[]>(
    worklet: (...args: A) => unknown,
    ...args: A
  ): void => {
    queue.push(() => {
      worklet(...args)
    })
    if (queue.length === 1) {
      flush()
    }
  }

  const runOnUI =
    <A extends unknown[]>(worklet: (...args: A) => unknown) =>
    (...args: A): void => {
      scheduleOnUI(worklet, ...args)
    }

  const scheduleOnRN = <A extends unknown[]>(
    fn: (...args: A) => unknown,
    ...args: A
  ): void => {
    queueMicrotask(() => {
      fn(...args)
    })
  }

  const runOnJS =
    <A extends unknown[]>(fn: (...args: A) => unknown) =>
    (...args: A): void => {
      scheduleOnRN(fn, ...args)
    }

  return { runOnUI, scheduleOnUI, runOnJS, scheduleOnRN }
}

/**
 * True only for a function the Babel plugin actually processed, matching
 * upstream's `__workletHash` check. Without the plugin — which is this
 * platform's normal case, since it never runs Babel — nothing is a worklet,
 * and nothing here needs one: a `"worklet"` directive is an inert string.
 */
export const isWorkletFunction = (value: unknown): boolean =>
  typeof value === "function" &&
  !!(value as unknown as Record<string, unknown>).__workletHash
