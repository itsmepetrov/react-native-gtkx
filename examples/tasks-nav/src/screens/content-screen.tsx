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
// The BODY is built from the same Adwaita widgets examples/tasks-app uses
// — AdwClamp, a `.boxed-list` GtkListBox, AdwEntryRow, AdwActionRow — not
// from React Native View/Text. That is deliberate, and it is the point of
// the example: the navigator supplies the chrome (pages, HeaderBars, the
// split view's collapse behaviour) while the pane inside keeps full
// Adwaita fidelity. RN primitives render flat rows with no list frame, no
// hover and no row activation — visibly worse than the platform's own, for
// no portability gain in an app that is Linux-only by design.
import { useEffect, useState } from "react"
import {
  AdwActionRow,
  AdwClamp,
  AdwEntryRow,
  AdwStatusPage,
  AdwSwitchRow,
  AdwToggle,
  AdwToggleGroup,
  AdwWindowTitle,
} from "react-native-gtkx/adw"
import {
  Gtk,
  GtkBox,
  GtkButton,
  GtkCheckButton,
  GtkListBox,
  GtkScrolledWindow,
  GtkSearchBar,
  GtkSearchEntry,
  GtkToggleButton,
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

/** AdwActionRow's title takes Pango markup when `useMarkup` is set, which
 *  is how a completed task gets a real strikethrough — so the task's own
 *  text has to be escaped before being embedded in it. */
const escapeMarkup = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

type EmptyState = { icon: string; title: string; description: string }

const emptyState = (
  selection: Selection,
  isTrash: boolean,
  query: string,
): EmptyState => {
  if (query) {
    return {
      icon: "system-search-symbolic",
      title: "No Results",
      description: `No tasks match “${query}”`,
    }
  }
  if (isTrash) {
    return {
      icon: "user-trash-symbolic",
      title: "Trash Is Empty",
      description: "Deleted tasks show up here.",
    }
  }
  if (selection.kind === "smart" && selection.view === "important") {
    return {
      icon: "starred-symbolic",
      title: "Nothing Important",
      description: "Star a task to see it here.",
    }
  }
  return {
    icon: "view-list-symbolic",
    title: "No Tasks",
    description: "Add one with the field above.",
  }
}

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
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

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

  // Where a task typed into the "Add a task…" row lands: the current list
  // when a list is selected, the first list otherwise — a smart view is a
  // query, not a place to put things (tasks-app's addListId, same rule).
  const addTargetListId =
    selection.kind === "list" ? selection.listId : lists[0]?.id

  const createTask = (title: string): Task | undefined => {
    const trimmed = title.trim()
    if (!trimmed || !addTargetListId) {
      return undefined
    }
    return addTask(addTargetListId, trimmed)
  }

  // The header's own shape changes with THIS screen's local state — see
  // the file header comment. setOptions MERGES into the previously
  // resolved options (see docs/api.md), so every branch gives every one
  // of these keys an explicit value, including the ones it does not use,
  // rather than omitting them.
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
            <GtkToggleButton
              iconName={
                openTask.important ? "starred-symbolic" : "non-starred-symbolic"
              }
              active={openTask.important}
              tooltipText="Important"
              onToggled={() => toggleImportant(openTask.id)}
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
          <>
            <GtkButton
              iconName="list-add-symbolic"
              tooltipText="New Task"
              onClicked={() => {
                // Inlined rather than calling createTask(): a closure
                // recreated every render would have to be an effect
                // dependency, re-running the whole header rebuild on every
                // render. Depending on the DATA it reads is the honest form.
                if (addTargetListId) {
                  setOpenTaskId(addTask(addTargetListId, "New Task").id)
                }
              }}
            />
            <GtkToggleButton
              iconName="system-search-symbolic"
              tooltipText="Search"
              active={searchMode}
              onToggled={(self) => setSearchMode(self.active)}
            />
          </>
        ),
        headerRight: undefined,
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
    openTask,
    isTrash,
    filter,
    searchMode,
    selection,
    navigation,
    addTask,
    addTargetListId,
    toggleImportant,
    moveToTrash,
  ])

  if (openTask) {
    const list = lists.find((entry) => entry.id === openTask.listId)
    return (
      <GtkScrolledWindow vexpand>
        <AdwClamp
          maximumSize={640}
          marginTop={24}
          marginBottom={24}
          marginStart={12}
          marginEnd={12}
        >
          <GtkListBox
            selectionMode={Gtk.SelectionMode.NONE}
            cssClasses={["boxed-list"]}
          >
            <AdwEntryRow
              title="Title"
              text={openTask.title}
              onNotifyText={(value) => setTitle(openTask.id, value ?? "")}
            />
            <AdwSwitchRow
              title="Done"
              active={openTask.done}
              onNotifyActive={() => toggleDone(openTask.id)}
            />
            <AdwSwitchRow
              title="Important"
              active={openTask.important}
              onNotifyActive={() => toggleImportant(openTask.id)}
            />
            <AdwActionRow
              title="List"
              subtitle={list?.name ?? "—"}
            />
          </GtkListBox>
        </AdwClamp>
      </GtkScrolledWindow>
    )
  }

  const query = searchMode ? searchQuery.trim().toLowerCase() : ""
  const visible = visibleTasks
    .filter((task) => isTrash || matchesFilter(task, filter))
    .filter((task) => !query || task.title.toLowerCase().includes(query))
  const empty = emptyState(selection, isTrash, query)

  return (
    <GtkBox
      orientation={Gtk.Orientation.VERTICAL}
      vexpand
    >
      <GtkSearchBar
        searchModeEnabled={searchMode}
        onNotifySearchModeEnabled={(enabled) => setSearchMode(enabled ?? false)}
      >
        <GtkSearchEntry
          placeholderText="Search tasks…"
          text={searchQuery}
          onSearchChanged={(self) => setSearchQuery(self.text)}
        />
      </GtkSearchBar>
      <GtkScrolledWindow vexpand>
        <AdwClamp
          maximumSize={640}
          marginTop={12}
          marginBottom={12}
          marginStart={12}
          marginEnd={12}
        >
          <GtkBox
            orientation={Gtk.Orientation.VERTICAL}
            spacing={12}
          >
            <GtkListBox
              selectionMode={Gtk.SelectionMode.NONE}
              cssClasses={["boxed-list"]}
            >
              {/* Trash is a graveyard, not a place to file new work — an
                  add row there would have nowhere sensible to put a task. */}
              {isTrash ? null : (
                <AdwEntryRow
                  title="Add a task…"
                  onEntryActivated={(self) => {
                    createTask(self.text)
                    self.text = ""
                  }}
                />
              )}
              {visible.map((task) => {
                const list = lists.find((entry) => entry.id === task.listId)
                const title = task.done
                  ? `<s>${escapeMarkup(task.title)}</s>`
                  : escapeMarkup(task.title)
                return (
                  <AdwActionRow
                    key={task.id}
                    title={title}
                    useMarkup
                    subtitle={
                      selection.kind === "list" ? undefined : list?.name
                    }
                    activatable
                    onActivated={() =>
                      isTrash ? restore(task.id) : setOpenTaskId(task.id)
                    }
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
                        <GtkButton
                          valign={Gtk.Align.CENTER}
                          iconName="edit-undo-symbolic"
                          tooltipText="Restore"
                          cssClasses={["flat"]}
                          onClicked={() => restore(task.id)}
                        />
                      ) : (
                        <>
                          <GtkToggleButton
                            valign={Gtk.Align.CENTER}
                            iconName={
                              task.important
                                ? "starred-symbolic"
                                : "non-starred-symbolic"
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
                            onClicked={() => moveToTrash(task.id)}
                          />
                        </>
                      )
                    }
                  />
                )
              })}
            </GtkListBox>
            {visible.length === 0 ? (
              <AdwStatusPage
                cssClasses={["compact"]}
                iconName={empty.icon}
                title={empty.title}
                description={empty.description}
              />
            ) : null}
          </GtkBox>
        </AdwClamp>
      </GtkScrolledWindow>
    </GtkBox>
  )
}
