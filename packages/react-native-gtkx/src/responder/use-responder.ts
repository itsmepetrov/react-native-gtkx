// The platform half of the responder system: GTK carries the events, the
// pure module in ./system owns the algorithm.
//
// Shape and why (docs/research/gestures.md, "Verifiability decides the
// implementation shape"): the architecturally cleanest source would be one
// GtkEventControllerLegacy on the toplevel doing its own hit-testing, which
// is react-native-web's design. It is also untestable here —
// @gtkx/testing's userEvent emits GtkGesture SIGNALS on the widget you name
// and never produces a GdkEvent, so a raw tap could not be driven in CI at
// all. A gesture per responder-declaring View is drivable today
// (`userEvent.drag`), and GTK's own bubble chain still delivers a press to
// every ancestor's gesture, so the path is not lost.
//
// One GtkGestureDrag per View covers press, move and release: it emits
// drag-begin on press with no threshold of its own, which is exactly what
// RN wants — the responder system has no threshold either, and PanResponder
// users apply their own inside onMoveShouldSetPanResponder.
import { useLayoutEffect, useRef, type RefObject } from "react"
import { createTouch } from "../components/press-event"
import { Gtk } from "../gtkx/bridge/index"
import { createResponderSystem, type ResponderHost } from "./system"
import { hasResponderProps, type ResponderProps } from "./types"

// The gesture that reported each registered widget, so a grant can make the
// GTK claim on the right one.
const gestures = new WeakMap<ResponderHost, Gtk.Gesture>()

/**
 * One lock for the process, as in RN. What is island-scoped is the
 * negotiation PATH, not the lock: `parentOf` walks the GTK widget tree and
 * simply finds nothing registered above a layout Root, so an RN island
 * inside a native widget tree negotiates among its own views and no others.
 */
const responderSystem = createResponderSystem({
  parentOf: (host) => (host as Gtk.Widget).getParent(),
  onGrant: (host) => {
    // GTK's only arbitration primitive, used the only way it can honestly be
    // used: a final one-way declaration AFTER JS has decided. There is no
    // un-claim, so nothing may depend on taking it back.
    gestures.get(host)?.setState(Gtk.EventSequenceState.CLAIMED)
  },
})

/** Exposed for tests and for future ScrollView arbitration. */
export const getCurrentResponder = (): ResponderHost | null =>
  responderSystem.getResponder()

/**
 * Attaches the responder event source to a component's widget, but only when
 * it actually declares responder props — RN never asks a view without
 * handlers, so a controller on every View would be pure cost.
 */
export const useResponder = (
  widgetRef: RefObject<Gtk.Widget | null>,
  props: ResponderProps,
): void => {
  // Handlers are read through a ref so a re-render never detaches and
  // re-adds the gesture mid-drag (the same reasoning as Pressable's). The
  // ref is refreshed in an effect rather than during render: a render-phase
  // write is not safe under concurrent rendering, and this effect is
  // declared BEFORE the registration effect so the handlers are already
  // current the first time the gesture can fire.
  const propsRef = useRef(props)
  useLayoutEffect(() => {
    propsRef.current = props
  })
  const active = hasResponderProps(props)

  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget || !active) {
      return
    }

    const unregister = responderSystem.register(widget, () => propsRef.current)

    const drag = new Gtk.GestureDrag()
    gestures.set(widget, drag)

    // drag-update/end report offsets FROM the start point, not absolute
    // coordinates — the start has to be carried.
    let startX = 0
    let startY = 0

    drag.on("drag-begin", (x: number, y: number) => {
      startX = x
      startY = y
      responderSystem.touchStart(widget, createTouch(widget, x, y))
    })
    drag.on("drag-update", (offsetX: number, offsetY: number) => {
      responderSystem.touchMove(
        widget,
        createTouch(widget, startX + offsetX, startY + offsetY),
      )
    })
    drag.on("drag-end", (offsetX: number, offsetY: number) => {
      responderSystem.touchEnd(
        widget,
        createTouch(widget, startX + offsetX, startY + offsetY),
      )
    })
    // GTK cancels a sequence when something upstream claims it — a native
    // ancestor scrolling, say. RN calls that a termination, and it is the
    // one termination trigger we get for free.
    drag.on("cancel", () => {
      responderSystem.touchCancel(widget, createTouch(widget, startX, startY))
    })

    widget.addController(drag)

    return () => {
      widget.removeController(drag)
      gestures.delete(widget)
      unregister()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
