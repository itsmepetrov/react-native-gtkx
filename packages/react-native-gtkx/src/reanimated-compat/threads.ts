// `runOnUI` / `runOnJS` — the thread hop, on a platform with one thread.
//
// The spike called these direct synchronous calls, on the reasoning that
// GTK's main loop IS the JS thread so there is nowhere to schedule to. That
// reasoning is right about the DESTINATION and wrong about the CONTRACT, and
// the implementation corrects it: upstream's thread functions are
// asynchronous, return void rather than the function's result, and code
// written for Reanimated assumes they do NOT run inline —
// `runOnJS(setState)()` inside a gesture callback is written expecting to
// finish the callback first. Making them synchronous would re-enter in places
// the author never allowed for.
//
// HOW MUCH LATER is the part that had to be corrected a second time, and it
// is measured rather than reasoned (docs/research/dnd-hover-flicker.md).
//
// `scheduleOnUI` used to defer by a microtask AND a frame, copying
// `react-native-worklets/src/threads.ts` — the file the web and
// react-native-windows run, which posts through `requestAnimationFrame`. That
// is the web's way of standing in for a UI runtime it has not got: rAF is the
// only "later" a browser offers that lands in the frame it will paint. React
// Native itself does no such thing. `scheduleOnUI` there posts to a real UI
// thread, which picks the job up as soon as it is scheduled and does not wait
// for a frame; nothing about the RN contract makes a UI hop cost a frame.
//
// The frame gate is not free here, because it is ASYMMETRIC: `scheduleOnRN`
// is a microtask, so the round trip every Reanimated-shaped measurement makes
// — `scheduleOnUI(measure)` then `scheduleOnRN(use it)` — cost one whole
// frame. And a gesture callback on this platform runs per GdkEvent, not per
// frame: GTK delivers motion as it arrives, so the next pan update reliably
// beat the round trip it had just started. `react-native-reanimated-dnd`
// re-registers its drop zones through exactly that round trip and re-reads
// them from exactly that pan update, and lost the race on every hover change
// — the drop zone strobed for as long as the pointer kept moving.
//
// So a UI hop is a TASK, not a frame. That keeps everything the contract
// asks for and drops only the wait nothing asked for:
//
//   - still asynchronous, so nothing re-enters its caller;
//   - still batched, so everything queued in one tick runs in one go, in
//     order — two `runOnUI` calls cannot be split;
//   - still LATER than `scheduleOnRN`'s microtask, so the relative order of a
//     UI-ward and an RN-ward hop issued in the same tick is upstream's;
//   - and it cannot starve the main loop, which a microtask could: a worklet
//     that re-arms itself is a legitimate shape, and on a single-threaded
//     platform a microtask loop would take GTK's paint and input with it.
type Job = () => void

export const createThreads = () => {
  // Everything queued in one tick runs in one batch, in order — the queue is
  // read when the timer fires, so a job pushed later in the same tick still
  // joins it.
  let queue: Job[] = []

  const scheduleOnUI = <A extends unknown[]>(
    worklet: (...args: A) => unknown,
    ...args: A
  ): void => {
    queue.push(() => {
      worklet(...args)
    })
    if (queue.length === 1) {
      setTimeout(() => {
        const batch = queue
        queue = []
        for (const job of batch) {
          job()
        }
      }, 0)
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
