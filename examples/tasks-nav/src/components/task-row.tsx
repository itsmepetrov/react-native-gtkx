// One task row, written in React Native.
//
// It used to be an `AdwActionRow` with `GtkDragSource`/`GtkDropTarget` in its
// `controllers` slot, and that was the single thing blocking this example's
// body from being rewritten in React Native at all: a `Pressable` exposes no
// widget, so there was nowhere to put a GTK event controller (see
// docs/research/react-native-first-showcase.md). `Controllers` from
// react-native-gtkx/gtk is the door that closed it.
//
// Reordering used to go through `List`'s `onReorder` plus a `reorderId` here
// — a second, id-keyed entry point into the same drag-and-drop module
// `Draggable` and `Sortable` come from, and therefore two ways to do one
// thing. It is now `react-native-gtkx/dnd` directly: the API an RN developer
// already knows from `react-native-reanimated-dnd`.
//
// **The honest comparison, since this is more code and not less.** The old
// version was two lines: `onReorder={reorder}` on the `List` and
// `reorderId={task.id}` here. This is a `Droppable` wrapping a `Draggable`
// wrapping the row, plus a `DropProvider` up in the screen — about a dozen
// lines. The old shape fit BECAUSE it was id-keyed, and it was id-keyed
// because a `List`'s rows are React children it cannot see the order of;
// this app's store owns the order, filters it and sorts it, so `Sortable`
// (which owns an array and renders its own ScrollView) does not fit either,
// and the id-keyed `Droppable`+`Draggable` pair is the faithful translation.
//
// The trade is real and it is worth stating rather than declaring a win:
// more lines here, one fewer concept overall, and the concept that survives
// is the one an app already has from iOS and Android.
//
// What is left of GTK here is deliberate and small: the checkbox and the two
// trailing buttons are real widgets in React Native layout (`Widget`), because
// RN has no checkbox at all and because a flat icon button's tooltip and
// accessible label are worth keeping. Everything that makes a row LOOK like an
// Adwaita row — the card, the separators, the hover and press tints, the focus
// ring, the metrics — is `View`, `Text`, `Pressable` and `StyleSheet`.
import { StyleSheet, Text, View } from "react-native"
import { Icon, Widget } from "react-native-gtkx/common"
import { Draggable, Droppable } from "react-native-gtkx/dnd"
import {
  Gtk,
  GtkButton,
  GtkCheckButton,
  GtkToggleButton,
} from "react-native-gtkx/gtk"
import { formatDue } from "../format"
import { useStore } from "../store"
import type { Task, TaskList } from "../types"
import { useRequestDeleteTask } from "./dialogs"
import { ListRow, type ListRowPosition } from "./list"

/** Due date first, then the list name when the current view mixes lists —
 *  one subtitle line, as `AdwActionRow` has, so the two share it. */
const subtitleFor = (task: Task, listName?: string): string | undefined => {
  const parts = [formatDue(task.due), listName].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : undefined
}

const styles = StyleSheet.create({
  // `row > box.header { border-spacing: 6px }` puts 6px between the row's
  // trailing controls; the buttons themselves are the theme's own size.
  suffix: { flexDirection: "row", alignItems: "center", gap: 6 },
  done: { textDecorationLine: "line-through" },
  // Droppable and Draggable each render a View. Neither should introduce a
  // box of its own between the list and the row, so both are transparent:
  // no padding, no background, and the row keeps its own corner radii.
  dropZone: { alignSelf: "stretch" },
  dragSource: { alignSelf: "stretch" },
})

