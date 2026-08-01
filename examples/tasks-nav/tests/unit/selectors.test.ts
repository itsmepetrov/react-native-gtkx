import { describe, expect, it } from "vitest"
import {
  addTargetListId,
  emptyState,
  isReorderable,
  parseRoute,
  visibleTasks,
} from "../../src/selectors"
import { createInitialState, reducer } from "../../src/store"
import type { Selection, Task } from "../../src/types"

const state = createInitialState()
const all: Selection = { kind: "smart", view: "all" }
const today: Selection = { kind: "smart", view: "today" }
const trash: Selection = { kind: "smart", view: "trash" }
const important: Selection = { kind: "smart", view: "important" }
const work: Selection = { kind: "list", listId: "list-work" }

const defaults = { query: "", filter: "all", sortOrder: "manual" } as const

const titles = (tasks: Task[]): string[] => tasks.map((task) => task.title)

describe("parseRoute", () => {
  it("tells the two route families apart", () => {
    expect(parseRoute("smart:important")).toEqual(important)
    expect(parseRoute("list:list-work")).toEqual(work)
  })
})

describe("isReorderable", () => {
  it("allows dragging in a plain, manually ordered list", () => {
    expect(isReorderable(work, "", "manual")).toBe(true)
    expect(isReorderable(all, "", "manual")).toBe(true)
  })

  it("refuses while a search is narrowing the list", () => {
    // A filtered projection has gaps: "drop it here" has no single answer.
    expect(isReorderable(work, "plants", "manual")).toBe(false)
    expect(isReorderable(work, "   ", "manual")).toBe(true)
  })

  it("refuses under any sort order other than manual", () => {
    expect(isReorderable(work, "", "due-date")).toBe(false)
    expect(isReorderable(work, "", "title")).toBe(false)
    expect(isReorderable(work, "", "created")).toBe(false)
  })

  it("refuses in Trash", () => {
    expect(isReorderable(trash, "", "manual")).toBe(false)
  })
})

describe("visibleTasks", () => {
  it("shows only the selected list's live tasks", () => {
    expect(titles(visibleTasks(state.tasks, work, defaults))).toEqual([
      "Review the navigation-depth-2 PR",
      "Update the sprint board",
    ])
  })

  it("shows only deleted tasks in Trash", () => {
    expect(titles(visibleTasks(state.tasks, trash, defaults))).toEqual([
      "Draft the old status report",
    ])
  })

  it("ignores the All/Open/Done filter in Trash, which has no toggle group", () => {
    const filtered = visibleTasks(state.tasks, trash, {
      ...defaults,
      filter: "done",
    })
    expect(titles(filtered)).toEqual(["Draft the old status report"])
  })

  it("applies the filter everywhere else", () => {
    const done = visibleTasks(state.tasks, all, { ...defaults, filter: "done" })
    expect(titles(done)).toEqual(["Book dentist appointment"])
  })

  it("matches a search case-insensitively", () => {
    const found = visibleTasks(state.tasks, all, {
      ...defaults,
      query: "  PASSPORT ",
    })
    expect(titles(found)).toEqual(["Renew passport"])
  })

  it("keeps only tasks due on the current calendar day under Today", () => {
    // The seeds are built relative to "now" (yesterday / today / tomorrow /
    // next week / undated), so this holds whenever the suite is run rather
    // than only on the day it was written.
    expect(titles(visibleTasks(state.tasks, today, defaults))).toEqual([
      "Water the plants",
    ])
  })

  it("Today is a calendar day, not the next 24 hours", () => {
    // A task due in a few hours' time but after midnight is TOMORROW. This
    // is the case a naive `due - now <= 86400000` gets wrong, and the
    // reason isToday compares start-of-day rather than a duration.
    const soonButTomorrow = new Date()
    soonButTomorrow.setDate(soonButTomorrow.getDate() + 1)
    soonButTomorrow.setHours(0, 30, 0, 0)
    const tasks = state.tasks.map((task) =>
      task.id === "seed-1"
        ? { ...task, due: soonButTomorrow.toISOString() }
        : task,
    )
    expect(titles(visibleTasks(tasks, today, defaults))).toEqual([])
  })

  it("excludes trashed tasks from Today, like every other smart view", () => {
    const tasks = state.tasks.map((task) =>
      task.id === "seed-1" ? { ...task, deleted: true } : task,
    )
    expect(visibleTasks(tasks, today, defaults)).toEqual([])
  })

  it("searches notes as well as titles", () => {
    const tasks = state.tasks.map((task) =>
      task.id === "seed-5" ? { ...task, notes: "ask about the ROADMAP" } : task,
    )
    const found = visibleTasks(tasks, all, { ...defaults, query: "roadmap" })
    expect(titles(found)).toEqual(["Update the sprint board"])
  })

  it("keeps only starred tasks under Important", () => {
    expect(titles(visibleTasks(state.tasks, important, defaults))).toEqual([
      "Renew passport",
      "Review the navigation-depth-2 PR",
    ])
  })

  it("sorts by title, and by due date with undated tasks last", () => {
    const byTitle = visibleTasks(state.tasks, all, {
      ...defaults,
      sortOrder: "title",
    })
    expect(titles(byTitle)).toEqual([...titles(byTitle)].sort())

    const byDue = visibleTasks(state.tasks, all, {
      ...defaults,
      sortOrder: "due-date",
    })
    expect(titles(byDue)).toEqual([
      "Review the navigation-depth-2 PR", // yesterday
      "Water the plants", // today
      "Update the sprint board", // tomorrow
      "Renew passport", // next week
      "Book dentist appointment", // no due date
    ])
  })

  it("reflects a drag in what the user sees, not just in the raw array", () => {
    // The end-to-end shape of the feature: a drop inside a list view moves
    // the row in that view, even though `reorder` splices the FULL array.
    const before = titles(visibleTasks(state.tasks, work, defaults))
    expect(before).toEqual([
      "Review the navigation-depth-2 PR",
      "Update the sprint board",
    ])
    const after = reducer(state, {
      type: "reorder",
      draggedId: "seed-5",
      targetId: "seed-4",
    })
    expect(titles(visibleTasks(after.tasks, work, defaults))).toEqual([
      "Update the sprint board",
      "Review the navigation-depth-2 PR",
    ])
  })
})

describe("emptyState", () => {
  it("blames the search when there is one", () => {
    expect(emptyState(work, "zzz").title).toBe("No Results")
  })

  it("is specific to the view otherwise", () => {
    expect(emptyState(trash, "").title).toBe("Trash Is Empty")
    expect(emptyState(today, "").title).toBe("Nothing Due Today")
    expect(emptyState(important, "").title).toBe("Nothing Important")
    expect(emptyState(work, "").title).toBe("No Tasks")
  })
})

describe("addTargetListId", () => {
  it("uses the selected list, and the first list under a smart view", () => {
    expect(addTargetListId(work, state.lists)).toBe("list-work")
    expect(addTargetListId(all, state.lists)).toBe("list-personal")
    expect(addTargetListId(all, [])).toBeUndefined()
  })
})
