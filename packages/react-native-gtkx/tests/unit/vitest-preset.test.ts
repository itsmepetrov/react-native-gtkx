// Pure shape/defaults tests for the react-native-gtkx/vitest preset — no
// compositor or codegen store needed: constructing the plugins/config object
// has no side effects (the real headless display only starts once a worker
// actually runs a test through the "gtk" project).
import type { Plugin } from "vite"
import { describe, expect, test } from "vitest"
import { reactNativeGtkxTest } from "../../src/vitest/index"

describe("reactNativeGtkxTest defaults", () => {
  test("names the project gtk and targets the *.gtk.test.{ts,tsx} suffix", async () => {
    const config = await reactNativeGtkxTest()
    expect(config.test?.name).toBe("gtk")
    expect(config.test?.include).toEqual(["**/*.gtk.test.{ts,tsx}"])
  })

  test("wires the compositor plugin and the react-native-gtkx vite preset, in order", async () => {
    const config = await reactNativeGtkxTest()
    const names = (config.plugins as Plugin[]).map((plugin) => plugin.name)
    expect(names).toEqual(["gtkx:vitest", "react-native-gtkx:preset"])
  })

  test("inlines @react-navigation by default so its react-native import goes through the resolver", async () => {
    const config = await reactNativeGtkxTest()
    expect(config.test?.server?.deps?.inline).toEqual([/@react-navigation/])
  })

  test("runs serially by default (per-worker compositors race on resize signal delivery)", async () => {
    const config = await reactNativeGtkxTest()
    expect(config.test?.fileParallelism).toBe(false)
  })

  test("includes the built-in act-environment setup file", async () => {
    const config = await reactNativeGtkxTest()
    expect(config.test?.setupFiles).toHaveLength(1)
    expect(config.test?.setupFiles?.[0]).toMatch(/setup\.js$/)
  })
})

describe("reactNativeGtkxTest options", () => {
  test("overrides name and include", async () => {
    const config = await reactNativeGtkxTest({
      name: "components",
      include: ["tests/gtk/**/*.test.tsx"],
    })
    expect(config.test?.name).toBe("components")
    expect(config.test?.include).toEqual(["tests/gtk/**/*.test.tsx"])
  })

  test("merges inlineDeps after the default", async () => {
    const config = await reactNativeGtkxTest({ inlineDeps: [/some-rn-lib/] })
    expect(config.test?.server?.deps?.inline).toEqual([
      /@react-navigation/,
      /some-rn-lib/,
    ])
  })

  test("merges setupFiles after the built-in one", async () => {
    const config = await reactNativeGtkxTest({
      setupFiles: ["./tests/gtk/extra-setup.ts"],
    })
    expect(config.test?.setupFiles).toHaveLength(2)
    expect(config.test?.setupFiles?.[0]).toMatch(/setup\.js$/)
    expect(config.test?.setupFiles?.[1]).toBe("./tests/gtk/extra-setup.ts")
  })

  test("overrides fileParallelism", async () => {
    const config = await reactNativeGtkxTest({ fileParallelism: true })
    expect(config.test?.fileParallelism).toBe(true)
  })
})
