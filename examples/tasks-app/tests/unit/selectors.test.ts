import { describe, expect, it } from "vitest"
import {
  addListId,
  emptyState,
  isReorderable,
  selectionKey,
  selectionTitle,
  sidebarCounts,
  visibleTasks,
} from "../../src/store/selectors"
import type { Selection, Task, TaskList } from "../../src/types"

const lists: TaskList[] = [
  { id: "personal", name: "Personal", color: "#3584e4" },
  { id: "work", name: "Work", color: "#2ec27e" },
]

const makeTask = (fields: Partial<Task> & Pick<Task, "id">): Task => ({
  listId: "personal",
  title: "Untitled",
  notes: "",
  done: false,
  important: false,
  deleted: false,
  due: null,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  completedAt: null,
  ...fields,
})

const todayIso = (): string => {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  return date.toISOString()
}

describe("selectionKey / selectionTitle / addListId", () => {
  it("keys and titles a smart selection", () => {
    const selection: Selection = { kind: "smart", view: "today" }
    expect(selectionKey(selection)).toBe("smart:today")
    expect(selectionTitle(selection, lists)).toBe("Today")
  })

  it("keys and titles a list selection by the list's own name", () => {
    const selection: Selection = { kind: "list", listId: "work" }
    expect(selectionKey(selection)).toBe("list:work")
    expect(selectionTitle(selection, lists)).toBe("Work")
  })

  it("falls back to 'Tasks' for an unknown list id", () => {
    const selection: Selection = { kind: "list", listId: "ghost" }
    expect(selectionTitle(selection, lists)).toBe("Tasks")
  })

  it("addListId picks the selection's own list, or the first list otherwise", () => {
    expect(addListId({ kind: "list", listId: "work" }, lists)).toBe("work")
    expect(addListId({ kind: "smart", view: "all" }, lists)).toBe("personal")
    expect(addListId({ kind: "smart", view: "all" }, [])).toBe("")
  })
})

describe("visibleTasks", () => {
  const tasks: Task[] = [
    makeTask({
      id: "t1",
      listId: "personal",
      title: "Water plants",
      due: todayIso(),
    }),
    makeTask({
      id: "t2",
      listId: "work",
      title: "Ship release",
      important: true,
    }),
    makeTask({
      id: "t3",
      listId: "personal",
      title: "Old note",
      deleted: true,
    }),
    makeTask({ id: "t4", listId: "personal", title: "Done thing", done: true }),
  ]

  it("smart:all excludes deleted tasks", () => {
    const visible = visibleTasks(
      tasks,
      { kind: "smart", view: "all" },
      {
        query: "",
        filter: "all",
        sortOrder: "manual",
      },
    )
    expect(visible.map((t) => t.id)).toEqual(["t1", "t2", "t4"])
  })

  it("smart:today keeps only tasks due today", () => {
    const visible = visibleTasks(
      tasks,
      { kind: "smart", view: "today" },
      {
        query: "",
        filter: "all",
        sortOrder: "manual",
      },
    )
    expect(visible.map((t) => t.id)).toEqual(["t1"])
  })

  it("smart:important keeps only important tasks", () => {
    const visible = visibleTasks(
      tasks,
      { kind: "smart", view: "important" },
      {
        query: "",
        filter: "all",
        sortOrder: "manual",
      },
    )
    expect(visible.map((t) => t.id)).toEqual(["t2"])
  })

  it("smart:trash keeps only deleted tasks", () => {
    const visible = visibleTasks(
      tasks,
      { kind: "smart", view: "trash" },
      {
        query: "",
        filter: "all",
        sortOrder: "manual",
      },
    )
    expect(visible.map((t) => t.id)).toEqual(["t3"])
  })

  it("a list selection keeps only that list's undeleted tasks", () => {
    const visible = visibleTasks(
      tasks,
      { kind: "list", listId: "personal" },
      {
        query: "",
        filter: "all",
        sortOrder: "manual",
      },
    )
    expect(visible.map((t) => t.id)).toEqual(["t1", "t4"])
  })

  it("filters by open/done", () => {
    const open = visibleTasks(
      tasks,
      { kind: "smart", view: "all" },
      {
        query: "",
        filter: "open",
        sortOrder: "manual",
      },
    )
    expect(open.map((t) => t.id)).toEqual(["t1", "t2"])

    const done = visibleTasks(
      tasks,
      { kind: "smart", view: "all" },
      {
        query: "",
        filter: "done",
        sortOrder: "manual",
      },
    )
    expect(done.map((t) => t.id)).toEqual(["t4"])
  })

  it("matches the query against title and notes, case-insensitively", () => {
    const visible = visibleTasks(
      tasks,
      { kind: "smart", view: "all" },
      {
        query: "SHIP",
        filter: "all",
        sortOrder: "manual",
      },
    )
    expect(visible.map((t) => t.id)).toEqual(["t2"])
  })

  it("sorts by title when sortOrder is 'title'", () => {
    const visible = visibleTasks(
      tasks,
      { kind: "smart", view: "all" },
      {
        query: "",
        filter: "all",
        sortOrder: "title",
      },
    )
    expect(visible.map((t) => t.title)).toEqual([
      "Done thing",
      "Ship release",
      "Water plants",
    ])
  })

  it("sorts by due date, tasks with no due date last", () => {
    const withDue: Task[] = [
      makeTask({ id: "a", due: "2026-05-01T00:00:00.000Z", position: 0 }),
      makeTask({ id: "b", due: null, position: 1 }),
      makeTask({ id: "c", due: "2026-01-01T00:00:00.000Z", position: 2 }),
    ]
    const visible = visibleTasks(
      withDue,
      { kind: "smart", view: "all" },
      {
        query: "",
        filter: "all",
        sortOrder: "due-date",
      },
    )
    expect(visible.map((t) => t.id)).toEqual(["c", "a", "b"])
  })
})

