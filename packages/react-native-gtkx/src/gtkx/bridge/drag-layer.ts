// A window-level drag layer: a non-interactive `Gtk.Picture` positioned by
// pixel margins inside a `Gtk.Overlay` wrapped once around each window's real
// content, showing a live `Gtk.WidgetPaintable` of whatever is being dragged.
//
// Why this exists NEXT TO `GtkDragSource`'s own icon (gtk-controllers.tsx
// already sets one via `setIcon`): that icon is a compositor-owned surface —
// real, and already unclipped by this process's own widget tree, but also
// outside it, so nothing in this process can read its geometry or its
// pixels. A dragged item escaping an `overflow: hidden` ancestor needs a
// widget IN OUR OWN TREE to prove that with — geometry a test can measure,
// pixels a screenshot can read. This is that widget: a second, deliberately
// redundant representation, added at window level (an `Overlay` child, so no
// ancestor's clip reaches it) for as long as the drag is over this window,
// and removed the moment the drag ends. `setIcon`'s own icon is untouched —
// a drag that leaves this window for another still shows it.
//
// REPARENTING THE DRAGGED WIDGET ITSELF was tried first and refused: moving
// the real node into a different container re-triggers ITS OWN size
// negotiation under a parent with different constraints (measured: a
// 100×100 card came out 800×600), and an unmount mid-flight strands the
// widget outside the tree React still thinks it owns. A `WidgetPaintable`
// sidesteps both — it is a live VIEW of the widget, not the widget, so the
// original never moves and never leaves the component tree React manages.
//
// Ghosting the original is `Gtk.Widget.setOpacity()`, restored to whatever it
// was before (not hardcoded to 1), so this composes with an app's own
// animated or static opacity rather than fighting it. Because
// `Gtk.WidgetPaintable` renders the widget it observes LIVE, `setIcon`'s own
// compositor icon and this overlay copy dim along with the original — the
// three are one underlying render, not three independent ones. Documented in
// docs/api.md rather than fought: decoupling them would need a frozen
// texture snapshot taken before the fade, not a live paintable, and a frozen
// snapshot is not what the spike validated or what this measures.
import * as Gtk from "@gtkx/gi/gtk"
import { computePointIn } from "./geometry"

// Dim, not hidden: RN dnd libraries commonly leave the dragged row at
// reduced rather than zero opacity (e.g. `react-native-draggable-flatlist`'s
// `activeOpacity`), and a fully transparent original would take the ghost's
// own coupled render with it, per the note above.
const GHOST_OPACITY = 0.35

export type DragLayerHandle = {
  /** Called on every `GtkDropControllerMotion` "motion", already in the
   *  OVERLAY's own coordinates — no per-call translation, because the
   *  picture is that overlay's own child. Zero React involvement: a widget
   *  property write per axis, nothing else. */
  move: (x: number, y: number) => void
  /** The pointer (re)entered this window mid-drag: reveal the ghost and
   *  place it before the next motion arrives. */
  show: (x: number, y: number) => void
  /** The pointer left this window: nothing further tracks it here, so
   *  hide rather than leave it stuck at the edge. */
  hide: () => void
  /** The drag ended (dropped or cancelled): remove the ghost and restore
   *  the original's opacity. */
  end: () => void
}

type OverlayEntry = {
  overlay: Gtk.Overlay
  /** At most one drag is ever in flight per window — GDK serialises drag
   *  sessions on a seat — so one slot, not a set. */
  active: DragLayerHandle | null
}

const overlaysByRoot = new WeakMap<Gtk.Root, OverlayEntry>()

// `Adw.ApplicationWindow` names its own slot "content" and manages Adwaita's
// toolbar/toast chrome INSIDE the `Gtk.Window` child slot it inherits —
// writing that slot directly would replace Adwaita's internal structure
// instead of the app's content. Anything else `AppRegistry.tsx` builds
// (`Gtk.ApplicationWindow`) is a plain `Gtk.Window`, whose own `child` slot
// IS the app's content, so `getChild`/`setChild` is right for it.
//
// Told apart by DUCK TYPING (does it have setContent/getContent?) rather
// than `instanceof Adw.ApplicationWindow`: this file backs the RN core's
// drag-and-drop (react-native-gtkx/dnd), which must build without Adw-1 at
// all (see .claude/epics/adw-optional/001.md) — `@gtkx/gi/adw` is not
// something this module can import even just to compare against it. A
// plain Gtk.Window/GtkApplicationWindow never has these methods, so the
// check is exactly as precise as the instanceof it replaces.
type AdwApplicationWindowLike = {
  setContent: (content: Gtk.Widget | null) => void
  getContent: () => Gtk.Widget | null
}

const asAdwApplicationWindow = (
  root: Gtk.Root,
): AdwApplicationWindowLike | null => {
  const candidate = root as unknown as Partial<AdwApplicationWindowLike>
  return typeof candidate.setContent === "function" &&
    typeof candidate.getContent === "function"
    ? (candidate as AdwApplicationWindowLike)
    : null
}

