// A small, syntactic (no type-checker) source graph over a TypeScript
// project: parse a file once, list what it imports and re-exports, resolve
// a relative specifier to the file it names, and find the declaration
// backing a top-level export. classify.ts walks this graph to answer "does
// evaluating export X ever reach the Adw door".
//
// Deliberately NOT a full ts.Program: we never need type information, only
// "what does this identifier refer to", and a Program needs a tsconfig and
// pays for full binding/checking we do not use. ts.createSourceFile per file
// is enough, and lets classify.ts run against an in-memory fixture (tests)
// exactly as it runs against the real package tree.
import ts from "typescript"

export type FileReader = (absolutePath: string) => string | undefined

// One imported/re-exported name, as bound at the use site.
export type ImportBinding = {
  // The local name this file refers to it by ("Foo" in `import { Foo as
  // Bar }` is "Bar" — the CALL SITE spells "Bar").
  localName: string
  // The name as exported by the specifier's module ("default" for a
  // default import, "*" for a namespace import).
  importedName: string
}

export type ParsedFile = {
  path: string
  sourceFile: ts.SourceFile
  // Specifier text -> bindings pulled from it, from both `import ... from`
  // and `export ... from` (re-export) statements.
  importsBySpecifier: Map<string, ImportBinding[]>
}

const CANDIDATE_SUFFIXES = [".ts", ".tsx", "/index.ts", "/index.tsx"]

// Resolves a specifier to an absolute path good enough to `readFile` with,
// no extension juggling required from the caller.
const withExactOrCandidates = (
  base: string,
  readFile: FileReader,
): string | null => {
  if (readFile(base) !== undefined) {
    return base
  }
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = base + suffix
    if (readFile(candidate) !== undefined) {
      return candidate
    }
  }
  return null
}

const dirname = (path: string): string => {
  const index = path.lastIndexOf("/")
  return index === -1 ? "." : path.slice(0, index)
}

// Collapses ".." / "." segments — good enough for the relative specifiers
// this package actually writes (no symlinks, no drive letters).
const normalize = (path: string): string => {
  const isAbsolute = path.startsWith("/")
  const parts = path.split("/")
  const out: string[] = []
  for (const part of parts) {
    if (part === "" || part === ".") {
      continue
    }
    if (part === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") {
        out.pop()
      } else if (!isAbsolute) {
        out.push("..")
      }
      continue
    }
    out.push(part)
  }
  return (isAbsolute ? "/" : "") + out.join("/")
}

const bindingsFromClause = (
  clause: ts.ImportClause | undefined,
): ImportBinding[] => {
  if (!clause) {
    return []
  }
  const bindings: ImportBinding[] = []
  if (clause.name) {
    bindings.push({ localName: clause.name.text, importedName: "default" })
  }
  const named = clause.namedBindings
  if (named && ts.isNamespaceImport(named)) {
    bindings.push({ localName: named.name.text, importedName: "*" })
  } else if (named && ts.isNamedImports(named)) {
    for (const element of named.elements) {
      bindings.push({
        localName: element.name.text,
        importedName: (element.propertyName ?? element.name).text,
      })
    }
  }
  return bindings
}

const bindingsFromNamedExports = (
  namedBindings: ts.NamedExportBindings | undefined,
): ImportBinding[] => {
  if (!namedBindings || !ts.isNamedExports(namedBindings)) {
    return []
  }
  return namedBindings.elements.map((element) => ({
    localName: element.name.text,
    importedName: (element.propertyName ?? element.name).text,
  }))
}

export class SourceGraph {
  private readonly cache = new Map<string, ParsedFile | null>()
  private readonly readFile: FileReader

  constructor(readFile: FileReader) {
    this.readFile = readFile
  }

  resolve(fromPath: string, specifier: string): string | null {
    if (!specifier.startsWith(".")) {
      // External (bare) specifier — outside this graph by construction.
      return null
    }
    const joined = normalize(`${dirname(fromPath)}/${specifier}`)
    return withExactOrCandidates(joined, this.readFile)
  }

