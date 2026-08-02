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
  Gtk,
  type Gtk as GtkNs,
} from "../gtkx/bridge/index"
import type { GestureResponderEvent } from "../responder/types"
import { requestResponder } from "../responder/use-responder"
import type { PreparedGesture } from "./composition"
import { DECIDERS } from "./deciders"
import { gestureOrchestrator } from "./orchestrator"
import { createRecognizer, type Recognizer, type Rect } from "./recognizer"
import { bindGestureTag, unbindGestureTag } from "./relations"
import type { TouchpadSample } from "./touchpad"
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

/** The two responder props that answer a question rather than take an event. */
export const PREDICATES = new Set<string>([
  "onStartShouldSetResponder",
  "onMoveShouldSetResponder",
])

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
   * The GTK controller feeding a `Pinch` or a `Rotation`, once the child has
   * produced a widget to attach it to. Null for every other kind, and null
   * until then — the child's ref lands before this parent's layout effect, but
   * a child that carries no widget at all never gets one.
   */
  controller: GtkNs.Gesture | null
}

export type DetectorRuntime = {
  /** The recognizer props to merge into the child. Stable for the mount. */
  handlers: Record<string, (event: GestureResponderEvent) => boolean | void>
  /** The callback ref to put on the child. Stable for the detector's life. */
  assignHandle: (instance: unknown) => void
  /** Called from a layout effect on every render. */
  sync: (prepared: readonly PreparedGesture[], forwarded: AnyRef) => void
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
   * Attaches `GtkGestureZoom` or `GtkGestureRotate` to the child's widget and
   * pumps it into the recognizer's touchpad channel.
   *
   * The scale and the angle are taken from the SIGNAL ARGUMENTS rather than
   * read back off the controller, and that is not a style preference:
   * `gtk_gesture_zoom_get_scale_delta` returns 1 the instant the gesture stops
   * being active, so anything asked after the fact reports the gesture undoing
   * itself. The signal carries the same number GTK would have returned, at the
   * moment it is true.
   *
   * The focal point is `gtk_gesture_get_bounding_box_center`, whose
   * coordinates are relative to the widget the controller is attached to —
   * which is the gesture's own view, so it is already the view-local space
   * upstream's `focalX`/`anchorX` are in (`absoluteToLocal` in its web
   * delegate). When GTK has no bounding box to report, the view's centre
   * stands in: a touchpad pinch's focal point is the pointer, and a pinch with
   * an unknown focal point is still a pinch.
   */
  const attachController = (gesture: Mounted): void => {
    const channel = gesture.recognizer.touchpad
    if (channel === null || gesture.controller !== null) {
      return
    }
    const widget = widgetForHandle(handle)
    if (!widget) {
      return
    }

    let scale = 1
    let rotation = 0
    const sample = (): TouchpadSample => {
      const controller = gesture.controller
      let focalX = widget.getWidth() / 2
      let focalY = widget.getHeight() / 2
      if (controller) {
        const [known, x, y] = controller.getBoundingBoxCenter()
        if (known) {
          focalX = x
          focalY = y
        }
      }
      // `gtk_gesture_zoom_filter_event` only lets a touchpad pinch through at
      // exactly two fingers, so this is a constant rather than a reading.
      return { scale, rotation, focalX, focalY, pointers: 2 }
    }

    if (gesture.kind === "pinch") {
      const zoom = new Gtk.GestureZoom()
      zoom.on("begin", () => {
        scale = 1
        rotation = 0
        channel.begin(sample())
      })
      zoom.on("scale-changed", (value: number) => {
        scale = value
        channel.update(sample())
      })
      zoom.on("end", () => {
        channel.end()
      })
      zoom.on("cancel", () => {
        channel.cancel()
      })
      gesture.controller = zoom
    } else {
      const rotate = new Gtk.GestureRotate()
      rotate.on("begin", () => {
        scale = 1
        rotation = 0
        channel.begin(sample())
      })
      // `angle-changed` carries the current absolute angle first and the delta
      // SINCE RECOGNITION second, which is upstream's `rotation` exactly:
      // radians, cumulative, positive clockwise.
      rotate.on("angle-changed", (_angle: number, delta: number) => {
        rotation = delta
        channel.update(sample())
      })
      rotate.on("end", () => {
        channel.end()
      })
      rotate.on("cancel", () => {
        channel.cancel()
      })
      gesture.controller = rotate
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

    checkWidget: () => {
      if (widgetForHandle(handle) === null) {
        warnNoWidget()
      }
    },

    gestures: () => mounted,

    dispose: () => {
      for (const gesture of mounted) {
        unbindGestureTag(gesture.spec)
        detachController(gesture)
        gesture.recognizer.dispose()
      }
      mounted = []
    },
  }
}
