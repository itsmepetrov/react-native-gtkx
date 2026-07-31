// The `commands` array is what the RN CLI reads through the package's
// react-native.config.js — a pure data export, and the only part of the
// runner testable off a GTK machine (everything else spawns Metro or the
// host; those are proven by the VM runs instead). This guards the
// user-facing flag surface: a renamed or dropped option silently changes
// the documented CLI.
import { expect, test } from "vitest"
import { commands } from "../../src/runner/index"

const commandNamed = (name: string) => {
  const command = commands.find((entry) => entry.name === name)
  if (!command) {
    throw new Error(`no ${name} command is registered`)
  }
  return command
}

const optionNames = (name: string) =>
  commandNamed(name).options.map((option) => option.name.split(" ")[0])

test("registers run-linux and build-linux", () => {
  expect(commands.map((command) => command.name)).toEqual([
    "run-linux",
    "build-linux",
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
