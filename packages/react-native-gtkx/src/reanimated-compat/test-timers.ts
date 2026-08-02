// Reanimated's test helpers: `withReanimatedTimer`, `advanceAnimationByTime`,
// `advanceAnimationByFrame`.
//
// WHY THESE EXIST HERE AT ALL. An app ported to this platform brings its own
// test suite, and a suite that tests animations cannot assert on one without
// controlling time — otherwise every case is `sleep(400)` and a prayer, which
// is the shape that produces the flaky test rather than the passing one.
// Upstream solves it by faking the timers Jest owns and by emulating frames
// on top of them. Nothing here is emulated: the frame driver every animation
// on this platform runs on is this repo's own (src/components/
// frame-scheduler.ts), so the honest version is to TAKE that driver for the
// duration of a test and step it by hand. Real animations, real widget
// writes, a clock the test owns.
//
// THE VIRTUAL CLOCK CONTINUES THE REAL ONE rather than starting at zero, so
// an animation still in flight when the helper hands the driver back sees
// time move forward, not backwards by half a century of monotonic
// microseconds. Handing back is therefore "the rest of it runs at wall
// speed", not "it jumps to the end".
//
// THE ONE THING THAT IS NOT SYNCHRONOUS, and it is the difference an app's
// tests will notice: `opacity` is a direct widget call and lands inside
// `advanceAnimationByTime()`, but a transform or a position goes through the
// rect store plus `queueAllocate()`, and GTK does that allocation on its own
// main loop. Assert those after yielding to the loop once (`await
// act(async () => {})` in a @gtkx/testing test); assert opacity straight
// away. `getAnimatedStyle` and `setUpTests` are refused for a related reason
// — see the refusals in index.tsx.
import {
  installFrameDriver,
  realFrameClock,
  type FrameDriver,
} from "../components/frame-scheduler"

/** 60 fps, which is upstream's default and this platform's frame budget. */
const FRAME_MS = 1000 / 60

type Pending = {
  callback: (timeMs: number) => void
  cancelled: boolean
}

type ManualDriver = FrameDriver & {
  /** Steps the clock, delivering one frame per elapsed frame interval. */
  advance(ms: number): void
}

const createManualDriver = (): ManualDriver => {
  let clock = realFrameClock()
  let pending: Pending[] = []

  const deliver = (): void => {
    // Taken whole: a callback that re-books (which every running animation
    // does) must land on the NEXT frame, not on this one, or a single
    // advance() would run an animation to completion in one tick.
    const batch = pending
    pending = []
    for (const entry of batch) {
      if (!entry.cancelled) {
        entry.callback(clock)
      }
    }
  }

  return {
    now: () => clock,
    schedule(callback) {
      const entry: Pending = { callback, cancelled: false }
      pending.push(entry)
      return () => {
        entry.cancelled = true
      }
    },
    advance(ms) {
      let remaining = ms
      while (remaining > 0) {
        const step = Math.min(FRAME_MS, remaining)
        clock += step
        remaining -= step
        deliver()
      }
    },
  }
}

let active: ManualDriver | null = null

const requireActive = (api: string): ManualDriver => {
  if (active === null) {
    throw new Error(
      `react-native-reanimated: ${api}() only works inside withReanimatedTimer(), which is what installs the ` +
        "test clock. Outside it there is nothing to advance — animations are running on the GLib main loop at " +
        "wall speed. See docs/api.md.",
    )
  }
  return active
}

/**
 * Runs `body` with the platform's frame driver replaced by one the test
 * steps, then puts the real one back.
 *
 * ```tsx
 * await withReanimatedTimer(async () => {
 *   await render(<Fading />)
 *   advanceAnimationByTime(150)
 *   expect(widget.getOpacity()).toBeCloseTo(0.5, 1)
 * })
 * ```
 *
 * Async bodies are supported, unlike upstream's — a test here has to await a
 * render before there is anything to animate. Note that no frame is delivered
 * while the body is awaiting: the clock only moves when the test moves it, so
 * an `await` in the middle cannot let an animation slip forward.
 */
export const withReanimatedTimer = <T>(
  body: () => T,
): T extends Promise<unknown> ? Promise<void> : void => {
  if (active !== null) {
    throw new Error(
      "react-native-reanimated: withReanimatedTimer() is already active — nesting it would leave the second " +
        "clock installed when the inner call returns.",
    )
  }
  const driver = createManualDriver()
  active = driver
  installFrameDriver(driver)

  const restore = (): void => {
    active = null
    installFrameDriver(null)
  }

  let result: T
  try {
    result = body()
  } catch (error) {
    restore()
    throw error
  }
  if (result instanceof Promise) {
    return result.then(restore, (error: unknown) => {
      restore()
      throw error
    }) as T extends Promise<unknown> ? Promise<void> : void
  }
  restore()
  return undefined as T extends Promise<unknown> ? Promise<void> : void
}

/**
 * Moves the test clock forward, delivering one animation frame per 1/60 s of
 * it. Everything the frame writes has already happened when this returns —
 * see the header for the one write that has not.
 */
export const advanceAnimationByTime = (timeMs = FRAME_MS): void => {
  requireActive("advanceAnimationByTime").advance(timeMs)
}

/** {@link advanceAnimationByTime} in whole frames. */
export const advanceAnimationByFrame = (count = 1): void => {
  requireActive("advanceAnimationByFrame").advance(count * FRAME_MS)
}

/** @internal Test seam: is a manual clock installed right now? */
export const isTestClockInstalled = (): boolean => active !== null
