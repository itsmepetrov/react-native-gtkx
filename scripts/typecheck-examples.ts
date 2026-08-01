#!/usr/bin/env node
// Typecheck every example against the BUILT package.
//
// WHY this is separate from `npm run typecheck`. That script covers
// `packages/react-native-gtkx` and `scripts`, which is what a change to the
// platform breaks first — and it deliberately typechecks the SOURCES, so it
// needs no build and runs in seconds. The examples cannot: they import
// `react-native-gtkx/...`, whose `exports` map resolves to `dist`, so they
// only typecheck after `npm run build:dist`.
//
// That gap shipped a bug: `main` briefly carried an example importing
// components that did not exist, and nothing in CI looked. The examples are
// this project's documentation of its own API — an example that does not
// compile is a page of the manual that is wrong.
//
// Each example owns a tsconfig.json already (its own `types`, its own
// `#data` import map); this runs them all and reports every failure rather
// than stopping at the first, so one CI run names every example to fix.
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

const REPO = join(import.meta.dirname, "..")
const EXAMPLES = join(REPO, "examples")

const projects = readdirSync(EXAMPLES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => existsSync(join(EXAMPLES, name, "tsconfig.json")))
  .sort()

if (projects.length === 0) {
  console.error("no examples with a tsconfig.json — nothing to check")
  process.exit(1)
}

if (!existsSync(join(REPO, "packages/react-native-gtkx/dist/index.d.ts"))) {
  console.error(
    "packages/react-native-gtkx/dist is missing — run `npm run build:dist` first",
  )
  process.exit(1)
}

const failed: string[] = []
for (const name of projects) {
  process.stdout.write(`examples/${name}… `)
  const result = spawnSync(
    "npx",
    ["tsc", "-p", join(EXAMPLES, name, "tsconfig.json")],
    { cwd: REPO, encoding: "utf8" },
  )
  if (result.status === 0) {
    process.stdout.write("ok\n")
    continue
  }
  process.stdout.write("FAILED\n")
  process.stdout.write(`${result.stdout ?? ""}${result.stderr ?? ""}\n`)
  failed.push(name)
}

if (failed.length > 0) {
  console.error(`\ntypecheck failed: ${failed.join(", ")}`)
  process.exit(1)
}
console.log(`\n${projects.length} examples typecheck clean`)
