// Everything a mounted `GestureDetector` has to remember between renders, in
// a closure rather than in the component.
//
// This file exists because the mutable state genuinely belongs here, and the
// React Compiler's lint rules are right to say so: a component may not read
// or write a ref while rendering. The detector needs things that outlive a
// render — the current configs, the child's handle, and the child's own
// forwarded ref — and every one of them is only ever touched from a callback,
// an effect or a GTK event. Keeping them behind functions makes that
// structural instead of a promise.
//
// It holds a LIST of recognizers rather than one, because a composed gesture
// is several recognizers on one child. The prop set the child is given is
// fixed and stable regardless: each entry is a trampoline over whatever
// recognizers the group currently has, so composing differently on a later
// render changes the list inside an effect and never during a render.
import { widgetForHandle } from "../components/measure"
import {
  computePointInWindow,
  Gdk,
  Gtk,
  type Gtk as GtkNs,
} from "../gtkx/bridge/index"
import type { GestureResponderEvent } from "../responder/types"
import { requestResponder } from "../responder/use-responder"
import { PREDICATES } from "./attach-context"
import type { PreparedGesture } from "./composition"
import { DECIDERS } from "./deciders"
import { gestureOrchestrator } from "./orchestrator"
import {
  createRecognizer,
  type ControllerSample,
  type Recognizer,
  type Rect,
} from "./recognizer"
import { bindGestureTag, unbindGestureTag } from "./relations"
import { registerRecognizer, unregisterRecognizer } from "./tag-registry"
import { mintHandlerTag, type GestureKind, type GestureSpec } from "./types"

/**
 * The props a recognizer contributes, named once.
 *
 * Fixed rather than read off a recognizer, because the trampolines have to
 * exist before there is a recognizer to read them from: the child renders and
 * registers with the responder system before the detector's own layout effect
 * has run. All three kinds contribute exactly this set.
 */
const HANDLER_NAMES = [
  "onStartShouldSetResponder",
  "onMoveShouldSetResponder",
  "onTouchStart",
  "onTouchMove",
  "onTouchEnd",
  "onTouchCancel",
  "onResponderGrant",
  "onResponderMove",
  "onResponderRelease",
  "onResponderTerminate",
] as const

/**
 * The two responder props that answer a question rather than take an event.
 * Canonical in ./attach-context now (components/animated.tsx's fallback
 * needs the same set without pulling in the rest of this file); re-exported
 * here so ./detector.tsx's own import keeps working.
 */
export { PREDICATES }

/** A ref in either of React's two spellings. */
type AnyRef =
  ((instance: unknown) => void) | { current: unknown } | null | undefined

let warnedWithoutWidget = false

const warnNoWidget = (): void => {
  if (warnedWithoutWidget) {
    return
  }
  warnedWithoutWidget = true
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production"
  if (!isProduction) {
    console.warn(
      "react-native-gtkx: `GestureDetector`'s child exposed no ref carrying a widget, so the gesture " +
        "cannot measure its own view. `hitSlop`, `shouldCancelWhenOutside` and the `x`/`y` fields of " +
        "every event will be wrong or ignored. Give the child a `ref` built with the platform's own " +
        "measure handle, or wrap it in a `View`. See docs/api.md.",
    )
  }
}

type Mounted = {
  /** The spec object this recognizer currently drives; rebound every render. */
  spec: GestureSpec
  readonly kind: GestureKind
  readonly tag: number
  readonly recognizer: Recognizer
  /**
   * The GTK controller feeding a kind the pointer stream cannot — a `Pinch`, a
   * `Rotation`, a `Hover` or a `ForceTouch` — once the child has produced a
   * widget to attach it to. Null for every pointer kind, and null until then:
   * the child's ref lands before this parent's layout effect, but a child that
   * carries no widget at all never gets one.
   *
   * Typed as the base controller rather than as `Gesture`, because `Hover`'s
   * is a `GtkEventControllerMotion` and that is not a gesture at all.
   */
  controller: GtkNs.EventController | null
}

