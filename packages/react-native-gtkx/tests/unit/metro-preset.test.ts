// The Metro preset is a pure function over a Metro-like config: platform
// registration, react-native aliasing, host-side externalization and the
// InitializeCore drop are all testable without Metro itself.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { isBuiltin } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, expect, test } from "vitest"
import {
  HOST_MODULE_EXTERNALS,
  withLinuxPlatform,
  type MetroResolutionContext,
  type MetroResolver,
} from "../../src/metro/index"

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

test("redirects react-native-svg (and subpaths) to the compat subpath on linux", () => {
  const { context, calls } = makeContext()
  resolve(context, "react-native-svg", "linux")
  resolve(context, "react-native-svg/lib/index", "linux")
  resolve(context, "react-native-svg-icons", "linux")
  expect(calls).toEqual([
    ["react-native-gtkx/svg", "linux"],
    ["react-native-gtkx/svg/lib/index", "linux"],
    // lookalike: left untouched.
    ["react-native-svg-icons", "linux"],
  ])
})

test("redirects react-native-reanimated-dnd to the dnd subpath on linux", () => {
  // The alias that IS the migration story: the real library cannot run here
  // (Reanimated 4 + worklets + RNGH at module scope), so without this every
  // app with drag-and-drop rewrites its imports to add a Linux build.
  const { context, calls } = makeContext()
  resolve(context, "react-native-reanimated-dnd", "linux")
  resolve(context, "react-native-reanimated-dnd/lib/index", "linux")
  resolve(context, "react-native-reanimated-dnd-extras", "linux")
  expect(calls).toEqual([
    ["react-native-gtkx/dnd", "linux"],
    ["react-native-gtkx/dnd/lib/index", "linux"],
    // lookalike: left untouched.
    ["react-native-reanimated-dnd-extras", "linux"],
  ])
})

test("redirects react-native-reanimated to the compat subpath on linux", () => {
  // The two reanimated aliases are lookalikes of each other, so this asserts
  // both directions in one place: `-dnd` must still reach /dnd, and must be
  // matched on its own name rather than swallowed by the shorter prefix —
  // an anchored replace on a loose match would produce
  // `react-native-gtkx/reanimated-dnd`, which does not exist.
  const { context, calls } = makeContext()
  resolve(context, "react-native-reanimated", "linux")
  resolve(context, "react-native-reanimated/lib/Easing", "linux")
  resolve(context, "react-native-reanimated-dnd", "linux")
  resolve(context, "react-native-reanimated-extras", "linux")
  expect(calls).toEqual([
    ["react-native-gtkx/reanimated", "linux"],
    ["react-native-gtkx/reanimated/lib/Easing", "linux"],
    // the lookalike that IS aliased, to its own subpath.
    ["react-native-gtkx/dnd", "linux"],
    // the lookalike that is not: left untouched.
    ["react-native-reanimated-extras", "linux"],
  ])
})

test("redirects react-native-worklets to the worklets subpath on linux", () => {
  // Reanimated 4 moved the worklet surface into its own package, and
  // libraries import it under that name at module scope with no try/require
  // guard — so without this alias the wall aliasing Reanimated tore down is
  // still standing one package over, and it falls at IMPORT rather than at
  // use. The lookalike here is a real package: react-native-worklets-core is
  // the VisionCamera worklets library, and an anchored replace on a loose
  // prefix would send it to `react-native-gtkx/worklets-core`.
  const { context, calls } = makeContext()
  resolve(context, "react-native-worklets", "linux")
  resolve(context, "react-native-worklets/plugin", "linux")
  resolve(context, "react-native-worklets-core", "linux")
  expect(calls).toEqual([
    ["react-native-gtkx/worklets", "linux"],
    ["react-native-gtkx/worklets/plugin", "linux"],
    // lookalike: left untouched.
    ["react-native-worklets-core", "linux"],
  ])
})

test("redirects react-native-gesture-handler to the shim on linux", () => {
  // Not a port of RNGH: the shim implements GestureHandlerRootView and makes
  // every other export throw. The alias exists so a ported app does not have
  // to edit the one wrapper at the root of its tree.
  const { context, calls } = makeContext()
  resolve(context, "react-native-gesture-handler", "linux")
  resolve(context, "react-native-gesture-handler/ReanimatedSwipeable", "linux")
  resolve(context, "react-native-gesture-handler-extras", "linux")
  expect(calls).toEqual([
    ["react-native-gtkx/gesture-handler", "linux"],
    ["react-native-gtkx/gesture-handler/ReanimatedSwipeable", "linux"],
    // lookalike: left untouched.
    ["react-native-gesture-handler-extras", "linux"],
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

test("every bundle-side bare import in src is host-provided", () => {
  // A bare specifier missing from HOST_MODULE_EXTERNALS gets bundled by
  // Metro, reaches host-only virtual modules (virtual:gtkx-config) and
  // breaks standalone apps — the @gtkx/react/internal regression. runner/,
  // Host-side or test-time-only subpaths that never enter an app bundle:
  // runner/, metro/ and vite/ drive the toolchain, mcp/ is the
  // react-native-gtkx-mcp CLI (a separate process), sea/ is the SEA
  // bundler (a build-time tool that runs under plain Node with a full
  // node_modules, never part of an app's own bundle), and vitest/ and
  // testing/ are imported only by an app's tests.
  const srcRoot = join(import.meta.dirname, "../../src")
  const hostSide = new Set([
    "runner",
    "metro",
    "vite",
    "vitest",
    "testing",
    "mcp",
    "sea",
  ])
  const specifiers = new Set<string>()
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (dir !== srcRoot || !hostSide.has(entry.name)) {
          visit(join(dir, entry.name))
        }
        continue
      }
      if (!/\.tsx?$/.test(entry.name)) {
        continue
      }
      const source = readFileSync(join(dir, entry.name), "utf8")
      for (const match of source.matchAll(
        /(?:from|import)\s*\(?\s*["']([^"'.][^"']*)["']/g,
      )) {
        specifiers.add(match[1]!)
      }
    }
  }
  visit(srcRoot)
  expect(specifiers.size).toBeGreaterThan(0)
  // Regular dependencies that Metro is SUPPOSED to bundle (not host
  // singletons): the app installs them itself (optional peers).
  const bundled = new Set(["@react-navigation/native"])
  const missing = [...specifiers].filter(
    (name) =>
      !isBuiltin(name) &&
      !HOST_MODULE_EXTERNALS.includes(name) &&
      !bundled.has(name),
  )
  expect(missing).toEqual([])
})
