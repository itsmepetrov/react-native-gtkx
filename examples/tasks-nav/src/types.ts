// The domain: smart views (All/Important/Trash) + user-created colored
// lists + tasks, the same shape gtkx's own tutorial app (and this repo's
// examples/tasks-app port of it) uses — the navigational complexity the
// PRD asks this example to prove is comparable to, not the full feature
// set (no due dates, reminders, drag-reorder — see README).
export type TaskList = {
  id: string
  name: string
  color: string
}

export type Task = {
  id: string
  title: string
  listId: string
  done: boolean
  important: boolean
  deleted: boolean
}

export type Filter = "all" | "open" | "done"

// A sidebar screen is either a fixed smart view or one user list — the
// route name (`smart:<view>` / `list:<id>`) is how the shared content
// screen tells the two families apart. See src/app.tsx.
export type SmartView = "all" | "important" | "trash"
