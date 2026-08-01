// One task row, and the only place drag-and-drop lives.
//
// WHY the raw GTK controllers and not a React Native drag library: every RN
// drag-reorder list (`react-native-draggable-flatlist` and its relatives)
// is built on react-native-gesture-handler + react-native-reanimated, and
// this platform implements neither — see docs/research/gestures.md, which
// names draggable-flatlist as blocked on Reanimated specifically. A
// hand-rolled JS drag is out too: `View` has no touch or responder props
// (only Pressable's discrete press/hover, whose event carries just x/y) and
// there is no `measure()`/`measureInWindow` to turn a row's rect into
// window coordinates. GTK4's own drag-and-drop, meanwhile, is right there
// through react-native-gtkx/gtk, and it brings a real drag icon
// (Gtk.WidgetPaintable of the row itself), correct cursors and GDK's
// content negotiation for free. The trade-off is that it is Linux-only —
// which costs this example nothing, since its whole body is already a GTK
// widget tree, but would matter to an app sharing this screen with mobile.
//
// The drag payload is the task id as a plain GObject string value, the same
// shape packages/react-native-gtkx/tests/gtk/bridge/auxiliary-elements.gtk.test.tsx
// exercises: every row is both a source (of its own id) and a target (drop
// the dragged task in front of me).
import { AdwActionRow } from "react-native-gtkx/adw"
import {
  Gdk,
  GObject,
  Gtk,
  GtkButton,
  GtkCheckButton,
  GtkDragSource,
  GtkDropTarget,
  GtkToggleButton,
} from "react-native-gtkx/gtk"
import { escapeMarkup, formatDue } from "../format"
import { useStore } from "../store"
import type { Task, TaskList } from "../types"
import { useRequestDeleteTask } from "./dialogs"

/** Due date first, then the list name when the current view mixes lists —
 *  AdwActionRow has exactly one subtitle line, so the two share it. */
const subtitleFor = (task: Task, listName?: string): string | undefined => {
  const parts = [formatDue(task.due), listName].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : undefined
}

export const TaskRow = ({
  task,
  list,
  isTrash,
  reorderable,
  showListName,
}: {
  task: Task
  list?: TaskList
  isTrash: boolean
  /** Drag-and-drop is attached only when the current view can express an
   *  order at all — see selectors.ts's `isReorderable`. */
  reorderable: boolean
  showListName: boolean
}) => {
  const { toggleDone, toggleImportant, restore, reorder, openTask } = useStore()
  const requestDeleteTask = useRequestDeleteTask()

  const title = task.done
    ? `<s>${escapeMarkup(task.title)}</s>`
    : escapeMarkup(task.title)

  return (
    <AdwActionRow
      title={title}
      useMarkup
      subtitle={subtitleFor(task, showListName ? list?.name : undefined)}
      activatable
      onActivated={() => (isTrash ? restore(task.id) : openTask(task.id))}
      prefix={
        isTrash ? undefined : (
          <GtkCheckButton
            valign={Gtk.Align.CENTER}
            active={task.done}
            accessibleLabel="Mark complete"
            onToggled={() => toggleDone(task.id)}
          />
        )
      }
      suffix={
        isTrash ? (
          <>
            <GtkButton
              valign={Gtk.Align.CENTER}
              iconName="edit-undo-symbolic"
              tooltipText="Restore"
              cssClasses={["flat"]}
              onClicked={() => restore(task.id)}
            />
            <GtkButton
              valign={Gtk.Align.CENTER}
              iconName="edit-delete-symbolic"
              tooltipText="Delete Permanently"
              accessibleLabel="Delete permanently"
              cssClasses={["flat"]}
              // Already in Trash, so this is the irreversible one and gets
              // a confirmation rather than an undo toast — the asymmetry
              // `requestDeleteTask` exists to keep in one place.
              onClicked={() => requestDeleteTask(task)}
            />
          </>
        ) : (
          <>
            <GtkToggleButton
              valign={Gtk.Align.CENTER}
              iconName={
                task.important ? "starred-symbolic" : "non-starred-symbolic"
              }
              active={task.important}
              accessibleLabel="Toggle important"
              cssClasses={["flat"]}
              onToggled={() => toggleImportant(task.id)}
            />
            <GtkButton
              valign={Gtk.Align.CENTER}
              iconName="user-trash-symbolic"
              accessibleLabel="Delete task"
              cssClasses={["flat"]}
              // Reversible, so this raises an "Undo" toast instead.
              onClicked={() => requestDeleteTask(task)}
            />
          </>
        )
      }
      controllers={
        reorderable ? (
          <>
            <GtkDragSource
              actions={Gdk.DragAction.MOVE}
              onPrepare={(x, y, self) => {
                // The drag icon is a snapshot of the row itself, offset by
                // where inside it the drag began — so the row appears to
                // lift off under the cursor rather than jumping to it.
                const row = self.getWidget()
                if (row) {
                  self.setIcon(
                    Gtk.WidgetPaintable.new(row),
                    Math.round(x),
                    Math.round(y),
                  )
                }
                return Gdk.ContentProvider.newForValue(
                  GObject.buildValue(GObject.TYPE_STRING, (value) =>
                    value.setString(task.id),
                  ),
                )
              }}
            />
            <GtkDropTarget
              actions={Gdk.DragAction.MOVE}
              types={[GObject.TYPE_STRING]}
              onDrop={(value) => {
                const draggedId = value.getString()
                if (draggedId) {
                  reorder(draggedId, task.id)
                }
                return true
              }}
            />
          </>
        ) : undefined
      }
    />
  )
}
