#!/usr/bin/env node
// Package-shape gate: runs are-the-types-wrong over the packed tarball.
//
// The package is `"type": "module"` with an exports map and no `require`
// condition anywhere — it ships ESM only, deliberately. So two of attw's
// findings are the correct answer rather than a defect, and the `esm-only`
// profile is what says so:
//
//   node10          💀 NoResolution      — the classic resolver cannot read
//                                          an exports map at all, so every
//                                          subpath "fails"; there is no
//                                          `main`-style fallback to add
//                                          without shipping CJS;
//   node16 (CJS)    ⚠️ CJSResolvesToESM  — `require()` of an ESM file. True,
//                                          and the point: CJS consumers use
//                                          a dynamic import.
//
// Both are reported as "(ignored per resolution)" and neither can fail the
// run. What the profile does NOT excuse is node16-from-ESM and bundler, and
// those are the two that matter here — which is why this is a script and
// not one `attw` invocation with `--ignore-rules internal-resolution-error`.
//
// That blanket ignore used to hide a real distinction. The emitted `.d.ts`
// and `.js` keep whatever relative specifiers the source wrote, and the
// source is split in two on purpose:
//
//   - src/mcp, src/vitest and the other subpaths Node itself loads (an MCP
//     bin run by `npx`, a `vite.config.ts`, a `vitest.config.ts`) spell out
//     `.js` on every relative import, because Node's ESM resolver does not
//     guess extensions. These MUST stay resolvable under node16-from-ESM:
//     a missing `.js` there is not a typing nit, it is a crash in a shipped
//     binary. They are checked below with no ignored rules at all.
//   - the React component surfaces (`.`, `./gtk`, `./common`, …) are only
//     ever resolved by Metro or Vite, and are written extensionless like
//     the rest of an app's source. attw reports 🥴 InternalResolutionError
//     for them under node16-from-ESM, correctly: a consumer whose tsconfig
//     said `moduleResolution: node16` would see it. Stock React Native
//     (`@react-native/typescript-config`) says `bundler`, which is the
//     configuration these subpaths are for and where they are 🟢.
//
// Ignoring the rule for the second group is a defensible shipping choice.
// Ignoring it for the first is how a broken bin reaches npm with CI green,
// so BUNDLER_ONLY below is exhaustive and every other subpath is held to
// the strict standard. Adding a subpath to the exports map without
// classifying it here fails this gate on purpose: the question "can Node
// load this one?" has to be answered by a person, once, in writing.
//
// One boundary worth knowing: attw walks the type graph reachable FROM each
// entrypoint, so `bin` fields are not entrypoints and dist/mcp/bin.js's own
// import line is not checked by anything here. Everything it reaches is —
// bin.ts imports ./server.js, which `./mcp` also re-exports — so the gate
// covers the module graph but not that one file's specifiers.
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const PACKAGE_DIR = join(ROOT, "packages/react-native-gtkx")

/**
 * Subpaths that only a bundler ever resolves, and are therefore allowed to
 * carry extensionless relative imports into the published types. Anything
 * not listed is checked with no ignored rules.
 */
const BUNDLER_ONLY = [
  ".",
  "./navigation",
  "./svg",
  "./gtk",
  "./adw",
  "./common",
  "./dnd",
  "./gesture-handler",
  "./reanimated",
  // Only ever reached through the presets' alias of `react-native-worklets`,
  // which fires inside Metro or Vite — nothing loads it through Node.
  "./worklets",
]

const readExportKeys = (): string[] => {
  const manifest: unknown = JSON.parse(
    readFileSync(join(PACKAGE_DIR, "package.json"), "utf8"),
  )
  const exportsField = (manifest as { exports?: Record<string, unknown> })
    .exports
  if (!exportsField) {
    throw new Error("packages/react-native-gtkx/package.json has no exports")
  }
  return Object.keys(exportsField)
}

const pack = (destination: string): string => {
  const result = spawnSync(
    "npm",
    ["pack", "--silent", "--pack-destination", destination],
    { cwd: PACKAGE_DIR, encoding: "utf8" },
  )
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "")
    throw new Error("npm pack failed")
  }
  const name = result.stdout.trim().split("\n").at(-1)
  if (!name) {
    throw new Error("npm pack printed no tarball name")
  }
  return join(destination, name)
}

const runAttw = (
  tarball: string,
  entrypoints: string[],
  ignoreRules: string[],
): boolean => {
  const args = [
    "attw",
    tarball,
    "--profile",
    "esm-only",
    "--entrypoints",
    ...entrypoints,
  ]
  if (ignoreRules.length > 0) {
    args.push("--ignore-rules", ...ignoreRules)
  }
  const result = spawnSync("npx", args, { cwd: ROOT, stdio: "inherit" })
  return result.status === 0
}

const keys = readExportKeys()
const unknownBundlerOnly = BUNDLER_ONLY.filter((key) => !keys.includes(key))
if (unknownBundlerOnly.length > 0) {
  console.error(
    `scripts/check-package.ts lists subpaths that no longer exist: ${unknownBundlerOnly.join(", ")}`,
  )
  process.exit(1)
}
const strict = keys.filter((key) => !BUNDLER_ONLY.includes(key))

const workDir = mkdtempSync(join(tmpdir(), "rn-gtkx-pack-"))
try {
  const tarball = pack(workDir)

  console.log(
    `\n=== Node-resolvable subpaths (${strict.length}), no ignored rules ===`,
  )
  const strictOk = runAttw(tarball, strict, [])

  console.log(
    `\n=== Bundler-only subpaths (${BUNDLER_ONLY.length}), extensionless relative imports allowed ===`,
  )
  const bundlerOk = runAttw(tarball, BUNDLER_ONLY, [
    "internal-resolution-error",
  ])

  if (!strictOk) {
    console.error(
      "\nA subpath Node loads directly does not resolve. Add the missing\n" +
        ".js extension to the relative import, or — if the subpath really is\n" +
        "bundler-only — move it into BUNDLER_ONLY in scripts/check-package.ts\n" +
        "with a note saying why nothing loads it through Node.",
    )
  }
  if (!bundlerOk) {
    console.error("\nA bundler-only subpath has a problem beyond the ignored")
    console.error("internal-resolution-error rule.")
  }
  // exitCode rather than exit(): process.exit() skips this try's finally, and
  // the tarball directory would survive every run.
  process.exitCode = strictOk && bundlerOk ? 0 : 1
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
