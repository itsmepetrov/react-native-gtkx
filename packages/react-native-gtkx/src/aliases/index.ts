// The package alias table, and the one place either preset learns about it.
//
// Six package names are rewritten onto this platform's own implementations.
// Until now `src/metro/index.ts` and `src/vite/index.ts` each hand-rolled the
// same six rules, and they drifted: the vite preset's `ssr.noExternal` listed
// three of the six names, so vite handed the other three to Node before any
// `resolveId` hook could run and the REAL `react-native-gesture-handler`
// loaded into a linux app (#90). Deriving both the resolver rules and the
// externalization list from one object makes that class of bug inexpressible.
//
// This module is imported with an explicit `.js` extension by both presets,
// because bare Node loads them (metro.config.ts, vite.config.ts) and its ESM
// resolver does not guess extensions — see scripts/check-package.ts.
//
// The rules are DATA rather than functions on purpose. Data can be validated:
// a typo'd key can be named, a pattern that also matches a separately declared
// package can be reported at config time, and the string form can be anchored
// by construction. All three are failure modes this repo has actually had.

/**
 * A rewrite rule in its general form: a pattern matched against the whole
 * specifier and the replacement it produces (`$1`… back-references allowed).
 * Only needed when a package's subpath layout differs from its target's — the
 * string form covers "exact name or subpath, tail transplanted".
 */
export type AliasPattern = {
  pattern: RegExp
  replace: string
}

/**
 * What an `aliases` entry may say about one package name:
 * - a string target — exact name or subpath, tail transplanted;
 * - a `{ pattern, replace }` rule for a differing subpath layout;
 * - `false` — drop an alias this preset installs, so the real package loads.
 */
export type AliasOverride = string | AliasPattern | false

/** The `aliases` option, keyed by package name. */
export type AliasOverrides = Readonly<Record<string, AliasOverride>>

/** A validated rule, tagged with the package name it was declared under. */
export type CompiledAlias = {
  /** The package name this rule belongs to. */
  name: string
  pattern: RegExp
  replace: string
}

/** The result of validating an `aliases` option against the defaults. */
export type AliasTable = {
  /**
   * Rules to try, most specific package name first. Order is a tie-breaker
   * only: overlapping rules are rejected, so at most one can ever match.
   */
  rules: readonly CompiledAlias[]
  /**
   * Every package name the table knows about, INCLUDING the ones turned off
   * with `false`. The vite preset keeps all of them inside its own pipeline:
   * a package whose alias was dropped still imports `react-native` at module
   * scope, and that import only reaches the alias if Node never sees the
   * package first.
   */
  names: readonly string[]
}

/**
 * `react-native` is not a package substitution and is not configurable. It is
 * the platform: "the react-native API rendered as GTK widgets" is what this
 * package IS, so a preset that stopped aliasing it would not be this preset.
 */
export const PLATFORM_ALIAS = "react-native"

/**
 * The aliases both presets install, package name → target. See docs/api.md
 * for the full story on each, and for which one is a real choice.
 */
export const DEFAULT_ALIASES: Readonly<Record<string, string>> = {
  // The platform. Not configurable: the out-of-tree npmPackageName
  // declaration alone does not alias imports for a Metro `bundle`, and the
  // vite path has no such declaration at all — the resolver has to.
  "react-native": "react-native-gtkx",
  // The SVG surface, in the shape of the react-native-svg package (see
  // src/svg-compat/index.ts). The real package is a native module.
  "react-native-svg": "react-native-gtkx/svg",
  // Drag and drop, on GtkDragSource/GtkDropTarget (see src/dnd/index.ts).
  // The ONE alias that is a genuine choice: the real 2.0.0 does run here on
  // top of the compat surfaces below, so an app may want it. Everything else
  // in this table substitutes an implementation that cannot run at all.
  "react-native-reanimated-dnd": "react-native-gtkx/dnd",
  // Reanimated, on GTK's frame clock (see src/reanimated-compat/index.tsx).
  // The real package needs a worklet runtime and a Babel plugin.
  "react-native-reanimated": "react-native-gtkx/reanimated",
  // Where Reanimated 4 moved the worklet surface (see
  // src/worklets-compat/index.ts). Libraries pull scheduleOnRN/scheduleOnUI
  // out of it at module scope with no try/require guard, so an unaliased
  // name fails at IMPORT rather than at use.
  "react-native-worklets": "react-native-gtkx/worklets",
  // Not a port of RNGH (docs/research/gestures.md): the shim supplies
  // GestureHandlerRootView, the one symbol apps that use none of the rest
  // still have at the root of their tree, and makes every other export throw
  // where it is used instead of arriving as undefined.
  "react-native-gesture-handler": "react-native-gtkx/gesture-handler",
}

