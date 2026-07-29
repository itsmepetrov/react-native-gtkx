import * as Gtk from "@gtkx/gi/gtk"

// RC1-WORKAROUND(fixed-layout-child): see docs/gtkx-rc1-vs-main.md
// Imperative positioning is the layout engine's write path: the reconciler puts
// GtkFixed children at (0,0), the engine then moves them to Yoga-computed coords.
export const moveChild = (
  fixed: Gtk.Fixed,
  child: Gtk.Widget,
  x: number,
  y: number,
): void => {
  fixed.move(child, x, y)
}