/**
 * `GtkGestureZoom` / `GtkGestureRotate` — `Pinch` and `Rotation`.
 *
 * The scale and the angle are taken from the SIGNAL ARGUMENTS rather than read
 * back off the controller, and that is not a style preference:
 * `gtk_gesture_zoom_get_scale_delta` returns 1 the instant the gesture stops
 * being active, so anything asked after the fact reports the gesture undoing
 * itself. The signal carries the same number GTK would have returned, at the
 * moment it is true.
 *
 * The position is `gtk_gesture_get_bounding_box_center`, whose coordinates are
 * relative to the widget the controller is attached to — which is the
 * gesture's own view, so it is already the view-local space upstream's
 * `focalX`/`anchorX` are in (`absoluteToLocal` in its web delegate). When GTK
 * has no bounding box to report, the view's centre stands in: a touchpad
 * pinch's focal point is the pointer, and a pinch with an unknown focal point
 * is still a pinch.
 */
const touchpadController = (
  kind: "pinch" | "rotation",
  widget: GtkNs.Widget,
  channel: NonNullable<Recognizer["controller"]>,
): GtkNs.Gesture => {
  let scale = 1
  let rotation = 0
  const controller: GtkNs.Gesture =
    kind === "pinch" ? new Gtk.GestureZoom() : new Gtk.GestureRotate()

  const sample = (): ControllerSample => {
    let x = widget.getWidth() / 2
    let y = widget.getHeight() / 2
    const [known, centreX, centreY] = controller.getBoundingBoxCenter()
    if (known) {
      x = centreX
      y = centreY
    }
    // `gtk_gesture_zoom_filter_event` only lets a touchpad pinch through at
    // exactly two fingers, so this is a constant rather than a reading.
    return { scale, rotation, x, y, pointers: 2 }
  }

  controller.on("begin", () => {
    scale = 1
    rotation = 0
    channel.begin(sample())
  })
  if (kind === "pinch") {
    ;(controller as GtkNs.GestureZoom).on("scale-changed", (value: number) => {
      scale = value
      channel.update(sample())
    })
  } else {
    // `angle-changed` carries the current absolute angle first and the delta
    // SINCE RECOGNITION second, which is upstream's `rotation` exactly:
    // radians, cumulative, positive clockwise.
    ;(controller as GtkNs.GestureRotate).on(
      "angle-changed",
      (_angle: number, delta: number) => {
        rotation = delta
        channel.update(sample())
      },
    )
  }
  controller.on("end", () => {
    channel.end()
  })
  controller.on("cancel", () => {
    channel.cancel()
  })
  return controller
}

/**
 * `GtkEventControllerMotion` — `Hover`.
 *
 * The plainest of the three, and the reason this gesture turned out to be
 * deliverable at all: `enter` and `motion` carry the pointer's position in the
 * WIDGET's own coordinates, which is already the space every payload field
 * wants, and `leave` carries nothing because there is nothing left to say.
 *
 * `leave` ends the gesture rather than cancelling it — upstream's
 * `onPointerMoveOut` calls `end()`, and it is right to: the pointer leaving is
 * the hover finishing normally, not something taking it away. GTK's own
 * `cancel` has no counterpart on a motion controller, so the channel's
 * `cancel` is reached only through the arbitration registry.
 *
 * Note that this is the same controller `components/pressable.tsx` attaches
 * for its `hovered` state, on possibly the same widget. Two motion controllers
 * on one widget both receive every crossing — they are observers, and neither
 * claims anything — so a `Pressable` inside a `GestureDetector` keeps its own
 * hover styling while the gesture runs.
 */
const hoverController = (
  channel: NonNullable<Recognizer["controller"]>,
): GtkNs.EventController => {
  const controller = new Gtk.EventControllerMotion()
  controller.on("enter", (x: number, y: number) => {
    channel.begin({ x, y, pointers: 1 })
  })
  controller.on("motion", (x: number, y: number) => {
    channel.update({ x, y, pointers: 1 })
  })
  controller.on("leave", () => {
    channel.end()
  })
  return controller
}

/**
 * `GtkGestureStylus` — `ForceTouch`, and the one controller here that needs
 * hardware nothing in the test suite can synthesize.
 *
 * `getAxis(Gdk.AxisUse.PRESSURE)` returns `[known, value]` and may ONLY be
 * called from inside one of the four signal handlers, which is why the sample
 * is built in each of them rather than from a shared reader. GDK normalises
 * pressure to `[0, 1]`, which is already upstream's documented range for
 * `minForce`/`maxForce`, so nothing is rescaled.
 *
 * `stylusOnly` is left at GTK's default (true), so this controller sees tablet
 * tools and nothing else. A mouse dragging across the widget produces no
 * events here at all — which is the behaviour that keeps a `ForceTouch` from
 * quietly activating at force 0 on a machine with no tablet.
 */