/** The default aliases an app may retarget or drop — everything but the platform. */
export const CONFIGURABLE_ALIASES: readonly string[] = Object.keys(
  DEFAULT_ALIASES,
).filter((name) => name !== PLATFORM_ALIAS)

const fail = (message: string): never => {
  throw new Error(`react-native-gtkx: ${message}`)
}

const quoted = (names: readonly string[]): string =>
  names.map((name) => `"${name}"`).join(", ")

const escapeRegExp = (literal: string): string =>
  literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * The string form, compiled. The guard is exact-match-or-slash-prefix, never a
 * bare prefix: `react-native-reanimated-dnd` is a lookalike of
 * `react-native-reanimated`, and `react-native-worklets-core` is a REAL and
 * unrelated package (the VisionCamera one) that looks like
 * `react-native-worklets`. A loose prefix would rewrite either onto a
 * `react-native-gtkx/*` subpath that does not exist. The lookahead keeps the
 * tail out of the match so `String.replace` transplants it onto the target.
 */
export const aliasPattern = (name: string, target: string): AliasPattern => ({
  pattern: new RegExp(`^${escapeRegExp(name)}(?=$|/)`),
  replace: target,
})

const isAliasPattern = (value: unknown): value is AliasPattern =>
  typeof value === "object" &&
  value !== null &&
  "pattern" in value &&
  "replace" in value

const checkTarget = (name: string, target: string): void => {
  if (target.trim() !== target || target === "") {
    fail(
      `aliases["${name}"] must be a package specifier, got ${JSON.stringify(target)}.`,
    )
  }
  if (target.startsWith(".") || target.startsWith("/")) {
    fail(
      `aliases["${name}"] is ${JSON.stringify(target)}, a path. Alias targets are module ` +
        "specifiers resolved from the importing file — name a package or one of its " +
        "subpaths instead.",
    )
  }
  if (target.endsWith("/")) {
    fail(
      `aliases["${name}"] is ${JSON.stringify(target)}; a target ends at the subpath, ` +
        "not at a slash — the matched tail is appended to it.",
    )
  }
}

const compileOverride = (name: string, value: AliasOverride): CompiledAlias => {
  if (typeof value === "string") {
    checkTarget(name, value)
    return { name, ...aliasPattern(name, value) }
  }
  if (!isAliasPattern(value)) {
    fail(
      `aliases["${name}"] must be a target string, a { pattern, replace } rule, or false.`,
    )
  }
  const { pattern, replace } = value as AliasPattern
  if (!(pattern instanceof RegExp)) {
    fail(`aliases["${name}"].pattern must be a RegExp.`)
  }
  if (typeof replace !== "string") {
    fail(`aliases["${name}"].replace must be a string.`)
  }
  if (pattern.flags.includes("g") || pattern.flags.includes("y")) {
    fail(
      `aliases["${name}"].pattern must not use the g or y flag: a stateful lastIndex ` +
        "makes the same specifier match or not depending on what was resolved before it.",
    )
  }
  if (!pattern.source.startsWith("^")) {
    fail(
      `aliases["${name}"].pattern must be anchored with ^: an unanchored pattern matches ` +
        `inside a longer specifier, so ${pattern} would also rewrite packages that merely ` +
        "contain that text.",
    )
  }
  return { name, pattern, replace }
}

// Probes stand in for "this package, and something inside it". Any rule that
// matches one of them owns that package name.
const probesFor = (name: string): string[] => [name, `${name}/__subpath__`]

