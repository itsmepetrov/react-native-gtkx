#!/usr/bin/env node
// Generates packages/react-native-gtkx/src/mcp/data/generated.ts — the
// structured facts the MCP server (react-native-gtkx-mcp) answers from.
//
// Pure Node: no @gtkx/gi / @gtkx/jsx imports, so this runs on any OS
// without the VM or the codegen store — unlike
// scripts/generate-widget-surface.ts, which classifies widgets against
// real GTK prototype chains and therefore must run on Linux. This script
// only reads that classification's committed OUTPUT
// (scripts/widget-surface/classification.json) plus a handful of markdown
// tables/sections from docs/.
//
// Sources of truth, in order of trust:
//   1. scripts/widget-surface/classification.json — generated on the VM,
//      committed, always current with what react-native-gtkx/gtk and
//      react-native-gtkx/adw actually export. docs/architecture/overview.md's
//      own prose widget list is NOT this: it names a handful by hand where
//      classification.json has 86 gtk + 46 adw wrapped — that list is
//      illustrative, not exhaustive, and untouched by any doc-coverage gate.
//   2. docs/reference/components/*.md — one page per portable component
//      (title = the export name, a `**Backed by:**` fact line, "Supported
//      props:"/"Differs from react-native:" sections) — and apis.md's `##`
//      sections (one per API module) — gated by `npm run docs:check`
//      against every value export of packages/react-native-gtkx/src/index.ts,
//      so a page/section cannot omit a portable export, even though its
//      prose content (the Supported/Differs bullets) is hand-written and
//      only as accurate as the person who last touched it.
//   3. Two real tables inside docs/architecture/ (Declarative primitives, in
//      integration.md; React Native content inside GTK slots, in
//      layout-and-styling.md) — not gated by anything, but small, stable,
//      and the only place NavigationStack/SlotContent/IntrinsicContent are
//      documented at all.
//   4. Full sections (by ## / ### heading) of every docs/reference/*.md
//      page (apis.md's own `##` entries are picked up this way too),
//      docs/guide/*.md, docs/getting-started.md (a pointer stub since
//      the docs-site Guide rewrite — kept in the list because it's still a
//      valid, if now tiny, input), docs/gtkx-1.0-notes.md,
//      docs/research/navigation-extensibility.md and every
//      docs/architecture/*.md page, plus a few
//      individually-chunked entries (one per component page, the
//      gtkx-1.0-notes live-workaround rows) — a full-text search corpus
//      for rn_gtkx_search_docs, the fallback tool for anything the
//      structured records above do not cover (e.g. "what's known-broken",
//      which has no stable per-component key — 1.0-WORKAROUND rows are
//      named by mechanism, not by widget).
//
// Regenerate after touching any of the docs above or after
// classification.json changes:
//   node scripts/generate-mcp-data.mjs
// Check that the committed file is still in sync (no write, just a diff):
//   node scripts/generate-mcp-data.mjs --check
import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

const REFERENCE_DIR = join(ROOT, "docs/reference")
const COMPONENTS_DIR = join(REFERENCE_DIR, "components")
// One page per portable component, in the same core → inputs → lists →
// overlays reading order the sidebar uses. `index.md` (the category
// overview) is deliberately not in this list — it carries no component of
// its own.
const COMPONENT_FILES = [
  "view.md",
  "text.md",
  "image.md",
  "safe-area-view.md",
  "status-bar.md",
  "activity-indicator.md",
  "root.md",
  "nested-root.md",
  "intrinsic-root.md",
  "text-input.md",
  "switch.md",
  "pressable.md",
  "touchable-opacity.md",
  "touchable-highlight.md",
  "touchable-without-feedback.md",
  "scroll-view.md",
  "flat-list.md",
  "section-list.md",
  "virtualized-list.md",
  "modal.md",
]
const API_MODULES_FILE = "apis.md"
const ARCH_OVERVIEW_MD = join(ROOT, "docs/architecture/overview.md")
const ARCH_LAYOUT_MD = join(ROOT, "docs/architecture/layout-and-styling.md")
const ARCH_INTEGRATION_MD = join(ROOT, "docs/architecture/integration.md")
const ARCH_GESTURES_MD = join(ROOT, "docs/architecture/gestures.md")
const ARCH_GLOSSARY_MD = join(ROOT, "docs/architecture/glossary.md")
const GETTING_STARTED_MD = join(ROOT, "docs/getting-started.md")
const GTKX_NOTES_MD = join(ROOT, "docs/gtkx-1.0-notes.md")
const NAV_EXT_MD = join(ROOT, "docs/research/navigation-extensibility.md")
// The Guide (docs/guide/*.md) is where docs/getting-started.md's content
// actually lives now — see that file's own header comment.
const GUIDE_MD_FILES = [
  "docs/guide/installation.md",
  "docs/guide/first-app.md",
  "docs/guide/toolchains.md",
  "docs/guide/plain-gtk.md",
  "docs/guide/packaging.md",
].map((path) => join(ROOT, path))
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

