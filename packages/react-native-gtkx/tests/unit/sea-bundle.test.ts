// buildEntrySource is the pure, deterministic half of the SEA bundler (the
// other half — esbuild plugins, filesystem/native-addon resolution — is
// proven by the epic's end-to-end VM run instead: see
// .claude/epics/single-executable/updates). This covers the part a unit
// test actually catches regressions in: every HOST_MODULE_EXTERNALS name
// ends up dynamically imported (never statically — see bundle.ts's header
// for why), and the yoga-layout special case stays wired to "/load".
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, expect, test } from "vitest"
import { HOST_MODULE_EXTERNALS } from "../../src/metro/index"
import { buildEntrySource } from "../../src/sea/bundle"

const dir = mkdtempSync(join(tmpdir(), "rn-gtkx-sea-"))
const jsbundlePath = join(dir, "main.jsbundle")
writeFileSync(jsbundlePath, "console.log('app');")
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const entry = buildEntrySource(jsbundlePath)

test("wraps everything in a single async function, no top-level await", () => {
  expect(entry).toContain("async function __gtkxSeaMain()")
  expect(entry).toContain("__gtkxSeaMain().catch(")
  // The whole point of the async wrapper: no `await` outside of it.
  const beforeFunction = entry.slice(0, entry.indexOf("async function"))
  expect(beforeFunction).not.toContain("await ")
})

test("every HOST_MODULE_EXTERNALS name is dynamically imported", () => {
  for (const name of HOST_MODULE_EXTERNALS) {
    if (name === "yoga-layout") {
      continue // special-cased below
    }
    expect(entry).toContain(`await import(${JSON.stringify(name)})`)
    expect(entry).toContain(`hostModules[${JSON.stringify(name)}]`)
  }
})

test("yoga-layout loads through the /load subpath, not the top-level-await entry", () => {
  expect(entry).toContain('await import("yoga-layout/load")')
  expect(entry).not.toContain('await import("yoga-layout")')
  expect(entry).toContain("await loadYoga()")
})

test("embeds the jsbundle source and runs it via vm.runInThisContext", () => {
  expect(entry).toContain("console.log('app');")
  expect(entry).toContain('require("node:vm").runInThisContext(')
  expect(entry).toContain(JSON.stringify(jsbundlePath))
})

test("wires globalThis.__hostModules and __hostRequire before running the bundle", () => {
  const hostModulesIndex = entry.indexOf(
    "globalThis.__hostModules = hostModules",
  )
  const hostRequireIndex = entry.indexOf("globalThis.__hostRequire = require")
  const runIndex = entry.indexOf("runInThisContext(")
  expect(hostModulesIndex).toBeGreaterThan(-1)
  expect(hostRequireIndex).toBeGreaterThan(hostModulesIndex)
  expect(runIndex).toBeGreaterThan(hostRequireIndex)
})
