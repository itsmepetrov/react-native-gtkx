// The one frame driver on this platform: ~60fps one-shot ticks off the GLib
// main loop. A frame-clock driver (per window) is a later optimization;
// timeouts keep the driver widget-free.
//
// Its own module because two things now inject it — `Animated` in
// components/animated.tsx and the Reanimated compat surface in
// reanimated-compat/ — and the point of both is that they share ONE clock.
// A second scheduler would be a second timer competing for the same main
// loop, which is exactly what neither layer is allowed to add.
//
// `glibScheduler` is a façade over a swappable DRIVER rather than the driver
// itself, and that indirection buys exactly one thing: a test can take the
// clock. Every consumer captured the object at import time and calls through
// it per frame, so replacing what is behind it replaces the clock for
// everything at once — which is what makes `advanceAnimationByTime()` (see
// src/reanimated-compat/test-timers.ts) drive the platform's real animations
// deterministically instead of sleeping and hoping.
import type { FrameScheduler } from "../animated/index"
import { GLib } from "../gtkx/bridge/index"

/** What a frame driver has to answer: when is it now, and call me next frame. */
export type FrameDriver = {
  schedule(callback: (timeMs: number) => void): () => void
  /** The same clock the frame stamps come from, readable off-frame. */
  now(): number
}

const glibDriver: FrameDriver = {
  now() {
    return Number(GLib.getMonotonicTime()) / 1000
  },
  schedule(callback) {
    let cancelled = false
    const id = GLib.timeoutAdd(GLib.PRIORITY_DEFAULT, 16, () => {
      if (!cancelled) {
        callback(Number(GLib.getMonotonicTime()) / 1000)
      }
      return false
    })
    return () => {
      if (!cancelled) {
        cancelled = true
        GLib.Source.remove(id)
      }
    }
  },
}

let driver: FrameDriver = glibDriver

export const glibScheduler: FrameScheduler = {
  now: () => driver.now(),
  schedule: (callback) => driver.schedule(callback),
}

/**
 * @internal Swaps the clock every animation on this platform runs on. Null
 * restores the GLib one. Only `withReanimatedTimer` should call it — a driver
 * left installed stops every animation in the process.
 */
export const installFrameDriver = (next: FrameDriver | null): void => {
  driver = next ?? glibDriver
}

/** @internal The real clock, for a manual driver that continues from it. */
export const realFrameClock = (): number => glibDriver.now()
