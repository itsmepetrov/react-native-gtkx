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
// THE FOUR PHASE HANDLERS are called now, and what they mean is the input
// device's rather than the platform's. Measured on GTK 4.22.4 under a real
// pointer (docs/research/scroll-phases.md):
//
//   - a MOUSE WHEEL produces none of them. GTK reports a detent — one
//     `::scroll`, no `::scroll-begin`, no `::scroll-end`, no `::decelerate`,
//     and the adjustment lands its whole step in one frame with nothing
//     coasting after it. There is no drag to begin and no momentum to
//     report, which is what PR #88 recorded; it turned out to be a fact
//     about the wheel rather than about the platform.
//   - a TOUCHPAD GLIDE produces all four. The sequence has a real beginning
//     and end, and the scrolled window's own kinetic animation carries the
//     content on afterwards.
//
// The one approximation: `onBeginDrag` is the scroll SEQUENCE beginning, not
// a finger landing on the content. A touchpad never touches the content, so
// "the user started driving this scroller" is the closest true statement —
// and it is the statement consumers act on.
//
// The routing is the other half. Upstream hands ONE value to `onScroll` and
// the native side delivers five event names into it; `@gorhom/bottom-sheet`
// relies on exactly that and passes no phase prop at all. Here the handler
// carries a phase SINK (src/components/scroll-phase.ts) that `ScrollView`
// delivers into, so a library call site is unchanged. The sink is attached
// only while a phase handler is actually present, which is what lets a
// `ScrollView` given a plain `onScroll`-only handler install nothing.
import { useRef, useState } from "react"
import {
  setScrollPhaseSink,
  type ScrollPhase,
} from "../components/scroll-phase"
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
  /** The scroll sequence began. A wheel has none — see the top of this file. */
  onBeginDrag?: ScrollHandlerCallback<Context>
  /** The scroll sequence ended. A wheel has none — see the top of this file. */
  onEndDrag?: ScrollHandlerCallback<Context>
  /** The scroller kept moving on its own after the sequence ended. */
  onMomentumBegin?: ScrollHandlerCallback<Context>
  /** That movement came to rest. */
  onMomentumEnd?: ScrollHandlerCallback<Context>
}

/** Upstream's event name for each phase, carried on the flattened event. */
const EVENT_NAME_OF_PHASE: Record<ScrollPhase, string> = {
  beginDrag: "onScrollBeginDrag",
  endDrag: "onScrollEndDrag",
  momentumBegin: "onMomentumScrollBegin",
  momentumEnd: "onMomentumScrollEnd",
}

const PHASE_KEY_OF_PHASE = {
  beginDrag: "onBeginDrag",
  endDrag: "onEndDrag",
  momentumBegin: "onMomentumBegin",
  momentumEnd: "onMomentumEnd",
} as const satisfies Record<ScrollPhase, string>

/**
 * Whether `handlers` asks for any phase at all. The answer decides whether a
 * `ScrollView` installs its phase machinery, so it is asked of the CURRENT
 * handlers on every render rather than once: a component that grows a phase
 * handler later gets one, and one that never has any never pays for one.
 */
