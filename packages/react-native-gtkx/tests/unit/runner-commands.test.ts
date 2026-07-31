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

test("build-linux offers the single-executable flags", () => {
  expect(optionNames("build-linux")).toEqual([
    "--entry-file",
    "--bundle-output",
    "--sea",
    "--sea-output",
  ])
})

test("--sea is opt-in, not a default", () => {
  const sea = commandNamed("build-linux").options.find(
    (option) => option.name === "--sea",
  )
  expect(sea).toBeDefined()
  expect(sea).not.toHaveProperty("default")
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