// docs-site task 005's own `**Profile:** GTK|Adw[(fallback: ...)]` fact
// line (apis.md's `##` sections carry it standalone) — internal
// docs-authoring markup, not page content; excluded from both the search
// corpus below and parseApiSection's fields so it never leaks into a
// generated record.
const PROFILE_LINE_RE = /^\*\*Profile:\*\*/

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
      if (PROFILE_LINE_RE.test(line.trim())) {
        continue
      }
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

/**
 * Pulls the block that follows a "Label:" marker inside a component page or
 * an apis.md `##` section. Two shapes are both real in these docs, and a
 * page may use either: the label starts an inline paragraph ("Supported
 * props: `style`, ...") that continues over following non-blank lines, or
 * the label stands alone, a blank line follows, then either a bullet list
 * (one `text` per list item, list items may themselves wrap onto
 * continuation lines) or another paragraph. Returns the joined text and the
 * line index right after the consumed block.
 */
const extractLabeledBlock = (lines, startIndex, label) => {
  const m = new RegExp(`^${label}\\s*(.*)$`).exec(lines[startIndex])
  if (!m) {
    throw new Error(`expected line ${startIndex} to start with "${label}"`)
  }
  const inline = m[1].trim()
  let i = startIndex + 1

  if (inline.length > 0) {
    const parts = [inline]
    while (i < lines.length && lines[i].trim() !== "") {
      parts.push(lines[i].trim())
      i++
    }
    return { text: parts.join(" "), nextIndex: i }
  }

  while (i < lines.length && lines[i].trim() === "") {
    i++
  }

  if (i < lines.length && /^- /.test(lines[i].trim())) {
    const bullets = []
    let current = null
    while (i < lines.length && lines[i].trim() !== "") {
      const trimmed = lines[i].trim()
      if (/^- /.test(trimmed)) {
        if (current !== null) {
          bullets.push(current.trim())
        }
        current = trimmed.replace(/^- /, "")
      } else if (current !== null) {
        current += ` ${trimmed}`
      }
      i++
    }
    if (current !== null) {
      bullets.push(current.trim())
    }
    return { text: bullets.join(" "), nextIndex: i }
  }

  const parts = []
  while (i < lines.length && lines[i].trim() !== "") {
    parts.push(lines[i].trim())
    i++
  }
  return { text: parts.join(" "), nextIndex: i }
}

const SUPPORTED_LABEL_RE = /^Supported( props)?:/
const DIFFERS_LABEL_RE = /^Differs from react-native:/

/**
 * Parses one docs/reference/components/*.md page: title (H1) → name,
 * "**Backed by:**" line → gtkImplementation, the "Supported props:"/
 * "Differs from react-native:" blocks (either form `extractLabeledBlock`
 * understands) → supported/differences, defaulting each to "—" when the
 * page has no such block at all (an honest thin page — SafeAreaView,
 * StatusBar, TouchableOpacity, ...).
 *
 * docs-site task 005's `**Profile:** GTK|Adw[(fallback: ...)] · ` prefix
 * (added ahead of "**Backed by:**" rather than as its own line, since a
 * component page is otherwise three lines long) is stripped from
 * gtkImplementation — internal docs-authoring markup, not a fact about the
 * widget, so it must not leak into a generated record.
 */
