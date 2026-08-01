// File-backed task storage: the document (lists + tasks) survives a
// restart, in $XDG_DATA_HOME/dev.rngtkx.tasksnav/tasks.json.
//
// Preferences already persisted through GSettings; this is the other half —
// a SETTINGS store and a DOCUMENT store are different things, and GSettings
// is the wrong tool for the second (dconf is not a place to put user data).
// Plain Node's `node:fs`, exactly as examples/tasks-app does it: "native
// modules" on this platform are just Node, so there is nothing gtkx-shaped
// to reach for here.
//
// Three failure modes get explicit handling, because each one silently
// destroys a user's tasks if left to chance:
//
// 1. A CRASH MID-WRITE. The naive `writeFileSync(file, json)` truncates
//    first and writes second, so a crash between the two leaves a
//    zero-length file and the next launch seeds over the top of it — every
//    task gone, with no error anywhere. Every save here goes to a sibling
//    temp file and is then `rename(2)`d over the real one. Rename is atomic
//    within a filesystem, so a reader (and the next launch) sees either the
//    complete old file or the complete new one, never a torn one.
//
//    Deliberately NOT fsync'd before the rename. That would additionally
//    survive a power cut rather than just a process crash, but it costs a
//    real disk flush per save — and saves happen on every keystroke in the
//    Notes field. Crash-atomicity is the failure this app can actually hit;
//    power-loss durability is a different, much rarer one, and the trade is
//    a bad one at this write frequency. Recorded rather than left implicit.
//
// 2. NO FILE, OR A BROKEN ONE. First run, a half-copied file, a hand-edited
//    one, a directory that cannot be read: every path through `loadTasks`
//    returns null instead of throwing, and the caller seeds. An app that
//    cannot read its save file must still start.
//
// 3. A SCHEMA THAT MOVES. The payload is wrapped in a versioned envelope,
//    and each field is revived individually with a default rather than
//    trusted. A file written before a field existed (`notes` and
//    `completedAt` are both younger than this example) therefore loads
//    normally instead of putting `undefined` where the UI expects a string.
//    A file from a FUTURE version is refused outright — half-reading a
//    format written by a newer build is worse than starting fresh.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Task, TaskList } from "./types"

/** Bump when the persisted shape changes incompatibly. Reviving fields
 *  individually (below) covers ADDED fields without a bump; this is for the
 *  changes that reviving cannot paper over. */
export const STORAGE_VERSION = 1

export type PersistedState = { lists: TaskList[]; tasks: Task[] }

// Resolved per call, not once at import: it keeps XDG_DATA_HOME honest for
// a process that sets it late, and it is what lets the round-trip be tested
// against a temp directory without import-order tricks.
const storageDirectory = (): string =>
  join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "dev.rngtkx.tasksnav",
  )

export const storageFile = (): string => join(storageDirectory(), "tasks.json")

const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback

const asIsoOrNull = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null

const reviveList = (value: unknown): TaskList | null => {
  if (typeof value !== "object" || value === null) {
    return null
  }
  // An entry with no id cannot be selected, added to or deleted — there is
  // no way to act on it, so it is dropped rather than half-restored.
  const id = Reflect.get(value, "id")
  if (typeof id !== "string" || id === "") {
    return null
  }
  return {
    id,
    name: asString(Reflect.get(value, "name"), "Untitled list"),
    color: asString(Reflect.get(value, "color"), "#3584e4"),
  }
}

const reviveTask = (value: unknown, index: number): Task | null => {
  if (typeof value !== "object" || value === null) {
    return null
  }
  const id = Reflect.get(value, "id")
  if (typeof id !== "string" || id === "") {
    return null
  }
  const position = Reflect.get(value, "position")
  const done = asBoolean(Reflect.get(value, "done"), false)
  return {
    id,
    title: asString(Reflect.get(value, "title"), "Untitled task"),
    listId: asString(Reflect.get(value, "listId"), ""),
    notes: asString(Reflect.get(value, "notes"), ""),
    done,
    important: asBoolean(Reflect.get(value, "important"), false),
    deleted: asBoolean(Reflect.get(value, "deleted"), false),
    due: asIsoOrNull(Reflect.get(value, "due")),
    // Falling back to the array index keeps "array order === position
    // order", the invariant every drag-reorder depends on (see store.ts).
    position:
      typeof position === "number" && Number.isFinite(position)
        ? position
        : index,
    createdAt: asString(
      Reflect.get(value, "createdAt"),
      new Date().toISOString(),
    ),
    // Only meaningful for a done task; an open one with a stray timestamp
    // would show a "Completed" row it should not have.
    completedAt: done ? asIsoOrNull(Reflect.get(value, "completedAt")) : null,
  }
}

/** Pure half of the load path — everything that can go wrong with the
 *  CONTENT of the file, with no filesystem involved, so it is testable
 *  headlessly. Returns null for anything unusable. */
export const parsePersisted = (raw: string): PersistedState | null => {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null) {
    return null
  }
  if (Reflect.get(value, "version") !== STORAGE_VERSION) {
    return null
  }
  const lists = Reflect.get(value, "lists")
  const tasks = Reflect.get(value, "tasks")
  if (!Array.isArray(lists) || !Array.isArray(tasks)) {
    return null
  }
  const revivedLists = lists
    .map(reviveList)
    .filter((list): list is TaskList => list !== null)
  // With no list there is nowhere to put a task — the "Add a task…" row
  // targets the current or first list — so this is not a document that can
  // be worked in. Seed instead.
  if (revivedLists.length === 0) {
    return null
  }
  return {
    lists: revivedLists,
    tasks: tasks.map(reviveTask).filter((task): task is Task => task !== null),
  }
}

export const serializePersisted = (state: PersistedState): string =>
  JSON.stringify({
    version: STORAGE_VERSION,
    lists: state.lists,
    tasks: state.tasks,
  })

/** The saved document, or null when there is nothing usable to restore —
 *  first run, an unreadable file, a corrupt or future-versioned one. Never
 *  throws: an app that cannot read its save file must still start. */
export const loadTasks = (): PersistedState | null => {
  try {
    return parsePersisted(readFileSync(storageFile(), "utf8"))
  } catch {
    return null
  }
}

/** Atomically replace the save file (see this file's header, point 1).
 *  Failures are logged, not thrown: a read-only home directory should cost
 *  the user persistence, not the running app. */
export const saveTasks = (state: PersistedState): void => {
  const file = storageFile()
  const temporary = `${file}.tmp`
  try {
    mkdirSync(storageDirectory(), { recursive: true })
    writeFileSync(temporary, serializePersisted(state))
    renameSync(temporary, file)
  } catch (error) {
    console.error("[tasks-nav] could not save tasks:", error)
  }
}
