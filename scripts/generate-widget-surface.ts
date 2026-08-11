#!/usr/bin/env node
// Generates the full GTK + Adwaita widget surface for react-native-gtkx/gtk
// and react-native-gtkx/adw.
//
// MUST run on Linux, inside the VM (`node scripts/vm.ts run "node
// scripts/generate-widget-surface.ts"`) — it imports the real @gtkx/gi
// classes to classify widgets by their actual prototype chain, which only
// resolve where GTK itself is installed. Re-run after `npm run codegen`
// picks up a gtkx update; the script diffs against its own previous output
// and prints what changed.
//
// See scripts/widget-surface/classify.ts for the classification rules and
// .claude/epics/widget-surface/ for the research trail behind the denylist.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as Adw from "@gtkx/gi/adw"
import * as Gtk from "@gtkx/gi/gtk"
import {
  classify,
  DENYLIST,
  type ClassifyResult,
  type GObjectClass,
} from "./widget-surface/classify.ts"
import { parseComponentNames } from "./widget-surface/parse-dts.ts"

const ROOT = join(import.meta.dirname, "..")
const PKG = join(ROOT, "packages/react-native-gtkx/src")

const GTK_DTS = join(ROOT, "node_modules/.gtkx/jsx/gtk/gtk.d.ts")
const ADW_DTS = join(ROOT, "node_modules/.gtkx/jsx/adw/adw.d.ts")
const MANIFEST_PATH = join(
  import.meta.dirname,
  "widget-surface/classification.json",
)

const BRIDGE_WIDGETS = join(PKG, "gtkx/bridge/widgets.generated.ts")
// Adw's raw widgets live in their own generated file, imported only by
// gtkx/bridge/adw.ts — the seam that keeps @gtkx/jsx/adw out of
// widgets.generated.ts, which core.ts (and everything the plain-GTK profile
// touches) re-exports (see .claude/epics/adw-optional/001.md).
const BRIDGE_WIDGETS_ADW = join(PKG, "gtkx/bridge/widgets.generated.adw.ts")
const GTK_WIDGETS = join(PKG, "gtk/widgets.generated.ts")
const ADW_WIDGETS = join(PKG, "adw/widgets.generated.ts")

const GENERATED_HEADER = (
  purpose: string,
): string => `// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-widget-surface.ts. Re-run it inside the VM
// after \`npm run codegen\` picks up a gtkx update; see
// scripts/widget-surface/classification.json for the full classification
// and .claude/epics/widget-surface/ for the rules behind it.
//
// ${purpose}
`

interface RawEntry {
  name: string
  reason: string
}

interface PlatformManifest {
  wrapped: string[]
  raw: RawEntry[]
  notAWidget: string[]
}

interface Manifest {
  gtk: PlatformManifest
  adw: PlatformManifest
}

// ---------------------------------------------------------------------------
// 1. Parse what gtkx binds, classify it against the real prototype chains.
// ---------------------------------------------------------------------------
const gtkParsed = parseComponentNames(GTK_DTS)
const adwParsed = parseComponentNames(ADW_DTS)

// The generated .d.ts and the real @gtkx/gi namespaces agree at runtime (that
// is the whole premise of this script) but come from independent type
// sources with no shared structural shape — bridging them needs a cast.
const result = classify({
  Gtk: Gtk as unknown as Record<string, GObjectClass | undefined>,
  Adw: Adw as unknown as Record<string, GObjectClass | undefined>,
  gtkComponentNames: gtkParsed.components,
  adwComponentNames: adwParsed.components,
})

const unresolved = [...result.gtk, ...result.adw].filter(
  (r) => r.bucket === "unresolved",
)
if (unresolved.length > 0) {
  console.error(
    "FATAL: could not resolve a runtime class for:\n" +
      unresolved.map((r) => "  " + r.name).join("\n") +
      "\nThe jsx component name no longer maps 1:1 onto a @gtkx/gi class name — " +
      "investigate before trusting the rest of this run.",
  )
  process.exit(1)
}

const bucketOf = (
  results: ClassifyResult[],
  bucket: ClassifyResult["bucket"],
): string[] =>
  results
    .filter((r) => r.bucket === bucket)
    .map((r) => r.name)
    .sort()

const reasonOf = (
  results: ClassifyResult[],
  name: string,
): string | undefined => results.find((r) => r.name === name)?.reason

const manifest: Manifest = {
  gtk: {
    wrapped: bucketOf(result.gtk, "wrapped"),
    raw: bucketOf(result.gtk, "raw").map((name) => ({
      name,
      reason: reasonOf(result.gtk, name) ?? "",
    })),
    notAWidget: bucketOf(result.gtk, "not-a-widget"),
  },
  adw: {
    wrapped: bucketOf(result.adw, "wrapped"),
    raw: bucketOf(result.adw, "raw").map((name) => ({
      name,
      reason: reasonOf(result.adw, name) ?? "",
    })),
    notAWidget: bucketOf(result.adw, "not-a-widget"),
  },
}

