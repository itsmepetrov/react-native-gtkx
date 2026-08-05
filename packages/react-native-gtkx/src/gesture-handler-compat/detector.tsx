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
// WHEN THE CHILD FORWARDS NOTHING. The merge above assumes the child either
// IS a widget-backed component or forwards its ref to one — true for a plain
// `View`, an `Animated.View`, anything this package or an app writes by hand.
// `react-native-sortables`'s v3 gesture-handler path hands this component an
// opaque composite instead (`ItemCell`: renders an `Animated.View`, forwards
// neither its ref nor its own unknown props onto it), so the cloned ref is
// dropped and the merged handlers never reach a widget — confirmed by
// instrumenting a real drag in the built gallery: zero touches, ever
// (docs/research/upstream-libraries.md). Upstream does not hit this, because
// its own v3 detector does not reach through the child either — it wraps in
// its OWN `display: "contents"` native view, a primitive this platform's
// layout does not have (contracts.ts's `display` is "none" | "flex" only,
// and a plain wrapping box would break react-native-sortables' own absolute
// item positioning rather than fix it — see ./attach-context for the full
// account). So the fallback there is used here instead: try the direct ref
// first, and only once a layout effect confirms it produced nothing does
// this component start providing ./attach-context, letting one of this
// package's own components somewhere inside the child claim the gesture on
// ITS OWN widget instead.
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
import { GestureAttachContext, type GestureAttach } from "./attach-context"
import { prepareGestures } from "./composition"
import { createDetectorRuntime, PREDICATES } from "./detector-runtime"
import { isAnyGestureSpec, type AnyGestureSpec } from "./types"

export type GestureDetectorProps = {
  gesture: AnyGestureSpec
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
  if (!isAnyGestureSpec(gesture)) {
    throw new Error(
      "react-native-gtkx: `GestureDetector` was given something that is not a gesture. " +
        "Build one with `Gesture.Pan()`, `Gesture.Tap()`, `Gesture.LongPress()`, " +
        "`Gesture.Native()`, `Gesture.Pinch()`, `Gesture.Rotation()`, `Gesture.Fling()`, " +
        "`Gesture.Manual()`, `Gesture.Hover()` or `Gesture.ForceTouch()` — or the hook " +
        "spelling of any of them — or compose several with `Gesture.Race()`, " +
        "`Gesture.Simultaneous()` or `Gesture.Exclusive()`. See docs/api.md.",
    )
  }
  if (!isValidElement(children)) {
    throw new Error(
      "react-native-gtkx: `GestureDetector` expects exactly one element child. " +
        "It renders no widget of its own, so there is nothing for a fragment, a string or " +
        "several children to attach to.",
    )
  }

  // One runtime, and one handler tag per recognizer in it, for as long as this
  // detector is mounted. Upstream reassigns tags when the gesture object
  // changes; here the object is not the identity — both spellings rebuild it
  // every render — the mounted detector is, and ./relations is what maps an
  // app's gesture object onto the tag that identity minted.
  const [runtime] = useState(createDetectorRuntime)

  // The fallback attach value handed to ./attach-context, built once: its
  // two fields are already stable for the runtime's whole life, so there is
  // nothing to recompute on a later render.
  const [attach] = useState<GestureAttach>(() => ({
    assignHandle: runtime.assignHandle,
    handlers: runtime.handlers,
  }))
  // False until a layout effect below finds the direct ref produced nothing.
  // Never reset back to false: once a child needed the fallback it keeps
  // needing it, and flipping back and forth on every render would detach and
  // reattach the responder registration the fallback's own consumer made.
  const [useFallback, setUseFallback] = useState(false)

  // A composition is flattened to the recognizers it contains, each carrying
  // the relations composition gave it. `Race`, `Simultaneous` and `Exclusive`
  // do all of their work here and contribute no mechanism past this point.
  const prepared = prepareGestures(gesture)

  const childProps = children.props as Record<string, unknown>
  // React 19 made `ref` an ordinary prop, and reading `element.ref` warns that
  // it did. So the child's own ref is read from its props and nowhere else —
  // which is also where `cloneElement` will put ours back.
  const childRef = childProps.ref as Ref<unknown> | undefined

  // The config is read on every event rather than captured, so a re-render
  // that hands over a fresh gesture object takes effect without swapping the
  // handler set mid-drag.
  useLayoutEffect(() => {
    runtime.sync(prepared, childRef)
  })

  useLayoutEffect(() => runtime.dispose, [runtime])

  // A silent no-op is the failure this repo refuses. Checked after the child's
  // own layout effects have run, which is where its `useImperativeHandle`
  // publishes the handle. The direct ref gets exactly one render to prove
  // itself before the fallback engages — every child that forwards one
  // (a plain View, an Animated.View, this package's own components) resolves
  // synchronously within that same render's effects, so this never
  // second-guesses a child that was going to work anyway.
  //
  // react-hooks/set-state-in-effect is disabled rather than worked around,
  // the same call gtk/controllers.tsx's own `Controllers` already makes: the
  // rule guards effects that derive state from PROPS, which belongs in render
  // instead. This derives it from whether the child produced a widget, which
  // does not exist until after the commit — an effect is the only place that
  // can come from. `!useFallback` guards it, so it runs once and settles;
  // there is no cascade for the rule to be protecting against. No dependency
  // array is deliberate too, matching the `sync` effect above: every render
  // re-checks, because a child that starts producing a widget only after a
  // LATER render (an app's own delayed ref, say) should still be found.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!useFallback && !runtime.hasWidget()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUseFallback(true)
      return
    }
    runtime.checkWidget()
  })

  const merged: Record<string, unknown> = { ref: runtime.assignHandle }
  for (const [name, own] of Object.entries(runtime.handlers)) {
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

  return (
    <GestureAttachContext.Provider value={useFallback ? attach : null}>
      {cloneElement(children, merged)}
    </GestureAttachContext.Provider>
  )
}
