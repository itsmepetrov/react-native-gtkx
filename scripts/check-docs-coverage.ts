#!/usr/bin/env node
// Docs coverage gate: every VALUE export of the public surface must be
// mentioned somewhere in docs/reference/*.md. Type-only exports are exempt.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const INDEX = join(ROOT, "packages/react-native-gtkx/src/index.ts")
const REFERENCE_DIR = join(ROOT, "docs/reference")

// Value exports: entries of `export { ... }` blocks (single- or multi-line,
// skipping `type` entries and whole `export type { ... }` blocks, honoring
// `X as Y` renames) plus `export const` declarations.
const emit = (raw: string, out: string[]): void => {
  const entry = raw.replace(/,$/, "").trim()
  if (entry === "" || entry.startsWith("type ") || entry.startsWith("}")) {
    return
  }
  out.push(entry.replace(/.* as /, ""))
}

const extractValueExportNames = (source: string): string[] => {
  const names: string[] = []
  let skiptype = false
  let inblock = false
  for (const line of source.split("\n")) {
    if (/^export const [A-Za-z_]/.test(line)) {
      const name = line.trim().split(/\s+/)[2]
      if (name) {
        names.push(name)
      }
      continue
    }
    if (/^export type \{/.test(line)) {
      skiptype = true
    }
    if (skiptype) {
      if (line.includes("}")) {
        skiptype = false
      }
      continue
    }
    if (/^export \{/.test(line)) {
      let rest = line.replace(/^export \{/, "")
      if (rest.includes("}")) {
        rest = rest.replace(/\}.*/, "")
        for (const part of rest.split(",")) {
          emit(part, names)
        }
      } else {
        inblock = true
      }
      continue
    }
    if (inblock) {
      if (/^\}/.test(line)) {
        inblock = false
        continue
      }
      emit(line, names)
    }
  }
  return names
}

const index = readFileSync(INDEX, "utf8")
const names = [...new Set(extractValueExportNames(index))].sort()

// The Reference is a set of files now, not one — docs/reference/*.md,
// concatenated. Every one of the portable exports above must show up
// (backtick-quoted) SOMEWHERE in that set; which specific page carries it
// does not matter to this gate, only that the surface is documented at all.
const referenceFiles = readdirSync(REFERENCE_DIR).filter((file) =>
  file.endsWith(".md"),
)
if (referenceFiles.length === 0) {
  console.error(`No .md files found under ${REFERENCE_DIR}`)
  process.exit(1)
}
const doc = referenceFiles
  .map((file) => readFileSync(join(REFERENCE_DIR, file), "utf8"))
  .join("\n")

const missing = names.filter((name) => !doc.includes(`\`${name}\``))

if (missing.length > 0) {
  console.error(
    "Undocumented public exports (add them to a docs/reference/*.md page):",
  )
  for (const name of missing) {
    console.error(`  - ${name}`)
  }
  process.exit(1)
}
console.log(
  `docs coverage OK: ${names.length} public exports documented across ${referenceFiles.length} reference pages`,
)