describe("sidebarCounts", () => {
  it("counts open (undeleted, undone) tasks per bucket and per list", () => {
    const tasks: Task[] = [
      makeTask({ id: "t1", listId: "personal", due: todayIso() }),
      makeTask({ id: "t2", listId: "work", important: true }),
      makeTask({ id: "t3", listId: "personal", deleted: true }),
      makeTask({ id: "t4", listId: "personal", done: true }),
    ]
    const counts = sidebarCounts(tasks, lists)
    expect(counts.all).toBe(2)
    expect(counts.today).toBe(1)
    expect(counts.important).toBe(1)
    expect(counts.trash).toBe(1)
    expect(counts.lists.personal).toBe(1)
    expect(counts.lists.work).toBe(1)
  })
})

describe("isReorderable", () => {
  it("is true only for manual order, no query, outside the trash view", () => {
    expect(isReorderable({ kind: "smart", view: "all" }, "", "manual")).toBe(
      true,
    )
    expect(isReorderable({ kind: "list", listId: "work" }, "", "manual")).toBe(
      true,
    )
    expect(
      isReorderable({ kind: "smart", view: "all" }, "water", "manual"),
    ).toBe(false)
    expect(isReorderable({ kind: "smart", view: "all" }, "", "due-date")).toBe(
      false,
    )
    expect(isReorderable({ kind: "smart", view: "trash" }, "", "manual")).toBe(
      false,
    )
  })
})

describe("emptyState", () => {
  it("returns a search-specific state when there is a query", () => {
    const state = emptyState({ kind: "smart", view: "all" }, "gizmo")
    expect(state.title).toBe("No Results")
    expect(state.description).toContain("gizmo")
  })

  it("returns the smart-view state when there is no query", () => {
    expect(emptyState({ kind: "smart", view: "trash" }, "").title).toBe(
      "Trash Is Empty",
    )
  })

  it("falls back to the 'all' empty state for a list selection", () => {
    expect(emptyState({ kind: "list", listId: "work" }, "").title).toBe(
      "No Tasks Yet",
    )
  })
})
