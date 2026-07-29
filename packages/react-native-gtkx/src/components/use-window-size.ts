import { useLayoutEffect, useState } from "react"
import type { Gdk, Gtk } from "../gtkx-bridge/index.js"

export type WindowSize = { width: number; height: number }

// Per-window viewport tracking: reads the window's logical size from the
// GdkSurface "layout" signal (the only moment allocation is guaranteed fresh
// — see 007). Each window (main, every Modal) drives its own layout root.
export const useGtkWindowSize = (
  window: Gtk.Window | null,
  initial: WindowSize,
): WindowSize => {
  const [size, setSize] = useState<WindowSize>(initial)

  useLayoutEffect(() => {
    if (!window) {
      return
    }
    let surface: Gdk.Surface | null = null

    const read = (): void => {
      const width = window.getWidth()
      const height = window.getHeight()
      if (width > 0 && height > 0) {
        setSize((previous) =>
          previous.width === width && previous.height === height
            ? previous
            : { width, height },
        )
      }
    }

    const onLayout = (): void => read()
    const attachSurface = (): void => {
      if (surface) {
        return
      }
      surface = window.getSurface()
      surface?.on("layout", onLayout)
      read()
    }
    const onRealize = (): void => attachSurface()

    window.on("realize", onRealize)
    if (window.getRealized()) {
      attachSurface()
    }
    read()

    return () => {
      window.off("realize", onRealize)
      surface?.off("layout", onLayout)
    }
  }, [window])

  return size
}
