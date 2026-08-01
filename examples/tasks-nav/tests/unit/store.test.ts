// The reducer is tested directly rather than through the module-level
// store: it is a pure function, so every case starts from a state built
// here instead of from whatever a previous test left behind.
import { describe, expect, it } from "vitest"
import { createInitialState, reducer, type Action } from "../../src/store"

const run = (actions: Action[], state = createInitialState()) =>
  actions.reduce(reducer, state)

const ids = (state: ReturnType<typeof createInitialState>): string[] =>
  state.tasks.map((task) => task.id)

describe("reorder", () => {
  it("moves the dragged task in front of its drop target", () => {
    const state = run([
      { type: "reorder", draggedId: "seed-5", targetId: "seed-1" },
    ])
    expect(ids(state)).toEqual([
      "seed-5",
      "seed-1",
      "seed-2",
      "seed-3",
      "seed-4",
      "seed-6",
    ])
  })

  it("renumbers position so array order and position order agree", () => {
    // The invariant every later drag depends on: `position` is what the
    // list sorts by, so a drag that left it stale would appear to do
    // nothing on the next render.
    const state = run([
      { type: "reorder", draggedId: "seed-4", targetId: "seed-2" },
      { type: "reorder", draggedId: "seed-1", targetId: "seed-6" },
    ])
    expect(state.tasks.map((task) => task.position)).toEqual([0, 1, 2, 3, 4, 5])
    expect(ids(state)).toEqual(
      [...state.tasks]
        .sort((a, b) => a.position - b.position)
        .map((task) => task.id),
    )
  })

  it("lands AFTER the target when dragged downward", () => {
    // The index is read before the dragged row is pulled out, so a
    // downward drag re-inserts one slot past its target — which is what a
    // user dropping onto a row below expects ("put it there") and the
    // mirror image of the upward case above.
    const state = run([
      { type: "reorder", draggedId: "seed-1", targetId: "seed-4" },
    ])
    expect(ids(state)).toEqual([
      "seed-2",
      "seed-3",
      "seed-4",
      "seed-1",
      "seed-5",
      "seed-6",
    ])
  })

  it("is a no-op when dropped on itself or on an unknown id", () => {
    const before = createInitialState()
    expect(
      reducer(before, {
        type: "reorder",
        draggedId: "seed-2",
        targetId: "seed-2",
      }),
    ).toBe(before)
    expect(
      reducer(before, {
        type: "reorder",
        draggedId: "seed-2",
        targetId: "nope",
      }),
    ).toBe(before)
    expect(
      reducer(before, {
        type: "reorder",
        draggedId: "nope",
        targetId: "seed-2",
      }),
    ).toBe(before)
  })
})

