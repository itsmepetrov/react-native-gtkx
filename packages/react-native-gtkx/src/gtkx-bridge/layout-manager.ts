// RnGtkxLayout — a GObject subclass of GtkLayoutManager registered entirely
// from JS (spike/layout-manager/FINDINGS.md, "B0"). The manager obeys ONLY the
// layout engine: measure() reports the engine-provided size (minimum ==
// natural, children are never queried) and allocate() delegates to the engine,
// which places every child at exactly its computed rect via allocateChild().
// This is what removes the GTK-vs-RN layout conflicts at the root: window
// minimum ratchet, overflow children inflating ancestors, and widget minimums
// pushing rects.
import * as Gdk from "@gtkx/gi/gdk"
import * as Gtk from "@gtkx/gi/gtk"
import { registerClass } from "@gtkx/runtime"

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

// Places one child at an exact rect. Only meaningful from inside an allocate()
// hook — GTK forbids size-allocating outside the layout phase.
export const allocateChild = (
  child: Gtk.Widget,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  child.sizeAllocate(
    new Gdk.Rectangle({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(0, Math.round(width)),
      height: Math.max(0, Math.round(height)),
    }),
    -1,
  )
}

// Engine flush → new rects for the same container size: schedule allocation
// only. A measure-affecting change must use queueResize instead.
export const queueAllocate = (widget: Gtk.Widget): void => {
  widget.queueAllocate()
}

export const queueResize = (widget: Gtk.Widget): void => {
  widget.queueResize()
}
