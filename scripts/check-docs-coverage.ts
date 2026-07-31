#!/usr/bin/env node
// Docs coverage gate: every VALUE export of the public surface must be
// mentioned in docs/api.md. Type-only exports are exempt.
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const INDEX = join(ROOT, "packages/react-native-gtkx/src/index.ts")
const DOC = join(ROOT, "docs/api.md")

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

const doc = readFileSync(DOC, "utf8")
const missing = names.filter((name) => !doc.includes(`\`${name}\``))

if (missing.length > 0) {
  console.error("Undocumented public exports (add them to docs/api.md):")
  for (const name of missing) {
    console.error(`  - ${name}`)
  }
  process.exit(1)
}
console.log(`docs coverage OK: ${names.length} public exports documented`)
