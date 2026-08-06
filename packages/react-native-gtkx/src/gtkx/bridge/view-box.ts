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
// `zIndex` is the other half of the same subject and lives here for the same
// reason: RN's z-order is a PAINT order and a PICK order, and this widget is
// the only thing that owns both. See the block above the zIndex section below.
//
// Registered lazily like RnGtkxLayout (registration needs GObject, class
// identity must exist before the first instance).
import * as Graphene from "@gtkx/gi/graphene"
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

// --- zIndex ---------------------------------------------------------------
//
// RN's `zIndex` reorders PAINT among siblings. GTK4 paints a container's
// children in child order and has no z-order property, so the obvious fix —
// reorder the widgets — is the wrong one: widget order is the order this
// platform keeps its shadow tree in sync with (`syncChildOrder` in
// components/use-layout-child.ts), so restacking for paint would silently
// restack the LAYOUT.
//
// Paint order and layout order do not have to be the same, though, and we own
// the widget: `allocate` stays in Yoga's order and `snapshot` walks the
// children in zIndex order instead. That is what Android does too
// (`ViewGroup.getChildDrawingOrder`) and for the same reason.
//
// The half that is easy to miss is that `gtk_widget_pick()` descends in
// REVERSE child order, so sorting the paint alone leaves a raised view drawn
// on top and still unclickable. GTK4 has no `pick` vfunc (GtkWidgetClass's
// public vtable ends at `contains`, verified against gtk 4.22's header and
// gtkx's generated registry), and the only per-point hook it offers is
// `contains()` — which is exactly the vfunc this file already overrides. So
// picking is made to agree by having a covered widget answer "not me" where a
// higher-painting sibling of one of its ancestors would answer instead.
//
// Everything below is behind `raisedCount`, which is 0 in every app that never
// writes the style: one integer comparison, and both vfuncs take the path they
// took before any of this existed.

/** Non-zero zIndex per widget. Absent means 0, which is RN's default. */
const zIndexes = new WeakMap<Gtk.Widget, number>()

/**
 * How many widgets in the process currently carry a non-zero `zIndex`.
 *
 * The fast path's whole guard. `snapshot()` and `contains()` read this first,
 * so a tree that never raises anything pays one integer comparison per call
 * and no allocation, no sort, and no per-child work beyond what GTK's own
 * snapshot does.
 */
let raisedCount = 0

/**
 * Cached paint order per container: an array in paint order, or `null` for
 * "plain child order, nothing to do". Recomputed on change (a zIndex write, a
 * commit that touched the container's children) rather than per snapshot —
 * `useSortable` puts `zIndex` in its style object every frame but changes its
 * VALUE about twice per drag.
 */
const paintOrders = new WeakMap<Gtk.Widget, Gtk.Widget[] | null>()

/**
 * The container's live children, in child order, as the LAST ALLOCATE PASS
 * walked them.
 *
 * The snapshot vfunc has to visit every child either way, and walking the
 * sibling chain from JS is what costs: each `getNextSibling()` mints a fresh
 * native wrapper, measured at 1.9 µs per child against 1.0 µs for the
 * `snapshotChild()` that follows it (docs/research/z-index.md). The container's
 * `allocate()` hook already walks exactly this chain, so it hands the array
 * over instead and the paint pass reuses it.
 *
 * Safe because a child cannot appear, disappear or move without queueing a
 * resize on this container, and GTK runs the layout phase before the paint
 * phase — so an allocate always lands between a change and the snapshot that
 * would see it. A container whose allocate never ran (no RnGtkxLayout, e.g. a
 * bare slot host) simply has no entry, and the vfunc walks live.
 */
const childOrders = new WeakMap<Gtk.Widget, Gtk.Widget[]>()

const sameChildren = (a: Gtk.Widget[], b: Gtk.Widget[]): boolean => {
  if (a.length !== b.length) {
    return false
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false
    }
  }
  return true
}

/**
 * Publishes the child list the container's allocate pass just walked.
 *
 * Cheap on the hot path by construction: the array is one the caller built
 * anyway, and the paint order is only invalidated when the children actually
 * differ — an allocate for a pure move (which is most of them, one per
 * animated frame) leaves the cached sort alone.
 */
export const cacheChildOrder = (
  container: Gtk.Widget,
  children: Gtk.Widget[],
): void => {
  const previous = childOrders.get(container)
  childOrders.set(container, children)
  if (previous === undefined || !sameChildren(previous, children)) {
    paintOrders.delete(container)
  }
}

