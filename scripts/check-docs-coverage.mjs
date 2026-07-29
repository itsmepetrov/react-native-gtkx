// Docs coverage gate (task 010 AC): every VALUE export of the public surface
// must be mentioned in docs/api.md. Type-only exports are exempt.
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const indexSource = readFileSync(
  join(root, "packages/react-native-gtkx/src/index.ts"),
  "utf8",
)
const apiDoc = readFileSync(join(root, "docs/api.md"), "utf8")

const names = new Set()
for (const block of indexSource.matchAll(/export\s*\{([^}]*)\}/gs)) {
  for (const raw of block[1].split(",")) {
    const entry = raw.trim()
    if (!entry || entry.startsWith("type ")) {
      continue
    }
    const name = (entry.split(" as ").pop() ?? entry).trim()
    if (name) {
      names.add(name)
    }
  }
}
for (const named of indexSource.matchAll(/export\s+const\s+(\w+)/g)) {
  names.add(named[1])
}

const missing = [...names].filter((name) => !apiDoc.includes(`\`${name}\``))
if (missing.length > 0) {
  console.error("Undocumented public exports (add them to docs/api.md):")
  for (const name of missing) {
    console.error(`  - ${name}`)
  }
  process.exit(1)
}
console.log(`docs coverage OK: ${names.size} public exports documented`)
