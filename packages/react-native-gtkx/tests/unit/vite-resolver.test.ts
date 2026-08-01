import { describe, expect, test } from "vitest"
import {
  DEFAULT_EXTENSIONS,
  DEFAULT_PLATFORMS,
  platformCandidates,
  platformSuffixes,
  resolvePlatformSpecifier,
  rewriteReactNativeImport,
  splitQuery,
  type FileExists,
} from "../../src/vite/index"

const existsAmong =
  (...files: string[]): FileExists =>
  (filePath) =>
    files.includes(filePath)

const never: FileExists = () => false
const always: FileExists = () => true

describe("rewriteReactNativeImport", () => {
  test("rewrites the bare react-native specifier", () => {
    expect(rewriteReactNativeImport("react-native")).toBe("react-native-gtkx")
  })

  test("rewrites react-native subpaths", () => {
    expect(rewriteReactNativeImport("react-native/package.json")).toBe(
      "react-native-gtkx/package.json",
    )
  })

  test("leaves react-native-gtkx alone (no self-alias loop)", () => {
    expect(rewriteReactNativeImport("react-native-gtkx")).toBeNull()
    expect(
      rewriteReactNativeImport("react-native-gtkx/src/index.ts"),
    ).toBeNull()
  })

  test("ignores lookalike and unrelated specifiers", () => {
    expect(rewriteReactNativeImport("react-native-web")).toBeNull()
    expect(rewriteReactNativeImport("react")).toBeNull()
    expect(rewriteReactNativeImport("@react-native/assets")).toBeNull()
    expect(rewriteReactNativeImport("./react-native")).toBeNull()
  })

  test("rewrites the bare react-native-svg specifier to the compat subpath", () => {
    expect(rewriteReactNativeImport("react-native-svg")).toBe(
      "react-native-gtkx/svg",
    )
  })

  test("rewrites react-native-svg subpaths", () => {
    expect(rewriteReactNativeImport("react-native-svg/lib/extract/types")).toBe(
      "react-native-gtkx/svg/lib/extract/types",
    )
  })

  test("ignores react-native-svg lookalikes", () => {
    expect(rewriteReactNativeImport("react-native-svg-icons")).toBeNull()
    expect(rewriteReactNativeImport("react-native-svg-transformer")).toBeNull()
  })

  test("rewrites react-native-reanimated-dnd to the dnd subpath", () => {
    // Load-bearing rather than convenient: the real library cannot run here,
    // so this alias is what lets a ported app keep its source unchanged.
    expect(rewriteReactNativeImport("react-native-reanimated-dnd")).toBe(
      "react-native-gtkx/dnd",
    )
    expect(
      rewriteReactNativeImport("react-native-reanimated-dnd/lib/index"),
    ).toBe("react-native-gtkx/dnd/lib/index")
  })

  test("rewrites react-native-gesture-handler to the shim subpath", () => {
    expect(rewriteReactNativeImport("react-native-gesture-handler")).toBe(
      "react-native-gtkx/gesture-handler",
    )
    expect(
      rewriteReactNativeImport("react-native-gesture-handler/jestSetup"),
    ).toBe("react-native-gtkx/gesture-handler/jestSetup")
  })

  test("ignores react-native-gesture-handler lookalikes", () => {
    expect(
      rewriteReactNativeImport("react-native-gesture-handler-extras"),
    ).toBeNull()
  })

  test("ignores react-native-reanimated-dnd lookalikes", () => {
    expect(
      rewriteReactNativeImport("react-native-reanimated-dnd-extras"),
    ).toBeNull()
  })

  test("rewrites react-native-reanimated to the compat subpath", () => {
    expect(rewriteReactNativeImport("react-native-reanimated")).toBe(
      "react-native-gtkx/reanimated",
    )
    expect(rewriteReactNativeImport("react-native-reanimated/lib/Easing")).toBe(
      "react-native-gtkx/reanimated/lib/Easing",
    )
  })

  test("keeps react-native-reanimated and its -dnd lookalike apart", () => {
    // Both directions, because both are now real aliases and the failure is
    // silent either way: a loose prefix match would send
    // `react-native-reanimated-dnd` to `react-native-gtkx/reanimated-dnd`,
    // which does not exist, and an alias for the shorter name placed first
    // would swallow the longer one. Exact-or-slash-prefix guards, not order.
    expect(rewriteReactNativeImport("react-native-reanimated-dnd")).toBe(
      "react-native-gtkx/dnd",
    )
    expect(
      rewriteReactNativeImport("react-native-reanimated-dnd/lib/index"),
    ).toBe("react-native-gtkx/dnd/lib/index")
    expect(
      rewriteReactNativeImport("react-native-reanimated-extras"),
    ).toBeNull()
  })
})

describe("splitQuery", () => {
  test("splits path and query", () => {
    expect(splitQuery("./Comp?raw")).toEqual({
      specifier: "./Comp",
      query: "?raw",
    })
  })

  test("returns an empty query when there is none", () => {
    expect(splitQuery("./Comp")).toEqual({ specifier: "./Comp", query: "" })
  })
})

describe("platformSuffixes", () => {
  test("orders platform-major: all linux suffixes before native ones", () => {
    expect(platformSuffixes()).toEqual([
      ".linux.tsx",
      ".linux.ts",
      ".linux.jsx",
      ".linux.js",
      ".native.tsx",
      ".native.ts",
      ".native.jsx",
      ".native.js",
    ])
  })

  test("honours custom platforms and extensions", () => {
    expect(
      platformSuffixes({ platforms: ["macos"], extensions: ["ts"] }),
    ).toEqual([".macos.ts"])
  })

  test("defaults are linux → native over tsx/ts/jsx/js", () => {
    expect(DEFAULT_PLATFORMS).toEqual(["linux", "native"])
    expect(DEFAULT_EXTENSIONS).toEqual(["tsx", "ts", "jsx", "js"])
  })
})

