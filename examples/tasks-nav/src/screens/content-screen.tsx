// The content pane: a task list, or the open task's editor — a conditional
// render inside ONE screen, not a push. This mirrors examples/tasks-app's
// own content-pane.tsx exactly (see its README: "opening a task is not a
// push to a second page, it is a conditional render inside the same
// AdwNavigationPage") — the difference is this screen IS one of
// createSidebarNavigator's own Sidebar.Screen entries, so the same shape
// that made a stack navigator the wrong tool here fits the sidebar
// navigator without any structural change.
//
// The header itself changes shape with THIS screen's own selection —
// tasks-app's third complaint, closed by SidebarNavigationOptions'
// headerLeft/headerRight/headerTitle (see docs/api.md). Three distinct
// shapes come out of one screen component: a filter toggle group for a
// list, a plain title for Trash, and a back/star/trash editor header for
// an open task.
import { useEffect, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { AdwWindowTitle } from "react-native-gtkx/adw"
import {
  GtkBox,
  GtkButton,
  GtkCheckButton,
  GtkEntry,
} from "react-native-gtkx/gtk"
import type {
  SidebarNavigationOptions,
  SidebarScreenProps,
} from "react-native-gtkx/navigation"
import { useStore } from "../store"
import type { Filter, Task } from "../types"

type Selection =
  | { kind: "smart"; view: "all" | "important" | "trash" }
  | { kind: "list"; listId: string }

const parseRoute = (name: string): Selection => {
  if (name.startsWith("smart:")) {
    return {
      kind: "smart",
      view: name.slice("smart:".length) as "all" | "important" | "trash",
    }
  }
  return { kind: "list", listId: name.slice("list:".length) }
}

const matchesSelection = (task: Task, selection: Selection): boolean => {
  if (selection.kind === "list") {
    return task.listId === selection.listId
  }
  if (selection.view === "important") {
    return task.important
  }
  return true // "all"
}

const matchesFilter = (task: Task, filter: Filter): boolean => {
  if (filter === "open") {
    return !task.done
  }
  if (filter === "done") {
    return task.done
  }
  return true
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "done", label: "Done" },
]

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // ScrollView's content defaults to alignItems: "flex-start" — a row
  // hugging its own content width instead of stretching to the screen's
  // width means a flex: 1 child inside it collapses to zero (flex: 1 is
  // flexBasis: 0, and a hug-width parent has no free space to grow into).
  // Found the hard way: the task title disappeared entirely, leaving only
  // the (non-flex) list-name badge visible per row. Same fix
  // examples/gallery documents for its own ScrollView sections.
  listContent: { alignItems: "stretch" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rowTitle: { flex: 1 },
  doneRowTitle: { opacity: 0.5 },
  detail: { flex: 1, padding: 16, gap: 12 },
  empty: { padding: 24, alignItems: "center" },
})

