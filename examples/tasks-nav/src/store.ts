// A small hand-written store — no external state library, since the point
// of this example is the navigator, not state management.
//
// It is a MODULE-LEVEL external store (useSyncExternalStore) rather than
// the Context + useReducer it started as, and that is not a stylistic
// preference. `AppRegistry.runApplication`'s `windowActions` /
// `windowControllers` are rendered as props of the window it builds — as
// SIBLINGS of the app's own tree, not descendants of it (see
// packages/react-native-gtkx/src/components/app-registry.tsx). React
// context from a provider inside the app therefore cannot reach them, so a
// `win.new` action or a Ctrl+F shortcut had no way to touch a Context
// store at all. examples/tasks-app never hit this because zustand is
// module-global to begin with. Same public `useStore()` API as before,
// plus `getStore()` for the out-of-tree callers.
import { useSyncExternalStore } from "react"
import type { DialogKind, Task, TaskList } from "./types"

type State = {
  lists: TaskList[]
  tasks: Task[]
  /** The task whose editor is open, if any. In the store rather than in
   *  the screen because Escape (a window-level shortcut, out of tree) has
   *  to be able to close it. */
  selectedTaskId: string | null
  searchMode: boolean
  searchQuery: string
  dialog: DialogKind
  taskToDelete: string | null
  /** The focused sidebar route, mirrored out of react-navigation so that
   *  `win.new` — a window action, mounted outside the navigator's tree and
   *  therefore with no access to its hooks — can still put a new task in
   *  the list the user is looking at. The navigator stays the source of
   *  truth; this is a read-only echo of it, written on focus. */
  activeRoute: string
}

export type Action =
  | { type: "addList"; list: TaskList }
  | { type: "addTask"; task: Task }
  | { type: "setTitle"; id: string; title: string }
  | { type: "setDue"; id: string; due: string | null }
  | { type: "toggleDone"; id: string }
  | { type: "toggleImportant"; id: string }
  | { type: "moveToTrash"; id: string }
  | { type: "restore"; id: string }
  | { type: "deleteForever"; id: string }
  | { type: "reorder"; draggedId: string; targetId: string }
  | { type: "openTask"; id: string | null }
  | { type: "setSearchMode"; searchMode: boolean }
  | { type: "setSearchQuery"; searchQuery: string }
  | { type: "showDialog"; dialog: DialogKind }
  | { type: "askDeleteTask"; id: string | null }
  | { type: "setActiveRoute"; route: string }

// Cycled for each new list — a fixed palette rather than a color picker,
// same simplification as skipping a "new list" dialog (see README).
export const LIST_COLOR_PALETTE = [
  "#e01b24",
  "#3584e4",
  "#2ec27e",
  "#9141ac",
  "#e5a50a",
  "#986a44",
]

const PERSONAL_LIST_ID = "list-personal"
const WORK_LIST_ID = "list-work"

const createdAt = new Date().toISOString()

/** An ISO timestamp `days` from today at 18:00 — seed due dates that stay
 *  meaningful whenever the example is run, rather than fixed dates that
 *  would all read as "months ago" by the time anyone runs it. */
const dueInDays = (days: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(18, 0, 0, 0)
  return date.toISOString()
}

const patch = (tasks: Task[], id: string, fields: Partial<Task>): Task[] =>
  tasks.map((task) => (task.id === id ? { ...task, ...fields } : task))

