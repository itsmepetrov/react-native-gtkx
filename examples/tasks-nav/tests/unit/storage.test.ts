// Persistence is the part of this example with real failure modes rather
// than just a missing feature, so every one of them gets a test instead of
// a screenshot: a corrupt file, a file from another schema version, a file
// missing fields that only exist now, and the atomic round trip itself.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  loadTasks,
  parsePersisted,
  saveTasks,
  serializePersisted,
  STORAGE_VERSION,
  storageFile,
  type PersistedState,
} from "../../src/storage"
import type { Task, TaskList } from "../../src/types"

const list: TaskList = { id: "list-1", name: "Personal", color: "#e01b24" }

const task: Task = {
  id: "task-1",
  title: "Water the plants",
  listId: "list-1",
  notes: "the big one by the window",
  done: false,
  important: true,
  deleted: false,
  due: "2026-08-01T18:00:00.000Z",
  position: 0,
  createdAt: "2026-07-01T09:00:00.000Z",
  completedAt: null,
}

const document: PersistedState = { lists: [list], tasks: [task] }

describe("parsePersisted", () => {
  it("round-trips a document unchanged", () => {
    expect(parsePersisted(serializePersisted(document))).toEqual(document)
  })

  it("refuses a file that is not JSON at all", () => {
    // Half a file, the shape a non-atomic writer leaves behind on a crash.
    expect(parsePersisted('{"version":1,"lists":[{"id":"list-1"')).toBeNull()
    expect(parsePersisted("")).toBeNull()
    expect(parsePersisted("null")).toBeNull()
    expect(parsePersisted('"a string"')).toBeNull()
  })

  it("refuses a version it does not know", () => {
    // Both directions: an older format that would need migrating, and one
    // written by a NEWER build, where half-reading is worse than seeding.
    const older = JSON.stringify({ version: 0, ...document })
    const newer = JSON.stringify({ version: STORAGE_VERSION + 1, ...document })
    expect(parsePersisted(older)).toBeNull()
    expect(parsePersisted(newer)).toBeNull()
  })

  it("refuses a document whose top-level shape is wrong", () => {
    expect(
      parsePersisted(
        JSON.stringify({ version: STORAGE_VERSION, lists: {}, tasks: [] }),
      ),
    ).toBeNull()
    expect(
      parsePersisted(JSON.stringify({ version: STORAGE_VERSION, lists: [] })),
    ).toBeNull()
  })

  it("refuses a document with no usable list, since a task has nowhere to go", () => {
    expect(
      parsePersisted(
        JSON.stringify({ version: STORAGE_VERSION, lists: [], tasks: [task] }),
      ),
    ).toBeNull()
  })

  it("fills in fields added after the file was written", () => {
    // Exactly a file saved before `notes` and `completedAt` existed: it must
    // load, not produce `undefined` where the editor expects a string.
    const legacy = JSON.stringify({
      version: STORAGE_VERSION,
      lists: [list],
      tasks: [
        {
          id: "task-1",
          title: "Water the plants",
          listId: "list-1",
          done: false,
          important: false,
          deleted: false,
          due: null,
          position: 0,
          createdAt: "2026-07-01T09:00:00.000Z",
        },
      ],
    })
    const parsed = parsePersisted(legacy)
    expect(parsed?.tasks[0]?.notes).toBe("")
    expect(parsed?.tasks[0]?.completedAt).toBeNull()
  })

  it("drops entries with no id and keeps the rest", () => {
    // An entry that cannot be addressed by any action is worse than absent:
    // it would render a row nothing could act on.
    const mixed = JSON.stringify({
      version: STORAGE_VERSION,
      lists: [list, { name: "no id here" }],
      tasks: [task, { title: "orphan" }, null, "nonsense"],
    })
    const parsed = parsePersisted(mixed)
    expect(parsed?.lists.map((entry) => entry.id)).toEqual(["list-1"])
    expect(parsed?.tasks.map((entry) => entry.id)).toEqual(["task-1"])
  })

  it("falls back to array order when position is missing or not a number", () => {
    // "array order === position order" is the invariant every drag-reorder
    // depends on (see store.ts) — a restored file must not break it.
    const noPositions = JSON.stringify({
      version: STORAGE_VERSION,
      lists: [list],
      tasks: [
        { id: "a", listId: "list-1" },
        { id: "b", listId: "list-1", position: "third" },
        { id: "c", listId: "list-1", position: Number.NaN },
      ],
    })
    expect(parsePersisted(noPositions)?.tasks.map((t) => t.position)).toEqual([
      0, 1, 2,
    ])
  })

  it("never reports a completion time for a task that is not done", () => {
    const inconsistent = JSON.stringify({
      version: STORAGE_VERSION,
      lists: [list],
      tasks: [{ ...task, done: false, completedAt: "2026-07-02T10:00:00Z" }],
    })
    expect(parsePersisted(inconsistent)?.tasks[0]?.completedAt).toBeNull()
  })
})

describe("loadTasks / saveTasks", () => {
  let dataHome: string
  const previous = process.env.XDG_DATA_HOME

  beforeEach(() => {
    dataHome = mkdtempSync(join(tmpdir(), "tasks-nav-storage-"))
    process.env.XDG_DATA_HOME = dataHome
  })

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.XDG_DATA_HOME
    } else {
      process.env.XDG_DATA_HOME = previous
    }
    rmSync(dataHome, { recursive: true, force: true })
  })

  it("returns null on a first run, with no file and no directory", () => {
    expect(loadTasks()).toBeNull()
  })

  it("saves and restores through a real file", () => {
    saveTasks(document)
    expect(loadTasks()).toEqual(document)
  })

  it("creates the data directory rather than failing when it is absent", () => {
    // First launch on a fresh profile: nothing under $XDG_DATA_HOME yet.
    saveTasks(document)
    expect(readFileSync(storageFile(), "utf8")).toContain("Water the plants")
  })

  it("leaves no temp file behind, so the save is one rename and not two files", () => {
    saveTasks(document)
    expect(() => readFileSync(`${storageFile()}.tmp`, "utf8")).toThrow()
  })

  it("returns null instead of throwing when the file is corrupt", () => {
    saveTasks(document)
    writeFileSync(storageFile(), '{"version":1,"lists":[{"id"')
    expect(loadTasks()).toBeNull()
  })

  it("replaces the previous document instead of appending to it", () => {
    saveTasks(document)
    const emptied: PersistedState = { lists: [list], tasks: [] }
    saveTasks(emptied)
    expect(loadTasks()).toEqual(emptied)
  })
})