const stylusController = (
  channel: NonNullable<Recognizer["controller"]>,
): GtkNs.EventController => {
  const controller = new Gtk.GestureStylus()
  const pressure = (): number => {
    const [known, value] = controller.getAxis(Gdk.AxisUse.PRESSURE)
    // A tool with no pressure axis reports none, and 0 is the honest reading
    // rather than a stand-in: a gesture whose `minForce` cannot be met simply
    // never activates, which is what a device that cannot measure pressure
    // should produce.
    return known ? value : 0
  }
  controller.on("down", (x: number, y: number) => {
    channel.begin({ x, y, force: pressure(), pointers: 1 })
  })
  controller.on("motion", (x: number, y: number) => {
    channel.update({ x, y, force: pressure(), pointers: 1 })
  })
  controller.on("up", () => {
    channel.end()
  })
  controller.on("cancel", () => {
    channel.cancel()
  })
  return controller
}

export type DetectorRuntime = {
  /** The recognizer props to merge into the child. Stable for the mount. */
  handlers: Record<string, (event: GestureResponderEvent) => boolean | void>
  /** The callback ref to put on the child. Stable for the detector's life. */
  assignHandle: (instance: unknown) => void
  /** Called from a layout effect on every render. */
  sync: (prepared: readonly PreparedGesture[], forwarded: AnyRef) => void
  /**
   * Whether the child (reached directly, via the ref merged onto it) has
   * produced a widget yet. False for a child that forwards no ref at all —
   * see ./attach-context for what happens next.
   */
  hasWidget: () => boolean
  /** Warns once if the child turned out to carry no widget. */
  checkWidget: () => void
  /** Every mounted recognizer, in the order the gestures were written. */
  gestures: () => readonly Mounted[]
  dispose: () => void
}