export const createInitialState = (): State => ({
  lists: [
    { id: PERSONAL_LIST_ID, name: "Personal", color: LIST_COLOR_PALETTE[0]! },
    { id: WORK_LIST_ID, name: "Work", color: LIST_COLOR_PALETTE[1]! },
  ],
  // Seeded ids live in their OWN namespace (`seed-*`), disjoint from the
  // `task-*`/`list-*` ids `makeId` hands out. They used to share it, and a
  // fresh counter meant the first task ever created was handed the id of a
  // seeded one: pressing Ctrl+N added a task and then opened "Water the
  // plants", because `tasks.find(id)` matched the seed first. Found by
  // actually pressing Ctrl+N in a running window; no test had noticed.
  tasks: [
    {
      id: "seed-1",
      title: "Water the plants",
      listId: PERSONAL_LIST_ID,
      done: false,
      important: false,
      deleted: false,
      due: dueInDays(0),
      position: 0,
      createdAt,
    },
    {
      id: "seed-2",
      title: "Renew passport",
      listId: PERSONAL_LIST_ID,
      done: false,
      important: true,
      deleted: false,
      due: dueInDays(9),
      position: 1,
      createdAt,
    },
    {
      id: "seed-3",
      title: "Book dentist appointment",
      listId: PERSONAL_LIST_ID,
      done: true,
      important: false,
      deleted: false,
      due: null,
      position: 2,
      createdAt,
    },
    {
      id: "seed-4",
      title: "Review the navigation-depth-2 PR",
      listId: WORK_LIST_ID,
      done: false,
      important: true,
      deleted: false,
      due: dueInDays(-1),
      position: 3,
      createdAt,
    },
    {
      id: "seed-5",
      title: "Update the sprint board",
      listId: WORK_LIST_ID,
      done: false,
      important: false,
      deleted: false,
      due: dueInDays(1),
      position: 4,
      createdAt,
    },
    {
      id: "seed-6",
      title: "Draft the old status report",
      listId: WORK_LIST_ID,
      done: false,
      important: false,
      deleted: true,
      due: null,
      position: 5,
      createdAt,
    },
  ],
  selectedTaskId: null,
  searchMode: false,
  searchQuery: "",
  dialog: "none",
  taskToDelete: null,
  // Matches the navigator's own initial route (src/app.tsx's first
  // Sidebar.Screen), so `win.new` works before any focus event has fired.
  activeRoute: "smart:all",
})

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "addList":
      return { ...state, lists: [...state.lists, action.list] }
    case "addTask":
      return { ...state, tasks: [...state.tasks, action.task] }
    case "setTitle":
      return {
        ...state,
        tasks: patch(state.tasks, action.id, { title: action.title }),
      }
    case "setDue":
      return {
        ...state,
        tasks: patch(state.tasks, action.id, { due: action.due }),
      }
    case "toggleDone":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, done: !task.done } : task,
        ),
      }
    case "toggleImportant":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id
            ? { ...task, important: !task.important }
            : task,
        ),
      }
    case "moveToTrash":
      return {
        ...state,
        tasks: patch(state.tasks, action.id, { deleted: true }),
        selectedTaskId:
          state.selectedTaskId === action.id ? null : state.selectedTaskId,
      }
    case "restore":
      return {
        ...state,
        tasks: patch(state.tasks, action.id, { deleted: false }),
      }
    case "deleteForever":
      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.id),
        selectedTaskId:
          state.selectedTaskId === action.id ? null : state.selectedTaskId,
      }
    // Splices in the FULL task array, not in the filtered view the user can
    // see: positions are then renumbered from array order, so the invariant
    // "array order === position order" holds for every later drag. Moving a
    // row next to its drop target in the full array also puts it next to it
    // in any filtered projection of that array, so the visible result is
    // what the user aimed at. Same implementation as examples/tasks-app.
    //
    // `to` is read before the dragged row is removed, so the insert lands
    // BEFORE the target when dragging up and AFTER it when dragging down.
    // That asymmetry is the desirable one — dropping onto a row above puts
    // the task above it, dropping onto a row below puts it below — and it
    // is what makes a single drop point behave like an insertion caret
    // without the row having to report which half was hit.
    case "reorder": {
      const tasks = [...state.tasks]
      const from = tasks.findIndex((task) => task.id === action.draggedId)
      const to = tasks.findIndex((task) => task.id === action.targetId)
      if (from < 0 || to < 0 || from === to) {
        return state
      }
      const [moved] = tasks.splice(from, 1)
      if (moved === undefined) {
        return state
      }
      tasks.splice(to, 0, moved)
      return {
        ...state,
        tasks: tasks.map((task, index) => ({ ...task, position: index })),
      }
    }
    case "openTask":
      return { ...state, selectedTaskId: action.id }
    case "setSearchMode":
      return {
        ...state,
        searchMode: action.searchMode,
        // Leaving search must also drop the query, or the list stays
        // filtered by a needle with no visible search field behind it.
        searchQuery: action.searchMode ? state.searchQuery : "",
      }
    case "setSearchQuery":
      return { ...state, searchQuery: action.searchQuery }
    case "showDialog":
      return { ...state, dialog: action.dialog }
    case "askDeleteTask":
      return {
        ...state,
        taskToDelete: action.id,
        dialog: action.id === null ? "none" : "delete-task",
      }
    case "setActiveRoute":
      return state.activeRoute === action.route
        ? state
        : { ...state, activeRoute: action.route }
    default:
      return state
  }
}

