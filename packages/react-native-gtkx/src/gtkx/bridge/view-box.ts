// RnGtkxViewBox — the GtkBox subclass every View renders — and the whole of
// RN's pointerEvents, which is a picking question and therefore lives here.
//
// Two of the four modes are the box's own contains(): "box-none" makes it
// invisible to GTK's pick while its children stay pickable, and hitSlop
// grows the rect the check uses. The other two are can-target on the widget
// ("none", the whole subtree) or on its children ("box-only").
//
// can-target is a single boolean per widget and TWO things want to write it
// — the widget's own pointerEvents, and a box-only ancestor masking it — so
// neither may write it directly. `setPointerTarget` records what the
// widget's own prop wants and applies the combination; the mask is derived
// from the live parent every time, so a widget that React moves elsewhere
// cannot end up stuck untargetable. Blanket-restoring children to `true` is
// what made nesting a pointerEvents inside a box-only view unsupported
// before: the restore pass could not know that a child wanted to be
// untargetable for its own reasons.
//
// Registered lazily like RnGtkxLayout (registration needs GObject, class
// identity must exist before the first instance).
import * as Gtk from "@gtkx/gi/gtk"
import { createElementComponent } from "@gtkx/react/internal"
import { registerClass } from "@gtkx/runtime"

const passthrough = new WeakSet<object>()
/** Widgets whose DIRECT children are masked — RN's pointerEvents="box-only". */
const boxOnly = new WeakSet<object>()
/** What each widget's own pointerEvents wants, before any mask. */
const ownTarget = new WeakMap<object, boolean>()

export type HitSlop = {
  top: number
  right: number
  bottom: number
  left: number
}

const hitSlops = new WeakMap<object, HitSlop>()

/** box-none toggle: picking consults this live, no invalidation needed. */
export const setBoxPassthrough = (
  widget: Gtk.Widget,
  enabled: boolean,
): void => {
  if (enabled) {
    passthrough.add(widget)
  } else {
    passthrough.delete(widget)
  }
}

/**
 * Grows the rect this widget's contains() accepts. Only RnGtkxViewBox
 * consults it — RN's hitSlop is a picking change and nothing in JS can
 * substitute for one, because a press outside the widget is never delivered
 * to it in the first place.
 */
export const setHitSlop = (widget: Gtk.Widget, slop: HitSlop | null): void => {
  if (slop === null) {
    hitSlops.delete(widget)
  } else {
    hitSlops.set(widget, slop)
  }
}

const isMasked = (widget: Gtk.Widget): boolean => {
  const parent = widget.getParent()
  return parent !== null && boxOnly.has(parent)
}

const applyTarget = (widget: Gtk.Widget): void => {
  widget.setCanTarget(!isMasked(widget) && (ownTarget.get(widget) ?? true))
}

/**
 * What this widget's own `pointerEvents` wants its can-target to be. A
 * box-only ancestor still overrides it, and stops overriding it the moment
 * the ancestor's mode changes — without either of them having to know about
 * the other.
 */
export const setPointerTarget = (
  widget: Gtk.Widget,
  targetable: boolean,
): void => {
  ownTarget.set(widget, targetable)
  applyTarget(widget)
}

/**
 * Masks or unmasks a widget's direct children — RN's
 * pointerEvents="box-only". Re-applied every commit rather than only on
 * change, because the child set moves with the renders.
 */
export const setBoxOnly = (widget: Gtk.Widget, enabled: boolean): void => {
  if (enabled) {
    boxOnly.add(widget)
  } else {
    boxOnly.delete(widget)
  }
  for (
    let child = widget.getFirstChild();
    child !== null;
    child = child.getNextSibling()
  ) {
    applyTarget(child)
  }
}

type ViewBoxComponent = ReturnType<typeof createElementComponent>

let component: ViewBoxComponent | null = null

export const getViewBoxComponent = (): ViewBoxComponent => {
  if (component) {
    return component
  }

  class RnGtkxViewBox extends Gtk.Box {
    override contains(x: number, y: number): boolean {
      if (passthrough.has(this)) {
        return false
      }
      // GTK translates the point into this widget's coordinates before
      // asking, and does not pre-check the bounds, so a negative x or a y
      // past the height is a legitimate question — which is what lets
      // hitSlop answer yes to it.
      const slop = hitSlops.get(this)
      if (slop === undefined) {
        // The default widget behavior: inside the widget's own bounds.
        return x >= 0 && y >= 0 && x < this.getWidth() && y < this.getHeight()
      }
      return (
        x >= -slop.left &&
        y >= -slop.top &&
        x < this.getWidth() + slop.right &&
        y < this.getHeight() + slop.bottom
      )
    }
  }
  // Explicit typeName: bundlers minify class names.
  registerClass(RnGtkxViewBox, { typeName: "RnGtkxViewBox" })
  component = createElementComponent("RnGtkxViewBox")
  return component
}
