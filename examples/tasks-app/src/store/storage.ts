// Persistence to $XDG_DATA_HOME with the Node.js standard library — ported
// from the gtkx tutorial (examples/tutorial/src/store/storage.ts). This is
// plain Node, not gtkx: "native modules" on this platform are just Node, so
// there is nothing to port beyond renaming the app's own data directory.
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const directory = join(
  process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
  "dev.rngtkx.tasks",
)
const file = join(directory, "tasks.json")

export const fileStorage = {
  getItem: (): string | null => {
    try {
      return readFileSync(file, "utf8")
    } catch {
      return null
    }
  },
  setItem: (_name: string, value: string): void => {
    mkdirSync(directory, { recursive: true })
    writeFileSync(`${file}.tmp`, value)
    renameSync(`${file}.tmp`, file)
  },
  removeItem: (): void => rmSync(file, { force: true }),
}