  parse(absolutePath: string): ParsedFile | null {
    if (this.cache.has(absolutePath)) {
      return this.cache.get(absolutePath) ?? null
    }
    const text = this.readFile(absolutePath)
    if (text === undefined) {
      this.cache.set(absolutePath, null)
      return null
    }
    const sourceFile = ts.createSourceFile(
      absolutePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      absolutePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const importsBySpecifier = new Map<string, ImportBinding[]>()
    const record = (specifier: string, bindings: ImportBinding[]): void => {
      if (bindings.length === 0) {
        return
      }
      const existing = importsBySpecifier.get(specifier) ?? []
      importsBySpecifier.set(specifier, [...existing, ...bindings])
    }
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        const specifier = statement.moduleSpecifier
        if (ts.isStringLiteral(specifier)) {
          record(specifier.text, bindingsFromClause(statement.importClause))
        }
      } else if (ts.isExportDeclaration(statement)) {
        const specifier = statement.moduleSpecifier
        if (specifier && ts.isStringLiteral(specifier)) {
          record(
            specifier.text,
            bindingsFromNamedExports(statement.exportClause),
          )
        }
      }
    }
    const parsed: ParsedFile = {
      path: absolutePath,
      sourceFile,
      importsBySpecifier,
    }
    this.cache.set(absolutePath, parsed)
    return parsed
  }

  // Where does `localName` come from: a same-file declaration (searched from
  // `scopeNode` outward through enclosing blocks up to the file's own top
  // level, when given — a helper function's LOCAL `const`, not just a
  // module-level one, the way `createAlert`'s own `const alert = ...; return
  // { alert }` needs), an import (resolved or external), or nowhere?
  lookup(
    file: ParsedFile,
    localName: string,
    scopeNode?: ts.Node,
  ): LookupResult {
    const local = scopeNode
      ? findEnclosingDeclaration(scopeNode, localName)
      : findTopLevelDeclaration(file.sourceFile, localName)
    if (local) {
      return { kind: "local", node: local }
    }
    for (const [specifier, bindings] of file.importsBySpecifier) {
      const binding = bindings.find((b) => b.localName === localName)
      if (binding) {
        const resolved = this.resolve(file.path, specifier)
        return resolved
          ? {
              kind: "import",
              file: resolved,
              importedName: binding.importedName,
            }
          : { kind: "external", specifier, importedName: binding.importedName }
      }
    }
    return { kind: "unknown" }
  }

  // Follows `export { X } from "./y"` / `export * from "./y"` chains to the
  // file+name that actually declares `exportName`, then returns its
  // declaration node (a top-level `const`/`function`) if found locally.
  resolveExport(
    file: ParsedFile,
    exportName: string,
  ): { file: ParsedFile; node: ts.Node } | null {
    const local = findTopLevelDeclaration(file.sourceFile, exportName)
    if (local) {
      return { file, node: local }
    }
    for (const [specifier, bindings] of file.importsBySpecifier) {
      const binding = bindings.find((b) => b.localName === exportName)
      if (!binding) {
        continue
      }
      const resolvedPath = this.resolve(file.path, specifier)
      const nextFile = resolvedPath ? this.parse(resolvedPath) : null
      if (!nextFile) {
        return null
      }
      return this.resolveExport(nextFile, binding.importedName)
    }
    // `export * from "./y"` re-exports everything without naming it —
    // check every star re-export as a last resort (rare in this package).
    for (const statement of file.sourceFile.statements) {
      if (
        ts.isExportDeclaration(statement) &&
        !statement.exportClause &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const resolvedPath = this.resolve(
          file.path,
          statement.moduleSpecifier.text,
        )
        const nextFile = resolvedPath ? this.parse(resolvedPath) : null
        const found = nextFile ? this.resolveExport(nextFile, exportName) : null
        if (found) {
          return found
        }
      }
    }
    return null
  }
}

export type LookupResult =
  | { kind: "local"; node: ts.Node }
  | { kind: "import"; file: string; importedName: string }
  | { kind: "external"; specifier: string; importedName: string }
  | { kind: "unknown" }

// A single statement list's `const NAME = ...` / `function NAME(...) {}` —
// shared by the file-top-level search and the enclosing-block search below.
// Destructured bindings (`const { AlertDialog } = requireAdwGi(...)`) have
// no initializer of their own; the whole declaration's initializer (the
// call itself) is what "defines" one of their names for this analysis.
const findInStatements = (
  statements: readonly ts.Statement[],
  name: string,
): ts.Node | null => {
  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === name
        ) {
          return declaration.initializer ?? declaration
        }
        if (ts.isObjectBindingPattern(declaration.name)) {
          for (const element of declaration.name.elements) {
            if (ts.isIdentifier(element.name) && element.name.text === name) {
              return declaration.initializer ?? declaration
            }
          }
        }
      }
    }
  }
  return null
}

// A top-level `const NAME = ...`, `function NAME(...) {}`, or `export const
// NAME = ...` / `export function NAME() {}` declaration.
export const findTopLevelDeclaration = (
  sourceFile: ts.SourceFile,
  name: string,
): ts.Node | null => findInStatements(sourceFile.statements, name)

// Same search, but starting from an arbitrary node and walking OUTWARD
// through enclosing block/function bodies before falling back to the file's
// own top level — a helper function's own local `const`, not just a
// module-level one.
export const findEnclosingDeclaration = (
  fromNode: ts.Node,
  name: string,
): ts.Node | null => {
  let current: ts.Node | undefined = fromNode
  while (current) {
    if (ts.isBlock(current) || ts.isSourceFile(current)) {
      const found = findInStatements(current.statements, name)
      if (found) {
        return found
      }
    }
    if (ts.isSourceFile(current)) {
      break
    }
    current = current.parent
  }
  return null
}
