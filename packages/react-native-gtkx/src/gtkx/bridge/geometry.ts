// Widget geometry in foreign coordinate spaces — what RN's measure()/
// measureInWindow()/measureLayout() and an event's pageX/pageY need.
//
// GTK4 folds a widget's allocated position into its transform relative to
// its parent, so there is no globally meaningful x/y to read off a widget:
// the position only exists as an answer to "in whose coordinates?".
// gtk_widget_compute_point() walks that transform chain, which is also why
// it comes out right inside a scrolled viewport — GtkViewport allocates its
// child at -adjustment.value, so the scroll offset IS the child's transform.
//
// gtk_widget_translate_coordinates() and gtk_widget_get_allocation() do the
// same job and are deprecated since GTK 4.12; compute_point/compute_bounds
// are the replacements. Both can legitimately fail (no common ancestor, an
// unrealized widget, a singular transform) — every helper here returns null
// rather than a plausible-looking zero.
import * as Graphene from "@gtkx/gi/graphene"
import type * as Gtk from "@gtkx/gi/gtk"

export type Point = { x: number; y: number }

// Graphene.Point's constructor takes plain scalars, so it never hit the
// nested-boxed-struct crash Graphene.Rect's did (the retired
// graphene-rect-nested-boxed-props workaround, fixed upstream in rc.3 by our
// gtkx-org/gtkx#473 — see "Fixed in rc.3" in docs/gtkx-rc4-notes.md).
// alloc+init stays because it is the cheaper of the two here, not because
// the constructor is unsafe.
const point = (x: number, y: number): Graphene.Point =>
  Graphene.Point.alloc().init(x, y)

/**
 * Translates a point from `widget`'s coordinates into `target`'s.
 * Returns null when the two are not in the same widget hierarchy.
 */
export const computePointIn = (
  widget: Gtk.Widget,
  target: Gtk.Widget,
  x: number,
  y: number,
): Point | null => {
  const [ok, translated] = widget.computePoint(target, point(x, y))
  return ok ? { x: translated.x, y: translated.y } : null
}

/**
 * Translates a point from `widget`'s coordinates into its toplevel's — RN's
 * "page" space. Returns null for a widget that is not in a window yet.
 */
export const computePointInWindow = (
  widget: Gtk.Widget,
  x: number,
  y: number,
): Point | null => {
  const root = widget.getRoot()
  return root ? computePointIn(widget, root, x, y) : null
}