/** Containers known to hold at least one raised child, for the picking walk. */
const zOrderedParents = new WeakSet<Gtk.Widget>()

/**
 * Widgets that paint but are not touch targets of their own: the GtkLabel a
 * `Text` renders and the GtkPicture an `Image` renders. Neither component has
 * a press prop, so nothing is ever attached to them — but GTK targets them by
 * default, and `gtk_widget_pick()` reaches a child BEFORE it asks the parent's
 * `contains()`. That is the one hole in the occlusion check below: a covered
 * `View` can answer "not me", a bare GtkLabel inside it cannot.
 *
 * So while a container has a raised child, the paint-only leaves under it are
 * made untargetable and the pick lands on their nearest `View` instead — which
 * is the same widget the press would have propagated to anyway, and which does
 * answer the occlusion question. Restored the moment nothing is raised there,
 * because it is not free of consequence: `pointerEvents: "box-none"` on a View
 * whose only child is a `Text` would otherwise fall through to whatever is
 * behind it. Documented in docs/reference/components-core.md.
 */
const paintOnlyLeaves = new WeakSet<Gtk.Widget>()

/**
 * Marks a widget as painting-only for picking purposes — see above. Called
 * once per widget by the components that own one (`Text`, `Image`).
 */
export const setPaintOnlyLeaf = (widget: Gtk.Widget): void => {
  paintOnlyLeaves.add(widget)
}

const applyLeafTargeting = (container: Gtk.Widget, suppress: boolean): void => {
  for (
    let child = container.getFirstChild();
    child !== null;
    child = child.getNextSibling()
  ) {
    if (paintOnlyLeaves.has(child)) {
      setPointerTarget(child, !suppress)
    }
    // A nested container that is STILL raised keeps its own suppression: an
    // outer container coming back down must not restore leaves an inner one
    // is relying on.
    if (suppress || !zOrderedParents.has(child)) {
      applyLeafTargeting(child, suppress)
    }
  }
}

/**
 * Drops a container's cached paint order and asks for a redraw.
 *
 * Called from the zIndex writer and from the container's per-commit effect
 * (components/use-layout-child.ts), which is what covers a child mounting,
 * unmounting or being MOVED by React — the three ways the order can change
 * without any zIndex being written.
 */
export const invalidateZOrder = (container: Gtk.Widget): void => {
  // The child list too: a commit is the one thing that can change it, and the
  // allocate the commit queues puts a fresh one back before the next paint.
  childOrders.delete(container)
  if (!paintOrders.delete(container)) {
    return
  }
  container.queueDraw()
  if (zOrderedParents.has(container)) {
    // Recomputed now rather than at the next snapshot, for the same reason
    // setZIndex does it: a container that just lost its last raised child
    // (the commit that unmounted it) would otherwise never be asked again —
    // the fast path stops calling paintOrderFor once nothing is raised — and
    // would keep its paint-only leaves untargetable forever.
    paintOrderFor(container)
  }
}

/**
 * RN's `zIndex` for one child. `0` (the default, and `undefined`) clears it.
 *
 * RN applies `zIndex` unconditionally — unlike CSS, which ignores `z-index`
 * on a `position: static` box. Nothing here looks at `position` either.
 */
export const setZIndex = (widget: Gtk.Widget, value: number): void => {
  const previous = zIndexes.get(widget) ?? 0
  if (previous === value) {
    return
  }
  if (value === 0) {
    zIndexes.delete(widget)
    raisedCount -= 1
  } else {
    zIndexes.set(widget, value)
    if (previous === 0) {
      raisedCount += 1
    }
  }
  const parent = widget.getParent()
  if (parent === null) {
    return
  }
  paintOrders.delete(parent)
  // Unconditional, unlike invalidateZOrder's: the container may never have
  // had a cache to drop and its paint still just changed.
  parent.queueDraw()
  if (value === 0) {
    // Recomputed eagerly on the way DOWN, never lazily: once nothing is
    // raised the fast path stops calling paintOrderFor at all, so a container
    // that lost its last raised child would never get the chance to undo what
    // being raised did to it (paint order, leaf targeting).
    paintOrderFor(parent)
  }
}

/** The container's children, from the allocate pass if it has run. */
const childrenOf = (container: Gtk.Widget): Gtk.Widget[] => {
  const cached = childOrders.get(container)
  if (cached !== undefined) {
    return cached
  }
  const children: Gtk.Widget[] = []
  for (
    let child = container.getFirstChild();
    child !== null;
    child = child.getNextSibling()
  ) {
    children.push(child)
  }
  return children
}

