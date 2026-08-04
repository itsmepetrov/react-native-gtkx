// The two GTK controllers everything in this module is built from, wrapped
// once so `Draggable`, `Droppable` and `SortableItem` do not each re-derive
// the drag-icon and payload details.
//
// Both go through `Controllers` from react-native-gtkx/gtk — the same public
// door an app would use. Nothing here is reachable only from inside the
// platform, which is the property `List`/`ListRow` already established
// (docs/platform-layer.md).
import { useRef, type ReactNode } from "react"
import { Controllers } from "../gtk/controllers"
import {
  beginDragLayer,
  Gdk,
  GObject,
  Gtk,
  GtkDragSource,
  GtkDropTarget,
  type DragLayerHandle,
} from "../gtkx/bridge/index"
import { decodePayload, encodePayload, type DragPayload } from "./payload"

export type DragSourceControllersProps = {
  payload: DragPayload
  /** Reports the grab point in the source widget's own coordinates, which is
   *  where the drag icon's hotspot goes and where `tx`/`ty` start from. The
   *  widget itself rides along too — `Sortable`/`SortableGrid` use it to
   *  convert this point into their own container's coordinates with
   *  `computePointIn` (see sortable.tsx/grid.tsx), the origin their reorder
   *  tracking measures every subsequent motion event against. `null` only
   *  when GDK could not resolve a widget for the drag source itself, which
   *  should not happen in practice. */
  onGrab?: (x: number, y: number, widget: Gtk.Widget | null) => void
  onDragBegin?: () => void
  /** `dropped` is what GDK's own `drag-end` reports: whether a target took
   *  it. `drag-cancel` reports the negative case separately, so both are
   *  folded into one callback here. */
  onDragEnd?: (dropped: boolean) => void
}

/**
 * A `GtkDragSource` on the enclosing React Native component's widget.
 *
 * The drag icon is a `Gtk.WidgetPaintable` of that widget, offset by where
 * inside it the drag began — so the thing appears to lift off under the
 * cursor rather than jump to it. That is the visual no JS drag can produce,
 * and the reason this module is built on GDK at all.
 *
 * A second, window-level copy of the same picture rides alongside it for as
 * long as the drag stays over this window — `gtkx/bridge/drag-layer.ts` has
 * the reason: `setIcon`'s own icon is a compositor surface, unclipped by any
 * `overflow: hidden` ancestor but also outside this process's own widget
 * tree, so nothing in it can prove that escape happened. The window-level
 * copy is the same escape, provable.
 */
export const DragSourceControllers = ({
  payload,
  onGrab,
  onDragBegin,
  onDragEnd,
}: DragSourceControllersProps): ReactNode => {
  // GDK emits `drag-cancel` AND then `drag-end` for a refused drop, so the
  // cancel is recorded and read by the end handler rather than reported
  // twice.
  const cancelled = useRef(false)
  // Set in `onPrepare`, consumed in `onDragBegin` — the window-level layer
  // only starts once GDK confirms the drag is really happening, but the
  // widget and grab point it needs are only ever handed to `onPrepare`.
  const grab = useRef<{ widget: Gtk.Widget; x: number; y: number } | null>(null)
  const dragLayer = useRef<DragLayerHandle | null>(null)

  return (
    <Controllers>
      <GtkDragSource
        actions={Gdk.DragAction.MOVE}
        onPrepare={(x, y, self) => {
          const widget = self.getWidget()
          if (widget) {
            self.setIcon(
              Gtk.WidgetPaintable.new(widget),
              Math.round(x),
              Math.round(y),
            )
            grab.current = { widget, x, y }
          }
          onGrab?.(x, y, widget)
          return Gdk.ContentProvider.newForValue(
            GObject.buildValue(GObject.TYPE_STRING, (value) =>
              value.setString(encodePayload(payload)),
            ),
          )
        }}
        onDragBegin={() => {
          cancelled.current = false
          if (grab.current) {
            dragLayer.current = beginDragLayer(
              grab.current.widget,
              grab.current.x,
              grab.current.y,
            )
          }
          onDragBegin?.()
        }}
        onDragCancel={() => {
          cancelled.current = true
          // false: let GTK play its own "snap back" animation, which is the
          // platform's way of saying the drop was refused.
          return false
        }}
        onDragEnd={() => {
          dragLayer.current?.end()
          dragLayer.current = null
          onDragEnd?.(!cancelled.current)
        }}
      />
    </Controllers>
  )
}

export type DropTargetControllersProps = {
  /** Return false to refuse — GDK then shows the no-drop cursor, which is
   *  better feedback than upstream's silent skip. */
  accepts: (payload: DragPayload) => boolean
  onDrop: (payload: DragPayload, x: number, y: number) => void
  onEnter?: (payload: DragPayload) => void
  onMotion?: (payload: DragPayload, x: number, y: number) => void
  onLeave?: () => void
}

/**
 * A `GtkDropTarget` on the enclosing React Native component's widget,
 * accepting the string payload this module encodes.
 *
 * The payload is decoded before `accepts` is consulted, so a string dragged
 * in from a text editor is refused rather than mistaken for a draggable.
 */
export const DropTargetControllers = ({
  accepts,
  onDrop,
  onEnter,
  onMotion,
  onLeave,
}: DropTargetControllersProps): ReactNode => {
  // The payload of the drag currently overhead, sampled on `::enter` and kept
  // for `::motion` (which is not handed the target).
  const hovering = useRef<DragPayload | null>(null)

  return (
    <Controllers>
      <GtkDropTarget
        actions={Gdk.DragAction.MOVE}
        types={[GObject.TYPE_STRING]}
        // Without this `gtk_drop_target_get_value()` returns NULL until the
        // drop itself, so `::enter` could not tell one drag from another and
        // every zone would light up for every payload. Preloading is exactly
        // the property GTK provides for reading the data during the drag; the
        // cost it warns about (fetching data from another process on hover)
        // does not apply, because the payload is a short string this process
        // wrote.
        preload
        onEnter={(_x, _y, self) => {
          const payload = payloadOf(self)
          hovering.current = payload
          // A payload that is not readable yet is NOT refused: refusing in
          // `::enter` ends the drag for this target permanently, while
          // accepting and re-checking at drop time is recoverable. Only a
          // payload we can read AND reject is turned away.
          if (payload && !accepts(payload)) {
            return Gdk.DragAction.NONE
          }
          if (payload) {
            onEnter?.(payload)
          }
          return Gdk.DragAction.MOVE
        }}
        onMotion={(x, y) => {
          const payload = hovering.current
          if (payload && !accepts(payload)) {
            return Gdk.DragAction.NONE
          }
          if (payload) {
            onMotion?.(payload, x, y)
          }
          return Gdk.DragAction.MOVE
        }}
        onLeave={() => {
          hovering.current = null
          onLeave?.()
        }}
        onDrop={(value, x, y) => {
          hovering.current = null
          const payload = decodePayload(value.getString())
          if (!payload || !accepts(payload)) {
            return false
          }
          onDrop(payload, x, y)
          return true
        }}
      />
    </Controllers>
  )
}

/**
 * The payload of the drag currently over a drop target, readable during the
 * drag because the target above sets `preload`.
 */
const payloadOf = (target: Gtk.DropTarget): DragPayload | null => {
  const value = target.getValue()
  if (!value) {
    return null
  }
  return decodePayload(value.getString())
}
