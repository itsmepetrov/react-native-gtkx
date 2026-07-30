// Gestures spike probe: does a touch-only GTK gesture receive events from a
// virtual uinput touchscreen? Every gesture logs with a [gesture-spike]
// marker so the driving script can grep the host log.
//
// Three controllers on one widget, deliberately overlapping:
// - a touch-ONLY click gesture (the class GtkScrolledWindow uses internally,
//   and the one mouse automation can never trigger);
// - a plain click gesture (any source) as the control;
// - a drag gesture, to see claim/deny arbitration between the two.
import * as Adw from "@gtkx/gi/adw"
import * as Gtk from "@gtkx/gi/gtk"
import { GtkApplication, GtkApplicationWindow, GtkLabel } from "@gtkx/jsx/gtk"
import { createRoot, quit } from "@gtkx/react"
import { useEffect, useRef, useState } from "react"

const log = (message: string): void => {
  console.log(`[gesture-spike] ${message}`)
}

const Probe = () => {
  const ref = useRef<Gtk.Label | null>(null)
  const [events, setEvents] = useState<string[]>([])

  useEffect(() => {
    const widget = ref.current
    if (!widget) {
      return
    }
    const record = (what: string): void => {
      log(what)
      setEvents((previous) => [...previous, what])
    }

    const touchClick = new Gtk.GestureClick()
    touchClick.setTouchOnly(true)
    touchClick.on("pressed", () => record("touch-only pressed"))
    touchClick.on("released", () => record("touch-only released"))
    widget.addController(touchClick)

    const anyClick = new Gtk.GestureClick()
    anyClick.on("pressed", () => record("any-source pressed"))
    widget.addController(anyClick)

    const drag = new Gtk.GestureDrag()
    drag.setTouchOnly(true)
    drag.on("drag-begin", () => record("drag begin"))
    drag.on("drag-update", () => record("drag update"))
    drag.on("drag-end", () => record("drag end"))
    widget.addController(drag)

    log("controllers attached")
    return () => {
      widget.removeController(touchClick)
      widget.removeController(anyClick)
      widget.removeController(drag)
    }
  }, [])

  return (
    <GtkLabel
      ref={ref}
      label={`touch probe — events: ${events.length}\n${events.slice(-4).join("\n")}`}
      hexpand
      vexpand
    />
  )
}

// GESTURE_SPIKE_FULLSCREEN=1 makes any injected touch land on the probe
// (the session test cannot aim at a window it cannot measure).
const App = () => (
  <GtkApplicationWindow
    title="gesture spike"
    defaultWidth={800}
    defaultHeight={600}
    fullscreened={process.env.GESTURE_SPIKE_FULLSCREEN === "1"}
    onCloseRequest={quit}
  >
    <Probe />
  </GtkApplicationWindow>
)

Adw.init()
createRoot().render(
  <GtkApplication>
    <App />
  </GtkApplication>,
)