const setWindowContent = (root: Gtk.Root, content: Gtk.Widget | null): void => {
  const adwWindow = asAdwApplicationWindow(root)
  if (adwWindow) {
    adwWindow.setContent(content)
  } else {
    ;(root as unknown as Gtk.Window).setChild(content)
  }
}

/**
 * Detaches the window's current content and hands it back, rather than
 * leaving it parented. `Gtk.Overlay.setChild()` asserts its argument is
 * unparented (or already its own child, or null) — it will not steal a
 * widget from another parent — so the content has to be unparented BEFORE
 * the overlay can adopt it, not after.
 */
const detachWindowContent = (root: Gtk.Root): Gtk.Widget | null => {
  const adwWindow = asAdwApplicationWindow(root)
  const current = adwWindow
    ? adwWindow.getContent()
    : (root as unknown as Gtk.Window).getChild()
  if (current) {
    setWindowContent(root, null)
  }
  return current
}

/**
 * The overlay for `root`, wrapping its real content the first time any drag
 * asks for it and reused for the window's whole lifetime after that — a
 * one-time structural change, not a per-drag one, because reparenting a
 * whole app's content is not something to repeat every time a finger moves.
 */
const getOverlayEntry = (root: Gtk.Root): OverlayEntry => {
  const existing = overlaysByRoot.get(root)
  if (existing) {
    return existing
  }

  const current = detachWindowContent(root)
  const overlay = Gtk.Overlay.new()
  overlay.setChild(current)
  setWindowContent(root, overlay)

  const entry: OverlayEntry = { overlay, active: null }
  overlaysByRoot.set(root, entry)

  // One motion controller per WINDOW rather than per drag or per provider:
  // GDK stops delivering to the drag source after `drag-begin` (the
  // compositor owns the pointer from there), and `GtkDropControllerMotion`
  // is the widget-level replacement `dnd/context.tsx` already relies on, at
  // provider scope, for the same reason. This is that same technique at
  // window scope, so the ghost tracks the pointer regardless of which
  // `DropProvider` — if any — the drag started under.
  const motion = Gtk.DropControllerMotion.new()
  motion.connect("motion", (x: number, y: number) => {
    entry.active?.move(x, y)
  })
  motion.connect("enter", (x: number, y: number) => {
    entry.active?.show(x, y)
  })
  motion.connect("leave", () => {
    entry.active?.hide()
  })
  overlay.addController(motion)

  return entry
}

/**
 * Starts the window-level ghost for a drag that just began on `widget`,
 * grabbed at `(grabX, grabY)` in `widget`'s own coordinates — the same pair
 * `GtkDragSource.onPrepare` already reports and already feeds `setIcon()`.
 *
 * Returns `null` when `widget` has no window yet (nothing to escape) or
 * shares no transform with it (unrealized) — the same failure mode
 * `computePointIn` documents for `measure()`.
 */
export const beginDragLayer = (
  widget: Gtk.Widget,
  grabX: number,
  grabY: number,
): DragLayerHandle | null => {
  const root = widget.getRoot()
  if (!root) {
    return null
  }
  const entry = getOverlayEntry(root)

  const origin = computePointIn(widget, entry.overlay, 0, 0)
  const grab = computePointIn(widget, entry.overlay, grabX, grabY)
  if (!origin || !grab) {
    return null
  }
  // Constant for the drag's lifetime: how far the pointer sits from the
  // widget's own top-left, in the overlay's coordinate space. Every later
  // motion subtracts it back off — the same arithmetic `DropProvider`'s
  // `onDragging` already does for `tx`/`ty`, one level up.
  const offsetX = grab.x - origin.x
  const offsetY = grab.y - origin.y

  const picture = Gtk.Picture.newForPaintable(Gtk.WidgetPaintable.new(widget))
  picture.setCanTarget(false)
  picture.setCanFocus(false)
  picture.setHalign(Gtk.Align.START)
  picture.setValign(Gtk.Align.START)
  picture.setMarginStart(Math.round(origin.x))
  picture.setMarginTop(Math.round(origin.y))

  entry.overlay.addOverlay(picture)
  // Neither should ever be true for a floating ghost, but both default open
  // on a plain overlay child — set explicitly rather than trusted, since
  // either one being true would let the ghost resize the window it is
  // supposed to float over (measure) or vanish at its own edge (clip) the
  // moment it demonstrates the fix this exists for.
  entry.overlay.setMeasureOverlay(picture, false)
  entry.overlay.setClipOverlay(picture, false)

  const previousOpacity = widget.getOpacity()
  widget.setOpacity(GHOST_OPACITY)

  const handle: DragLayerHandle = {
    move: (x, y) => {
      picture.setMarginStart(Math.round(x - offsetX))
      picture.setMarginTop(Math.round(y - offsetY))
    },
    show: (x, y) => {
      picture.setVisible(true)
      handle.move(x, y)
    },
    hide: () => picture.setVisible(false),
    end: () => {
      entry.overlay.removeOverlay(picture)
      widget.setOpacity(previousOpacity)
      if (entry.active === handle) {
        entry.active = null
      }
    },
  }
  entry.active = handle
  return handle
}