/**
 * Rejects two rules that can both claim the same specifier. Only possible with
 * the `{ pattern }` form — the string form is anchored to its own package name
 * and cannot reach another one — and it is exactly the trap the presets carry
 * a comment about: an anchored replace on a loose prefix turns
 * `react-native-reanimated-dnd` into `react-native-gtkx/reanimated-dnd`, which
 * does not exist. With every rule declared as data, the preset can see it.
 */
const checkOverlaps = (rules: readonly CompiledAlias[]): void => {
  for (const rule of rules) {
    for (const other of rules) {
      if (other.name === rule.name) {
        continue
      }
      const hit = probesFor(other.name).find((probe) =>
        rule.pattern.test(probe),
      )
      if (hit !== undefined) {
        fail(
          `aliases["${rule.name}"].pattern (${rule.pattern}) also matches "${hit}", which is ` +
            `declared separately as "${other.name}". Two rules claiming one specifier make ` +
            "resolution order-dependent — narrow the pattern, or use the string form, which " +
            "is anchored to its own package name and cannot overlap.",
        )
      }
    }
  }
}

const checkKey = (name: string, value: AliasOverride): void => {
  if (name === PLATFORM_ALIAS) {
    fail(
      value === false
        ? `aliases["${PLATFORM_ALIAS}"] cannot be false. "${PLATFORM_ALIAS}" is not a package ` +
            "substitution here, it is the platform: rendering the react-native API as GTK " +
            "widgets is what this preset does, and dropping the alias would leave the app " +
            `importing a package with no linux implementation. Removable: ${quoted(CONFIGURABLE_ALIASES)}.`
        : `aliases["${PLATFORM_ALIAS}"] cannot be retargeted. "${PLATFORM_ALIAS}" is the ` +
            "platform, not one of the substituted packages — it always resolves to " +
            `react-native-gtkx. Configurable: ${quoted(CONFIGURABLE_ALIASES)}.`,
    )
  }
  if (value === false && !(name in DEFAULT_ALIASES)) {
    fail(
      `aliases["${name}"] is false, but "${name}" is not an alias this preset installs, so ` +
        `there is nothing to drop. Aliases that can be dropped: ${quoted(CONFIGURABLE_ALIASES)}. ` +
        `(To ADD an alias for "${name}", give it a target instead of false.)`,
    )
  }
}

/**
 * Merges an app's `aliases` deltas over the defaults and validates the result.
 * Throws — at config load, where the mistake is — with a message that names
 * the valid keys.
 *
 * Deltas rather than a replacement list because a replacement list can
 * silently lose an entry, which is #90 all over again: an app that re-listed
 * five of the six names would get the sixth handed to Node before the alias
 * ran, and the failure surfaces as an unrelated crash deep inside a library.
 */
export const compileAliases = (overrides: AliasOverrides = {}): AliasTable => {
  const targets = new Map<string, AliasOverride>(
    Object.entries(DEFAULT_ALIASES),
  )
  for (const [name, value] of Object.entries(overrides)) {
    checkKey(name, value)
    targets.set(name, value)
  }
  const rules: CompiledAlias[] = []
  for (const [name, value] of targets) {
    if (value !== false) {
      rules.push(compileOverride(name, value))
    }
  }
  checkOverlaps(rules)
  // Longest package name first. Overlaps are rejected above, so this only
  // fixes an order rather than choosing between candidates — but a stable,
  // most-specific-first order is what a reader expects when they scan it.
  rules.sort(
    (a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name),
  )
  return { rules, names: [...targets.keys()] }
}

/**
 * Applies a compiled table to one specifier. Returns the rewritten specifier,
 * or null when nothing claims it — including for `react-native-gtkx` itself
 * and for every package the app turned off with `false`.
 */
export const applyAliases = (
  table: AliasTable,
  specifier: string,
): string | null => {
  for (const rule of table.rules) {
    if (rule.pattern.test(specifier)) {
      return specifier.replace(rule.pattern, rule.replace)
    }
  }
  return null
}

/** The table with no app overrides — what both presets install by default. */
export const DEFAULT_ALIAS_TABLE: AliasTable = compileAliases()
