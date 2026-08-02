// The alias table itself: merge semantics, the string form's guard, and the
// validation that only exists because the rules are data rather than
// functions. Every message asserted here is a message someone will read at
// config load with a broken build in front of them, so the tests pin the
// substance of the text, not just the fact that something threw.
import { describe, expect, test } from "vitest"
import {
  applyAliases,
  compileAliases,
  CONFIGURABLE_ALIASES,
  DEFAULT_ALIAS_TABLE,
  DEFAULT_ALIASES,
  PLATFORM_ALIAS,
} from "../../src/aliases/index"

const alias = (specifier: string, overrides = {}) =>
  applyAliases(compileAliases(overrides), specifier)

describe("the default table", () => {
  test("rewrites every default package name onto its subpath", () => {
    for (const [name, target] of Object.entries(DEFAULT_ALIASES)) {
      expect(alias(name)).toBe(target)
    }
  })

  test("transplants the tail of a subpath import", () => {
    expect(alias("react-native/Libraries/Text")).toBe(
      "react-native-gtkx/Libraries/Text",
    )
    expect(alias("react-native-svg/lib/index")).toBe(
      "react-native-gtkx/svg/lib/index",
    )
  })

  // The guard the presets have carried a comment about since #71: the string
  // form matches the exact name or a slash-prefixed subpath, never a bare
  // prefix. `react-native-worklets-core` is a REAL package (VisionCamera's),
  // and `react-native-reanimated-dnd` is a lookalike of a name in this very
  // table — a loose prefix would send either to a subpath that does not exist.
  test("never matches a lookalike package name", () => {
    for (const lookalike of [
      "react-native-web",
      "react-native-svg-icons",
      "react-native-worklets-core",
      "react-native-reanimated-extras",
      "react-native-gesture-handler-extras",
    ]) {
      expect(alias(lookalike)).toBeNull()
    }
  })

  test("leaves react-native-gtkx and unrelated packages alone", () => {
    expect(alias("react-native-gtkx")).toBeNull()
    expect(alias("react-native-gtkx/dnd")).toBeNull()
    expect(alias("left-pad")).toBeNull()
  })

  // Both lookalike pairs resolve on their own name whatever the order, because
  // the guard is in the pattern rather than in the sequence of ifs.
  test("resolves lookalike pairs independently of rule order", () => {
    expect(alias("react-native-reanimated-dnd")).toBe("react-native-gtkx/dnd")
    expect(alias("react-native-reanimated")).toBe(
      "react-native-gtkx/reanimated",
    )
  })

  test("DEFAULT_ALIAS_TABLE is the table with no overrides", () => {
    expect(DEFAULT_ALIAS_TABLE.names).toEqual(Object.keys(DEFAULT_ALIASES))
  })

  test("names every package it knows about, for the vite externals list", () => {
    expect(compileAliases().names).toEqual(Object.keys(DEFAULT_ALIASES))
  })
})

describe("deltas", () => {
  // The point of deltas over a replacement list: touching one name cannot
  // lose another. A replacement list is how the vite preset ended up with
  // three of six names in ssr.noExternal and a linux app loading the real
  // react-native-gesture-handler (#90).
  test("an override touches only the name it names", () => {
    const overrides = { "react-native-reanimated-dnd": false } as const
    expect(alias("react-native-reanimated-dnd", overrides)).toBeNull()
    for (const name of Object.keys(DEFAULT_ALIASES)) {
      if (name !== "react-native-reanimated-dnd") {
        expect(alias(name, overrides)).toBe(DEFAULT_ALIASES[name])
      }
    }
  })

  test("false drops an alias so the real package loads", () => {
    expect(
      alias("react-native-reanimated-dnd", {
        "react-native-reanimated-dnd": false,
      }),
    ).toBeNull()
    expect(
      alias("react-native-reanimated-dnd/lib/x", {
        "react-native-reanimated-dnd": false,
      }),
    ).toBeNull()
  })

  // A dropped alias is still a name the vite preset must keep out of Node's
  // hands: the real package imports react-native at module scope, and that
  // import only reaches the platform alias from inside the pipeline.
  test("a dropped alias stays in the known names", () => {
    const table = compileAliases({ "react-native-reanimated-dnd": false })
    expect(table.names).toContain("react-native-reanimated-dnd")
    expect(table.rules.map((rule) => rule.name)).not.toContain(
      "react-native-reanimated-dnd",
    )
  })

  test("a string adds an alias with the same tail-transplant semantics", () => {
    const overrides = { "my-pkg": "my-pkg/linux" }
    expect(alias("my-pkg", overrides)).toBe("my-pkg/linux")
    expect(alias("my-pkg/deep/thing", overrides)).toBe(
      "my-pkg/linux/deep/thing",
    )
    expect(alias("my-pkg-other", overrides)).toBeNull()
  })

  test("a string retargets one of ours", () => {
    expect(alias("react-native-svg", { "react-native-svg": "my-svg" })).toBe(
      "my-svg",
    )
  })

  test("a pattern rule handles a differing subpath layout", () => {
    const overrides = {
      "weird-pkg": { pattern: /^weird-pkg\/lib\/(.+)$/, replace: "impl/$1" },
    }
    expect(alias("weird-pkg/lib/thing", overrides)).toBe("impl/thing")
    // Deliberately narrow: the bare name is not claimed by that pattern.
    expect(alias("weird-pkg", overrides)).toBeNull()
  })

  test("names grow with added aliases", () => {
    expect(compileAliases({ "my-pkg": "my-pkg/linux" }).names).toContain(
      "my-pkg",
    )
  })
})