describe("platformCandidates", () => {
  test("tries direct files before directory index files", () => {
    const candidates = platformCandidates("/app/src/Comp", {
      platforms: ["linux", "native"],
      extensions: ["tsx"],
    })
    expect(candidates).toEqual([
      "/app/src/Comp.linux.tsx",
      "/app/src/Comp.native.tsx",
      "/app/src/Comp/index.linux.tsx",
      "/app/src/Comp/index.native.tsx",
    ])
  })
})

describe("resolvePlatformSpecifier", () => {
  const importer = "/app/src/index.tsx"

  test("picks the linux file over native and base", () => {
    const exists = existsAmong(
      "/app/src/Comp.linux.tsx",
      "/app/src/Comp.native.tsx",
      "/app/src/Comp.tsx",
    )
    expect(resolvePlatformSpecifier("./Comp", importer, exists)).toBe(
      "/app/src/Comp.linux.tsx",
    )
  })

  test("falls back to the native file when no linux file exists", () => {
    const exists = existsAmong("/app/src/Comp.native.ts", "/app/src/Comp.ts")
    expect(resolvePlatformSpecifier("./Comp", importer, exists)).toBe(
      "/app/src/Comp.native.ts",
    )
  })

  test("returns null when only the base file exists (default resolver wins)", () => {
    const exists = existsAmong("/app/src/Comp.tsx")
    expect(resolvePlatformSpecifier("./Comp", importer, exists)).toBeNull()
  })

  test("resolves parent-relative specifiers", () => {
    const exists = existsAmong("/app/shared/Comp.linux.tsx")
    expect(resolvePlatformSpecifier("../shared/Comp", importer, exists)).toBe(
      "/app/shared/Comp.linux.tsx",
    )
  })

  test("resolves platform index files of a directory", () => {
    const exists = existsAmong("/app/src/menu/index.linux.tsx")
    expect(resolvePlatformSpecifier("./menu", importer, exists)).toBe(
      "/app/src/menu/index.linux.tsx",
    )
  })

  test("prefers a direct platform file over a platform index file", () => {
    const exists = existsAmong(
      "/app/src/menu.native.tsx",
      "/app/src/menu/index.linux.tsx",
    )
    expect(resolvePlatformSpecifier("./menu", importer, exists)).toBe(
      "/app/src/menu.native.tsx",
    )
  })

  test("carries the query suffix over to the resolution", () => {
    const exists = existsAmong("/app/src/Comp.linux.tsx")
    expect(resolvePlatformSpecifier("./Comp?raw", importer, exists)).toBe(
      "/app/src/Comp.linux.tsx?raw",
    )
  })

  test("strips the importer query before resolving against its directory", () => {
    const exists = existsAmong("/app/src/Comp.linux.tsx")
    expect(
      resolvePlatformSpecifier("./Comp", `${importer}?v=123`, exists),
    ).toBe("/app/src/Comp.linux.tsx")
  })

  test("source-extension imports resolve platform variants first", () => {
    // Metro parity: "./Comp.tsx" still prefers Comp.linux.tsx — compiled RN
    // libraries import with explicit .js and expect .native.js to win.
    expect(resolvePlatformSpecifier("./Comp.tsx", importer, always)).toBe(
      "/app/src/Comp.linux.tsx",
    )
  })

  test("skips bare package imports", () => {
    expect(resolvePlatformSpecifier("lodash", importer, always)).toBeNull()
    expect(resolvePlatformSpecifier("@scope/pkg", importer, always)).toBeNull()
  })

  test("skips virtual modules and entries without importer", () => {
    expect(resolvePlatformSpecifier("\0virtual:x", importer, always)).toBeNull()
    expect(resolvePlatformSpecifier("./Comp", undefined, always)).toBeNull()
  })

  test("supports absolute specifiers", () => {
    const exists = existsAmong("/app/src/Comp.linux.tsx")
    expect(resolvePlatformSpecifier("/app/src/Comp", importer, exists)).toBe(
      "/app/src/Comp.linux.tsx",
    )
  })

  test("honours custom platform order", () => {
    const exists = existsAmong(
      "/app/src/Comp.linux.tsx",
      "/app/src/Comp.macos.tsx",
    )
    expect(
      resolvePlatformSpecifier("./Comp", importer, exists, {
        platforms: ["macos", "native"],
      }),
    ).toBe("/app/src/Comp.macos.tsx")
  })

  test("returns null when nothing matches", () => {
    expect(resolvePlatformSpecifier("./Comp", importer, never)).toBeNull()
  })
})

describe("strippable source extensions", () => {
  test("resolves platform variants for .js-suffixed imports (Metro parity)", () => {
    const files = new Set([
      "/pkg/src/useLinking.js",
      "/pkg/src/useLinking.native.js",
    ])
    expect(
      resolvePlatformSpecifier("./useLinking.js", "/pkg/src/index.js", (path) =>
        files.has(path),
      ),
    ).toBe("/pkg/src/useLinking.native.js")
  })

  test("leaves .js imports without platform variants to the default resolver", () => {
    const files = new Set(["/pkg/src/plain.js"])
    expect(
      resolvePlatformSpecifier("./plain.js", "/pkg/src/index.js", (path) =>
        files.has(path),
      ),
    ).toBeNull()
  })

  test("never touches non-source extensions", () => {
    const files = new Set(["/pkg/src/styles.native.css"])
    expect(
      resolvePlatformSpecifier("./styles.css", "/pkg/src/index.js", (path) =>
        files.has(path),
      ),
    ).toBeNull()
  })
})