export const createDetectorRuntime = (): DetectorRuntime => {
  let mounted: Mounted[] = []
  let handle: unknown = null
  let forwardedRef: AnyRef = null

  const publish = (instance: unknown): void => {
    if (typeof forwardedRef === "function") {
      forwardedRef(instance)
    } else if (forwardedRef) {
      forwardedRef.current = instance
    }
  }

  const boundsInWindow = (): Rect | null => {
    const widget = widgetForHandle(handle)
    if (!widget) {
      return null
    }
    const origin = computePointInWindow(widget, 0, 0)
    if (!origin) {
      return null
    }
    return {
      x: origin.x,
      y: origin.y,
      width: widget.getWidth(),
      height: widget.getHeight(),
    }
  }

  /**
   * Attaches the GTK controller a non-pointer kind is fed by, and pumps it
   * into the recognizer's controller channel.
   *
   * FOUR KINDS, THREE CONTROLLERS, ONE CHANNEL. `GtkGestureZoom` for `Pinch`,
   * `GtkGestureRotate` for `Rotation`, `GtkEventControllerMotion` for `Hover`
   * and `GtkGestureStylus` for `ForceTouch`. Everything past `channel.begin`
   * is the same state machine every pointer kind runs on — see
   * `ControllerChannel` in ./recognizer.
   */
  const attachController = (gesture: Mounted): void => {
    const channel = gesture.recognizer.controller
    if (channel === null || gesture.controller !== null) {
      return
    }
    const widget = widgetForHandle(handle)
    if (!widget) {
      return
    }

    if (gesture.kind === "pinch" || gesture.kind === "rotation") {
      gesture.controller = touchpadController(gesture.kind, widget, channel)
    } else if (gesture.kind === "hover") {
      gesture.controller = hoverController(channel)
    } else {
      gesture.controller = stylusController(channel)
    }
    widget.addController(gesture.controller)
  }

  const detachController = (gesture: Mounted): void => {
    const controller = gesture.controller
    if (controller === null) {
      return
    }
    gesture.controller = null
    const widget = widgetForHandle(handle)
    widget?.removeController(controller)
  }

  const create = (spec: GestureSpec): Mounted => {
    const tag = mintHandlerTag()
    const gesture: Mounted = {
      spec,
      kind: spec.kind,
      tag,
      controller: null,
      // The config is read on every event rather than captured, so a re-render
      // that hands the detector a fresh gesture object takes effect without
      // swapping the handler set mid-drag.
      recognizer: createRecognizer(
        tag,
        DECIDERS[spec.kind],
        () => gesture.spec.config,
        {
          boundsInWindow,
          requestResponder: (): boolean => {
            const widget = widgetForHandle(handle)
            return widget !== null && requestResponder(widget)
          },
          orchestrator: gestureOrchestrator,
        },
      ),
    }
    // Populated the instant a recognizer exists — this IS "at GestureDetector
    // mount" for the gesture the tag belongs to. See ./tag-registry.
    registerRecognizer(tag, gesture.recognizer)
    return gesture
  }

  const handlers: Record<
    string,
    (event: GestureResponderEvent) => boolean | void
  > = {}
  for (const name of HANDLER_NAMES) {
    handlers[name] = PREDICATES.has(name)
      ? (event: GestureResponderEvent) => {
          // Either recognizer saying yes is a yes, and every one of them is
          // asked — the same rule RN's own bubbling uses when several views
          // want the responder, and the reason a composed gesture's members
          // all get to see the question.
          let wanted = false
          for (const gesture of mounted) {
            if (gesture.recognizer.handlers[name]?.(event) === true) {
              wanted = true
            }
          }
          return wanted
        }
      : (event: GestureResponderEvent) => {
          for (const gesture of mounted) {
            gesture.recognizer.handlers[name]?.(event)
          }
        }
  }

  return {
    handlers,

    assignHandle: (instance: unknown) => {
      handle = instance
      publish(instance)
      // No return value: React 19 reads one as a callback-ref cleanup.
    },

    sync: (prepared, forwarded) => {
      // A composition whose SHAPE changed is a different set of gestures, so
      // the recognizers that no longer have a counterpart are disposed and
      // the new ones minted. Doing it here rather than during render is what
      // keeps tag minting out of the render phase; the child's props never
      // change, because they are trampolines over this list.
      const next: Mounted[] = []
      const reusable = [...mounted]
      for (const gesture of prepared) {
        const index = reusable.findIndex(
          (candidate) => candidate.kind === gesture.spec.kind,
        )
        const existing =
          index >= 0 ? reusable.splice(index, 1)[0]! : create(gesture.spec)
        existing.spec = gesture.spec
        next.push(existing)
        // Identity for the relation maps: the spec object an app holds points
        // at the tag this mount minted. Re-bound every render because both
        // spellings rebuild the object, and never unbound on re-render, so a
        // memoized gesture holding an earlier render's object still resolves.
        bindGestureTag(gesture.spec, existing.tag)
        gestureOrchestrator.relations.configure(existing.tag, gesture.relations)
        // Idempotent, and attempted on every render rather than once: the
        // child's ref lands before this effect, but a child that is not laid
        // out yet has no widget to carry a controller. The first render that
        // has one attaches it.
        attachController(existing)
      }
      for (const dropped of reusable) {
        unbindGestureTag(dropped.spec)
        unregisterRecognizer(dropped.tag)
        detachController(dropped)
        dropped.recognizer.dispose()
      }
      mounted = next

      // The child's ref is attached BEFORE this parent's layout effect runs,
      // so the first `assignHandle` happened while there was nothing to
      // forward to. Publishing again here is what gets the handle into a ref
      // the child was given on its very first mount.
      const changed = forwarded !== forwardedRef
      forwardedRef = forwarded
      if (changed && handle !== null) {
        publish(handle)
      }
    },

    hasWidget: () => widgetForHandle(handle) !== null,

    checkWidget: () => {
      if (widgetForHandle(handle) === null) {
        warnNoWidget()
      }
    },

    gestures: () => mounted,

    dispose: () => {
      for (const gesture of mounted) {
        unbindGestureTag(gesture.spec)
        unregisterRecognizer(gesture.tag)
        detachController(gesture)
        gesture.recognizer.dispose()
      }
      mounted = []
    },
  }
}