describe("validation", () => {
  // The failure mode being designed out: a typo that silently does nothing.
  test("false on an unknown key names the keys that can be dropped", () => {
    expect(() =>
      compileAliases({ "react-native-reanimated-dndd": false }),
    ).toThrow(/is not an alias this preset installs/)
    const message = (() => {
      try {
        compileAliases({ "react-native-reanimated-dndd": false })
        return ""
      } catch (error) {
        return (error as Error).message
      }
    })()
    for (const name of CONFIGURABLE_ALIASES) {
      expect(message).toContain(name)
    }
    // And it points at the thing the user might actually have meant.
    expect(message).toContain("give it a target instead of false")
  })

  test("react-native cannot be removed, and the message says why", () => {
    expect(() => compileAliases({ [PLATFORM_ALIAS]: false })).toThrow(
      /it is the platform/,
    )
  })

  test("react-native cannot be retargeted either", () => {
    expect(() =>
      compileAliases({ [PLATFORM_ALIAS]: "something-else" }),
    ).toThrow(/is the platform, not one of the substituted packages/)
  })

  // Only expressible because the rules are data: with an opaque function the
  // preset could not know that two of them claim one specifier.
  test("an overlapping pattern is reported, naming both packages", () => {
    expect(() =>
      compileAliases({
        "react-native-reanimated": {
          pattern: /^react-native-reanimated(.*)$/,
          replace: "react-native-gtkx/reanimated$1",
        },
      }),
    ).toThrow(
      /also matches "react-native-reanimated-dnd", which is declared separately/,
    )
  })

  test("an overlap between two added packages is reported too", () => {
    expect(() =>
      compileAliases({
        "a-pkg": { pattern: /^a-pkg.*$/, replace: "x" },
        "a-pkg-two": "x",
      }),
    ).toThrow(/also matches "a-pkg-two"/)
  })

  test("a pattern that hijacks the platform alias is reported", () => {
    expect(() =>
      compileAliases({
        "my-pkg": { pattern: /^react-native$/, replace: "my-pkg" },
      }),
    ).toThrow(/also matches "react-native"/)
  })

  test("an unanchored pattern is rejected", () => {
    expect(() =>
      compileAliases({ "my-pkg": { pattern: /my-pkg/, replace: "x" } }),
    ).toThrow(/must be anchored with \^/)
  })

  // test() with a sticky/global regex advances lastIndex, so the same
  // specifier would match or not depending on what resolved before it.
  test("a stateful regex flag is rejected", () => {
    expect(() =>
      compileAliases({ "my-pkg": { pattern: /^my-pkg/g, replace: "x" } }),
    ).toThrow(/must not use the g or y flag/)
  })

  test("a relative or absolute target is rejected", () => {
    expect(() => compileAliases({ "my-pkg": "./local/thing" })).toThrow(
      /a path/,
    )
    expect(() => compileAliases({ "my-pkg": "/abs/thing" })).toThrow(/a path/)
  })

  test("an empty or trailing-slash target is rejected", () => {
    expect(() => compileAliases({ "my-pkg": "" })).toThrow(
      /must be a package specifier/,
    )
    expect(() => compileAliases({ "my-pkg": "my-pkg/linux/" })).toThrow(
      /a target ends at the subpath/,
    )
  })

  test("a value that is neither a string, a rule nor false is rejected", () => {
    expect(() => compileAliases({ "my-pkg": 42 as unknown as string })).toThrow(
      /must be a target string, a \{ pattern, replace \} rule, or false/,
    )
    expect(() =>
      compileAliases({
        "my-pkg": { pattern: "^my-pkg", replace: "x" } as unknown as string,
      }),
    ).toThrow(/pattern must be a RegExp/)
  })
})