const wantsPhases = (handlers: unknown): boolean =>
  typeof handlers === "object" &&
  handlers !== null &&
  Object.values(PHASE_KEY_OF_PHASE).some(
    (key) => typeof (handlers as Record<string, unknown>)[key] === "function",
  )

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
  // The context object, when the caller already owns one — `useHandler`
  // hands out its own and a handler built from it has to share it.
  sharedContext?: Context,
): ((event: ScrollEvent) => void) => {
  // Upstream's `useHandler` gives every handler call the SAME mutable object
  // across the whole scroll, and `@gorhom/bottom-sheet` uses it to carry the
  // offset a drag started at. One object per handler is that contract.
  const context = sharedContext ?? ({} as Context)
  const handle = (event: ScrollEvent): void => {
    const current = latest()
    const onScroll = typeof current === "function" ? current : current?.onScroll
    onScroll?.({ ...event.nativeEvent, eventName: "onScroll" }, context)
  }
  // The phase sink shares that same context object, which is the whole
  // reason gorhom's lock works: `onBeginDrag` writes the offset the drag
  // started at into it and `onScroll` reads it back on the next frame.
  setScrollPhaseSink(handle, {
    wants: () => wantsPhases(latest()),
    deliver: (phase, event) => {
      const current = latest()
      if (typeof current !== "object" || current === null) {
        return
      }
      const callback = current[PHASE_KEY_OF_PHASE[phase]] as
        ScrollHandlerCallback<Context> | undefined
      callback?.(
        { ...event.nativeEvent, eventName: EVENT_NAME_OF_PHASE[phase] },
        context,
      )
    },
  })
  return handle
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

// --- the primitives the hook above is built on --------------------------
//
// `useHandler` and `useEvent` are what upstream builds every scroll handler
// out of, and libraries reach for them directly to build their own. Both are
// implementable over this seam, and neither needs the event system they exist
// to arrange on mobile — for the reason at the top of this file.

/** Upstream's return shape. Both fields mean something here. */
export type UseHandlerContext<Context extends Record<string, unknown>> = {
  context: Context
  doDependenciesDiffer: boolean
  useWeb: boolean
}

/**
 * The context object a hand-built handler shares across its calls, plus the
 * two questions upstream answers alongside it.
 *
 * `doDependenciesDiffer` is **always false**, and that is a statement rather
 * than a stub: upstream needs it because a worklet is a by-value snapshot
 * that goes stale, so a changed dependency has to force a REBUILD of the
 * handler on the UI runtime. Here a handler is an ordinary closure read out
 * of a ref at call time, so it is never stale and there is never anything to
 * rebuild. A caller that feeds this into `useEvent`'s `rebuild` argument
 * therefore never rebuilds, which is correct.
 *
 * `useWeb` is upstream's `SHOULD_BE_USE_WEB`, and it is true for the same
 * reason it is true for react-native-windows: one runtime, no worklet
 * boundary, events delivered as ordinary props (docs/research/reanimated.md).
 */
export const useHandler = <
  Event extends object,
  Context extends Record<string, unknown> = Record<string, unknown>,
>(
  handlers: Record<
    string,
    ((event: Event, context: Context) => void) | undefined
  >,
  dependencies?: DependencyList,
): UseHandlerContext<Context> => {
  void handlers
  void dependencies
  const [context] = useState(() => ({}) as Context)
  return { context, doDependenciesDiffer: false, useWeb: true }
}

/**
 * The event names this platform has a source for. Everything a scroll can
 * report, and nothing else — there is no native event registry here to
 * subscribe an arbitrary name against, so a name outside this set is refused
 * by name rather than accepted and never fired.
 */
const SCROLL_EVENT_NAMES = new Set<string>([
  "onScroll",
  ...Object.values(EVENT_NAME_OF_PHASE),
])

const PHASE_OF_EVENT_NAME = new Map<string, ScrollPhase>(
  (Object.keys(EVENT_NAME_OF_PHASE) as ScrollPhase[]).map((phase) => [
    EVENT_NAME_OF_PHASE[phase],
    phase,
  ]),
)

/**
 * Runs `handler` for each of `eventNames` the platform can report. The
 * returned value goes on a scrollable's `onScroll`, exactly as the result of
 * {@link useAnimatedScrollHandler} does — and it is the same object underneath:
 * one callable carrying the phase sink for whichever phase names were asked
 * for, so a `ScrollView` given a handler that asked for none installs no phase
 * machinery.
 *
 * `rebuild` is accepted and ignored, for the reason `doDependenciesDiffer` is
 * always false: nothing here goes stale, so there is nothing to rebuild.
 *
 * **Scroll event names only.** A name outside that set throws where it is
 * asked for, naming itself: `onGestureHandlerStateChange` and the touch names
 * belong to systems this platform implements elsewhere and would not reach a
 * handler registered here, and a subscription that can never fire is the
 * failure mode this package refuses everywhere else.
 */
export const useEvent = <Event extends object>(
  handler: (event: Event & { eventName: string }) => void,
  eventNames: readonly string[] = [],
  rebuild = false,
): ((event: ScrollEvent) => void) => {
  void rebuild
  for (const name of eventNames) {
    if (!SCROLL_EVENT_NAMES.has(name)) {
      throw new Error(
        `[react-native-gtkx] useEvent("${name}") is not supported. ` +
          `This platform delivers scroll events only — ${[...SCROLL_EVENT_NAMES].join(", ")} — ` +
          "because a GtkAdjustment is the one event source there is to subscribe to. " +
          "See docs/api.md for the gesture and touch surfaces, which are their own systems.",
      )
    }
  }
  const latest = useRef(handler)
  // eslint-disable-next-line react-hooks/refs
  latest.current = handler
  const names = useRef(eventNames)
  // eslint-disable-next-line react-hooks/refs
  names.current = eventNames
  // eslint-disable-next-line react-hooks/refs
  const [stable] = useState(() => {
    const call = (nativeEvent: object, eventName: string): void => {
      if (names.current.includes(eventName)) {
        latest.current({ ...nativeEvent, eventName } as Event & {
          eventName: string
        })
      }
    }
    const emit = (event: ScrollEvent): void => {
      call(event.nativeEvent, "onScroll")
    }
    setScrollPhaseSink(emit, {
      wants: () => names.current.some((name) => PHASE_OF_EVENT_NAME.has(name)),
      deliver: (phase, event) => {
        call(event.nativeEvent, EVENT_NAME_OF_PHASE[phase])
      },
    })
    // Upstream's return value carries this, and `useScrollOffset` reaches
    // through it to register a view TAG with the native event registry. There
    // is no such registry here and no tag to give it, so reaching for it
    // fails where it is reached for rather than silently doing nothing.
    Object.defineProperty(emit, "workletEventHandler", {
      get() {
        throw new Error(
          "[react-native-gtkx] useEvent(...).workletEventHandler is not supported. " +
            "It registers a native view tag with Reanimated's event registry, and this " +
            "platform has neither. Hand the value useEvent returns to a scrollable's " +
            "`onScroll` prop instead — that IS the subscription here.",
        )
      },
    })
    return emit
  })
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
