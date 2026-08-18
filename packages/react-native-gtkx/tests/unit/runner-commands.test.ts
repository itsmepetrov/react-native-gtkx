// The `commands` array is what the RN CLI reads through the package's
// react-native.config.js — a pure data export, and the only part of the
// runner testable off a GTK machine (everything else spawns Metro, the
// host, or `gtkx deploy`; those are proven by the VM runs instead). This
// guards the user-facing flag surface: a renamed or dropped option silently
// changes the documented CLI. isViteProject is deploy-linux's own path
// detection — also pure (just existsSync checks), so also covered here
// instead of only by the VM proof.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import { commands, isViteProject } from "../../src/runner/index"

const commandNamed = (name: string) => {
  const command = commands.find((entry) => entry.name === name)
  if (!command) {
    throw new Error(`no ${name} command is registered`)
  }
  return command
}

const optionNames = (name: string) =>
  commandNamed(name).options.map((option) => option.name.split(" ")[0])

test("registers run-linux, build-linux and deploy-linux", () => {
  expect(commands.map((command) => command.name)).toEqual([
    "run-linux",
    "build-linux",
    "deploy-linux",
  ])
})

test("build-linux offers all three distribution artifacts", () => {
  expect(optionNames("build-linux")).toEqual([
    "--entry-file",
    "--bundle-output",
    "--standalone",
    "--sea",
    "--sea-output",
  ])
})

test("--standalone and --sea are opt-in, not defaults", () => {
  for (const name of ["--standalone", "--sea"]) {
    const option = commandNamed("build-linux").options.find(
      (entry) => entry.name === name,
    )
    expect(option).toBeDefined()
    expect(option).not.toHaveProperty("default")
  }
})

test("run-linux keeps its dev-server flags", () => {
  expect(optionNames("run-linux")).toEqual([
    "--entry-file",
    "--bundle-output",
    "--skip-bundling",
    "--dev",
    "--port",
  ])
})

test("deploy-linux forwards gtkx deploy's own flag surface", () => {
  expect(optionNames("deploy-linux")).toEqual([
    "--entry-file",
    "--target",
    "--out",
    "--print-manifests",
    "--skip-build",
  ])
})

// isViteProject: deploy-linux's own vite-vs-Metro detection (neither
// run-linux nor build-linux need to tell the two apart — both are Metro
// only). A real vite.config.* at the project root, the same signal vite
// itself uses, is enough; a bare gtkx.config.ts is not, since every example
// in this repo has one regardless of toolchain. A fresh temp dir per test —
// not a shared one — since isViteProject reads real files off disk.
let dir = ""
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rn-gtkx-deploy-detect-"))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

test("a project with vite.config.ts is detected as vite-shaped", () => {
  writeFileSync(join(dir, "vite.config.ts"), "export default {}")
  expect(isViteProject(dir)).toBe(true)
})

test("vite.config.mjs/.js/.mts count too, not just .ts", () => {
  for (const name of ["vite.config.js", "vite.config.mjs", "vite.config.mts"]) {
    writeFileSync(join(dir, name), "export default {}")
    expect(isViteProject(dir)).toBe(true)
    rmSync(join(dir, name))
  }
})

test("a gtkx.config.ts alone (no vite.config.*) is NOT vite-shaped", () => {
  // Every example in this repo has a gtkx.config.ts regardless of
  // toolchain (both need it for codegen) — it is not the signal.
  writeFileSync(join(dir, "gtkx.config.ts"), "export default {}")
  expect(isViteProject(dir)).toBe(false)
})

test("an empty project is NOT vite-shaped", () => {
  expect(isViteProject(dir)).toBe(false)
})
