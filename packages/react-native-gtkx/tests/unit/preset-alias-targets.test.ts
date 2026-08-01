// The link between the two preset tests and reality: they prove the presets
// REWRITE a package name, and nothing proved that what they rewrite it to is
// something a bundler can then resolve. An alias onto a subpath that is not in
// the exports map, or onto a module that is not built, fails at the consumer's
// build with a resolution error that names our package and not the alias — the
// kind of break neither preset test can see.
//
// So: every alias, from both presets, must agree on its target, that target
// must be a declared subpath, and the file the subpath points into must have a
// source module behind it. The dist path is checked against src rather than
// against dist itself on purpose — this is a unit test, it runs before any
// build, and the question it answers is "will the build produce this".
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"
import { withLinuxPlatform, type MetroResolutionContext } from "../../src/metro"
import { rewriteReactNativeImport } from "../../src/vite/index"

const PACKAGE_ROOT = join(import.meta.dirname, "../..")

/** Every package name the presets alias, and the subpath each one lands on. */
const ALIASES: Record<string, string> = {
  "react-native": "react-native-gtkx",
  "react-native-svg": "react-native-gtkx/svg",
  "react-native-reanimated": "react-native-gtkx/reanimated",
  "react-native-reanimated-dnd": "react-native-gtkx/dnd",
  "react-native-worklets": "react-native-gtkx/worklets",
  "react-native-gesture-handler": "react-native-gtkx/gesture-handler",
}

const metroTarget = (moduleName: string): string => {
  const seen: string[] = []
  const context: MetroResolutionContext = {
    resolveRequest: (_context, name) => {
      seen.push(name)
      return { type: "sourceFile", filePath: `/resolved/${name}` }
    },
  }
  withLinuxPlatform(
    {},
    { proxyDir: join(PACKAGE_ROOT, "node_modules/.rn-gtkx-alias-test") },
  ).resolver.resolveRequest(context, moduleName, "linux")
  return seen[0]!
}

const manifest = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
) as { exports: Record<string, { types: string; default: string }> }

test("both presets alias the same package names onto the same subpaths", () => {
  for (const [packageName, target] of Object.entries(ALIASES)) {
    expect(rewriteReactNativeImport(packageName)).toBe(target)
    expect(metroTarget(packageName)).toBe(target)
  }
})

test("every alias target is a declared subpath with a module behind it", () => {
  for (const target of Object.values(ALIASES)) {
    const subpath = target.replace(/^react-native-gtkx/, ".") as
      "." | `./${string}`
    const entry = manifest.exports[subpath === "." ? "." : subpath]
    expect(entry, `${target} is not in the exports map`).toBeDefined()

    // ./dist/<dir>/index.js is produced by tsc from src/<dir>/index.ts(x).
    const source = entry!.default
      .replace(/^\.\/dist\//, "src/")
      .replace(/\.js$/, "")
    const exists = [".ts", ".tsx"].some((extension) =>
      existsSync(join(PACKAGE_ROOT, source + extension)),
    )
    expect(exists, `${entry!.default} has no source at ${source}.ts(x)`).toBe(
      true,
    )
  }
})
