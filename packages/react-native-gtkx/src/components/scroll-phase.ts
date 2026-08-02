// The seam between a scrollable's PHASE events and a handler object that
// wants all of them through one prop.
//
// RN's `ScrollView` reports the phases as four separate props
// (`onScrollBeginDrag` and friends) and an app writes them separately. A
// Reanimated scroll handler is the other shape: `useAnimatedScrollHandler`
// returns ONE value, an app writes `onScroll={handler}` and nothing else, and
// on mobile the native side routes all five event names into it —
// `@gorhom/bottom-sheet` does exactly that and passes no phase prop at all.
//
// So something has to fan one prop out into five callbacks, and on RN that
// something is native. Here it is this: a scroll handler may carry a phase
// SINK, and `ScrollView` delivers the phases into it as well as to its own
// props. Both shapes work, neither knows about the other, and this module is
// the only thing they share — which is why it lives in `components/` with no
// import of its own. `reanimated-compat` may depend on the platform; the
// platform may not depend on `reanimated-compat`.
import type { ScrollEvent } from "./scroll-view"

/**
 * The four phases RN reports around a scroll, in the order they can occur:
 * the user starts driving the scroller, stops driving it, its own inertia
 * takes over, its inertia runs out. What each one MEANS on GTK — and which
 * input devices produce any of them at all — is measured in
 * docs/research/scroll-phases.md.
 */
export type ScrollPhase =
  "beginDrag" | "endDrag" | "momentumBegin" | "momentumEnd"

/**
 * What a phase-aware handler offers a scrollable.
 *
 * `wants()` is separate from `deliver()` on purpose, and it is what keeps the
 * machinery free: a Reanimated handler is one stable function whose handler
 * OBJECT is rebuilt every render, so whether it currently asks for any phase
 * is a question with a changing answer and no event to ask it on. A
 * `ScrollView` asks it during render; while the answer is false it installs
 * no GTK controller at all.
 */
export type ScrollPhaseSink = {
  wants(): boolean
  deliver(phase: ScrollPhase, event: ScrollEvent): void
}

/**
 * The property a phase-aware handler carries. A string rather than a Symbol
 * so that a handler built by one copy of the package is still understood by
 * another — an app and a library can resolve different instances of
 * `react-native-gtkx` through their own `node_modules`, and a Symbol would
 * make those two silently stop talking.
 *
 * @internal
 */
const PHASE_SINK = "__rnGtkxScrollPhaseSink"

type PhaseAware = { [PHASE_SINK]?: ScrollPhaseSink | null }

/** @internal Marks `handler` as able to receive the phases. */
export const setScrollPhaseSink = (
  handler: object,
  sink: ScrollPhaseSink,
): void => {
  ;(handler as PhaseAware)[PHASE_SINK] = sink
}

/** @internal The phase sink `handler` carries, or null when it carries none. */
export const scrollPhaseSink = (handler: unknown): ScrollPhaseSink | null => {
  if (handler === null || handler === undefined) {
    return null
  }
  if (typeof handler !== "function" && typeof handler !== "object") {
    return null
  }
  return (handler as PhaseAware)[PHASE_SINK] ?? null
}
