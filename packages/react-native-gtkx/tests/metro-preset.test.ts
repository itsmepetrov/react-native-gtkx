// The Metro preset is a pure function over a Metro-like config: platform
// registration, react-native aliasing, host-side externalization and the
// InitializeCore drop are all testable without Metro itself.
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, expect, test } from "vitest"
import {
  HOST_MODULE_EXTERNALS,
  withLinuxPlatform,
  type MetroResolutionContext,
  type MetroResolver,
} from "../src/metro/index"

const proxyDir = mkdtempSync(join(tmpdir(), "rn-gtkx-metro-"))
afterAll(() => {
  rmSync(proxyDir, { recursive: true, force: true })
})

// Records what fell through to Metro's own resolution.
const makeContext = (): {
  context: MetroResolutionContext
  calls: [string, string | null][]
} => {
  const calls: [string, string | null][] = []
  const context: MetroResolutionContext = {
    resolveRequest: (_context, moduleName, platform) => {
      calls.push([moduleName, platform])
      return { type: "sourceFile", filePath: `/resolved/${moduleName}` }
    },
  }
  return { context, calls }
}

const preset = withLinuxPlatform(
  { resolver: { platforms: ["ios", "android"] } },
  { proxyDir },
)
const resolve = preset.resolver.resolveRequest

test("adds linux to resolver.platforms once", () => {
  expect(preset.resolver.platforms).toEqual(["ios", "android", "linux"])
  const again = withLinuxPlatform(preset, { proxyDir })
  expect(again.resolver.platforms).toEqual(["ios", "android", "linux"])
})

test("redirects react-native (and subpaths) to react-native-gtkx on linux", () => {
  const { context, calls } = makeContext()
  resolve(context, "react-native", "linux")
  resolve(context, "react-native/index", "linux")
  expect(calls).toEqual([
    ["react-native-gtkx", "linux"],
    ["react-native-gtkx/index", "linux"],
  ])
})

test("externals resolve to __hostModules proxies", () => {
  const { context } = makeContext()
  for (const name of ["@gtkx/react", "react", "yoga-layout"]) {
    expect(HOST_MODULE_EXTERNALS).toContain(name)
    const resolution = resolve(context, name, "linux")
    expect(resolution.type).toBe("sourceFile")
    const source = readFileSync(resolution.filePath!, "utf8")
    expect(source).toContain(`global.__hostModules[${JSON.stringify(name)}]`)
  }
})

test("node builtins resolve to __hostRequire proxies", () => {
  const { context } = makeContext()
  for (const name of ["node:fs", "path"]) {
    const resolution = resolve(context, name, "linux")
    const source = readFileSync(resolution.filePath!, "utf8")
    expect(source).toContain(`global.__hostRequire(${JSON.stringify(name)})`)
  }
})

test("other platforms fall through untouched", () => {
  const { context, calls } = makeContext()
  resolve(context, "react-native", "ios")
  resolve(context, "@gtkx/react", "android")
  expect(calls).toEqual([
    ["react-native", "ios"],
    ["@gtkx/react", "android"],
  ])
})

test("composes with an existing custom resolveRequest", () => {
  const custom: [string, string | null][] = []
  const previous: MetroResolver = (_context, moduleName, platform) => {
    custom.push([moduleName, platform])
    return { type: "sourceFile", filePath: `/custom/${moduleName}` }
  }
  const wrapped = withLinuxPlatform(
    { resolver: { resolveRequest: previous } },
    { proxyDir },
  )
  const wrappedResolve = wrapped.resolver.resolveRequest
  const { context } = makeContext()
  // Non-linux goes to the previous resolver; linux aliasing lands there too.
  wrappedResolve(context, "left-pad", "ios")
  wrappedResolve(context, "react-native", "linux")
  expect(custom).toEqual([
    ["left-pad", "ios"],
    ["react-native-gtkx", "linux"],
  ])
})

test("drops InitializeCore from the pre-main modules", () => {
  expect(preset.serializer.getModulesRunBeforeMainModule("entry.js")).toEqual(
    [],
  )
})

test("extra externals extend the host-provided set", () => {
  const wrapped = withLinuxPlatform(
    {},
    { proxyDir, externals: ["better-sqlite3"] },
  )
  const wrappedResolve = wrapped.resolver.resolveRequest
  const { context } = makeContext()
  const resolution = wrappedResolve(context, "better-sqlite3", "linux")
  const source = readFileSync(resolution.filePath!, "utf8")
  expect(source).toContain('global.__hostModules["better-sqlite3"]')
})
