// The domain: smart views (All/Today/Important/Trash) + user-created
// colored lists + tasks, the same shape gtkx's own tutorial app (and this
// repo's examples/tasks-app port of it) uses. Tasks are persisted to a file
// between runs — see src/storage.ts.
export type TaskList = {
  id: string
  name: string
  color: string
}

export type Task = {
  id: string
  title: string
  listId: string
  /** Free-form body text, edited in the task editor's Notes field. Searched
   *  alongside the title, the same as examples/tasks-app. */
  notes: string
  done: boolean
  important: boolean
  deleted: boolean
  /** ISO timestamp, or null for a task with no due date. */
  due: string | null
  /** The manual (drag-reorder) order. Only meaningful under
   *  `sortOrder === "manual"`; every other order ignores it. */
  position: number
  /** ISO timestamp — what `sortOrder === "created"` sorts on. */
  createdAt: string
  /** ISO timestamp of when the task was last marked done, or null while it
   *  is open. Cleared again when a done task is reopened. */
  completedAt: string | null
}

export type Filter = "all" | "open" | "done"

// A sidebar screen is either a fixed smart view or one user list — the
// route name (`smart:<view>` / `list:<id>`) is how the shared content
// screen tells the two families apart. See src/app.tsx.
export type SmartView = "all" | "today" | "important" | "trash"

export type Selection =
  { kind: "smart"; view: SmartView } | { kind: "list"; listId: string }

// The GSettings enum key stores an integer; the app talks in nicks. Mirrors
// data/dev.rngtkx.tasksnav.gschema.xml — the two must stay in step.
export enum SortValue {
  manual = 0,
  "due-date" = 1,
  title = 2,
  created = 3,
}

export type SortOrder = keyof typeof SortValue

export type DialogKind =
  "none" | "about" | "shortcuts" | "preferences" | "new-list" | "delete-task"
