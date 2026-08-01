#!/usr/bin/env node
// Generates packages/react-native-gtkx/src/mcp/data/generated.ts — the
// structured facts the MCP server (react-native-gtkx-mcp) answers from.
//
// Pure Node: no @gtkx/gi / @gtkx/jsx imports, so this runs on any OS
// without the VM or the codegen store — unlike
// scripts/generate-widget-surface.mjs, which classifies widgets against
// real GTK prototype chains and therefore must run on Linux. This script
// only reads that classification's committed OUTPUT
// (scripts/widget-surface/classification.json) plus a handful of markdown
// tables/sections from docs/.
//
// Sources of truth, in order of trust:
//   1. scripts/widget-surface/classification.json — generated on the VM,
//      committed, always current with what react-native-gtkx/gtk and
//      react-native-gtkx/adw actually export. docs/platform-layer.md's own
//      prose widget list is NOT this: it names 10 widgets by hand where
//      classification.json has 87 gtk + 46 adw — that list is illustrative,
//      not exhaustive, and untouched by any doc-coverage gate.
//   2. docs/api.md's Components and API modules tables — gated by
//      `npm run docs:check` against every value export of
//      packages/react-native-gtkx/src/index.ts, so these rows cannot omit a
//      portable export, even though their prose content (the Supported/
//      Differences columns) is hand-written and only as accurate as the
//      person who last touched it.
//   3. docs/platform-layer.md's two real tables (Declarative primitives;
//      React Native content inside GTK slots) — not gated by anything, but
//      small, stable, and the only place NavigationStack/SlotContent/
//      IntrinsicContent are documented at all.
//   4. Full sections (by ## / ### heading) of docs/getting-started.md,
//      docs/gestures.md, docs/gtkx-rc3-notes.md,
//      docs/research/navigation-extensibility.md and
//      docs/api.md/docs/platform-layer.md themselves, plus a few
//      individually-chunked table rows (component rows, API module rows,
//      the gtkx-rc3-notes live-workaround rows) — a full-text search corpus
//      for rn_gtkx_search_docs, the fallback tool for anything the
//      structured records above do not cover (e.g. "what's known-broken",
//      which has no stable per-component key — RC2-WORKAROUND rows are
//      named by mechanism, not by widget).
//
// Regenerate after touching any of the docs above or after
// classification.json changes:
//   node scripts/generate-mcp-data.mjs
// Check that the committed file is still in sync (no write, just a diff):
//   node scripts/generate-mcp-data.mjs --check
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

const API_MD = join(ROOT, "docs/api.md")
const PLATFORM_MD = join(ROOT, "docs/platform-layer.md")
const GETTING_STARTED_MD = join(ROOT, "docs/getting-started.md")
const RC3_NOTES_MD = join(ROOT, "docs/gtkx-rc3-notes.md")
const NAV_EXT_MD = join(ROOT, "docs/research/navigation-extensibility.md")
const GESTURES_MD = join(ROOT, "docs/gestures.md")
const CLASSIFICATION_JSON = join(
  ROOT,
  "scripts/widget-surface/classification.json",
)
const OUTPUT = join(
  ROOT,
  "packages/react-native-gtkx/src/mcp/data/generated.ts",
)

// ---------------------------------------------------------------------------
// Markdown table parsing — deliberately simple (this repo's own docs, fixed
// GFM shape) rather than a general parser. Fails loudly on a shape it does
// not recognize instead of silently emitting a truncated table.
// ---------------------------------------------------------------------------