export type Store = State & {
  addList: (name: string, color: string) => TaskList
  addTask: (listId: string, title: string) => Task | undefined
  setTitle: (id: string, title: string) => void
  setDue: (id: string, due: string | null) => void
  toggleDone: (id: string) => void
  toggleImportant: (id: string) => void
  moveToTrash: (id: string) => void
  restore: (id: string) => void
  deleteForever: (id: string) => void
  reorder: (draggedId: string, targetId: string) => void
  openTask: (id: string | null) => void
  setSearchMode: (searchMode: boolean) => void
  setSearchQuery: (searchQuery: string) => void
  showDialog: (dialog: DialogKind) => void
  askDeleteTask: (id: string | null) => void
  setActiveRoute: (route: string) => void
}

let state = createInitialState()
let snapshot: Store | null = null
const listeners = new Set<() => void>()

const dispatch = (action: Action): void => {
  const next = reducer(state, action)
  if (next === state) {
    return
  }
  state = next
  snapshot = null
  for (const listener of listeners) {
    listener()
  }
}

let nextId = 0
const makeId = (prefix: string): string => {
  nextId += 1
  return `${prefix}-${nextId}`
}

// Bound once, at module scope: useSyncExternalStore compares snapshots by
// identity, so the action half must never be rebuilt — a fresh object per
// read would make every consumer re-render on every read, forever.
const actions = {
  addList: (name: string, color: string): TaskList => {
    const list: TaskList = { id: makeId("list"), name, color }
    dispatch({ type: "addList", list })
    return list
  },
  addTask: (listId: string, title: string): Task | undefined => {
    const trimmed = title.trim()
    if (!trimmed || !listId) {
      return undefined
    }
    const task: Task = {
      id: makeId("task"),
      title: trimmed,
      listId,
      done: false,
      important: false,
      deleted: false,
      due: null,
      position: state.tasks.length,
      createdAt: new Date().toISOString(),
    }
    dispatch({ type: "addTask", task })
    return task
  },
  setTitle: (id: string, title: string) =>
    dispatch({ type: "setTitle", id, title }),
  setDue: (id: string, due: string | null) =>
    dispatch({ type: "setDue", id, due }),
  toggleDone: (id: string) => dispatch({ type: "toggleDone", id }),
  toggleImportant: (id: string) => dispatch({ type: "toggleImportant", id }),
  moveToTrash: (id: string) => dispatch({ type: "moveToTrash", id }),
  restore: (id: string) => dispatch({ type: "restore", id }),
  deleteForever: (id: string) => dispatch({ type: "deleteForever", id }),
  reorder: (draggedId: string, targetId: string) =>
    dispatch({ type: "reorder", draggedId, targetId }),
  openTask: (id: string | null) => dispatch({ type: "openTask", id }),
  setSearchMode: (searchMode: boolean) =>
    dispatch({ type: "setSearchMode", searchMode }),
  setSearchQuery: (searchQuery: string) =>
    dispatch({ type: "setSearchQuery", searchQuery }),
  showDialog: (dialog: DialogKind) => dispatch({ type: "showDialog", dialog }),
  askDeleteTask: (id: string | null) => dispatch({ type: "askDeleteTask", id }),
  setActiveRoute: (route: string) =>
    dispatch({ type: "setActiveRoute", route }),
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The store outside React — what `windowActions`/`windowControllers` use,
 *  since no provider of ours is above them. */
export const getStore = (): Store => {
  snapshot ??= { ...state, ...actions }
  return snapshot
}

export const useStore = (): Store => useSyncExternalStore(subscribe, getStore)
