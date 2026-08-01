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
//
// The BODY is React Native — `ScrollView`, `View`, `Text`, `TextInput` and
// `common`'s `List`/`ListRow`, styled with `StyleSheet`. It used to be the
// same Adwaita widget tree examples/tasks-app is built from (AdwClamp, a
// `.boxed-list` GtkListBox, AdwActionRow), and `contentLayout: "widget"`
// exists because of it.
//
// What changed is not taste. docs/research/react-native-first-showcase.md
// measured the gap between the two and found it was mostly styling this
// example never did, plus `boxShadow` (the card frame is a shadow, not a
// border) — and one thing that was genuinely impossible: the rows carried
// drag-reorder through GTK event controllers, and a `Pressable` had no way
// to hold one. That is now `ListRow`'s `reorderId`, over `Controllers` from
// react-native-gtkx/gtk. `examples/tasks-app` still stands next door as the
// hand-built Adwaita comparison, which is what makes the claim checkable.
//
// A few GTK widgets stay, each for a reason RN cannot argue with: the
// checkbox and the flat icon buttons inside a row (components/task-row.tsx),
// and the segmented filter control in the header (`AdwToggleGroup`).
import { useEffect, useMemo, useState } from "react"
import { ScrollView, StyleSheet, TextInput, View } from "react-native"
import {
  AdwToggle,
  AdwToggleGroup,
  AdwWindowTitle,
} from "react-native-gtkx/adw"
import { List, ListRow, rowPosition } from "react-native-gtkx/common"
import { GtkButton, GtkToggleButton } from "react-native-gtkx/gtk"
import type {
  SidebarNavigationOptions,
  SidebarScreenProps,
} from "react-native-gtkx/navigation"
import { useRequestDeleteTask } from "../components/dialogs"
import { MainMenu } from "../components/main-menu"
import { TaskDetail } from "../components/task-detail"
import { EmptyState, TaskRow } from "../components/task-row"
import { useSortOrder } from "../hooks/use-sort-order"
import {
  addTargetListId,
  emptyState,
  isReorderable,
  isTrashSelection,
  parseRoute,
  visibleTasks,
} from "../selectors"
import { useStore } from "../store"
import type { Filter } from "../types"

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
    selectedTaskId,
    searchMode,
    searchQuery,
    addTask,
    openTask,
    toggleImportant,
    setSearchMode,
    setSearchQuery,
    setActiveRoute,
    reorder,
  } = useStore()
  const requestDeleteTask = useRequestDeleteTask()
  const [filter, setFilter] = useState<Filter>("all")
  const [sortOrder] = useSortOrder()
  // The add field is local: it is a draft, not app state, and it should not
  // survive switching to another list.
  const [draft, setDraft] = useState("")

  // The split view's own back button/Escape/back gesture (narrow window)
  // hides content and shows the sidebar again — a presentation change with
  // no react-navigation state behind it, so `sidebarShown` is the only way
  // this screen learns it happened (see docs/api.md). Reset the open task
  // so re-selecting the SAME list from the sidebar lands back on the list,
  // not straight back into whatever task was open — "back" should mean
  // back, the same way a mobile master-detail app's own back button would.
  //
  // `focus` does the same for a DIFFERENT row being selected. The open task
  // and the search term live in the store (they have to: Escape and Ctrl+F
  // are window-wide shortcuts, declared beside the window's actions rather
  // than in this screen), so unlike the local
  // state they replaced they are shared by every screen — arriving at
  // another list still holding the previous list's open task would be
  // wrong. This is examples/tasks-app's `select()` reset, moved to where
  // this app learns that selection changed.
  useEffect(() => {
    const clear = () => {
      openTask(null)
      setSearchMode(false)
    }
    const unsubscribeShown = navigation.addListener("sidebarShown", clear)
    const unsubscribeFocus = navigation.addListener("focus", () => {
      clear()
      // Mirror the focused route into the store for `win.new`, which is
      // mounted outside the navigator and cannot read navigation state.
      setActiveRoute(route.name)
    })
    return () => {
      unsubscribeShown()
      unsubscribeFocus()
    }
  }, [navigation, route.name, openTask, setSearchMode, setActiveRoute])

  // Memoized on the route name alone: `selection` is a fresh object every
  // render otherwise, and it is an effect dependency below — the header
  // would be rebuilt on every single render for no reason.
  const selection = useMemo(() => parseRoute(route.name), [route.name])
  const isTrash = isTrashSelection(selection)

  const openedTask = selectedTaskId
    ? tasks.find((task) => task.id === selectedTaskId && !task.deleted)
    : undefined

  const addListId = addTargetListId(selection, lists)

  // Drag-and-drop is only attached to rows when the current view can
  // actually express an order — see selectors.ts's `isReorderable` for the
  // three conditions and why each one disqualifies a drag.
  const reorderable = isReorderable(selection, searchQuery, sortOrder)

  // The header's own shape changes with THIS screen's local state — see
  // the file header comment. setOptions MERGES into the previously
  // resolved options (see docs/api.md), so every branch gives every one
  // of these keys an explicit value, including the ones it does not use,
  // rather than omitting them.
  useEffect(() => {
    let options: SidebarNavigationOptions
    if (openedTask) {
      options = {
        headerLeft: () => (
          <GtkButton
            iconName="go-previous-symbolic"
            tooltipText="Back (Escape)"
            onClicked={() => openTask(null)}
          />
        ),
        // The menu goes LAST so it stays the rightmost control in the
        // HeaderBar, where GNOME apps put it — headerRight's children pack
        // left to right, after the navigator's own headerButtons.
        headerRight: () => (
          <>
            <GtkToggleButton
              iconName={
                openedTask.important
                  ? "starred-symbolic"
                  : "non-starred-symbolic"
              }
              active={openedTask.important}
              tooltipText="Important"
              onToggled={() => toggleImportant(openedTask.id)}
            />
            <GtkButton
              iconName="user-trash-symbolic"
              tooltipText="Delete (Delete)"
              onClicked={() => requestDeleteTask(openedTask)}
            />
            <MainMenu />
          </>
        ),
        headerTitle: () => <AdwWindowTitle title={openedTask.title} />,
      }
    } else if (isTrash) {
      options = {
        headerLeft: undefined,
        headerRight: () => <MainMenu />,
        headerTitle: undefined,
      }
    } else {
      options = {
        headerLeft: () => (
          <>
            <GtkButton
              iconName="list-add-symbolic"
              tooltipText="New Task (Ctrl+N)"
              // The window action, not a local handler: the same code path
              // Ctrl+N takes, so the two can never drift apart.
              actionName="win.new"
            />
            <GtkToggleButton
              iconName="system-search-symbolic"
              tooltipText="Search (Ctrl+F)"
              active={searchMode}
              onToggled={(self) => setSearchMode(self.active)}
            />
          </>
        ),
        headerRight: () => <MainMenu />,
        // AdwToggleGroup, not a hand-built GtkBox of GtkButtons: the
        // Adwaita widget IS the compact segmented pill this design calls
        // for. A box of buttons cannot be made to look like one — `.linked`
        // styles siblings by adjacency, and each wrapped child sits in its
        // own container, so the buttons come out as three separate rounded
        // rects instead of one joined control.
        headerTitle: () => (
          <AdwToggleGroup
            activeName={filter}
            cssClasses={["round"]}
            onNotifyActiveName={(name) => {
              if (name === "all" || name === "open" || name === "done") {
                setFilter(name)
              }
            }}
          >
            <AdwToggle
              name="all"
              label="All"
            />
            <AdwToggle
              name="open"
              label="Open"
            />
            <AdwToggle
              name="done"
              label="Done"
            />
          </AdwToggleGroup>
        ),
      }
    }
    navigation.setOptions(options)
    // route.name is not in the deps: `selection` (derived from it) already
    // captures everything this effect reads from the route.
  }, [
    openedTask,
    requestDeleteTask,
    isTrash,
    filter,
    searchMode,
    selection,
    navigation,
    openTask,
    setSearchMode,
    toggleImportant,
  ])

  if (openedTask) {
    return (
      <TaskDetail
        task={openedTask}
        list={lists.find((entry) => entry.id === openedTask.listId)}
      />
    )
  }

  const visible = visibleTasks(tasks, selection, {
    query: searchQuery,
    filter,
    sortOrder,
  })
  const empty = emptyState(selection, searchQuery)

  // The add row is a row of the list, so it counts for the corner radii —
  // Adwaita rounds the FIRST row, whichever one that is.
  const addRow = isTrash ? 0 : 1
  const rowCount = addRow + visible.length

  return (
    <View style={styles.screen}>
      {/* GtkSearchBar's reveal animation is the one thing lost in the
          rewrite: it is a widget behaviour, and a `Widget` around it would
          have to be re-measured on every animation frame. Ctrl+F and Escape
          are window shortcuts (components/app-shortcuts.tsx), so the field
          itself is just a field. */}
      {searchMode ? (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchField}
            placeholder="Search tasks…"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      ) : null}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* AdwClamp, in two style properties: cap the width and centre what
            is left. */}
        <View style={styles.clamp}>
          <List
            testID="task-list"
            // Dropped entirely when the view cannot express an order — see
            // selectors.ts's `isReorderable`. With no handler, `ListRow`
            // attaches no drag controllers at all.
            onReorder={reorderable ? reorder : undefined}
          >
            {/* Trash is a graveyard, not a place to file new work — an add
                row there would have nowhere sensible to put a task. */}
            {isTrash ? null : (
              <ListRow
                position={rowPosition(0, rowCount)}
                title={
                  // AdwEntryRow's floating label is a composed widget with
                  // its own state machine, not a look; RN's answer to the
                  // same job is a placeholder, and that is the honest
                  // difference rather than an imitation of it.
                  <TextInput
                    style={styles.addField}
                    placeholder="Add a task…"
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={() => {
                      if (addListId && draft.trim()) {
                        addTask(addListId, draft.trim())
                      }
                      setDraft("")
                    }}
                  />
                }
              />
            )}
            {visible.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                list={lists.find((entry) => entry.id === task.listId)}
                isTrash={isTrash}
                position={rowPosition(addRow + index, rowCount)}
                reorderable={reorderable}
                showListName={selection.kind !== "list"}
              />
            ))}
          </List>
          {visible.length === 0 ? (
            <EmptyState
              icon={empty.icon}
              title={empty.title}
              description={empty.description}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // GtkSearchBar's own chrome: a bar the width of the pane with the field
  // centred in it.
  searchBar: { padding: 6, alignItems: "center" },
  searchField: { width: "100%", maxWidth: 400 },
  scroll: { flex: 1 },
  // AdwClamp's own margins, transcribed.
  scrollContent: { padding: 12, alignItems: "center" },
  clamp: { width: "100%", maxWidth: 640, gap: 12 },
  // Adwaita draws a row's entry with no frame of its own — the card IS the
  // frame. GtkEntry's default filled look would put a grey bar across the
  // top of the list.
  addField: { backgroundColor: "transparent", borderWidth: 0 },
})