// ---------------------------------------------------------------------------
// 2. Diff against the previous run, so an upgrade says what changed.
// ---------------------------------------------------------------------------
const summarizeBuckets = (m: Manifest): Map<string, string> => {
  const map = new Map<string, string>()
  for (const name of m.gtk.wrapped) {
    map.set(name, "gtk:wrapped")
  }
  for (const { name } of m.gtk.raw) {
    map.set(name, "gtk:raw")
  }
  for (const name of m.gtk.notAWidget) {
    map.set(name, "gtk:not-a-widget")
  }
  for (const name of m.adw.wrapped) {
    map.set(name, "adw:wrapped")
  }
  for (const { name } of m.adw.raw) {
    map.set(name, "adw:raw")
  }
  for (const name of m.adw.notAWidget) {
    map.set(name, "adw:not-a-widget")
  }
  return map
}

let changeReport = "first run — no previous classification.json to diff against"
if (existsSync(MANIFEST_PATH)) {
  const previous = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest
  const before = summarizeBuckets(previous)
  const after = summarizeBuckets(manifest)
  const added = [...after.keys()].filter((k) => !before.has(k))
  const removed = [...before.keys()].filter((k) => !after.has(k))
  const reclassified = [...after.keys()].filter(
    (k) => before.has(k) && before.get(k) !== after.get(k),
  )
  const lines: string[] = []
  if (added.length) {
    lines.push(`  added (${added.length}): ${added.join(", ")}`)
  }
  if (removed.length) {
    lines.push(`  removed (${removed.length}): ${removed.join(", ")}`)
  }
  if (reclassified.length) {
    lines.push(
      `  reclassified (${reclassified.length}): ` +
        reclassified
          .map((k) => `${k} ${before.get(k)} -> ${after.get(k)}`)
          .join(", "),
    )
  }
  changeReport =
    lines.length > 0 ? lines.join("\n") : "no change since the previous run"
}

// ---------------------------------------------------------------------------
// 3. Emit the generated source files.
// ---------------------------------------------------------------------------
const emitBridgeWidgets = (): void => {
  const gtkNames = [
    ...manifest.gtk.wrapped,
    ...manifest.gtk.raw.map((r) => r.name),
  ].sort()
  const adwNames = [
    ...manifest.adw.wrapped,
    ...manifest.adw.raw.map((r) => r.name),
  ].sort()
  // Split by namespace: gtk/adw-optional (001.md) needs core.ts to reach
  // zero widgets that require @gtkx/jsx/adw, so the raw GTK widgets and the
  // raw Adwaita widgets cannot share one generated file the way they used
  // to — a single `export … from "@gtkx/jsx/adw"` line here would put that
  // specifier back on core.ts's dependency graph regardless of which name
  // is actually used.
  const gtkBody =
    GENERATED_HEADER(
      "Every widget the classifier resolved to a Gtk.Widget subclass, re-exported\n" +
        "// RAW. This is the only generated file (besides the hand-written bridge\n" +
        "// modules) allowed to import @gtkx/jsx directly — src/gtk/widgets.generated\n" +
        "// pulls from here instead, so the no-restricted-imports carve-out for\n" +
        "// src/gtkx/bridge/** stays the only door. Adwaita's raw widgets are the\n" +
        "// sibling file, widgets.generated.adw.ts — see gtkx/bridge/adw.ts.",
    ) +
    "\nexport {\n" +
    gtkNames.map((n) => `  ${n},`).join("\n") +
    '\n} from "@gtkx/jsx/gtk"\n'
  writeFileSync(BRIDGE_WIDGETS, gtkBody)

  const adwBody =
    GENERATED_HEADER(
      "Every Adwaita widget the classifier resolved to a Gtk.Widget subclass,\n" +
        "// re-exported RAW. Imported ONLY by src/adw/widgets.generated.ts — that\n" +
        "// subpath already requires Adw-1 unconditionally, so a static import here\n" +
        "// is fine; gtkx/bridge/adw.ts (the seam app-registry.tsx/host.gtkx.ts use)\n" +
        "// reaches @gtkx/jsx/adw through require() instead, never through this file,\n" +
        "// so it stays reachable even when Adw was never generated. See\n" +
        "// .claude/epics/adw-optional/001.md and docs/gtkx-1.0-notes.md for why\n" +
        "// @gtkx/jsx/adw cannot live in widgets.generated.ts alongside the GTK half.",
    ) +
    "\nexport {\n" +
    adwNames.map((n) => `  ${n},`).join("\n") +
    '\n} from "@gtkx/jsx/adw"\n'
  writeFileSync(BRIDGE_WIDGETS_ADW, adwBody)
}

interface EmitPlatformWidgetsArgs {
  path: string
  prefix: string
  wrapped: string[]
  raw: RawEntry[]
  wrapReactNativeFrom: string
  /** gtkx/bridge/widgets.generated (gtk) or its .adw sibling — see
   *  emitBridgeWidgets' comment on why the two cannot be one file. */
  bridgeWidgetsModule: string
}