const stripBacktickSpan = (cell) => {
  const trimmed = cell.trim()
  const m = /^`([^`]+)`$/.exec(trimmed)
  return m ? m[1] : trimmed
}

const splitRow = (line) => {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  return body.split("|").map((c) => c.trim())
}

const isTableRow = (line) => line.trim().startsWith("|")
const isSeparatorRow = (line) =>
  isTableRow(line) && /^[\s|:-]+$/.test(line.trim())

/**
 * Finds an exact heading line, then the first markdown table under it
 * (header row + separator row + data rows), and returns the parsed cells.
 * Throws if the heading is missing or no table immediately follows it
 * (before the next heading) — a doc reshuffle should break this loudly,
 * not silently ship stale/empty data.
 */
const parseTableAfterHeading = (text, headingText, docLabel) => {
  const lines = text.split("\n")
  const headingIndex = lines.findIndex((l) => l.trim() === headingText)
  if (headingIndex === -1) {
    throw new Error(`${docLabel}: heading "${headingText}" not found`)
  }
  let i = headingIndex + 1
  while (i < lines.length && !isTableRow(lines[i])) {
    if (lines[i].trim().startsWith("#")) {
      throw new Error(`${docLabel}: no table found under "${headingText}"`)
    }
    i++
  }
  if (i >= lines.length) {
    throw new Error(`${docLabel}: no table found under "${headingText}"`)
  }
  const headers = splitRow(lines[i])
  i++
  if (i >= lines.length || !isSeparatorRow(lines[i])) {
    throw new Error(
      `${docLabel}: expected a table separator row after the header under "${headingText}"`,
    )
  }
  i++
  const rows = []
  while (i < lines.length && isTableRow(lines[i])) {
    rows.push(splitRow(lines[i]))
    i++
  }
  return { headers, rows }
}

const assertColumnCount = (table, expected, docLabel, headingText) => {
  if (table.headers.length !== expected) {
    throw new Error(
      `${docLabel}: table under "${headingText}" has ${table.headers.length} columns, expected ${expected} (headers: ${table.headers.join(" | ")})`,
    )
  }
}

/** Splits a doc into sections by ## / ### headings, heading text included. */
const parseSections = (text, doc) => {
  const lines = text.split("\n")
  const sections = []
  let current = null
  for (const line of lines) {
    const m = /^(#{2,3})\s+(.*)$/.exec(line)
    if (m) {
      if (current) {
        sections.push(current)
      }
      current = { doc, heading: m[2].trim(), text: "" }
    } else if (current) {
      current.text += line + "\n"
    }
  }
  if (current) {
    sections.push(current)
  }
  return sections
    .map((s) => ({ ...s, text: s.text.trim() }))
    .filter((s) => s.text.length > 0)
}

// ---------------------------------------------------------------------------
// 1. Portable surface (docs/api.md) — Components + API modules tables.
// ---------------------------------------------------------------------------

const apiMdText = readFileSync(API_MD, "utf8")

const componentsTable = parseTableAfterHeading(
  apiMdText,
  "## Components",
  "docs/api.md",
)
assertColumnCount(componentsTable, 4, "docs/api.md", "## Components")

const portableComponents = componentsTable.rows.map(
  ([name, gtkImplementation, supported, differences]) => ({
    name: stripBacktickSpan(name),
    subpath: "react-native",
    gtkImplementation,
    supported,
    differences,
  }),
)

const apiModulesTable = parseTableAfterHeading(
  apiMdText,
  "## API modules",
  "docs/api.md",
)
assertColumnCount(apiModulesTable, 3, "docs/api.md", "## API modules")

const portableApis = apiModulesTable.rows.map(
  ([name, supported, differences]) => ({
    name: stripBacktickSpan(name),
    subpath: "react-native",
    supported,
    differences,
  }),
)

// ---------------------------------------------------------------------------
// 2. Common subpath (docs/platform-layer.md) — the two real tables.
// ---------------------------------------------------------------------------

const platformMdText = readFileSync(PLATFORM_MD, "utf8")

const declarativeTable = parseTableAfterHeading(
  platformMdText,
  "### Declarative primitives",
  "docs/platform-layer.md",
)
assertColumnCount(
  declarativeTable,
  2,
  "docs/platform-layer.md",
  "### Declarative primitives",
)

const slotTable = parseTableAfterHeading(
  platformMdText,
  "### React Native content inside GTK slots",
  "docs/platform-layer.md",
)
assertColumnCount(
  slotTable,
  3,
  "docs/platform-layer.md",
  "### React Native content inside GTK slots",
)

const commonPrimitives = [
  ...declarativeTable.rows.map(([name, whatItIs]) => ({
    name: stripBacktickSpan(name),
    subpath: "react-native-gtkx/common",
    summary: whatItIs,
  })),
  ...slotTable.rows.map(([name, sizing, useFor]) => ({
    name: stripBacktickSpan(name),
    subpath: "react-native-gtkx/common",
    summary: `Sizing: ${sizing}. Use for: ${useFor}.`,
  })),
]

// ---------------------------------------------------------------------------
// 3. gtk/adw widget surface (scripts/widget-surface/classification.json) —
//    the generated, always-current source; NOT the illustrative prose list
//    in docs/platform-layer.md (see the file header comment above).
// ---------------------------------------------------------------------------

const classification = JSON.parse(readFileSync(CLASSIFICATION_JSON, "utf8"))

const widgetRecords = (bucket, subpath) => [
  ...bucket.wrapped.map((name) => ({ name, subpath, wrapped: true })),
  ...bucket.raw.map(({ name, reason }) => ({
    name,
    subpath,
    wrapped: false,
    reason,
  })),
]

const gtkWidgets = widgetRecords(classification.gtk, "react-native-gtkx/gtk")
const adwWidgets = widgetRecords(classification.adw, "react-native-gtkx/adw")

// ---------------------------------------------------------------------------
// 4. Full-text search corpus — sections of every doc, plus fine-grained
//    per-row chunks so a specific fact (one FlatList quirk, one workaround)
//    ranks even when it is a single row inside a large table.
// ---------------------------------------------------------------------------

const rc3NotesText = readFileSync(RC3_NOTES_MD, "utf8")
const gettingStartedText = readFileSync(GETTING_STARTED_MD, "utf8")
const navExtText = readFileSync(NAV_EXT_MD, "utf8")
const gesturesText = readFileSync(GESTURES_MD, "utf8")

const workaroundsTable = parseTableAfterHeading(
  rc3NotesText,
  "## Live workarounds",
  "docs/gtkx-rc3-notes.md",
)
assertColumnCount(
  workaroundsTable,
  4,
  "docs/gtkx-rc3-notes.md",
  "## Live workarounds",
)

const workaroundChunks = workaroundsTable.rows.map(
  ([name, whatGtkxDoes, ourWorkaround, removalCondition]) => ({
    doc: "docs/gtkx-rc3-notes.md",
    heading: `RC3-WORKAROUND(${stripBacktickSpan(name)})`,
    text: `${whatGtkxDoes} — our workaround: ${ourWorkaround} — removed when: ${removalCondition}`,
  }),
)

const componentRowChunks = portableComponents.map((c) => ({
  doc: "docs/api.md",
  heading: c.name,
  text: `${c.name} — GTK implementation: ${c.gtkImplementation}. Supported: ${c.supported}. Differences from RN: ${c.differences}`,
}))

const apiModuleRowChunks = portableApis.map((a) => ({
  doc: "docs/api.md",
  heading: a.name,
  text: `${a.name} — Supported: ${a.supported}. Differences: ${a.differences}`,
}))

const docChunks = [
  ...parseSections(apiMdText, "docs/api.md"),
  ...parseSections(platformMdText, "docs/platform-layer.md"),
  ...parseSections(gettingStartedText, "docs/getting-started.md"),
  ...parseSections(rc3NotesText, "docs/gtkx-rc3-notes.md"),
  ...parseSections(navExtText, "docs/research/navigation-extensibility.md"),
  ...parseSections(gesturesText, "docs/gestures.md"),
  ...workaroundChunks,
  ...componentRowChunks,
  ...apiModuleRowChunks,
]

// ---------------------------------------------------------------------------
// 5. Emit.
// ---------------------------------------------------------------------------

const HEADER = `// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-mcp-data.mjs from docs/api.md,
// docs/platform-layer.md, docs/gtkx-rc3-notes.md, docs/getting-started.md,
// docs/gestures.md, docs/research/navigation-extensibility.md and
// scripts/widget-surface/classification.json.
//
// Regenerate after touching any of those:
//   node scripts/generate-mcp-data.mjs
// Check without writing (used in verification):
//   node scripts/generate-mcp-data.mjs --check
`

const emit = () => {
  const body = `${HEADER}
