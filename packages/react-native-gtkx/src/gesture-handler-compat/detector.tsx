// `GestureDetector` — the one piece of the RNGH surface that survives
// upstream's own migration intact, and the only part of it that renders.
//
// IT ADDS NO WIDGET, for exactly the reasons `createAnimatedComponent`
// records: an extra box changes flex layout, changes what `measureLayout` is
// relative to, and changes which widget a parent's allocate walks. So it
// renders its single child unchanged and reaches that child's widget through
// the handle the child already exposes — `widgetForHandle` in
// components/measure.ts, the seam reanimated slice 1b built for this shape.
//
// The gesture's events arrive through the child's OWN responder registration
// rather than through a second one. Two `Gtk.GestureDrag` controllers on one
// widget would report every press twice, and two `register()` calls for one
// host would silently drop whichever came first — so the recognizer's props
// are MERGED into the child's, and the child's own responder props keep
// working alongside them.
//
// The widget is still needed, and not for events: `hitSlop`,
// `shouldCancelWhenOutside` and the `x`/`y` fields of every payload are all
// measured against the gesture's own view, which is not necessarily the
// widget the event arrived on.
//
// Everything mutable lives in ./detector-runtime, so nothing here reads or
// writes a ref while rendering.
import {
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react"
import { createDetectorRuntime } from "./detector-runtime"
import { isGestureSpec, mintHandlerTag, type GestureSpec } from "./types"

export type GestureDetectorProps = {
  gesture: GestureSpec
  children?: ReactNode
  /**
   * Web-only upstream, and inert here — there is no text selection to
   * suppress, no context-menu default to cancel and no CSS `touch-action` on
   * a GTK widget. Accepted so portable source stays portable.
   */
  userSelect?: string
  enableContextMenu?: boolean
  touchAction?: string
}

/** The two responder props that answer a question rather than take an event. */
const PREDICATES = new Set([
  "onStartShouldSetResponder",
  "onMoveShouldSetResponder",
])

/**
 * Not a view: exactly one child, whose props it extends.
 *
 * Upstream attaches a ref and subscribes the child's native view; the same
 * idea with the platform substituted, plus the merge that keeps the child's
 * own responder props alive.
 */
export const GestureDetector = ({
  gesture,
  children,
}: GestureDetectorProps): ReactElement => {
  if (!gesture) {
    throw new Error(
      "react-native-gtkx: `GestureDetector` must have a gesture prop provided.",
    )
  }
  if (!isGestureSpec(gesture)) {
    throw new Error(
      "react-native-gtkx: `GestureDetector` was given something that is not a gesture. " +
        "Build one with `Gesture.Pan()`, `Gesture.Tap()` or `Gesture.LongPress()` — or the hook " +
        "spelling of any of the three. The remaining recognizers and the composers are not " +
        "implemented yet and throw by name. See docs/api.md.",
    )
  }
  if (!isValidElement(children)) {
    throw new Error(
      "react-native-gtkx: `GestureDetector` expects exactly one element child. " +
        "It renders no widget of its own, so there is nothing for a fragment, a string or " +
        "several children to attach to.",
    )
  }

  // One tag, and one runtime, for as long as this detector is mounted.
  // Upstream reassigns tags when the gesture object changes; here the object
  // is not the identity — both spellings rebuild it every render — the
  // mounted detector is.
  // The KIND is fixed for the detector's life along with the tag, because it
  // decides which predicates the recognizer was built with. Swapping a `Pan`
  // for a `Tap` on the same detector is a different gesture, not a config
  // change, and upstream mints a new handler for it too.
  const [runtime] = useState(() =>
    createDetectorRuntime(mintHandlerTag(), gesture.kind, gesture.config),
  )

  const childProps = children.props as Record<string, unknown>
  // React 19 made `ref` an ordinary prop, and reading `element.ref` warns that
  // it did. So the child's own ref is read from its props and nowhere else —
  // which is also where `cloneElement` will put ours back.
  const childRef = childProps.ref as Ref<unknown> | undefined

  // The config is read on every event rather than captured, so a re-render
  // that hands over a fresh gesture object takes effect without swapping the
  // handler set mid-drag.
  useLayoutEffect(() => {
    runtime.sync(gesture.config, childRef)
  })

  useLayoutEffect(() => runtime.recognizer.dispose, [runtime])

  // A silent no-op is the failure this repo refuses. Checked after the child's
  // own layout effects have run, which is where its `useImperativeHandle`
  // publishes the handle.
  useLayoutEffect(() => {
    runtime.checkWidget()
  })

  const merged: Record<string, unknown> = { ref: runtime.assignHandle }
  for (const [name, own] of Object.entries(runtime.recognizer.handlers)) {
    const childHandler = childProps[name] as
      ((event: never) => boolean | void) | undefined
    if (!childHandler) {
      merged[name] = own
      continue
    }
    // The child asked for these too. Both run; for the two that answer a
    // question, either saying yes is a yes — the same rule RN's own bubbling
    // uses when several views want the responder.
    merged[name] = PREDICATES.has(name)
      ? (event: never) => {
          const mine = own(event) === true
          const theirs = childHandler(event) === true
          return mine || theirs
        }
      : (event: never) => {
          own(event)
          childHandler(event)
        }
  }

  return cloneElement(children, merged)
}
