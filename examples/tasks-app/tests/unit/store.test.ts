// Runs against a throwaway XDG_DATA_HOME so persistence never touches the
// real machine — set before the store module (which resolves its storage
// path at import time) is ever imported.
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

const dataHome = mkdtempSync(join(tmpdir(), "tasks-app-store-"))
process.env.XDG_DATA_HOME = dataHome

const { useStore } = await import("../../src/store/index")
const { seedLists, seedTasks } = await import("../../src/store/seed")

beforeEach(() => {
  rmSync(join(dataHome, "dev.rngtkx.tasks"), { recursive: true, force: true })
  useStore.setState({
    tasks: seedTasks,
    lists: seedLists,
    selection: { kind: "smart", view: "all" },
    selectedTaskId: null,
    collapsed: false,
    showContent: false,
    filter: "all",
    searchMode: false,
    searchQuery: "",
    dialog: "none",
    taskToDelete: null,
  })
})

afterAll(() => {
  rmSync(dataHome, { recursive: true, force: true })
})

describe("tasks slice", () => {
  it("adds a task, trims the title, and rejects a blank one", () => {
    const id = useStore.getState().addTask("personal", "  Call the plumber  ")
    expect(id).not.toBeNull()
    const added = useStore.getState().tasks.find((task) => task.id === id)
    expect(added?.title).toBe("Call the plumber")
    expect(added?.listId).toBe("personal")
    expect(added?.done).toBe(false)

    expect(useStore.getState().addTask("personal", "   ")).toBeNull()
  })

  it("completing a task stamps completedAt, uncompleting clears it", () => {
    const id = useStore.getState().addTask("personal", "Call the plumber")!
    useStore.getState().setDone(id, true)
    const done = useStore.getState().tasks.find((task) => task.id === id)
    expect(done?.done).toBe(true)
    expect(done?.completedAt).not.toBeNull()

    useStore.getState().setDone(id, false)
    const undone = useStore.getState().tasks.find((task) => task.id === id)
    expect(undone?.done).toBe(false)
    expect(undone?.completedAt).toBeNull()
  })

  it("toggles important and updates title/notes/due/listId", () => {
    const id = useStore.getState().addTask("personal", "Call the plumber")!
    useStore.getState().setImportant(id, true)
    expect(
      useStore.getState().tasks.find((task) => task.id === id)?.important,
    ).toBe(true)

    useStore
      .getState()
      .updateTask(id, { title: "Call the electrician", notes: "urgent" })
    const updated = useStore.getState().tasks.find((task) => task.id === id)
    expect(updated?.title).toBe("Call the electrician")
    expect(updated?.notes).toBe("urgent")
  })

  it("moves to trash, restores, and permanently deletes", () => {
    const id = useStore.getState().addTask("personal", "Throwaway")!
    useStore.getState().moveToTrash(id)
    expect(
      useStore.getState().tasks.find((task) => task.id === id)?.deleted,
    ).toBe(true)

    useStore.getState().restore(id)
    expect(
      useStore.getState().tasks.find((task) => task.id === id)?.deleted,
    ).toBe(false)

    useStore.getState().moveToTrash(id)
    useStore.getState().deleteForever(id)
    expect(
      useStore.getState().tasks.find((task) => task.id === id),
    ).toBeUndefined()
  })

  it("reorders tasks and renumbers position sequentially", () => {
    const before = useStore.getState().tasks.map((task) => task.id)
    const [first, , third] = before
    useStore.getState().reorder(first!, third!)
    const after = useStore.getState().tasks
    expect(after.map((task) => task.id)).not.toEqual(before)
    expect(after.map((task) => task.position)).toEqual(after.map((_, i) => i))
  })

  it("reorder is a no-op for unknown ids or reordering onto itself", () => {
    const before = useStore.getState().tasks
    useStore.getState().reorder("missing", before[0]!.id)
    expect(useStore.getState().tasks).toBe(before)
    useStore.getState().reorder(before[0]!.id, before[0]!.id)
    expect(useStore.getState().tasks).toBe(before)
  })
})

describe("lists slice", () => {
  it("adds a list and rejects a blank name", () => {
    const before = useStore.getState().lists.length
    useStore.getState().addList("Errands", "#9141ac")
    expect(useStore.getState().lists.length).toBe(before + 1)
    expect(useStore.getState().lists.at(-1)).toMatchObject({
      name: "Errands",
      color: "#9141ac",
    })

    useStore.getState().addList("   ", "#9141ac")
    expect(useStore.getState().lists.length).toBe(before + 1)
  })
})

describe("ui slice", () => {
  it("select clears the open task and any active search", () => {
    const id = useStore.getState().tasks[0]!.id
    useStore.getState().openTask(id)
    useStore.getState().setSearchQuery("plants")
    useStore.getState().select({ kind: "smart", view: "trash" })
    const state = useStore.getState()
    expect(state.selection).toEqual({ kind: "smart", view: "trash" })
    expect(state.selectedTaskId).toBeNull()
    expect(state.searchQuery).toBe("")
    expect(state.searchMode).toBe(false)
  })

  it("select shows the content pane when the sidebar is collapsed", () => {
    useStore.setState({ collapsed: true })
    useStore.getState().select({ kind: "smart", view: "today" })
    expect(useStore.getState().showContent).toBe(true)
  })

  it("askDeleteTask opens and closes the delete-confirmation dialog", () => {
    const id = useStore.getState().tasks[0]!.id
    useStore.getState().askDeleteTask(id)
    expect(useStore.getState().dialog).toBe("delete-task")
    expect(useStore.getState().taskToDelete).toBe(id)

    useStore.getState().askDeleteTask(null)
    expect(useStore.getState().dialog).toBe("none")
    expect(useStore.getState().taskToDelete).toBeNull()
  })
})
