// requestAnimationFrame/cancelAnimationFrame as GLOBALS — RN provides both
// from its own bootstrap on every platform (InitializeCore's JSTimers); this
// one dropped that bootstrap entirely (../metro/index.ts: "the runtime
// environment IS Node, the host provides everything"), which held for
// everything except this one browser-ism library code reaches for directly.
// docs/research/upstream-libraries.md's third experiment is what found the
// gap: react-native-sortables crashes the whole process at mount on a bare
// `requestAnimationFrame`, a `ReferenceError` — Node has no such global,
// browsers and RN both do.
//
// Semantics match the browser spec's "run the animation frame callbacks"
// algorithm (which is also what RN's own JSTimers mirrors): an id comes
// back; a callback receives a monotonic, high-resolution timestamp in
// milliseconds; a callback booked WHILE a batch is running lands on the
// frame AFTER that one — the spec snapshots the callback list before
// invoking it, so same-frame recursion never happens; cancelling before the
// frame fires is silent; and one callback throwing is reported and does NOT
// stop its siblings in the same batch (the spec's "invoke callback" for each
// entry, un-nested — one throw ends one iteration, not the loop).
//
// PURE ON PURPOSE — no import of frame-scheduler.ts (and therefore no
// @gtkx/* bridge, no GLib): both `createRequestAnimationFrame` and
// `installGlobalRequestAnimationFrame` below take a `FrameScheduler`
// argument rather than reaching for `glibScheduler` themselves, exactly the
// split `animated/frame-loop.ts` (pure) already draws against
// `components/animated.tsx` (the impure thing that wires it to the real
// clock). That is what lets this file's own scheduling semantics be unit
// tested off Linux, with no codegen store and no GTK — the caller (this
// package's entry, src/index.ts) is what supplies the real
// `glibScheduler`, the one frame driver on this platform (see
// frame-scheduler.ts's header for why nothing else may add a second one).
import type { FrameScheduler } from "../animated/index"

// No "dom" lib in this package's tsconfig (lib: ["esnext"]), so these are
// stated by hand — matching react-native's OWN ambient declaration
// (node_modules/react-native/src/types/globals.d.ts) exactly, parameter for
// parameter, rather than inventing a narrower one: that file is what
// `@react-navigation/native`'s types pull into this program transitively
// (through its own `react-native` import), so a mismatched signature here
// does not stay private — it becomes a real overload conflict the moment
// both are ambient in the same program. `cancelAnimationFrame` accepting
// `null | undefined` is not padding: it is what makes
// `cancelAnimationFrame(handleRef.current)` — a ref that starts unset — a
// no-op that also type-checks, the common cleanup shape in a `useEffect`.
declare global {
  function requestAnimationFrame(callback: (time: number) => void): number
  function cancelAnimationFrame(handle: number | null | undefined): void
}

export type RequestAnimationFrame = (callback: (time: number) => void) => number
export type CancelAnimationFrame = (handle: number | null | undefined) => void

export type RequestAnimationFramePair = {
  requestAnimationFrame: RequestAnimationFrame
  cancelAnimationFrame: CancelAnimationFrame
}

/**
 * Pure factory over an injected `FrameScheduler` — the part a test drives
 * directly, without touching `globalThis`. Every request made before a
 * batch flushes lands in that SAME batch and gets the SAME timestamp
 * (rAF's usual "one paint, one time" contract); a request made from inside
 * a running callback is queued fresh and therefore always lands one batch
 * later, because the batch already in flight was taken off `pending` before
 * the first callback in it ran.
 */
export const createRequestAnimationFrame = (
  scheduler: FrameScheduler,
): RequestAnimationFramePair => {
  let nextHandle = 1
  let pending = new Map<number, (time: number) => void>()
  let unbook: (() => void) | null = null

  const flush = (time: number): void => {
    unbook = null
    // Snapshot-then-clear: a callback that re-requests itself — every
    // rAF-driven animation loop does exactly that — must land in the batch
    // that starts empty again below, not in the one currently running.
    const batch = pending
    pending = new Map()
    for (const callback of batch.values()) {
      try {
        callback(time)
      } catch (error) {
        // One throwing callback does not take its siblings down with it:
        // browsers report the exception and keep running the rest of the
        // batch, and RN's own JSTimers wraps each callback in its own
        // try/catch for the same reason. See docs/api.md.
        console.error(
          "[react-native-gtkx] requestAnimationFrame callback threw:",
          error,
        )
      }
    }
  }

  const requestAnimationFrame: RequestAnimationFrame = (callback) => {
    const handle = nextHandle++
    pending.set(handle, callback)
    // Only the FIRST request in an otherwise-empty queue books a frame —
    // every other one rides the booking already pending, so N calls in the
    // same tick cost one scheduler subscription, not N.
    if (unbook === null) {
      unbook = scheduler.schedule(flush)
    }
    return handle
  }

  const cancelAnimationFrame: CancelAnimationFrame = (handle) => {
    // `null`/`undefined` — an unset ref, the common cleanup shape — is a
    // silent no-op, the same as an unknown or already-delivered handle.
    if (handle == null) {
      return
    }
    pending.delete(handle)
    // No idle tick once the last pending callback is gone — mirrors
    // animated/frame-loop.ts's stop(), same reason: a booking held for
    // nothing is a tick nobody asked for.
    if (pending.size === 0 && unbook !== null) {
      unbook()
      unbook = null
    }
  }

  return { requestAnimationFrame, cancelAnimationFrame }
}

let installed = false

/**
 * Installs requestAnimationFrame/cancelAnimationFrame as globals, running
 * the batch above off `scheduler`. Called once from the package entry
 * (src/index.ts) with the real `glibScheduler` — every app importing
 * "react-native" (aliased here) pulls it in before any of its own code
 * runs, on both toolchains, the same way InitializeCore would have.
 * Idempotent, because `installed` is module state: re-importing the entry
 * module a second time in the same process must not orphan whatever the
 * first install has already queued behind a fresh, disconnected id
 * namespace.
 */
export const installGlobalRequestAnimationFrame = (
  scheduler: FrameScheduler,
): void => {
  if (installed) {
    return
  }
  installed = true
  const pair = createRequestAnimationFrame(scheduler)
  globalThis.requestAnimationFrame = pair.requestAnimationFrame
  globalThis.cancelAnimationFrame = pair.cancelAnimationFrame
}
