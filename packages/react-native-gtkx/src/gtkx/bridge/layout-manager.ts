// RnGtkxLayout — a GObject subclass of GtkLayoutManager registered entirely
// from JS (docs/research/layout-manager.md, "B0"). The manager obeys ONLY the
// layout engine: measure() reports the engine-provided size (minimum ==
// natural, children are never queried) and allocate() delegates to the engine,
// which places every child at exactly its computed rect via allocateChild().
// This is what removes the GTK-vs-RN layout conflicts at the root: window
// minimum ratchet, overflow children inflating ancestors, and widget minimums
// pushing rects.
import * as Gdk from "@gtkx/gi/gdk"
import * as Gsk from "@gtkx/gi/gsk"
import * as Gtk from "@gtkx/gi/gtk"
import { registerClass } from "@gtkx/runtime"
import type { Transform2D } from "../../contracts"

export type RnLayoutOrientation = "horizontal" | "vertical"

export type RnLayoutHooks = {
  // Engine-provided size for the given axis; minimum == natural == this value.
  measure(orientation: RnLayoutOrientation, forSize: number): number
  // Called during GTK's allocation phase with the container's final size.
  // The engine must size-allocate every child (allocateChild) synchronously.
  allocate(width: number, height: number): void
}

// The class must exist before any instance is created, but registration needs
// GObject to be initialized — both hold after the bridge is imported, so the
// class is registered lazily on first attach (also keeps the module safe to
// import in environments without a display).
let RnGtkxLayoutClass: (new () => Gtk.LayoutManager) | null = null

const hooksByManager = new WeakMap<Gtk.LayoutManager, RnLayoutHooks>()

const ensureRegistered = (): new () => Gtk.LayoutManager => {
  if (RnGtkxLayoutClass) {
    return RnGtkxLayoutClass
  }

  class RnGtkxLayout extends Gtk.LayoutManager {
    override measure(
      _widget: Gtk.Widget,
      orientation: Gtk.Orientation,
      forSize: number,
    ): [number, number, number, number] {
      const hooks = hooksByManager.get(this)
      if (!hooks) {
        return [0, 0, -1, -1]
      }
      const size = hooks.measure(
        orientation === Gtk.Orientation.HORIZONTAL ? "horizontal" : "vertical",
        forSize,
      )
      return [size, size, -1, -1]
    }

    // Trailing vfunc params (baseline; widget) are dropped — JS tolerates the
    // arity mismatch and the linter rejects unused trailing args.
    override allocate(
      _widget: Gtk.Widget,
      width: number,
      height: number,
    ): void {
      hooksByManager.get(this)?.allocate(width, height)
    }

    override getRequestMode(): Gtk.SizeRequestMode {
      return Gtk.SizeRequestMode.CONSTANT_SIZE
    }
  }

  // Explicit typeName: bundlers minify class names and registerClass derives
  // the GType name from klass.name by default (FINDINGS §1).
  registerClass(RnGtkxLayout, { typeName: "RnGtkxLayout" })
  RnGtkxLayoutClass = RnGtkxLayout
  return RnGtkxLayout
}

// Replaces the widget's layout manager with an RnGtkxLayout driven by `hooks`.
// The container must attach its children in a layout-child-free way (GtkBox
// append / set_parent) — GtkFixed.put demands a GtkFixedLayoutChild from the
// current manager and is incompatible (FINDINGS §2).
export const attachRnLayout = (
  widget: Gtk.Widget,
  hooks: RnLayoutHooks,
): void => {
  const Klass = ensureRegistered()
  if (hooksByManager.has(widget.getLayoutManager() as Gtk.LayoutManager)) {
    throw new Error("attachRnLayout: widget already has an RnGtkxLayout")
  }
  const manager = new Klass()
  hooksByManager.set(manager, hooks)
  widget.setLayoutManager(manager)
}

// Drops the hooks and hands layout back to a fresh manager of the widget's
// own class default. Safe to call on widgets that were never attached.
export const detachRnLayout = (widget: Gtk.Widget): void => {
  const manager = widget.getLayoutManager() as Gtk.LayoutManager | null
  if (!manager || !hooksByManager.has(manager)) {
    return
  }
  hooksByManager.delete(manager)
  widget.setLayoutManager(null as unknown as Gtk.LayoutManager)
}

// Places one child at an exact rect, optionally under a visual transform.
// Only meaningful from inside an allocate() hook — GTK forbids
// size-allocating outside the layout phase.
//
// The transform path is gtk_widget_allocate(), which is what
// gtk_widget_size_allocate() itself calls with a plain translate — the child
// keeps the width/height Yoga gave it and only its placement matrix changes,
// which is exactly RN's "transforms are visual only". GTK4 inverts that
// matrix in gtk_widget_pick(), so input follows the rotated/scaled shape for
// free (measured: docs/research/transforms.md).
export const allocateChild = (
  child: Gtk.Widget,
  x: number,
  y: number,
  width: number,
  height: number,
  matrix: Transform2D | null = null,
): void => {
  const left = Math.round(x)
  const top = Math.round(y)
  const w = Math.max(0, Math.round(width))
  const h = Math.max(0, Math.round(height))

  if (!matrix) {
    child.sizeAllocate(
      new Gdk.Rectangle({ x: left, y: top, width: w, height: h }),
      -1,
    )
    return
  }

  // RN's transform origin is the centre of the view, so the matrix GTK gets
  // is T(left + cx, top + cy) · matrix · T(-cx, -cy) — folded into the six
  // components here rather than chained through GskTransform, which would
  // cost five FFI hops instead of one.
  const cx = w / 2
  const cy = h / 2
  const transform = Gsk.Transform.new().matrix2d(
    matrix.xx,
    matrix.yx,
    matrix.xy,
    matrix.yy,
    left + cx - (matrix.xx * cx + matrix.xy * cy) + matrix.dx,
    top + cy - (matrix.yx * cx + matrix.yy * cy) + matrix.dy,
  )
  // gtk_widget_allocate consumes the transform (transfer full) and gtkx
  // hands ownership over with it — never unref it here (that aborts on
  // GLib's rc-box magic assertion).
  child.allocate(w, h, -1, transform)
}

// Engine flush → new rects for the same container size: schedule allocation
// only. A measure-affecting change must use queueResize instead.
export const queueAllocate = (widget: Gtk.Widget): void => {
  widget.queueAllocate()
}

export const queueResize = (widget: Gtk.Widget): void => {
  widget.queueResize()
}
