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
//
// Since the presets now compile ONE table (src/aliases/index.ts) instead of
// hand-rolling six rules each, this file also carries the test that would fail
// if they ever diverged again — over app-supplied `aliases` as well as the
// defaults, because a per-preset option is a second way for them to drift.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"
import { DEFAULT_ALIASES, type AliasOverrides } from "../../src/aliases/index"
import {
  withLinuxPlatform,
  type LinuxPlatformOptions,
  type MetroResolutionContext,
} from "../../src/metro"
import {
  reactNativeGtkx,
  rewriteReactNativeImport,
  type ReactNativeGtkxOptions,
} from "../../src/vite/index"

const PACKAGE_ROOT = join(import.meta.dirname, "../..")
const PROXY_DIR = join(PACKAGE_ROOT, "node_modules/.rn-gtkx-alias-test")

/** Every package name the presets alias, and the subpath each one lands on. */
const ALIASES: Record<string, string> = {
  "react-native": "react-native-gtkx",
  "react-native-svg": "react-native-gtkx/svg",
  "react-native-reanimated": "react-native-gtkx/reanimated",
  "react-native-reanimated-dnd": "react-native-gtkx/dnd",
  "react-native-worklets": "react-native-gtkx/worklets",
  "react-native-gesture-handler": "react-native-gtkx/gesture-handler",
}

/** What the Metro preset hands on for `moduleName`, or null if it was left alone. */
const metroTarget = (
  moduleName: string,
  options: LinuxPlatformOptions = {},
): string | null => {
  const seen: string[] = []
  const context: MetroResolutionContext = {
    resolveRequest: (_context, name) => {
      seen.push(name)
      return { type: "sourceFile", filePath: `/resolved/${name}` }
    },
  }
  withLinuxPlatform(
    {},
    { proxyDir: PROXY_DIR, ...options },
  ).resolver.resolveRequest(context, moduleName, "linux")
  const target = seen[0]!
  return target === moduleName ? null : target
}

/** The same, through the vite plugin's resolveId hook with a fake resolver. */
const viteTarget = async (
  source: string,
  options: ReactNativeGtkxOptions = {},
): Promise<string | null> => {
  const plugin = reactNativeGtkx(options)
  const hook = plugin.resolveId as unknown as (
    this: { resolve: () => Promise<null> },
    source: string,
    importer?: string,
  ) => Promise<string | null>
  return hook.call(
    { resolve: () => Promise.resolve(null) },
    source,
    join(PACKAGE_ROOT, "src/index.ts"),
  )
}

const manifest = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
) as { exports: Record<string, { types: string; default: string }> }

/** Alias targets that must be a subpath of this package with a module behind it. */
const assertRealModule = (target: string): void => {
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

test("both presets alias the same package names onto the same subpaths", () => {
  for (const [packageName, target] of Object.entries(ALIASES)) {
    expect(rewriteReactNativeImport(packageName)).toBe(target)
    expect(metroTarget(packageName)).toBe(target)
  }
})

test("the documented default table is the one the presets install", () => {
  expect(DEFAULT_ALIASES).toEqual(ALIASES)
})

test("every alias target is a declared subpath with a module behind it", () => {
  for (const target of Object.values(ALIASES)) {
    assertRealModule(target)
  }
})

// The divergence test. Both presets read one table, so the only way for them
// to disagree is for one of them to stop reading it — which this catches on
// the defaults AND on every shape the `aliases` option can take, including the
// ones an app is most likely to use.
const OPTION_CASES: Record<string, AliasOverrides> = {
  defaults: {},
  "the dnd opt-out": { "react-native-reanimated-dnd": false },
  "several drops at once": {
    "react-native-reanimated-dnd": false,
    "react-native-svg": false,
  },
  "a retargeted default": { "react-native-svg": "my-svg/linux" },
  "an added package": { "my-pkg": "my-pkg/linux" },
  "a pattern rule": {
    "weird-pkg": { pattern: /^weird-pkg\/lib\/(.+)$/, replace: "impl/$1" },
  },
}

const SPECIMENS = [
  ...Object.keys(ALIASES),
  ...Object.keys(ALIASES).map((name) => `${name}/deep/thing`),
  // Lookalikes, including two real npm packages.
  "react-native-web",
  "react-native-svg-icons",
  "react-native-worklets-core",
  "react-native-reanimated-extras",
  // Never aliased.
  "react-native-gtkx",
  "react-native-gtkx/dnd",
  "left-pad",
  // Reached by the option cases above.
  "my-pkg",
  "my-pkg/deep/thing",
  "my-pkg-other",
  "weird-pkg",
  "weird-pkg/lib/thing",
]

for (const [label, aliases] of Object.entries(OPTION_CASES)) {
  test(`Metro and vite resolve identically — ${label}`, async () => {
    for (const specifier of SPECIMENS) {
      expect(
        await viteTarget(specifier, { aliases }),
        `vite and Metro disagree about ${specifier}`,
      ).toBe(metroTarget(specifier, { aliases }))
    }
  })
}

// #71 asserted this for our own six. An app that adds an alias makes the same
// mistake in its own config, and the same class of error — an alias onto a
// subpath the target package does not declare — surfaces at ITS build, naming
// a package rather than the alias. The preset cannot resolve a stranger's
// module at config time, so what it validates is the shape: a target is a
// module specifier, never a path, and never a bare directory.
test("a user alias target is validated as a module specifier, not a path", () => {
  const rejected = ["./local/thing", "/abs/thing", "my-pkg/linux/", ""]
  for (const target of rejected) {
    expect(
      () =>
        withLinuxPlatform(
          {},
          { proxyDir: PROXY_DIR, aliases: { "my-pkg": target } },
        ),
      `${JSON.stringify(target)} should not be accepted as an alias target`,
    ).toThrow()
    expect(() => reactNativeGtkx({ aliases: { "my-pkg": target } })).toThrow()
  }
})

test("a user alias onto one of our subpaths still lands on a real module", () => {
  // The supported way to reuse a compat surface for a package we do not know
  // about: it goes through the same target check as our own entries.
  const target = "react-native-gtkx/reanimated"
  assertRealModule(target)
  expect(
    metroTarget("some-reanimated-fork", {
      aliases: { "some-reanimated-fork": target },
    }),
  ).toBe(target)
})