export type PortableRecord = {
  readonly name: string
  readonly subpath: "react-native"
  readonly gtkImplementation?: string
  readonly supported: string
  readonly differences: string
}

export type CommonRecord = {
  readonly name: string
  readonly subpath: "react-native-gtkx/common"
  readonly summary: string
}

export type WidgetRecord = {
  readonly name: string
  readonly subpath: "react-native-gtkx/gtk" | "react-native-gtkx/adw"
  readonly wrapped: boolean
  readonly reason?: string
}

export type DocChunk = {
  readonly doc: string
  readonly heading: string
  readonly text: string
}

export const PORTABLE_COMPONENTS = ${JSON.stringify(portableComponents)} as const satisfies readonly PortableRecord[]

export const PORTABLE_APIS = ${JSON.stringify(portableApis)} as const satisfies readonly PortableRecord[]

export const COMMON_PRIMITIVES = ${JSON.stringify(commonPrimitives)} as const satisfies readonly CommonRecord[]

export const GTK_WIDGETS = ${JSON.stringify(gtkWidgets)} as const satisfies readonly WidgetRecord[]

export const ADW_WIDGETS = ${JSON.stringify(adwWidgets)} as const satisfies readonly WidgetRecord[]

export const DOC_CHUNKS = ${JSON.stringify(docChunks)} as const satisfies readonly DocChunk[]
`
  return body
}

const formatWithPrettier = (path) => {
  // --config explicit: the --check temp file lives outside the repo tree
  // (so .prettierignore's node_modules/ rule cannot exclude it), which
  // means prettier's own upward config discovery would not find ours
  // either — pass it explicitly so both the real write and the check
  // format identically.
  execFileSync(
    "npx",
    ["prettier", "--config", join(ROOT, ".prettierrc"), "--write", path],
    { cwd: ROOT, stdio: "inherit" },
  )
}

const checkMode = process.argv.includes("--check")

if (checkMode) {
  if (!existsSync(OUTPUT)) {
    console.error(`FATAL: ${OUTPUT} does not exist. Run without --check first.`)
    process.exit(1)
  }
  // Outside node_modules/ and outside the repo tree — .prettierignore
  // excludes node_modules, and prettier's own config discovery should not
  // pick up anything repo-specific for a plain formatting pass.
  const tmp = join(
    mkdtempSync(join(tmpdir(), "mcp-data-check-")),
    "generated.ts",
  )
  writeFileSync(tmp, emit())
  formatWithPrettier(tmp)
  const generated = readFileSync(tmp, "utf8")
  const committed = readFileSync(OUTPUT, "utf8")
  if (generated !== committed) {
    console.error(
      "STALE: packages/react-native-gtkx/src/mcp/data/generated.ts does not " +
        "match what scripts/generate-mcp-data.mjs would produce from the " +
        "current docs/classification.json. Run `node scripts/generate-mcp-data.mjs` " +
        "and commit the result.",
    )
    process.exit(1)
  }
  console.log("OK: generated.ts is up to date.")
  process.exit(0)
}

writeFileSync(OUTPUT, emit())
formatWithPrettier(OUTPUT)
console.log(`Wrote ${OUTPUT}`)
console.log(
  `  portable components: ${portableComponents.length}, portable apis: ${portableApis.length}, ` +
    `common: ${commonPrimitives.length}`,
)
console.log(
  `  gtk widgets: ${classification.gtk.wrapped.length} wrapped + ${classification.gtk.raw.length} raw, ` +
    `adw widgets: ${classification.adw.wrapped.length} wrapped + ${classification.adw.raw.length} raw`,
)
console.log(`  doc chunks: ${docChunks.length}`)
