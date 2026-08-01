// The one frame driver on this platform: ~60fps one-shot ticks off the GLib
// main loop. A frame-clock driver (per window) is a later optimization;
// timeouts keep the driver widget-free.
//
// Its own module because two things now inject it — `Animated` in
// components/animated.tsx and the Reanimated compat surface in
// reanimated-compat/ — and the point of both is that they share ONE clock.
// A second scheduler would be a second timer competing for the same main
// loop, which is exactly what neither layer is allowed to add.
import type { FrameScheduler } from "../animated/index"
import { GLib } from "../gtkx/bridge/index"

export const glibScheduler: FrameScheduler = {
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
