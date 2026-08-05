// Regression guard for .claude/epics/adw-optional/007-sea-tla.md: a
// module-scope top-level await in gtkx/bridge/adw.ts broke `react-native
// build-linux` outright (with or without --sea/--standalone) — Metro's own
// minifier (metro-minify-terser) parses each module's compiled factory as a
// plain SCRIPT, not an ES module, so a bare `await` anywhere at the module's
// own top level is a hard syntax error there, regardless of which runtime
// branch is ever reached. This is cross-platform (parses the TS source
// directly via the TypeScript compiler API — the same package `tsc` itself
// runs on this repo, so no build or GTK runtime is needed) and asserts the
// actual property that matters: no `await` expression appears outside of a
// function body anywhere in the file, on either the source (this file) or
// the compiled dist emit `npm run build:dist` produces (same AST shape,
// since tsc does not restructure await expressions).
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as ts from "typescript"
import { describe, expect, it } from "vitest"

const SRC_FILE = join(import.meta.dirname, "../../../src/gtkx/bridge/adw.ts")

/**
 * True if `node` (or anything inside it) is an AwaitExpression NOT nested
 * inside a function boundary between it and the file's own top level —
 * i.e. a genuine module-scope top-level await.
 */
const containsTopLevelAwait = (node: ts.Node): boolean => {
  let found = false
  const visit = (current: ts.Node): void => {
    if (found) {
      return
    }
    if (ts.isAwaitExpression(current)) {
      found = true
      return
    }
    // A function boundary makes any await inside it non-top-level: stop
    // descending, since an await there needs the file to be free of a
    // module-scope one, not that function itself.
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isGetAccessor(current) ||
      ts.isSetAccessor(current)
    ) {
      return
    }
    ts.forEachChild(current, visit)
  }
  ts.forEachChild(node, visit)
  return found
}

describe("gtkx/bridge/adw.ts has no module-scope top-level await", () => {
  it("source", () => {
    const source = readFileSync(SRC_FILE, "utf8")
    const sourceFile = ts.createSourceFile(
      SRC_FILE,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const offenders = sourceFile.statements.filter((statement) =>
      ts.isAwaitExpression(statement) ? true : containsTopLevelAwait(statement),
    )
    expect(offenders.length).toBe(0)
  })

  // Belt-and-braces: confirms the property survives a real TS->JS emission
  // too (tsc erases types but does not restructure expressions, so this is
  // expected to match the source-level result — this is what Metro/rolldown
  // actually parse, dist being what the package ships).
  it("compiled output", () => {
    const source = readFileSync(SRC_FILE, "utf8")
    const result = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: SRC_FILE,
    })
    const emitted = ts.createSourceFile(
      "adw.js",
      result.outputText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    )
    const offenders = emitted.statements.filter((statement) =>
      ts.isAwaitExpression(statement) ? true : containsTopLevelAwait(statement),
    )
    expect(offenders.length).toBe(0)
  })
})
