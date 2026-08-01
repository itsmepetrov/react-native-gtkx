// Keeping a widget on screen after React has reconciled it away.
//
// THE PROBLEM. Every exit animation — a Reanimated `exiting`, a route
// leaving a stack, anything that has to be *seen* going — needs the view
// layer to keep drawing something React already considers gone. React's
// deletion is not asynchronous and does not ask: the reconciler runs the
// unmounting subtree's layout-effect cleanups and then unparents its topmost
// widget, in one synchronous commit. By the time our own cleanup in
// use-layout-child.ts runs, the Yoga node is about to be freed and the widget
// is one call away from having no parent, so there is nothing left to
// animate.
//
// THE SHAPE OF THE ANSWER is the one src/common/navigation-stack.tsx already
// uses for pages: hold on to what is leaving, drop it on the real end-of-
// animation signal, and arm a timer in case that signal never comes. This
// module is that pattern with the React-element half replaced by the widget
// half, and generalised: it knows nothing about Reanimated, about layout
// animations, or about what is being animated. It knows how to keep a widget
// alive, parented and laid out until somebody says stop.
//
// WHAT RETENTION HAS TO COVER, measured against what actually breaks:
//
//   1. The widget is unparented by the reconciler. It SURVIVES that (its
//      JS wrapper holds the reference; verified on the rig — a widget removed
//      by React re-parents and re-allocates at its stored rect), so the fix
//      is to put it back, in the same container, at the end of the child list
//      so it draws over the siblings that are reflowing into its place.
//   2. Every container in the subtree has its RnGtkxLayout DETACHED, which
//      hands its children back to a GtkBox with no layout manager at all —
//      after which nothing size-allocates them, GTK warns once per frame that
//      it is snapshotting a child "without a current allocation", and the
//      subtree measures 0×0 instead of the size the engine gave it. That
//      detach is what gets deferred.
//
// AND WHAT IT DELIBERATELY DOES NOT COVER: the Yoga nodes. They are removed
// from the shadow tree and freed on the spot, like any other unmount, because
// the only thing the retained subtree still reads from a node is
// `getRect()` — and that returns `lastRect`, an ordinary JS object that
// outlives the WASM node. Deferring the free as well was measured against the
// same test and changed nothing, so it is not here.
//
// (2) applies to the whole retained SUBTREE, not just its root, so the
// deferral is looked up by walking the widget's parent chain — which is
// intact at cleanup time, because the reconciler unparents only the topmost
// widget of a deleted subtree and does it last.
//
// THE TIMER IS NOT OPTIONAL. A retained widget is a widget nothing owns: if
// the animation that was supposed to release it never ends — it was never
// started, it threw, the frame source died — the widget stays parented,
// drawn, and hit-testable forever. Every retention therefore arms a fallback
// that releases it regardless, and `release()` is idempotent so whichever
// arrives first wins.
import { queueAllocate, type Gtk } from "../gtkx/bridge/index"

// A deliberately generous upper bound for how long a widget may be retained
// when the caller does not name its own, mirroring navigation-stack.tsx's
// `DEFAULT_TRANSITION_MS`: NOT a measurement of any real animation, just the
// point past which "still animating" stops being a credible explanation for a
// widget nothing owns.
const DEFAULT_RETENTION_MS = 1000

/** A live retention. Releasing is idempotent — the timer may get there first. */
export type WidgetRetention = {
  /** Drops the widget and runs everything deferred while it was held. */
  release(): void
}

type Retention = {
  deferred: (() => void)[]
  timer: ReturnType<typeof setTimeout> | null
  released: boolean
  onRelease: (() => void) | undefined
}

// Keyed by the retained widget, and a real Map rather than a WeakMap on
// purpose: while a widget is retained, this IS its owner — nothing else
// references it — and `size` is the fast path that keeps `deferUntilReleased`
// free for every unmount that is not part of a retention.
const retentions = new Map<Gtk.Widget, Retention>()

/** @internal Test seam: how many widgets are being held right now. */
export const retainedWidgetCount = (): number => retentions.size

const findRetention = (widget: Gtk.Widget): Retention | null => {
  let current: Gtk.Widget | null = widget
  while (current !== null) {
    const found = retentions.get(current)
    if (found !== undefined) {
      return found
    }
    current = current.getParent() as Gtk.Widget | null
  }
  return null
}

/**
 * Postpones `job` if `widget` is inside a subtree being retained; otherwise
 * says so and leaves the caller to run it now.
 *
 * This is the single seam the unmount path uses (see use-layout-child.ts).
 * Jobs run in reverse registration order when the retention is released, so
 * a subtree is taken apart from the leaves back up the way it was built.
 */
export const deferUntilReleased = (
  widget: Gtk.Widget | null | undefined,
  job: () => void,
): boolean => {
  if (!widget || retentions.size === 0) {
    return false
  }
  const retention = findRetention(widget)
  if (retention === null) {
    return false
  }
  retention.deferred.push(job)
  return true
}

/**
 * Holds `widget` in `parent` until the returned handle is released or
 * `fallbackMs` elapses.
 *
 * Call it from the unmounting component's own layout-effect cleanup — which
 * React runs BEFORE the cleanups of the components below it and before the
 * widget is unparented, so the retention is registered by the time the rest
 * of the subtree asks whether it is inside one.
 *
 * Returns null when there is nothing to retain: no widget, or a parent that
 * is being unmounted in the same commit (its ref has already been detached,
 * which is exactly the case where an exit animation would be animating
 * something on its way out anyway).
 */
export const retainWidget = (
  widget: Gtk.Widget | null | undefined,
  parent: Gtk.Widget | null | undefined,
  options?: { fallbackMs?: number; onRelease?: () => void },
): WidgetRetention | null => {
  if (!widget || !parent) {
    return null
  }
  const existing = retentions.get(widget)
  if (existing !== undefined) {
    // Retaining the same widget twice would fight over one parent slot.
    return null
  }

  const retention: Retention = {
    deferred: [],
    timer: null,
    released: false,
    onRelease: options?.onRelease,
  }
  retentions.set(widget, retention)

  const release = (): void => {
    if (retention.released) {
      return
    }
    retention.released = true
    if (retention.timer !== null) {
      clearTimeout(retention.timer)
      retention.timer = null
    }
    retentions.delete(widget)
    // Unparent first: everything below undoes the layout bookkeeping that
    // only matters while the widget is still on screen.
    if (widget.getParent() !== null) {
      widget.unparent()
    }
    for (let index = retention.deferred.length - 1; index >= 0; index -= 1) {
      retention.deferred[index]!()
    }
    retention.deferred.length = 0
    retention.onRelease?.()
  }

  // The reconciler unparents the widget AFTER this cleanup returns, so the
  // re-attach cannot happen here. A microtask is the earliest moment that is
  // still inside the same turn of the main loop — GTK has not had a chance to
  // lay out or paint, so nothing flickers.
  queueMicrotask(() => {
    if (retention.released) {
      return
    }
    if (widget.getParent() === null) {
      // Appended rather than restored to its old index, and that is
      // load-bearing twice over: last in the child list means drawn over the
      // siblings closing the gap, and it means the sibling positions
      // use-layout-child.ts derives a new child's Yoga index from are not
      // shifted by a widget that has no Yoga node any more.
      widget.setParent(parent)
    }
    queueAllocate(parent)
  })

  retention.timer = setTimeout(
    release,
    options?.fallbackMs ?? DEFAULT_RETENTION_MS,
  )

  return { release }
}
