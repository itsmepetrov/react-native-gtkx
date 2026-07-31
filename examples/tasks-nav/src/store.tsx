// A small Context + useReducer store — no external state library, since
// the point of this example is the navigator, not state management (see
// README, "Out of scope").
import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react"
import type { Task, TaskList } from "./types"

type State = {
  lists: TaskList[]
  tasks: Task[]
}

type Action =
  | { type: "addList"; list: TaskList }
  | { type: "addTask"; task: Task }
  | { type: "setTitle"; id: string; title: string }
  | { type: "toggleDone"; id: string }
  | { type: "toggleImportant"; id: string }
  | { type: "moveToTrash"; id: string }
  | { type: "restore"; id: string }

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

const INITIAL_STATE: State = {
  lists: [
    { id: PERSONAL_LIST_ID, name: "Personal", color: LIST_COLOR_PALETTE[0]! },
    { id: WORK_LIST_ID, name: "Work", color: LIST_COLOR_PALETTE[1]! },
  ],
  tasks: [
    {
      id: "task-1",
      title: "Water the plants",
      listId: PERSONAL_LIST_ID,
      done: false,
      important: false,
      deleted: false,
    },
    {
      id: "task-2",
      title: "Renew passport",
      listId: PERSONAL_LIST_ID,
      done: false,
      important: true,
      deleted: false,
    },
    {
      id: "task-3",
      title: "Book dentist appointment",
      listId: PERSONAL_LIST_ID,
      done: true,
      important: false,
      deleted: false,
    },
    {
      id: "task-4",
      title: "Review the navigation-depth-2 PR",
      listId: WORK_LIST_ID,
      done: false,
      important: true,
      deleted: false,
    },
    {
      id: "task-5",
      title: "Update the sprint board",
      listId: WORK_LIST_ID,
      done: false,
      important: false,
      deleted: false,
    },
    {
      id: "task-6",
      title: "Draft the old status report",
      listId: WORK_LIST_ID,
      done: false,
      important: false,
      deleted: true,
    },
  ],
}

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "addList":
      return { ...state, lists: [...state.lists, action.list] }
    case "addTask":
      return { ...state, tasks: [...state.tasks, action.task] }
    case "setTitle":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, title: action.title } : task,
        ),
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
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, deleted: true } : task,
        ),
      }
    case "restore":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, deleted: false } : task,
        ),
      }
    default:
      return state
  }
}

type Store = State & {
  addList: (name: string, color: string) => TaskList
  addTask: (listId: string, title: string) => Task
  setTitle: (id: string, title: string) => void
  toggleDone: (id: string) => void
  toggleImportant: (id: string) => void
  moveToTrash: (id: string) => void
  restore: (id: string) => void
}

const StoreContext = createContext<Store | null>(null)

let nextId = 0
const makeId = (prefix: string): string => {
  nextId += 1
  return `${prefix}-${nextId}`
}

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

  const store = useMemo<Store>(
    () => ({
      ...state,
      addList: (name, color) => {
        const list: TaskList = { id: makeId("list"), name, color }
        dispatch({ type: "addList", list })
        return list
      },
      addTask: (listId, title) => {
        const task: Task = {
          id: makeId("task"),
          title,
          listId,
          done: false,
          important: false,
          deleted: false,
        }
        dispatch({ type: "addTask", task })
        return task
      },
      setTitle: (id, title) => dispatch({ type: "setTitle", id, title }),
      toggleDone: (id) => dispatch({ type: "toggleDone", id }),
      toggleImportant: (id) => dispatch({ type: "toggleImportant", id }),
      moveToTrash: (id) => dispatch({ type: "moveToTrash", id }),
      restore: (id) => dispatch({ type: "restore", id }),
    }),
    [state],
  )

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export const useStore = (): Store => {
  const store = useContext(StoreContext)
  if (!store) {
    throw new Error("useStore must be used inside StoreProvider")
  }
  return store
}
