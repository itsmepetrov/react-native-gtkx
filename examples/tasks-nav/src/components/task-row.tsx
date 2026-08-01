// One task row, written in React Native.
//
// It used to be an `AdwActionRow` with `GtkDragSource`/`GtkDropTarget` in its
// `controllers` slot, and that was the single thing blocking this example's
// body from being rewritten in React Native at all: a `Pressable` exposes no
// widget, so there was nowhere to put a GTK event controller (see
// docs/research/react-native-first-showcase.md). Two changes closed it —
// `ListRow`'s `reorderId` (with `List`'s `onReorder`), which is all this file
// needs, and `Controllers` from react-native-gtkx/gtk underneath it, which is
// what an app reaches for when `common` does not already have the shape.
//
// What is left of GTK here is deliberate and small: the checkbox and the two
// trailing buttons are real widgets in React Native layout (`Widget`), because
// RN has no checkbox at all and because a flat icon button's tooltip and
// accessible label are worth keeping. Everything that makes a row LOOK like an
// Adwaita row — the card, the separators, the hover and press tints, the focus
// ring, the metrics — is `View`, `Text`, `Pressable` and `StyleSheet`.
import { StyleSheet, Text, View } from "react-native"
import {
  Icon,
  ListRow,
  Widget,
  type ListRowPosition,
} from "react-native-gtkx/common"
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
})

export const TaskRow = ({
  task,
  list,
  isTrash,
  position,
  showListName,
  reorderable,
}: {
  task: Task
  list?: TaskList
  isTrash: boolean
  position: ListRowPosition
  showListName: boolean
  /** Drag-and-drop is offered only when the current view can express an
   *  order at all — see selectors.ts's `isReorderable`. The `List` above
   *  drops its `onReorder` in the same cases, so this is belt and braces:
   *  either one alone disables the drag. */
  reorderable: boolean
}) => {
  const { toggleDone, toggleImportant, restore, openTask } = useStore()
  const requestDeleteTask = useRequestDeleteTask()

  return (
    <ListRow
      testID={`task-${task.id}`}
      position={position}
      reorderId={reorderable ? task.id : undefined}
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
