#!/usr/bin/env node
// Generates the full GTK + Adwaita widget surface for react-native-gtkx/gtk
// and react-native-gtkx/adw.
//
// MUST run on Linux, inside the VM (`bash scripts/vm.sh run "node
// scripts/generate-widget-surface.mjs"`) — it imports the real @gtkx/gi
// classes to classify widgets by their actual prototype chain, which only
// resolve where GTK itself is installed. Re-run after `npm run codegen`
// picks up a gtkx update; the script diffs against its own previous output
// and prints what changed.
//
// See scripts/widget-surface/classify.mjs for the classification rules and
// .claude/epics/widget-surface/ for the research trail behind the denylist.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as Adw from "@gtkx/gi/adw"
import * as Gtk from "@gtkx/gi/gtk"
import { classify, DENYLIST } from "./widget-surface/classify.mjs"
import { parseComponentNames } from "./widget-surface/parse-dts.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const PKG = join(ROOT, "packages/react-native-gtkx/src")

const GTK_DTS = join(ROOT, "node_modules/.gtkx/jsx/gtk/gtk.d.ts")
const ADW_DTS = join(ROOT, "node_modules/.gtkx/jsx/adw/adw.d.ts")
const MANIFEST_PATH = join(__dirname, "widget-surface/classification.json")

const BRIDGE_WIDGETS = join(PKG, "gtkx/bridge/widgets.generated.ts")
const GTK_WIDGETS = join(PKG, "gtk/widgets.generated.ts")
const ADW_WIDGETS = join(PKG, "adw/widgets.generated.ts")

const GENERATED_HEADER = (purpose) => `// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-widget-surface.mjs. Re-run it inside the VM
// after \`npm run codegen\` picks up a gtkx update; see
// scripts/widget-surface/classification.json for the full classification
// and .claude/epics/widget-surface/ for the rules behind it.
//
// ${purpose}
`

// ---------------------------------------------------------------------------
// 1. Parse what gtkx binds, classify it against the real prototype chains.
// ---------------------------------------------------------------------------
const gtkParsed = parseComponentNames(GTK_DTS)
const adwParsed = parseComponentNames(ADW_DTS)

const result = classify({
  Gtk,
  Adw,
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

const bucketOf = (results, bucket) =>
  results
    .filter((r) => r.bucket === bucket)
    .map((r) => r.name)
    .sort()

const reasonOf = (results, name) => results.find((r) => r.name === name)?.reason

const manifest = {
  gtk: {
    wrapped: bucketOf(result.gtk, "wrapped"),
    raw: bucketOf(result.gtk, "raw").map((name) => ({
      name,
      reason: reasonOf(result.gtk, name),
    })),
    notAWidget: bucketOf(result.gtk, "not-a-widget"),
  },
  adw: {
    wrapped: bucketOf(result.adw, "wrapped"),
    raw: bucketOf(result.adw, "raw").map((name) => ({
      name,
      reason: reasonOf(result.adw, name),
    })),
    notAWidget: bucketOf(result.adw, "not-a-widget"),
  },
}

// ---------------------------------------------------------------------------
// 2. Diff against the previous run, so an upgrade says what changed.
// ---------------------------------------------------------------------------
const summarizeBuckets = (m) => {
  const map = new Map()
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
  const previous = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
  const before = summarizeBuckets(previous)
  const after = summarizeBuckets(manifest)
  const added = [...after.keys()].filter((k) => !before.has(k))
  const removed = [...before.keys()].filter((k) => !after.has(k))
  const reclassified = [...after.keys()].filter(
    (k) => before.has(k) && before.get(k) !== after.get(k),
  )
  const lines = []
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
const emitBridgeWidgets = () => {
  const gtkNames = [
    ...manifest.gtk.wrapped,
    ...manifest.gtk.raw.map((r) => r.name),
  ].sort()
  const adwNames = [
    ...manifest.adw.wrapped,
    ...manifest.adw.raw.map((r) => r.name),
  ].sort()
  const body =
    GENERATED_HEADER(
      "Every widget the classifier resolved to a Gtk.Widget subclass, re-exported\n" +
        "// RAW. This is the only generated file (besides the hand-written bridge\n" +
        "// modules) allowed to import @gtkx/jsx directly — src/gtk/widgets.generated\n" +
        "// and src/adw/widgets.generated pull from here instead, so the\n" +
        "// no-restricted-imports carve-out for src/gtkx/bridge/** stays the only door.",
    ) +
    "\nexport {\n" +
    gtkNames.map((n) => `  ${n},`).join("\n") +
    '\n} from "@gtkx/jsx/gtk"\n\n' +
    "export {\n" +
    adwNames.map((n) => `  ${n},`).join("\n") +
    '\n} from "@gtkx/jsx/adw"\n'
  writeFileSync(BRIDGE_WIDGETS, body)
}

const emitPlatformWidgets = ({
  path,
  prefix,
  wrapped,
  raw,
  wrapReactNativeFrom,
}) => {
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
    `\n} from "../gtkx/bridge/widgets.generated"\n` +
    `import { wrapReactNative } from "${wrapReactNativeFrom}"\n\n` +
    wrapped
      .map((n) => `export const ${n} = wrapReactNative(Raw${n})`)
      .join("\n") +
    "\n\n" +
    (rawNames.length > 0
      ? "export {\n" +
        rawNames
          .map((n) => `  ${n}, // ${raw.find((r) => r.name === n).reason}`)
          .join("\n") +
        '\n} from "../gtkx/bridge/widgets.generated"\n\n'
      : "") +
    `export const ${prefix.toUpperCase()}_WRAPPED_WIDGET_NAMES = [\n` +
    wrapped.map((n) => `  "${n}",`).join("\n") +
    "\n] as const\n"
  writeFileSync(path, body)
}

mkdirSync(dirname(MANIFEST_PATH), { recursive: true })
emitBridgeWidgets()
emitPlatformWidgets({
  path: GTK_WIDGETS,
  prefix: "gtk",
  wrapped: manifest.gtk.wrapped,
  raw: manifest.gtk.raw,
  wrapReactNativeFrom: "../common/widget",
})
emitPlatformWidgets({
  path: ADW_WIDGETS,
  prefix: "adw",
  wrapped: manifest.adw.wrapped,
  raw: manifest.adw.raw,
  // wrapReactNative is toolkit-level, not Adwaita-specific — it lives in
  // src/gtk/widget.tsx, and src/adw only ever re-exports it (see
  // src/adw/index.ts), it never redefines it.
  wrapReactNativeFrom: "../common/widget",
})
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n")

// The templates above get import order and line-wrapping close but not
// exact — running the repo's own formatter is simpler and more robust than
// hand-replicating @ianvs/prettier-plugin-sort-imports here, and it is what
// `npm run format` would do to this output anyway.
execFileSync(
  "npx",
  ["prettier", "--write", BRIDGE_WIDGETS, GTK_WIDGETS, ADW_WIDGETS],
  { cwd: ROOT, stdio: "inherit" },
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
console.log(" ", GTK_WIDGETS)
console.log(" ", ADW_WIDGETS)
console.log(" ", MANIFEST_PATH)
