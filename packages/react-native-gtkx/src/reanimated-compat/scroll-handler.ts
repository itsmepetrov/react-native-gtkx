// `useAnimatedScrollHandler` — Reanimated's "react to a scroll without
// rendering".
//
// On mobile it is the sharpest edge of the whole architecture: the scroll
// event is delivered to the UI runtime by native code, so the handler runs on
// the UI thread at 60/120Hz and the JS thread never hears about it. That is
// what `useEvent` and the whole event-name subscription machinery underneath
// this hook exist to arrange.
//
// Here the arrangement is already the case, and it has been since the
// ScrollView shipped. `emitScroll` in src/components/scroll-view.tsx runs
// from a `GtkAdjustment::value-changed` handler — a C callback on the GTK
// main loop, which is this JS thread — and calls the `onScroll` prop
// directly. Nothing about that path goes through React: no state is set, no
// render is scheduled, and the windowed list core already relies on exactly
// this to re-window during a scroll. A handler that writes a shared value
// from there gets what Reanimated promises, by the same reasoning
// docs/research/reanimated.md gives for the rest of this surface.
//
// So the hook is a translation, not an implementation of an event system:
// it returns a plain function to hand to a scrollable's `onScroll`, and the
// scrollable calls it. That is also how Reanimated's own web path resolves —
// `SHOULD_BE_USE_WEB` routes `useEvent` to a JS listener attached as an
// ordinary prop.
//
// TWO THINGS IT DOES NOT DO, both because the platform has no source for
// them rather than because the hook declined:
//
//   - `onBeginDrag`/`onEndDrag`. RN's `onScrollBeginDrag`/`onScrollEndDrag`
//     report the user grabbing and letting go of the CONTENT. A desktop
//     scroller is driven by the wheel, which has no grab, and this
//     platform's ScrollView has no such prop to be driven from. Handlers are
//     honoured and never called — the same fact `BackHandler` records about
//     a hardware back key.
//   - `onMomentumBegin`/`onMomentumEnd`, for the same reason one level down:
//     momentum is the deceleration after a fling, GTK's kinetic scrolling is
//     touch-only, and there is nothing on this platform that can produce a
//     touch (docs/research/gestures.md — no virtual-touch protocol exists).
//
// If ScrollView ever grows those four props, this hook needs no change: they
// are read off the same handler object and would only need a call site.
import { useRef, useState } from "react"
import type { ScrollEvent } from "../components/scroll-view"
import type { DependencyList } from "./hooks"

/**
 * The event a scroll handler receives — Reanimated's shape, which is RN's
 * native scroll payload FLATTENED (`event.contentOffset`, not
 * `event.nativeEvent.contentOffset`) plus the event name.
 *
 * It carries exactly the three measurements this platform can report, which
 * are the three {@link ScrollEvent} already carries. RN's payload also has
 * `contentInset`, `velocity` and `zoomScale`; none has a source in a
 * `GtkScrolledWindow`, and inventing zeros for them would be a number a
 * caller could not tell from a measurement.
 */
export type AnimatedScrollEvent = ScrollEvent["nativeEvent"] & {
  eventName: string
}

export type ScrollHandlerCallback<Context extends Record<string, unknown>> = (
  event: AnimatedScrollEvent,
  context: Context,
) => void

export type ScrollHandlers<Context extends Record<string, unknown>> = {
  onScroll?: ScrollHandlerCallback<Context>
  /** Honoured and never called — see the note at the top of this file. */
  onBeginDrag?: ScrollHandlerCallback<Context>
  /** Honoured and never called — see the note at the top of this file. */
  onEndDrag?: ScrollHandlerCallback<Context>
  /** Honoured and never called — see the note at the top of this file. */
  onMomentumBegin?: ScrollHandlerCallback<Context>
  /** Honoured and never called — see the note at the top of this file. */
  onMomentumEnd?: ScrollHandlerCallback<Context>
}