// `route`/`navigation` are read as PROPS, not via `useNavigation()`/
// `useRoute()` — react-navigation passes both to any screen `component`
// regardless, and going through `SidebarScreenProps` here is what gives
// `navigation.addListener("sidebarShown", …)` below its real type (found
// the hard way: `useNavigation<SidebarNavigationHelpers>()` — no type
// arguments applied to the underlying route/param-list generics — resolves
// to something unusable rather than the intended type; a pre-existing
// quirk of this react-navigation alpha's generics, not new here, and not
// worth chasing for this fix. Props sidestep it entirely.
export const ContentScreen = ({ route, navigation }: SidebarScreenProps) => {
  const {
    lists,
    tasks,
    addTask,
    setTitle,
    toggleDone,
    toggleImportant,
    moveToTrash,
    restore,
  } = useStore()
  const [filter, setFilter] = useState<Filter>("all")
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  // The split view's own back button/Escape/back gesture (narrow window)
  // hides content and shows the sidebar again — a presentation change with
  // no react-navigation state behind it, so `sidebarShown` is the only way
  // this screen learns it happened (see docs/api.md). Reset the open task
  // so re-selecting the SAME list from the sidebar lands back on the list,
  // not straight back into whatever task was open — "back" should mean
  // back, the same way a mobile master-detail app's own back button would.
  useEffect(
    () => navigation.addListener("sidebarShown", () => setOpenTaskId(null)),
    [navigation],
  )

  const selection = parseRoute(route.name)
  const isTrash = selection.kind === "smart" && selection.view === "trash"

  const visibleTasks = tasks.filter((task) => {
    if (isTrash) {
      return task.deleted
    }
    return !task.deleted && matchesSelection(task, selection)
  })

  const openTask = openTaskId
    ? tasks.find((task) => task.id === openTaskId && !task.deleted)
    : undefined

  // The header's own shape changes with THIS screen's local state — see
  // the file header comment. setOptions MERGES into the previously
  // resolved options (see docs/api.md), so every branch gives every one
  // of these four keys an explicit value, including the ones it does not
  // use, rather than omitting them.
  useEffect(() => {
    let options: SidebarNavigationOptions
    if (openTask) {
      options = {
        headerLeft: () => (
          <GtkButton
            iconName="go-previous-symbolic"
            tooltipText="Back"
            onClicked={() => setOpenTaskId(null)}
          />
        ),
        headerRight: () => (
          <>
            <GtkButton
              iconName={
                openTask.important ? "starred-symbolic" : "non-starred-symbolic"
              }
              tooltipText="Important"
              onClicked={() => toggleImportant(openTask.id)}
            />
            <GtkButton
              iconName="user-trash-symbolic"
              tooltipText="Delete"
              onClicked={() => {
                moveToTrash(openTask.id)
                setOpenTaskId(null)
              }}
            />
          </>
        ),
        headerTitle: () => <AdwWindowTitle title={openTask.title} />,
      }
    } else if (isTrash) {
      options = {
        headerLeft: undefined,
        headerRight: undefined,
        headerTitle: undefined,
      }
    } else {
      options = {
        headerLeft: () => (
          <GtkButton
            iconName="list-add-symbolic"
            tooltipText="New Task"
            onClicked={() => {
              const listId =
                selection.kind === "list" ? selection.listId : lists[0]?.id
              if (!listId) {
                return
              }
              const created = addTask(listId, "New Task")
              setOpenTaskId(created.id)
            }}
          />
        ),
        headerRight: undefined,
        headerTitle: () => (
          <GtkBox cssClasses={["linked"]}>
            {FILTERS.map((entry) => (
              <GtkButton
                key={entry.id}
                label={entry.label}
                cssClasses={filter === entry.id ? ["suggested-action"] : []}
                onClicked={() => setFilter(entry.id)}
              />
            ))}
          </GtkBox>
        ),
      }
    }
    navigation.setOptions(options)
    // route.name is not in the deps: `selection` (derived from it) already
    // captures everything this effect reads from the route.
  }, [
    openTask,
    isTrash,
    filter,
    selection,
    navigation,
    lists,
    addTask,
    toggleImportant,
    moveToTrash,
  ])

  if (openTask) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.detail}
      >
        <GtkEntry
          text={openTask.title}
          onNotifyText={(value) => setTitle(openTask.id, value ?? "")}
        />
        <View style={styles.row}>
          <GtkCheckButton
            active={openTask.done}
            label="Done"
            onToggled={() => toggleDone(openTask.id)}
          />
        </View>
      </ScrollView>
    )
  }

  const visible = visibleTasks.filter(
    (task) => isTrash || matchesFilter(task, filter),
  )

  if (visible.length === 0) {
    return (
      <View style={styles.empty}>
        <Text>{isTrash ? "Trash is empty" : "No tasks here yet"}</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.listContent}
    >
      {visible.map((task) => {
        const list = lists.find((entry) => entry.id === task.listId)
        return (
          <Pressable
            key={task.id}
            style={styles.row}
            onPress={() =>
              isTrash ? restore(task.id) : setOpenTaskId(task.id)
            }
          >
            {!isTrash && (
              <GtkCheckButton
                active={task.done}
                onToggled={() => toggleDone(task.id)}
              />
            )}
            <Text style={[styles.rowTitle, task.done && styles.doneRowTitle]}>
              {task.title}
            </Text>
            {selection.kind !== "list" && list ? (
              <Text style={styles.doneRowTitle}>{list.name}</Text>
            ) : null}
            {isTrash && (
              <GtkButton
                iconName="edit-undo-symbolic"
                tooltipText="Restore"
                onClicked={() => restore(task.id)}
              />
            )}
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
