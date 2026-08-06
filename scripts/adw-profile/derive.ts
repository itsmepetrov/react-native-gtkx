#!/usr/bin/env node
// The code-derived GTK/Adw capability matrix — docs-site epic task 005.
//
// Walks packages/react-native-gtkx/src from the public entry points and
// answers, per documented surface, whether it ever reaches
// src/gtkx/bridge/adw.ts (the eslint-enforced single Adw door — see
// .claude/epics/adw-optional/001.md): "gtk" (never), "probe-guarded"
// (behind an `adwAvailable()` check — a plain-GTK fallback exists), or
// "hard-adw" (unconditional — absent or refusing without Adw). The actual
// walk/interpreter lives in classify.ts + graph.ts, both source-tree
// agnostic (classify.test.ts exercises them over a small in-memory
// fixture); this file is the one real-repo-specific piece: which files are
// the door, and which documented name maps to which export.
//
// Two shapes, matching what docs/reference/*.md declares (see
// declarations.ts): the 42 exports docs:check already knows about (every
// component and API, reached from src/index.ts — the SAME public surface,
// not a separate list) get a per-entry verdict; the five subpath modules
// with their own page (navigation, svg, dnd, gesture-handler,
// reanimated-compat — NOT gated by docs:check's export coverage, see
// #143's note that this task does not expand that gate) get ONE verdict
// for their whole public surface.
//
// Run directly (`node scripts/adw-profile/derive.ts`) to print the matrix;
// import `deriveAdwProfiles` to use the result programmatically (the
// docs:check wiring lands once the Reference restructure this depends on
// has merged — see .claude/epics/docs-site/005-notes.md).
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  classifyEntryModule,
  classifyExport,
  listValueExportNames,
} from "./classify.ts"
import type { ClassifyResult, DoorConfig } from "./classify.ts"
import { SourceGraph } from "./graph.ts"

const ROOT = join(import.meta.dirname, "..", "..")
const SRC = join(ROOT, "packages/react-native-gtkx/src")
const src = (relative: string): string => join(SRC, relative)

const readFile = (path: string): string | undefined => {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

export const REAL_DOOR_CONFIG: DoorConfig = {
  // The one module allowed to import @gtkx/gi/adw and @gtkx/jsx/adw
  // unconditionally-but-behind-a-probe (see the file's own header).
  doorModules: [src("gtkx/bridge/adw.ts")],
  probeExportName: "adwAvailable",
  // Calling one of these without a guard in front is what makes a path
  // hard: each either throws when Adw is absent (requireAdwGi/requireAdwJsx)
  // or reads AdwStyleManager directly (colorScheme/styleManager).
  gatedExportNames: [
    "requireAdwGi",
    "requireAdwJsx",
    "colorScheme",
    "styleManager",
  ],
  // Eager, module-scope imports of the real @gtkx/gi/adw namespace and the
  // generated raw Adwaita widgets — reached only from react-native-gtkx/adw
  // (src/adw/*), never probed, always hard.
  eagerModules: [
    src("gtkx/bridge/adw-namespace.ts"),
    src("gtkx/bridge/widgets.generated.adw.ts"),
  ],
}

// The public entry point docs:check itself reads exports from — walking
// every one of its (42, at last count) value exports from here is exactly
// the surface Reference documents, component or API alike, wherever its
// own module actually lives.
const MAIN_ENTRY = src("index.ts")

// The subpath modules with their OWN reference page (docs/reference/*.md),
// badged at PAGE level — see this task's notes on #143's export-coverage
// scope. Extensions matter: navigation and the two *-compat subpaths that
// use JSX are .tsx.
const SUBPATH_PAGES: Readonly<Record<string, string>> = {
  navigation: src("navigation/index.tsx"),
  svg: src("svg-compat/index.ts"),
  dnd: src("dnd/index.ts"),
  "gesture-handler": src("gesture-handler-compat/index.tsx"),
  "reanimated-compat": src("reanimated-compat/index.tsx"),
}

export type DerivedMatrix = {
  entries: Record<string, ClassifyResult>
  pages: Record<string, ClassifyResult>
}

export const deriveAdwProfiles = (): DerivedMatrix => {
  const graph = new SourceGraph(readFile)
  const mainFile = graph.parse(MAIN_ENTRY)
  if (!mainFile) {
    throw new Error(`derive-adw-profile: could not read ${MAIN_ENTRY}`)
  }
  const entries: Record<string, ClassifyResult> = {}
  for (const name of listValueExportNames(mainFile.sourceFile)) {
    entries[name] = classifyExport(graph, REAL_DOOR_CONFIG, mainFile, name)
  }
  const pages: Record<string, ClassifyResult> = {}
  for (const [page, entryFile] of Object.entries(SUBPATH_PAGES)) {
    pages[page] = classifyEntryModule(graph, REAL_DOOR_CONFIG, entryFile)
  }
  return { entries, pages }
}

const printMatrix = (matrix: DerivedMatrix): void => {
  const rows = [
    ...Object.entries(matrix.entries).map(([name, result]) => ({
      name,
      ...result,
    })),
    ...Object.entries(matrix.pages).map(([name, result]) => ({
      name: `${name} (page)`,
      ...result,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name))

  const counts = { gtk: 0, "probe-guarded": 0, "hard-adw": 0 }
  for (const row of rows) {
    counts[row.profile] += 1
  }

  for (const row of rows) {
    const label =
      row.profile === "gtk"
        ? "GTK"
        : row.profile === "hard-adw"
          ? "Adw (hard)"
          : "Adw (probe)"
    console.log(`${row.name.padEnd(28)} ${label}`)
  }
  console.log("")
  console.log(
    `${rows.length} surfaces: ${counts.gtk} GTK, ${counts["hard-adw"]} hard Adw, ` +
      `${counts["probe-guarded"]} probe-guarded`,
  )
}

// Only run the CLI body when this file is the program entry point, so
// derive.test.ts and declarations.ts can import deriveAdwProfiles/
// REAL_DOOR_CONFIG without printing anything.
if (import.meta.url === `file://${process.argv[1]}`) {
  printMatrix(deriveAdwProfiles())
}
