// The fallback attach seam: how a mounted gesture reaches a widget when
// `GestureDetector`'s immediate child does not forward one.
//
// THE GAP THIS CLOSES. `./detector.tsx`'s primary mechanism clones the
// recognizer's ref and handler props straight onto the child element —
// correct for a plain `View`, an `Animated.View`, or anything else that
// forwards a measure handle, which is every OTHER gesture surface on this
// platform (the gesture-detector gallery section, gorhom's sheet,
// reanimated-dnd). `react-native-sortables`'s v3 gesture-handler path put a
// different shape in front of it: `DraggableView` hands `GestureDetector` an
// `<ItemCell>` element, a plain composite that renders an `Animated.View` but
// forwards neither its own ref nor its unknown props onto it — so the merged
// ref is silently dropped and the ten responder props that ARE the touch
// chain never reach a widget at all. Confirmed by instrumenting a real drag
// in the built gallery (docs/research/upstream-libraries.md): zero
// `onTouchStart` calls, ever, for any grid item.
//
// WHY the child not forwarding a ref is not a bug on the library's side
// either. Upstream's own v3 `NativeDetector` does not reach through the
// child for this: it wraps it in its OWN native view, styled
// `display: "contents"` — a real host view for gesture attachment that adds
// no box of its own, so it does not disturb the child's layout. This
// platform's `display` is `"none" | "flex"` only (contracts.ts) — there is
// no equivalent primitive to reproduce that wrap, and a PLAIN wrapping `View`
// is not a substitute: react-native-sortables' items are positioned via an
// explicit `top`/`left` (first resolved by flex-wrap, later frozen to
// absolute coordinates) relative to the grid's own container, and inserting
// any REAL layout-participating box between that container and an item would
// either break the initial flex-wrap columns or — if made to fill its
// parent so the child's math still resolves — turn the wrapper into a
// grid-sized overlay that steals every OTHER item's touches too. Neither is
// acceptable, so this context reaches past the opaque composite via React
// CONTEXT instead of via a ref or a new widget.
//
// THE PROTOCOL. `GestureDetector` provides null while its direct, ref-based
// attachment is still being tried — every existing gesture surface never
// sees anything but null, so nothing about them changes. Only once a layout
// effect confirms the child produced no widget does it start providing the
// real value, and only this package's OWN host components consume it
// (`Animated.View` today): the first one encountered descending the tree
// claims it — registering its own already-existing widget as the gesture's
// handle and merging the handlers into its own responder registration — and
// re-provides null to ITS children, so nothing deeper claims a second time.
import { createContext, useContext } from "react"
import type { GestureResponderEvent } from "../responder/types"

export type GestureAttach = {
  /** The same callback ref `GestureDetector` would have put on its child. */
  assignHandle: (instance: unknown) => void
  /** The same recognizer props `GestureDetector` merges onto its child. */
  handlers: Record<string, (event: GestureResponderEvent) => boolean | void>
}

/**
 * Null everywhere except between a `GestureDetector` whose direct attachment
 * failed and the first of this package's own components willing to claim it.
 */
export const GestureAttachContext = createContext<GestureAttach | null>(null)

export const useGestureAttach = (): GestureAttach | null =>
  useContext(GestureAttachContext)

/**
 * The two responder props that answer a question rather than take an event.
 * Canonical here rather than in ./detector-runtime (which re-exports it),
 * because `mergeGestureHandlers` below needs it and this is a leaf module —
 * a component using the fallback should not have to pull in the rest of the
 * recognizer machinery (the orchestrator, the tag registry, every recognizer
 * kind) just to merge two names' worth of predicate rules.
 */
export const PREDICATES = new Set<string>([
  "onStartShouldSetResponder",
  "onMoveShouldSetResponder",
])

/**
 * Merges a gesture's handlers into a component's own responder props, the
 * same rule `GestureDetector` applies when the child declares one of these
 * itself: for the two that answer a question, either side saying yes is a
 * yes; for the rest, both run.
 */
export const mergeGestureHandlers = <T extends Record<string, unknown>>(
  own: T,
  handlers: GestureAttach["handlers"],
): T => {
  const merged: Record<string, unknown> = { ...own }
  for (const [name, gestureHandler] of Object.entries(handlers)) {
    const ownHandler = own[name] as
      ((event: never) => boolean | void) | undefined
    if (!ownHandler) {
      merged[name] = gestureHandler
      continue
    }
    merged[name] = PREDICATES.has(name)
      ? (event: never) => {
          const gestureWants = gestureHandler(event) === true
          const ownWants = ownHandler(event) === true
          return gestureWants || ownWants
        }
      : (event: never) => {
          gestureHandler(event)
          ownHandler(event)
        }
  }
  return merged as T
}