/**
 * @internal The hook without the hook: the translation from a
 * {@link ScrollEvent} to a handler call, plus the one context object every
 * call shares. Split out because this repo's unit project has no React
 * renderer — the hook below is two refs around this.
 *
 * `latest` is read per event rather than captured, so a re-render that
 * changed the handlers is picked up without changing the returned function.
 */
export const createScrollHandler = <
  Context extends Record<string, unknown> = Record<string, unknown>,
>(
  latest: () =>
    ScrollHandlers<Context> | ScrollHandlerCallback<Context> | undefined,
): ((event: ScrollEvent) => void) => {
  // Upstream's `useHandler` gives every handler call the SAME mutable object
  // across the whole scroll, and `@gorhom/bottom-sheet` uses it to carry the
  // offset a drag started at. One object per handler is that contract.
  const context = {} as Context
  return (event: ScrollEvent): void => {
    const current = latest()
    const onScroll = typeof current === "function" ? current : current?.onScroll
    onScroll?.({ ...event.nativeEvent, eventName: "onScroll" }, context)
  }
}

/**
 * Returns a scroll handler to pass as a scrollable's `onScroll`. The identity
 * is stable across renders — a scrollable that re-attached its signal handler
 * on every render would be a worse deal than the render this hook exists to
 * avoid.
 */
export const useAnimatedScrollHandler = <
  Context extends Record<string, unknown> = Record<string, unknown>,
>(
  handlers:
    ScrollHandlers<Context> | ScrollHandlerCallback<Context> | undefined,
  // Accepted for source parity and unused, for the reason the rest of this
  // surface gives: nothing here is captured by a Babel plugin, so a handler
  // read out of a ref is always the current one and there is no stale
  // closure for a dependency array to refresh.
  dependencies?: DependencyList,
): ((event: ScrollEvent) => void) => {
  void dependencies
  // The "latest ref" pattern, and the two disables below are what it costs.
  // Upstream rebuilds the handler OBJECT on every render and the returned
  // function has to call the current one; keeping it in a ref is the only
  // way to do that without a new function each time, which is the whole
  // point of the hook. Nothing reads the ref during render — the read
  // happens inside the scroll callback, which runs from a GTK signal long
  // after the commit. `useState` holds the function itself for the same
  // reason `useAnimatedRef` reaches for it: that value IS the return value,
  // and a ref there really would be a render-time read.
  const latest = useRef(handlers)
  // eslint-disable-next-line react-hooks/refs
  latest.current = handlers
  // eslint-disable-next-line react-hooks/refs
  const [stable] = useState(() =>
    createScrollHandler<Context>(() => latest.current),
  )
  return stable
}

/** Anything `scrollTo` can be pointed at: RN's scroll methods live on the ref. */
type ScrollableHandle = {
  scrollTo?: (options: { x?: number; y?: number; animated?: boolean }) => void
}

type ScrollableRef =
  | (() => ScrollableHandle | null)
  | { current: ScrollableHandle | null }
  | null
  | undefined

/**
 * Scrolls the view an `useAnimatedRef` points at — the other half of the pair
 * above, and the reason it is in this file: a list that reads its own offset
 * through the handler almost always writes one back, and
 * `react-native-reanimated-dnd`'s `useSortableList` does exactly that inside
 * a `useAnimatedReaction`.
 *
 * Upstream is a worklet reaching the shadow tree directly. Here it is the
 * ordinary imperative `scrollTo` every RN scrollable already exposes, called
 * synchronously, for the same reason the handler needs no event system: this
 * IS the thread that owns the widget. The argument order is upstream's
 * (`x` then `y`, not RN's options object), so library call sites are
 * unchanged, and `animated` carries through to `ScrollView`, which ignores it.
 *
 * A ref that is not (yet) pointing at a scrollable is ignored rather than
 * throwing: upstream does the same, and the first frames of a list whose ref
 * has not been attached are a normal state, not an error.
 */
export const scrollTo = (
  animatedRef: ScrollableRef,
  x: number,
  y: number,
  animated: boolean,
): void => {
  if (!animatedRef) {
    return
  }
  const handle =
    typeof animatedRef === "function" ? animatedRef() : animatedRef.current
  handle?.scrollTo?.({ x, y, animated })
}
