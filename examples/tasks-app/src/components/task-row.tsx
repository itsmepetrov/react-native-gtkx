// One task row — ported from the gtkx tutorial
// (examples/tutorial/src/components/task-row.tsx). AdwActionRow gives it
// the native GtkListBox row chrome (hover/selection, the checkbox/star/
// trash suffix layout) for free; RN has no equivalent. Drag reorder uses
// the raw GtkDragSource/GtkDropTarget controllers (react-native-gtkx/gtk),
// enabled only when the current view actually supports manual reordering.
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
import { useSortOrder } from "../hooks/use-sort-order"
import { useStore } from "../store/index"
import { isReorderable } from "../store/selectors"
import type { Task } from "../types"
import { useRequestDeleteTask } from "./dialogs"

export const TaskRow = ({ task }: { task: Task }) => {
  const requestDeleteTask = useRequestDeleteTask()
  const setDone = useStore((state) => state.setDone)
  const setImportant = useStore((state) => state.setImportant)
  const openTask = useStore((state) => state.openTask)
  const reorder = useStore((state) => state.reorder)
  const selection = useStore((state) => state.selection)
  const searchQuery = useStore((state) => state.searchQuery)
  const [sortOrder] = useSortOrder()
  const reorderable = isReorderable(selection, searchQuery, sortOrder)
  const title = task.done
    ? `<s>${escapeMarkup(task.title)}</s>`
    : escapeMarkup(task.title)

  return (
    <AdwActionRow
      title={title}
      useMarkup
      subtitle={formatDue(task.due) ?? undefined}
      activatable
      onActivated={() => openTask(task.id)}
      prefix={
        <GtkCheckButton
          valign={Gtk.Align.CENTER}
          active={task.done}
          accessibleLabel="Mark complete"
          onToggled={(self) => setDone(task.id, self.active)}
        />
      }
      suffix={
        <>
          <GtkToggleButton
            valign={Gtk.Align.CENTER}
            iconName={
              task.important ? "starred-symbolic" : "non-starred-symbolic"
            }
            active={task.important}
            accessibleLabel="Toggle important"
            cssClasses={["flat"]}
            onToggled={(self) => setImportant(task.id, self.active)}
          />
          <GtkButton
            valign={Gtk.Align.CENTER}
            iconName="user-trash-symbolic"
            accessibleLabel="Delete task"
            cssClasses={["flat"]}
            onClicked={() => requestDeleteTask(task)}
          />
        </>
      }
      controllers={
        reorderable ? (
          <>
            <GtkDragSource
              actions={Gdk.DragAction.MOVE}
              onPrepare={(x, y, self) => {
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