export const TaskRow = ({
  task,
  list,
  isTrash,
  position,
  showListName,
  reorderable,
  onReorder,
}: {
  task: Task
  list?: TaskList
  isTrash: boolean
  position: ListRowPosition
  showListName: boolean
  /** Drag-and-drop is offered only when the current view can express an
   *  order at all — see selectors.ts's `isReorderable`. When false neither
   *  the drag source nor the drop target is attached, so the row offers no
   *  drag rather than one that would be ignored. */
  reorderable: boolean
  /** Called with the dragged task's id and this row's id — the dragged task
   *  belongs in front of this one. Ids, not indices: the visible list is a
   *  filtered, sorted projection of the store, so an index here would not
   *  mean anything to it. */
  onReorder: (draggedId: string, targetId: string) => void
}) => {
  const { toggleDone, toggleImportant, restore, openTask } = useStore()
  const requestDeleteTask = useRequestDeleteTask()

  const row = (
    <ListRow
      testID={`task-${task.id}`}
      position={position}
      title={
        <Text
          numberOfLines={1}
          style={task.done ? styles.done : undefined}
        >
          {task.title}
        </Text>
      }
      subtitle={subtitleFor(task, showListName ? list?.name : undefined)}
      onPress={() => (isTrash ? restore(task.id) : openTask(task.id))}
      prefix={
        isTrash ? undefined : (
          // RN has had no checkbox since 0.60 (the community package is what
          // apps use), and this one is one line of a real Adwaita widget in
          // React Native layout.
          <Widget>
            <GtkCheckButton
              valign={Gtk.Align.CENTER}
              active={task.done}
              accessibleLabel="Mark complete"
              onToggled={() => toggleDone(task.id)}
            />
          </Widget>
        )
      }
      suffix={
        <View style={styles.suffix}>
          {isTrash ? (
            <>
              <Widget>
                <GtkButton
                  valign={Gtk.Align.CENTER}
                  iconName="edit-undo-symbolic"
                  tooltipText="Restore"
                  cssClasses={["flat"]}
                  onClicked={() => restore(task.id)}
                />
              </Widget>
              <Widget>
                <GtkButton
                  valign={Gtk.Align.CENTER}
                  iconName="edit-delete-symbolic"
                  tooltipText="Delete Permanently"
                  accessibleLabel="Delete permanently"
                  cssClasses={["flat"]}
                  // Already in Trash, so this is the irreversible one and
                  // gets a confirmation rather than an undo toast — the
                  // asymmetry `requestDeleteTask` keeps in one place.
                  onClicked={() => requestDeleteTask(task)}
                />
              </Widget>
            </>
          ) : (
            <>
              <Widget>
                {/* A toggle, not a button: the "checked" background is how
                    Adwaita says the star is on, and a plain button has no
                    such state to draw. */}
                <GtkToggleButton
                  valign={Gtk.Align.CENTER}
                  iconName={
                    task.important ? "starred-symbolic" : "non-starred-symbolic"
                  }
                  active={task.important}
                  tooltipText="Important"
                  accessibleLabel="Toggle important"
                  cssClasses={["flat"]}
                  onToggled={() => toggleImportant(task.id)}
                />
              </Widget>
              <Widget>
                <GtkButton
                  valign={Gtk.Align.CENTER}
                  iconName="user-trash-symbolic"
                  tooltipText="Delete"
                  accessibleLabel="Delete task"
                  cssClasses={["flat"]}
                  // Reversible, so this raises an "Undo" toast instead.
                  onClicked={() => requestDeleteTask(task)}
                />
              </Widget>
            </>
          )}
        </View>
      }
    />
  )

  if (!reorderable) {
    return row
  }

  // Both halves, as one pair per row: the row is a drag SOURCE carrying
  // its own task id, and a drop TARGET that reports the id it received.
  // `Droppable` is the outer one so the drop area is the whole row
  // including the space the drag source's own view occupies.
  return (
    <Droppable<string>
      droppableId={`task-drop-${task.id}`}
      style={styles.dropZone}
      onDrop={(draggedId) => onReorder(draggedId, task.id)}
    >
      <Draggable<string>
        data={task.id}
        draggableId={task.id}
        style={styles.dragSource}
      >
        {row}
      </Draggable>
    </Droppable>
  )
}

/** The row's own empty-state sibling: an icon and two lines, where the screen
 *  used to hand `AdwStatusPage` the same three strings. */
export const EmptyState = ({
  icon,
  title,
  description,
}: {
  icon: string
  title: string
  description: string
}) => (
  <View style={emptyStyles.box}>
    <Icon
      name={icon}
      size={48}
      style={emptyStyles.icon}
    />
    <Text style={emptyStyles.title}>{title}</Text>
    <Text style={emptyStyles.description}>{description}</Text>
  </View>
)

const emptyStyles = StyleSheet.create({
  box: { alignItems: "center", paddingVertical: 24, gap: 6 },
  // `--dim-opacity` is 55%, and Adwaita dims a status page's icon further.
  icon: { opacity: 0.35 },
  title: { fontSize: 18, fontWeight: "bold" },
  description: { opacity: 0.55, textAlign: "center" },
})