const paintOrderFor = (container: Gtk.Widget): Gtk.Widget[] | null => {
  if (paintOrders.has(container)) {
    return paintOrders.get(container) ?? null
  }
  const children = childrenOf(container)
  let raised = false
  for (const child of children) {
    if (zIndexes.has(child)) {
      raised = true
      break
    }
  }
  let order: Gtk.Widget[] | null = null
  if (raised) {
    zOrderedParents.add(container)
    // Once per recompute, not per frame, and only for a container that
    // actually has something raised: the walk is what catches a `Text` that
    // mounted into an already-raised container since the last one.
    applyLeafTargeting(container, true)
    // Stable by construction. RN keeps document order among equal zIndexes,
    // and an unstable sort would let equal siblings swap between frames —
    // flicker that is miserable to attribute. `Array.prototype.sort` has been
    // required to be stable since ES2019; the index tiebreak makes that
    // independent of the engine rather than assumed of it.
    order = children
      .map((widget, index) => ({
        widget,
        index,
        z: zIndexes.get(widget) ?? 0,
      }))
      .sort((a, b) => a.z - b.z || a.index - b.index)
      .map((entry) => entry.widget)
  } else if (zOrderedParents.delete(container)) {
    applyLeafTargeting(container, false)
  }
  paintOrders.set(container, order)
  return order
}

/**
 * Whether a higher-painting sibling of this widget — or of any of its
 * ancestors — would take the pick at this point.
 *
 * `pick()` on the sibling rather than a bounds test, because "would GTK have
 * answered inside that subtree" IS the question, and it comes with the rest of
 * RN's rules for free: a raised view with `pointerEvents: "none"` is not
 * targetable, so it does not occlude either.
 *
 * The recursion terminates because it only ever asks about siblings STRICTLY
 * higher in the same container's paint order.
 */
const isOccluded = (widget: Gtk.Widget, x: number, y: number): boolean => {
  let child = widget
  let parent = child.getParent()
  while (parent !== null) {
    if (zOrderedParents.has(parent)) {
      const order = paintOrderFor(parent)
      if (order !== null) {
        const index = order.indexOf(child)
        for (let above = index + 1; above < order.length; above += 1) {
          const sibling = order[above]!
          const [ok, point] = widget.computePoint(
            sibling,
            new Graphene.Point({ x, y }),
          )
          if (
            ok &&
            sibling.pick(point.x, point.y, Gtk.PickFlags.DEFAULT) !== null
          ) {
            return true
          }
        }
      }
    }
    child = parent
    parent = child.getParent()
  }
  return false
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
      const inside =
        slop === undefined
          ? // The default widget behavior: inside the widget's own bounds.
            x >= 0 && y >= 0 && x < this.getWidth() && y < this.getHeight()
          : x >= -slop.left &&
            y >= -slop.top &&
            x < this.getWidth() + slop.right &&
            y < this.getHeight() + slop.bottom
      if (!inside || raisedCount === 0) {
        return inside
      }
      // Something in this process is raised: this widget only answers where
      // nothing painted above it would have.
      return !isOccluded(this, x, y)
    }

    // GTK's own container snapshot is `gtk_widget_real_snapshot`, which walks
    // first-to-last calling gtk_widget_snapshot_child — the loop below with
    // nothing in front of it. There is no way to chain up to it from here
    // (gtkx installs the vfunc but exposes no parent-class call, and
    // gtk_widget_snapshot() is not public C API either), so the fast path
    // reproduces it rather than delegating to it.
    //
    // No `override`: `snapshot` is a real vfunc in gtkx's codegen but is
    // missing from the shipped gtk.d.ts (same as in svg-node.ts).
    snapshot(snapshot: Gtk.Snapshot): void {
      if (raisedCount !== 0) {
        const order = paintOrderFor(this)
        if (order !== null) {
          for (const child of order) {
            this.snapshotChild(child, snapshot)
          }
          return
        }
      }
      for (const child of childrenOf(this)) {
        this.snapshotChild(child, snapshot)
      }
    }
  }
  // Explicit typeName: bundlers minify class names.
  registerClass(RnGtkxViewBox, { typeName: "RnGtkxViewBox" })
  component = createElementComponent("RnGtkxViewBox")
  return component
}