const emitPlatformWidgets = ({
  path,
  prefix,
  wrapped,
  raw,
  wrapReactNativeFrom,
  bridgeWidgetsModule,
}: EmitPlatformWidgetsArgs): void => {
  const rawNames = raw.map((r) => r.name).sort()
  const body =
    GENERATED_HEADER(
      "Wrapped: RN layout + a GTK CSS class from the style prop, steps aside and\n" +
        `// renders bare outside RN layout (see wrapReactNative in ${wrapReactNativeFrom}).\n` +
        "// Raw: toplevels and child-only widgets, where a wrapper box would be\n" +
        "// invalid GTK rather than a convenience — exported as gtkx binds them, same\n" +
        "// as the hand-picked ones were before this file existed.",
    ) +
    "\nimport {\n" +
    wrapped.map((n) => `  ${n} as Raw${n},`).join("\n") +
    `\n} from "${bridgeWidgetsModule}"\n` +
    `import { wrapReactNative } from "${wrapReactNativeFrom}"\n\n` +
    wrapped
      // The name is passed explicitly: gtkx builds its components from a
      // factory, so they carry no name of their own, and wrapReactNative
      // needs one for the slot diagnostics and for React devtools.
      .map((n) => `export const ${n} = wrapReactNative(Raw${n}, "${n}")`)
      .join("\n") +
    "\n\n" +
    (rawNames.length > 0
      ? "export {\n" +
        rawNames
          .map(
            (n) => `  ${n}, // ${raw.find((r) => r.name === n)?.reason ?? ""}`,
          )
          .join("\n") +
        `\n} from "${bridgeWidgetsModule}"\n\n`
      : "") +
    `export const ${prefix.toUpperCase()}_WRAPPED_WIDGET_NAMES = [\n` +
    wrapped.map((n) => `  "${n}",`).join("\n") +
    "\n] as const\n"
  writeFileSync(path, body)
}

mkdirSync(join(import.meta.dirname, "widget-surface"), { recursive: true })
emitBridgeWidgets()
emitPlatformWidgets({
  path: GTK_WIDGETS,
  prefix: "gtk",
  wrapped: manifest.gtk.wrapped,
  raw: manifest.gtk.raw,
  wrapReactNativeFrom: "../common/widget",
  bridgeWidgetsModule: "../gtkx/bridge/widgets.generated",
})
emitPlatformWidgets({
  path: ADW_WIDGETS,
  prefix: "adw",
  wrapped: manifest.adw.wrapped,
  raw: manifest.adw.raw,
  // wrapReactNative is toolkit-level, not Adwaita-specific — it lives in
  // src/common/widget.tsx, and src/adw only ever re-exports it (see
  // src/adw/index.ts), it never redefines it.
  wrapReactNativeFrom: "../common/widget",
  bridgeWidgetsModule: "../gtkx/bridge/widgets.generated.adw",
})
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n")

// The templates above get import order and line-wrapping close but not
// exact — running the repo's own formatter is simpler and more robust than
// hand-replicating @ianvs/prettier-plugin-sort-imports here, and it is what
// `npm run format` would do to this output anyway.
execFileSync(
  "npx",
  [
    "prettier",
    "--write",
    BRIDGE_WIDGETS,
    BRIDGE_WIDGETS_ADW,
    GTK_WIDGETS,
    ADW_WIDGETS,
  ],
  {
    cwd: ROOT,
    stdio: "inherit",
  },
)

// ---------------------------------------------------------------------------
// 4. Report.
// ---------------------------------------------------------------------------
console.log("=== react-native-gtkx widget surface ===")
console.log(
  `gtk:  ${manifest.gtk.wrapped.length} wrapped, ${manifest.gtk.raw.length} raw, ` +
    `${manifest.gtk.notAWidget.length} not-a-widget (out of scope)`,
)
console.log(
  `adw:  ${manifest.adw.wrapped.length} wrapped, ${manifest.adw.raw.length} raw, ` +
    `${manifest.adw.notAWidget.length} not-a-widget (out of scope)`,
)
console.log("\n--- gtk raw (with reason) ---")
for (const r of manifest.gtk.raw) {
  console.log(`  ${r.name}: ${r.reason}`)
}
console.log("\n--- adw raw (with reason) ---")
for (const r of manifest.adw.raw) {
  console.log(`  ${r.name}: ${r.reason}`)
}
console.log("\n--- denylist entries in effect ---")
for (const [name, { reason }] of Object.entries(DENYLIST)) {
  console.log(`  ${name}: ${reason}`)
}
console.log("\n--- change since previous run ---")
console.log(changeReport)
console.log("\nWrote:")
console.log(" ", BRIDGE_WIDGETS)
console.log(" ", BRIDGE_WIDGETS_ADW)
console.log(" ", GTK_WIDGETS)
console.log(" ", ADW_WIDGETS)
console.log(" ", MANIFEST_PATH)
