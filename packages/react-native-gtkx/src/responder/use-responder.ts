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
//
// The terminations that are not pointer events (watchTerminations, below)
// were expected to need that raw tap after all. Measurement said otherwise.
import { useLayoutEffect, useRef, type RefObject } from "react"
import { createTouch } from "../components/press-event"
import { Gtk } from "../gtkx/bridge/index"
import { createResponderSystem, type ResponderHost } from "./system"
import { hasResponderProps, type ResponderProps } from "./types"

// The gesture that reported each registered widget, so a grant can make the
// GTK claim on the right one.
const gestures = new WeakMap<ResponderHost, Gtk.Gesture>()

/** Whether `widget` is `ancestor` or sits underneath it. */
const contains = (ancestor: Gtk.Widget, widget: object): boolean => {
  for (
    let current = widget as Gtk.Widget | null;
    current !== null;
    current = current.getParent()
  ) {
    if (current === ancestor) {
      return true
    }
  }
  return false
}

/**
 * Every `GtkScrolledWindow` above `source`, innermost first. Nested
 * scrollers are rare but real, and stopping only the innermost would let an
 * outer one take the drag instead.
 */
const enclosingScrollers = (source: Gtk.Widget): Gtk.ScrolledWindow[] => {
  const found: Gtk.ScrolledWindow[] = []
  for (
    let widget = source.getParent();
    widget !== null;
    widget = widget.getParent()
  ) {
    if (widget instanceof Gtk.ScrolledWindow) {
      found.push(widget)
    }
  }
  return found
}

/**
 * `setIsJSResponder`, which is what every RN platform calls the message
 * "JavaScript has taken this interaction, native scroller stop stealing the
 * drag". iOS cancels the `UIScrollView` pan when the responder is a
 * descendant; Android has a `JSResponderHandler`; react-native-windows
 * punted on it in 2017, shipped a `manipulationModes` prop instead, and its
 * tracking issues are still open.
 *
 * On GTK the message is `kinetic-scrolling`. Measured on GTK 4 rather than
 * inferred (tests/gtk/components/scroll-arbitration.gtk.test.tsx):
 * `GtkScrolledWindow` installs exactly four gestures of its own —
 * `GestureLongPress`, `GestureSwipe`, `GesturePan`, `GestureDrag`, all
 * touch-only, all in the CAPTURE phase — and turning kinetic scrolling off
 * puts those four, and only those four, into `GTK_PHASE_NONE`. Setting a
 * controller's phase to NONE resets it, so a scroll that had already begun
 * stops there; the wheel and the motion controllers are untouched, so
 * scrolling with a mouse keeps working while a child pans.
 *
 * Why this is needed at all when the `CLAIMED` declaration above already
 * denies ancestor gestures: it is a race, and only sometimes ours.
 * `GtkScrolledWindow` does not claim on press — it claims in `drag-update`,
 * once movement passes `gtk-dnd-drag-threshold` (8 px). A view that claims
 * on press beats it. A view that claims on a MOVE — which is what
 * `onMoveShouldSetPanResponder` does, and it is the commonest shape there
 * is — usually does not, and `CLAIMED` cannot be taken back once the
 * scroller has it. So the claim is not enough on its own, and this is the
 * part that makes a child pan reachable inside a scrolling list.
 *
 * Restores the previous value rather than assuming `true`: an app that
 * turned kinetic scrolling off itself must not have it turned back on.
 */
const suspendEnclosingScrollers = (source: Gtk.Widget): (() => void) => {
  const suspended = enclosingScrollers(source).filter((scroller) =>
    scroller.getKineticScrolling(),
  )
  for (const scroller of suspended) {
    scroller.setKineticScrolling(false)
  }
  return () => {
    for (const scroller of suspended) {
      scroller.setKineticScrolling(true)
    }
  }
}

/**
 * The scroller suspension for the interaction currently under way. Module
 * scope because it is set when the responder is granted and undone when the
 * interaction ends, which are two different events on two different
 * objects; there is only ever one interaction, which is the same assumption
 * the responder system itself is built on (one pointer, one session).
 */
let restoreScrollers: (() => void) | null = null

/**
 * One lock for the process, as in RN. What is island-scoped is the
 * negotiation PATH, not the lock: `parentOf` walks the GTK widget tree and
 * simply finds nothing registered above a layout Root, so an RN island
 * inside a native widget tree negotiates among its own views and no others.
 */