const parseComponentPage = (text, docLabel) => {
  const lines = text.split("\n")

  const h1Index = lines.findIndex((l) => /^# /.test(l))
  if (h1Index === -1) {
    throw new Error(`${docLabel}: no "# Title" heading found`)
  }
  const name = lines[h1Index].replace(/^# /, "").trim()

  const backedByIndex = lines.findIndex((l) => /\*\*Backed by:\*\*/.test(l))
  if (backedByIndex === -1) {
    throw new Error(`${docLabel}: no "**Backed by:**" line found`)
  }
  const gtkImplementation = lines[backedByIndex]
    .replace(/^.*\*\*Backed by:\*\*\s*/, "")
    .trim()

  const supportedIndex = lines.findIndex((l) => SUPPORTED_LABEL_RE.test(l))
  const supported =
    supportedIndex === -1
      ? "—"
      : extractLabeledBlock(
          lines,
          supportedIndex,
          lines[supportedIndex].match(SUPPORTED_LABEL_RE)[0],
        ).text

  const differsIndex = lines.findIndex((l) => DIFFERS_LABEL_RE.test(l))
  const differences =
    differsIndex === -1
      ? "—"
      : extractLabeledBlock(lines, differsIndex, "Differs from react-native:")
          .text

  return { name, gtkImplementation, supported, differences }
}

/**
 * Parses one `##` section of apis.md into a PortableRecord's fields. Most
 * sections carry an explicit "Supported:" line; the two sections that are
 * also full prose write-ups (`Animated`, merged with its detailed surface
 * below the API-modules row it used to be) carry no such marker — for
 * those, everything before "Differs from react-native:" (or the whole
 * section, if it has none) doubles as `supported`, which is not a loss of
 * information: the full write-up is strictly more informative than the
 * table row it replaces.
 *
 * Every section here carries its own docs-site task 005 `**Profile:**
 * ...` line, standalone, right after the heading — stripped up front so it
 * never becomes part of `supported` for a section with no "Supported:"
 * label (Animated), the one shape where it would otherwise be swept into
 * the "everything before Differs" fallback below.
 */
const parseApiSection = (heading, text, docLabel) => {
  const lines = text.split("\n").filter((l) => !PROFILE_LINE_RE.test(l.trim()))
  const differsIndex = lines.findIndex((l) => DIFFERS_LABEL_RE.test(l))
  const supportedIndex = lines.findIndex((l) => SUPPORTED_LABEL_RE.test(l))

  let supported
  if (supportedIndex !== -1) {
    supported = extractLabeledBlock(lines, supportedIndex, "Supported:").text
  } else {
    const end = differsIndex === -1 ? lines.length : differsIndex
    supported = lines
      .slice(0, end)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join(" ")
    if (supported.length === 0) {
      throw new Error(`${docLabel}: "## ${heading}" has no supported content`)
    }
  }

  const differences =
    differsIndex === -1
      ? "—"
      : extractLabeledBlock(lines, differsIndex, "Differs from react-native:")
          .text

  return { name: heading, supported, differences }
}

// ---------------------------------------------------------------------------
// 1. Portable surface (docs/reference/) — one page per component under
//    components/ + apis.md's `##` sections.
// ---------------------------------------------------------------------------

const referenceFileNames = readdirSync(REFERENCE_DIR)
  .filter((file) => file.endsWith(".md"))
  .sort()
const referenceTexts = new Map(
  referenceFileNames.map((file) => [
    file,
    readFileSync(join(REFERENCE_DIR, file), "utf8"),
  ]),
)

// Components carry their source file (docs/reference/components/<file>)
// alongside the parsed fields — PortableRecord itself has no `doc` field
// (kept identical to what packages/react-native-gtkx/src/mcp/resolve.ts
// already expects), but the per-page search-corpus chunks below need to
// point at the right page.
const portableComponentRows = COMPONENT_FILES.map((file) => {
  const docLabel = `docs/reference/components/${file}`
  const path = join(COMPONENTS_DIR, file)
  if (!existsSync(path)) {
    throw new Error(`${docLabel}: expected file not found`)
  }
  const text = readFileSync(path, "utf8")
  const { name, gtkImplementation, supported, differences } =
    parseComponentPage(text, docLabel)
  return {
    name,
    subpath: "react-native",
    gtkImplementation,
    supported,
    differences,
    doc: docLabel,
  }
})

const portableComponents = portableComponentRows.map(
  ({ name, subpath, gtkImplementation, supported, differences }) => ({
    name,
    subpath,
    gtkImplementation,
    supported,
    differences,
  }),
)

const apiModulesDocLabel = `docs/reference/${API_MODULES_FILE}`
const apiModulesText = referenceTexts.get(API_MODULES_FILE)
if (apiModulesText === undefined) {
  throw new Error(
    `${apiModulesDocLabel}: expected file not found under ${REFERENCE_DIR}`,
  )
}
const apiModulesSections = parseSections(apiModulesText, apiModulesDocLabel)
if (apiModulesSections.length === 0) {
  throw new Error(`${apiModulesDocLabel}: no "##" sections found`)
}

const portableApis = apiModulesSections.map(({ heading, text }) => {
  const { name, supported, differences } = parseApiSection(
    heading,
    text,
    apiModulesDocLabel,
  )
  return {
    name: stripBacktickSpan(name),
    subpath: "react-native",
    supported,
    differences,
  }
})

// ---------------------------------------------------------------------------
// 2. Common subpath (docs/architecture/) — the two real tables.
// ---------------------------------------------------------------------------

const archIntegrationText = readFileSync(ARCH_INTEGRATION_MD, "utf8")
const archLayoutText = readFileSync(ARCH_LAYOUT_MD, "utf8")

const declarativeTable = parseTableAfterHeading(
  archIntegrationText,
  "### Declarative primitives",
  "docs/architecture/integration.md",
)
assertColumnCount(
  declarativeTable,
  2,
  "docs/architecture/integration.md",
  "### Declarative primitives",
)

const slotTable = parseTableAfterHeading(
  archLayoutText,
  "### React Native content inside GTK slots",
  "docs/architecture/layout-and-styling.md",
)
assertColumnCount(
  slotTable,
  3,
  "docs/architecture/layout-and-styling.md",
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
//    in docs/architecture/overview.md (see the file header comment above).
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

const gtkxNotesText = readFileSync(GTKX_NOTES_MD, "utf8")
const gettingStartedText = readFileSync(GETTING_STARTED_MD, "utf8")
const navExtText = readFileSync(NAV_EXT_MD, "utf8")
const archOverviewText = readFileSync(ARCH_OVERVIEW_MD, "utf8")
const archGesturesText = readFileSync(ARCH_GESTURES_MD, "utf8")
const archGlossaryText = readFileSync(ARCH_GLOSSARY_MD, "utf8")
const guideChunks = GUIDE_MD_FILES.flatMap((path) =>
  parseSections(
    readFileSync(path, "utf8"),
    `docs/guide/${path.split("/").at(-1)}`,
  ),
)

const workaroundsTable = parseTableAfterHeading(
  gtkxNotesText,
  "## Live workarounds",
  "docs/gtkx-1.0-notes.md",
)
assertColumnCount(
  workaroundsTable,
  4,
  "docs/gtkx-1.0-notes.md",
  "## Live workarounds",
)

const workaroundChunks = workaroundsTable.rows.map(
  ([name, whatGtkxDoes, ourWorkaround, removalCondition]) => ({
    doc: "docs/gtkx-1.0-notes.md",
    heading: `1.0-WORKAROUND(${stripBacktickSpan(name)})`,
    text: `${whatGtkxDoes} — our workaround: ${ourWorkaround} — removed when: ${removalCondition}`,
  }),
)

// Component pages are titled with an H1 (`# View`), not `##`/`###`, so
// parseSections (below) never sees them — one dedicated chunk per page
// covers the gap. apis.md needs no such treatment: its `##` sections are
// already full prose write-ups, picked up by parseSections like any other
// reference page's sections (see referenceSectionChunks), so there is no
// separate apiModuleRowChunks anymore — the full section text is strictly
// more informative than a one-line summary would be.
const componentRowChunks = portableComponentRows.map((c) => ({
  doc: c.doc,
  heading: c.name,
  text: `${c.name} — GTK implementation: ${c.gtkImplementation}. Supported: ${c.supported}. Differences from RN: ${c.differences}`,
}))

const componentsIndexDocLabel = "docs/reference/components/index.md"
const componentsIndexChunks = parseSections(
  readFileSync(join(COMPONENTS_DIR, "index.md"), "utf8"),
  componentsIndexDocLabel,
)

const referenceSectionChunks = referenceFileNames.flatMap((file) =>
  parseSections(referenceTexts.get(file), `docs/reference/${file}`),
)

const docChunks = [
  ...referenceSectionChunks,
  ...componentsIndexChunks,
  ...parseSections(archOverviewText, "docs/architecture/overview.md"),
  ...parseSections(archLayoutText, "docs/architecture/layout-and-styling.md"),
  ...parseSections(archIntegrationText, "docs/architecture/integration.md"),
  ...parseSections(archGesturesText, "docs/architecture/gestures.md"),
  ...parseSections(archGlossaryText, "docs/architecture/glossary.md"),
  ...guideChunks,
  ...parseSections(gettingStartedText, "docs/getting-started.md"),
  ...parseSections(gtkxNotesText, "docs/gtkx-1.0-notes.md"),
  ...parseSections(navExtText, "docs/research/navigation-extensibility.md"),
  ...workaroundChunks,
  ...componentRowChunks,
]

// ---------------------------------------------------------------------------
// 5. Emit.
// ---------------------------------------------------------------------------

const HEADER = `// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-mcp-data.mjs from docs/reference/*.md
// (including docs/reference/components/*.md, one page per component),
// docs/architecture/*.md, docs/guide/*.md, docs/gtkx-1.0-notes.md,
// docs/getting-started.md,
// docs/research/navigation-extensibility.md and
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
