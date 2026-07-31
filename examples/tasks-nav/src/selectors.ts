// Everything the content screen derives from the store, pulled out of the
// component so it can be unit-tested without GTK. `isReorderable` in
// particular is the gate on drag-and-drop, and a predicate that decides
// whether a drag is even possible deserves a test rather than a live
// screenshot.
import type { Filter, Selection, SmartView, SortOrder, Task } from "./types"

/** Route names encode which family a screen belongs to (see src/app.tsx);
 *  this is the only place that knows the encoding. */
export const parseRoute = (name: string): Selection => {
  if (name.startsWith("smart:")) {
    return { kind: "smart", view: name.slice("smart:".length) as SmartView }
  }
  return { kind: "list", listId: name.slice("list:".length) }
}

export const isTrashSelection = (selection: Selection): boolean =>
  selection.kind === "smart" && selection.view === "trash"

const inSelection = (task: Task, selection: Selection): boolean => {
  if (isTrashSelection(selection)) {
    return task.deleted
  }
  if (task.deleted) {
    return false
  }
  if (selection.kind === "list") {
    return task.listId === selection.listId
  }
  return selection.view === "important" ? task.important : true
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

// Ties fall back to `position` so an ordering is always total: two tasks
// with the same due date keep their manual order rather than swapping
// places on every re-render (Array.sort is not required to be stable across
// engines for the comparator returning 0, and a list that reshuffles itself
// under the cursor is exactly what a drag-reorder app must not do).
const byOrder =
  (order: SortOrder) =>
  (a: Task, b: Task): number => {
    switch (order) {
      case "due-date": {
        if (a.due === b.due) {
          return a.position - b.position
        }
        if (!a.due) {
          return 1
        }
        if (!b.due) {
          return -1
        }
        return a.due < b.due ? -1 : 1
      }
      case "title":
        return a.title.localeCompare(b.title)
      case "created":
        return a.createdAt.localeCompare(b.createdAt)
      default:
        return a.position - b.position
    }
  }

export type VisibleOptions = {
  query: string
  filter: Filter
  sortOrder: SortOrder
}

export const visibleTasks = (
  tasks: Task[],
  selection: Selection,
  { query, filter, sortOrder }: VisibleOptions,
): Task[] => {
  const needle = query.trim().toLowerCase()
  return tasks
    .filter(
      (task) =>
        inSelection(task, selection) &&
        (!needle || task.title.toLowerCase().includes(needle)) &&
        // Trash has no All/Open/Done toggle group in its header, so the
        // filter left over from another view must not silently apply here.
        (isTrashSelection(selection) || matchesFilter(task, filter)),
    )
    .sort(byOrder(sortOrder))
}

/**
 * Whether rows in this view can be dragged into a new order. Manual order
 * is the only one a drag can express — dropping a row somewhere under
 * "sort by title" would either be ignored or fight the sort on the next
 * render — and a filtered-by-search list is a projection whose gaps make
 * "put it here" ambiguous. Trash is not a place to arrange things.
 *
 * Same three conditions as examples/tasks-app's own `isReorderable`.
 */
export const isReorderable = (
  selection: Selection,
  query: string,
  sortOrder: SortOrder,
): boolean =>
  sortOrder === "manual" && query.trim() === "" && !isTrashSelection(selection)

export type EmptyState = { icon: string; title: string; description: string }

export const emptyState = (selection: Selection, query: string): EmptyState => {
  if (query.trim()) {
    return {
      icon: "system-search-symbolic",
      title: "No Results",
      description: `No tasks match “${query.trim()}”`,
    }
  }
  if (isTrashSelection(selection)) {
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

/** Where a task typed into the "Add a task…" row lands: the current list
 *  when a list is selected, the first list otherwise — a smart view is a
 *  query, not a place to put things. */
export const addTargetListId = (
  selection: Selection,
  lists: { id: string }[],
): string | undefined =>
  selection.kind === "list" ? selection.listId : lists[0]?.id