const responderSystem = createResponderSystem({
  parentOf: (host) => (host as Gtk.Widget).getParent(),
  onClaim: (source) => {
    // GTK's only arbitration primitive, used the only way it can honestly be
    // used: a final one-way declaration AFTER JS has decided. There is no
    // un-claim, so nothing may depend on taking it back.
    //
    // On the SOURCE's gesture — the one the interaction is arriving through
    // — never on the granted view's. Claiming denies the sequence on every
    // gesture above the claimer and cancels it on everything below, so
    // claiming on an ancestor kills the source and the drag goes silent
    // after the grant. Slice 2 did exactly that, and the common
    // onMoveShouldSetPanResponder shape never received a single move.
    gestures.get(source)?.setState(Gtk.EventSequenceState.CLAIMED)
    // A ResponderHost is deliberately opaque to the pure module; on this
    // platform it is always the Gtk.Widget that registered it.
    restoreScrollers = suspendEnclosingScrollers(source as Gtk.Widget)
  },
})

/**
 * Everything that ends a gesture without being a pointer event, connected
 * for the length of one interaction and torn down with it.
 *
 * The plan for this task called for a single `GtkEventControllerLegacy` on
 * the toplevel in the capture phase — react-native-web's shape, on the
 * reasoning that a raw event tap is the only way to see terminations that
 * are not pointer events. Measured against GTK, it buys nothing here. Each
 * of the two triggers that survive has a first-class signal that says
 * exactly what we need to know and nothing else, and the rest of RNW's list
 * turned out to arrive as an ordinary gesture `::cancel` (see
 * `TerminationReason`). A legacy controller would have re-derived all of it
 * from a stream of raw events, and its one advantage — hearing events on a
 * sequence GTK has already denied us — matters only for triggers that no
 * longer exist.
 */
const watchTerminations = (source: Gtk.Widget): (() => void) => {
  const disposers: (() => void)[] = []

  // Window blur. GTK's `is-active` on the toplevel is the same thing the DOM
  // reports as a window `blur` — the window stopped being the active one,
  // which on a desktop usually means the user alt-tabbed mid-drag.
  const root = source.getRoot()
  if (root instanceof Gtk.Window) {
    const onActive = (): void => {
      if (!root.isActive()) {
        responderSystem.terminate("blur")
      }
    }
    root.on("notify::is-active", onActive)
    disposers.push(() => {
      root.off("notify::is-active", onActive)
    })
  }

  // An ancestor scrolling. RNW's rule exactly: the scroller has to CONTAIN
  // the responder and not BE it — a ScrollView that holds the responder
  // itself keeps it, and a sibling list scrolling is none of our business.
  // Watching the adjustments rather than a scroll controller is what makes
  // that precise: it fires for a wheel, for a keyboard scroll and for
  // kinetic deceleration alike, and only for this scroller.
  for (const scroller of enclosingScrollers(source)) {
    const onScrolled = (): void => {
      const holder = responderSystem.getResponder()
      if (
        holder !== null &&
        holder !== scroller &&
        contains(scroller, holder)
      ) {
        responderSystem.terminate("scroll")
      }
    }
    for (const adjustment of [
      scroller.getHadjustment(),
      scroller.getVadjustment(),
    ]) {
      adjustment.on("value-changed", onScrolled)
      disposers.push(() => {
        adjustment.off("value-changed", onScrolled)
      })
    }
  }

  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}

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
    let stopWatching: (() => void) | null = null

    const endInteraction = (): void => {
      stopWatching?.()
      stopWatching = null
      restoreScrollers?.()
      restoreScrollers = null
    }

    drag.on("drag-begin", (x: number, y: number) => {
      startX = x
      startY = y
      responderSystem.touchStart(widget, createTouch(widget, x, y))
      // Every ancestor's gesture reports the same press; only the one that
      // opened the interaction owns it, and asking the system afterwards is
      // the cheapest way to find out which that was.
      if (responderSystem.getSource() === widget) {
        stopWatching = watchTerminations(widget)
      }
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
      endInteraction()
    })
    // GTK cancels a sequence when something takes it away from us: a native
    // ancestor claiming it, a `GtkDragSource` attached through `Controllers`
    // reaching its threshold, a second mouse button going down for a context
    // menu. RN calls all of that a termination, and unlike RNW we never get
    // to ask first — by the time GTK tells us, the sequence is gone.
    drag.on("cancel", () => {
      responderSystem.touchCancel(widget, createTouch(widget, startX, startY))
      endInteraction()
    })

    widget.addController(drag)

    return () => {
      endInteraction()
      widget.removeController(drag)
      gestures.delete(widget)
      unregister()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