describe("tasks", () => {
  it("moves a task to trash and closes its editor if it was open", () => {
    const state = run([
      { type: "openTask", id: "seed-2" },
      { type: "moveToTrash", id: "seed-2" },
    ])
    expect(state.tasks.find((task) => task.id === "seed-2")?.deleted).toBe(true)
    expect(state.selectedTaskId).toBeNull()
  })

  it("leaves another task's open editor alone when trashing", () => {
    const state = run([
      { type: "openTask", id: "seed-1" },
      { type: "moveToTrash", id: "seed-2" },
    ])
    expect(state.selectedTaskId).toBe("seed-1")
  })

  it("restores a trashed task", () => {
    const state = run([{ type: "restore", id: "seed-6" }])
    expect(state.tasks.find((task) => task.id === "seed-6")?.deleted).toBe(
      false,
    )
  })

  it("deletes a task for good", () => {
    const state = run([{ type: "deleteForever", id: "seed-6" }])
    expect(ids(state)).not.toContain("seed-6")
  })

  it("toggles done and important", () => {
    const state = run([
      { type: "toggleDone", id: "seed-1" },
      { type: "toggleImportant", id: "seed-1" },
    ])
    const task = state.tasks.find((entry) => entry.id === "seed-1")
    expect(task?.done).toBe(true)
    expect(task?.important).toBe(true)
  })

  it("stamps a completion time on done, and clears it on reopening", () => {
    // The editor shows a "Completed" row off this field, so a stale value
    // would outlive the state it describes.
    const done = run([{ type: "toggleDone", id: "seed-1" }])
    expect(
      done.tasks.find((task) => task.id === "seed-1")?.completedAt,
    ).toEqual(expect.any(String))
    const reopened = run([{ type: "toggleDone", id: "seed-1" }], done)
    expect(
      reopened.tasks.find((task) => task.id === "seed-1")?.completedAt,
    ).toBeNull()
  })

  it("edits notes", () => {
    const state = run([
      { type: "setNotes", id: "seed-2", notes: "renew before the trip" },
    ])
    expect(state.tasks.find((task) => task.id === "seed-2")?.notes).toBe(
      "renew before the trip",
    )
  })

  it("sets and clears a due date", () => {
    const iso = new Date(2026, 5, 1, 18, 0, 0).toISOString()
    const set = run([{ type: "setDue", id: "seed-3", due: iso }])
    expect(set.tasks.find((task) => task.id === "seed-3")?.due).toBe(iso)
    const cleared = run([{ type: "setDue", id: "seed-3", due: null }], set)
    expect(cleared.tasks.find((task) => task.id === "seed-3")?.due).toBeNull()
  })
})

describe("restoring a saved document", () => {
  it("uses the saved lists and tasks instead of the seed fixture", () => {
    const persisted = {
      lists: [{ id: "list-x", name: "Restored", color: "#2ec27e" }],
      tasks: [
        {
          id: "task-x",
          title: "From disk",
          listId: "list-x",
          notes: "",
          done: false,
          important: false,
          deleted: false,
          due: null,
          position: 0,
          createdAt: "2026-07-01T09:00:00.000Z",
          completedAt: null,
        },
      ],
    }
    const state = createInitialState(persisted)
    expect(state.lists).toEqual(persisted.lists)
    expect(ids(state)).toEqual(["task-x"])
  })

  it("never restores UI state, only the document", () => {
    // A window that reopened mid-search, or with a dialog up, would be a
    // bug — those are not part of the document.
    const state = createInitialState({ lists: [], tasks: [] })
    expect(state.searchMode).toBe(false)
    expect(state.searchQuery).toBe("")
    expect(state.selectedTaskId).toBeNull()
    expect(state.dialog).toBe("none")
  })
})

describe("ui", () => {
  it("drops the query when search mode is turned off", () => {
    // Otherwise the list stays filtered by a needle whose search field is
    // no longer on screen.
    const state = run([
      { type: "setSearchMode", searchMode: true },
      { type: "setSearchQuery", searchQuery: "passport" },
      { type: "setSearchMode", searchMode: false },
    ])
    expect(state.searchQuery).toBe("")
  })

  it("keeps the query while search mode stays on", () => {
    const state = run([
      { type: "setSearchMode", searchMode: true },
      { type: "setSearchQuery", searchQuery: "passport" },
      { type: "setSearchMode", searchMode: true },
    ])
    expect(state.searchQuery).toBe("passport")
  })

  it("asking to delete a task opens the confirmation, cancelling closes it", () => {
    const asked = run([{ type: "askDeleteTask", id: "seed-6" }])
    expect(asked.dialog).toBe("delete-task")
    expect(asked.taskToDelete).toBe("seed-6")
    const cancelled = run([{ type: "askDeleteTask", id: null }], asked)
    expect(cancelled.dialog).toBe("none")
  })

  it("ignores a repeated active route rather than churning state", () => {
    const before = run([{ type: "setActiveRoute", route: "list:list-work" }])
    expect(
      reducer(before, { type: "setActiveRoute", route: "list:list-work" }),
    ).toBe(before)
  })
})
