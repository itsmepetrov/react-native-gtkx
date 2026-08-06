// The derivation itself: given a public surface entry (a file + exported
// name), does evaluating it ever reach the Adw door
// (packages/react-native-gtkx/src/gtkx/bridge/adw.ts and its two siblings —
// see DoorConfig below), and if so, is every path to the door gated behind
// `adwAvailable()` (probe-guarded — works on plain GTK, richer under Adw) or
// does at least one path reach it unconditionally (hard Adw — absent or
// refusing on plain GTK)?
//
// Two passes, run in sequence:
//
// 1. `resolveLeaves` — a tiny, deliberately narrow interpreter that follows
//    the ONE indirection this package's own architecture actually uses: a
//    host object (all its methods defined in one file) injected into
//    factory functions defined in OTHER files (`createAlert(host)`,
//    `createAppearance(host)`, ...), wired together at exactly one call site
//    per factory (apis/index.ts). Without tracing that, a plain "does the
//    FILE import the door" check marks every export of apis/index.ts as Adw
//    (all of them are wired to the one host object whose *file* imports the
//    door) even though only two or three of the host's methods actually
//    touch it. `resolveLeaves` follows identifiers, member access,
//    conditionals and one level of call/parameter binding down to the
//    expressions that actually decide the question, then hands each one to:
// 2. `existsDoorTouch` — a generic recursive walk of a leaf expression that
//    finds every reference to a door export and asks whether it sits behind
//    a local `adwAvailable()` guard (a surrounding `cond ? adwGuarded :
//    plainFallback` or `if (adwAvailable()) { ... }`, including one hop
//    through a named boolean like `useAdwChrome = x && adwAvailable()`).
//
// Scope, stated once: this is a heuristic over syntax, not a type-checked
// data-flow prover. It resolves exactly the shapes this package's own
// source uses (arrow/function bodies, object literals, single-argument
// factory calls, ternary and if-guards) and falls back to "scan the
// expression as-is" for anything else — which, for code that never
// references a door export, safely reads as GTK. Extending it to a new
// shape is expected as the source grows; getting the WRONG answer for an
// unrecognized shape would fail loud (docs:check mismatch), not silently.
import ts from "typescript"
import type { ParsedFile } from "./graph.ts"
import { SourceGraph } from "./graph.ts"

export type DoorConfig = {
  // Absolute paths of the modules that constitute "the door". Resolved once
  // by the caller (real paths for the package, fixture paths for tests).
  doorModules: readonly string[]
  // The export that, called and checked, gates the rest ("adwAvailable").
  probeExportName: string
  // Exports from a door module that require Adw to already be there —
  // calling one with no guard in front of it is what makes a path "hard".
  gatedExportNames: readonly string[]
  // Modules where importing ANYTHING is itself the hard cost (an eager,
  // module-scope import with no probe involved at all, e.g. adw-namespace.ts).
  eagerModules: readonly string[]
}

export type Profile = "gtk" | "hard-adw" | "probe-guarded"

export type ClassifyResult = {
  profile: Profile
  // Human-readable trail — which door export was reached, from where.
  evidence: string[]
}

const isDoor = (config: DoorConfig, file: string): boolean =>
  config.doorModules.includes(file)
const isEager = (config: DoorConfig, file: string): boolean =>
  config.eagerModules.includes(file)

// One binding of a function parameter to the (unevaluated) argument
// expression at its call site, plus the environment that expression must be
// read in — a minimal closure, enough for the one level of factory(host)
// indirection this package uses.
type Env = ReadonlyMap<
  string,
  { file: ParsedFile; expr: ts.Expression; env: Env }
>
const EMPTY_ENV: Env = new Map()

type Leaf = { file: ParsedFile; node: ts.Node }

const unwrap = (expr: ts.Expression): ts.Expression => {
  let current = expr
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = ts.isParenthesizedExpression(current)
      ? current.expression
      : (current.expression as ts.Expression)
  }
  return current
}

const functionParamNames = (
  fn:
    | ts.ArrowFunction
    | ts.FunctionExpression
    | ts.FunctionDeclaration
    | ts.MethodDeclaration,
): string[] =>
  fn.parameters
    .map((p) => (ts.isIdentifier(p.name) ? p.name.text : null))
    .filter((n): n is string => n !== null)

const isFunctionLike = (
  node: ts.Node,
): node is ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration =>
  ts.isArrowFunction(node) ||
  ts.isFunctionExpression(node) ||
  ts.isFunctionDeclaration(node)

// Every `return <expr>` AND every top-level `<expr>;`/`void <expr>` at the
// top level of a function body block (not descending into nested
// functions). The latter matters as much as the former: a fire-and-forget
// body like `alert.ts`'s (`void host.showAlert(...).then(...).catch(...)`)
// never returns anything, so its interesting expression only shows up as a
// plain ExpressionStatement — skipping it would leave the one call that
// actually reaches the host invisible to the structural (env-aware) side of
// this analysis, visible only to existsDoorTouch's dumber generic scan,
// which does not resolve parameter member access at all.
const topLevelBlockExpressions = (block: ts.Block): ts.Expression[] => {
  const found: ts.Expression[] = []
  const walk = (node: ts.Node): void => {
    if (isFunctionLike(node) || ts.isMethodDeclaration(node)) {
      return
    }
    if (ts.isReturnStatement(node) && node.expression) {
      found.push(node.expression)
      return
    }
    if (ts.isExpressionStatement(node)) {
      const expression = ts.isVoidExpression(node.expression)
        ? node.expression.expression
        : node.expression
      found.push(expression)
      return
    }
    ts.forEachChild(node, walk)
  }
  ts.forEachChild(block, walk)
  return found
}

// Resolves a callee-position expression to the graph's SourceGraph so
// resolveLeaves/resolveObjectShape can share one lookup implementation.
class Interpreter {
  private readonly graph: SourceGraph
  private readonly config: DoorConfig

  constructor(graph: SourceGraph, config: DoorConfig) {
    this.graph = graph
    this.config = config
  }

  // The two-phase entry point: find every leaf expression the export's
  // value can reach, then scan each for a guarded/unguarded door touch.
  classify(file: ParsedFile, node: ts.Node): ClassifyResult {
    const leaves = this.resolveLeaves(file, node, EMPTY_ENV, 0, true)
    let profile: Profile = "gtk"
    const evidence: string[] = []
    for (const leaf of leaves) {
      const result = existsDoorTouch(
        this.graph,
        this.config,
        leaf.file,
        leaf.node,
        new Set(),
        0,
      )
      if (!result.touched) {
        continue
      }
      evidence.push(...result.evidence)
      if (result.hard) {
        profile = "hard-adw"
      } else if (profile === "gtk") {
        profile = "probe-guarded"
      }
    }
    return { profile, evidence }
  }

  // obj.prop / obj[prop]-as-identifier resolution: what VALUE does `obj`
  // stand for, so we can look `prop` up inside it (an object literal, or the
  // returned object of a factory call)?
  private resolveObjectShape(
    file: ParsedFile,
    expr: ts.Expression,
    env: Env,
    depth: number,
  ): { file: ParsedFile; node: ts.ObjectLiteralExpression; env: Env } | null {
    if (depth > 40) {
      return null
    }
    const node = unwrap(expr)
    if (ts.isObjectLiteralExpression(node)) {
      return { file, node, env }
    }
    if (ts.isIdentifier(node)) {
      const bound = env.get(node.text)
      if (bound) {
        return this.resolveObjectShape(
          bound.file,
          bound.expr,
          bound.env,
          depth + 1,
        )
      }
      const looked = this.graph.lookup(file, node.text, node)
      if (looked.kind === "local" && ts.isExpression(looked.node)) {
        return this.resolveObjectShape(file, looked.node, env, depth + 1)
      }
      if (looked.kind === "import") {
        const nextFile = this.graph.parse(looked.file)
        if (!nextFile) {
          return null
        }
        const resolved = this.graph.resolveExport(nextFile, looked.importedName)
        if (resolved && ts.isExpression(resolved.node)) {
          return this.resolveObjectShape(
            resolved.file,
            resolved.node,
            EMPTY_ENV,
            depth + 1,
          )
        }
      }
      return null
    }
    if (ts.isCallExpression(node)) {
      const call = this.enterCall(file, node, env, depth)
      if (!call) {
        return null
      }
      for (const ret of call.returns) {
        const shape = this.resolveObjectShape(
          call.file,
          ret,
          call.env,
          depth + 1,
        )
        if (shape) {
          return shape
        }
      }
      return null
    }
    return null
  }

  // Resolves `callee(args)` to the callee's own file/body plus a fresh env
  // binding each parameter name to its (unevaluated) argument, and the
  // function's top-level return expressions (or the body itself, when nothing
  // returns — a void factory method, scanned directly as a leaf by the caller).
  private enterCall(
    file: ParsedFile,
    call: ts.CallExpression,
    env: Env,
    depth: number,
  ): {
    file: ParsedFile
    env: Env
    returns: ts.Expression[]
    bodyAsLeaf?: ts.Node
    fullBody?: ts.Block
  } | null {
    const callee = unwrap(call.expression)
    if (!ts.isIdentifier(callee) && !ts.isPropertyAccessExpression(callee)) {
      return null
    }
    // Only plain-identifier callees are followed into a definition — this
    // package always calls its factories by bare name (`createAlert(...)`),
    // never through a namespace/member path.
    if (!ts.isIdentifier(callee)) {
      return null
    }
    const bound = env.get(callee.text)
    const target = bound
      ? this.resolveCallable(bound.file, bound.expr, bound.env, depth + 1)
      : this.resolveCallableByName(file, callee, callee.text, depth + 1)
    if (!target) {
      return null
    }
    const paramNames = functionParamNames(target.fn)
    const newEnv = new Map(EMPTY_ENV)
    paramNames.forEach((name, index) => {
      const arg = call.arguments[index]
      if (arg) {
        newEnv.set(name, { file, expr: arg, env })
      }
    })
    const body = target.fn.body
    if (!body) {
      return null
    }
    if (ts.isBlock(body)) {
      const returns = topLevelBlockExpressions(body)
      // Both: recurse into the return/expression-statement value(s) (needed
      // to keep following a returned object/call, or a fire-and-forget
      // `host.foo(...)` statement, for member access or expansion) AND keep
      // the whole block as a supplementary scan target, so a door touch
      // this interpreter does not model is still seen by existsDoorTouch's
      // generic scan.
      return returns.length > 0
        ? { file: target.file, env: newEnv, returns, fullBody: body }
        : { file: target.file, env: newEnv, returns: [], bodyAsLeaf: body }
    }
    // Arrow with an expression body (`(host) => ({ ... })` or `(host) =>
    // host.getColorScheme()`).
    return { file: target.file, env: newEnv, returns: [body] }
  }

  private resolveCallableByName(
    file: ParsedFile,
    fromNode: ts.Node,
    name: string,
    depth: number,
  ): {
    file: ParsedFile
    fn: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration
  } | null {
    const looked = this.graph.lookup(file, name, fromNode)
    if (looked.kind === "local") {
      if (isFunctionLike(looked.node)) {
        return { file, fn: looked.node }
      }
      if (ts.isExpression(looked.node)) {
        return this.resolveCallable(file, looked.node, EMPTY_ENV, depth)
      }
      return null
    }
    if (looked.kind === "import") {
      const nextFile = this.graph.parse(looked.file)
      if (!nextFile) {
        return null
      }
      const resolved = this.graph.resolveExport(nextFile, looked.importedName)
      if (resolved && isFunctionLike(resolved.node)) {
        return { file: resolved.file, fn: resolved.node }
      }
      if (resolved && ts.isExpression(resolved.node)) {
        return this.resolveCallable(
          resolved.file,
          resolved.node,
          EMPTY_ENV,
          depth,
        )
      }
    }
    return null
  }

  private resolveCallable(
    file: ParsedFile,
    expr: ts.Expression,
    env: Env,
    depth: number,
  ): {
    file: ParsedFile
    fn: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration
  } | null {
    if (depth > 40) {
      return null
    }
    const node = unwrap(expr)
    if (isFunctionLike(node)) {
      return { file, fn: node }
    }
    if (ts.isIdentifier(node)) {
      const bound = env.get(node.text)
      if (bound) {
        return this.resolveCallable(
          bound.file,
          bound.expr,
          bound.env,
          depth + 1,
        )
      }
      return this.resolveCallableByName(file, node, node.text, depth + 1)
    }
    return null
  }

  // A method/get-accessor property's block body: recurse into its return
  // expression(s) the same way a factory call's body would, so a getter
  // like `get Version() { return host.gtkVersion() }` still resolves the
  // member access on `host` instead of being handed to existsDoorTouch as
  // an opaque, env-unaware block.
  private resolveBlockBody(
    file: ParsedFile,
    body: ts.Block,
    env: Env,
    depth: number,
  ): Leaf[] {
    const returns = topLevelBlockExpressions(body)
    const leaves = returns.flatMap((ret) =>
      this.resolveLeaves(file, ret, env, depth + 1, false),
    )
    return [...leaves, { file, node: body }]
  }

  // The main descent: follow an export's value down to the expressions that
  // decide whether it touches Adw. Object literals expand to EVERY property
  // (the doc surface is one row for the whole thing); everything else
  // narrows until it bottoms out at something existsDoorTouch can scan.
  //
  // `allowEnter` gates ONLY the plain `identifier(args)` call case, and is
  // true for exactly one call in the whole descent: classify()'s initial
  // one, when the export's own value IS a call
  // (`export const Alert = createAlert(gtkxHost)`) whose returned object we
  // want to expand into per-property leaves. Every other call a factory
  // body makes (`showAlertAdw(request)` inside a ternary, say) is left as a
  // leaf in its ORIGINAL position instead — entering it would relocate the
  // scan into the callee's own body, severing it from the guard
  // (`adwAvailable() ? ... : ...`) that surrounds the call site, which is
  // exactly what existsDoorTouch's own (guard-aware) call-following exists
  // to see. Property access (`host.prop`) is unrestricted by this flag: it
  // is the structural indirection this analysis exists to follow, not "one
  // more call".
  resolveLeaves(
    file: ParsedFile,
    node: ts.Node,
    env: Env,
    depth: number,
    allowEnter: boolean,
  ): Leaf[] {
    if (depth > 60) {
      return [{ file, node }]
    }
    if (isFunctionLike(node)) {
      // A bare function reference, never called with known arguments here
      // (e.g. classifying a whole exported function directly) — descend
      // into its body the same way a call's return value would be, so a
      // ternary/object-literal body still gets the specialized handling
      // below rather than being handed to existsDoorTouch raw.
      if (!node.body) {
        return []
      }
      return ts.isBlock(node.body)
        ? this.resolveBlockBody(file, node.body, env, depth)
        : this.resolveLeaves(file, node.body, env, depth + 1, false)
    }
    if (!ts.isExpression(node)) {
      return [{ file, node }]
    }
    const expr = unwrap(node)
    if (ts.isObjectLiteralExpression(expr)) {
      const leaves: Leaf[] = []
      for (const prop of expr.properties) {
        if (ts.isPropertyAssignment(prop)) {
          leaves.push(
            ...this.resolveLeaves(
              file,
              prop.initializer,
              env,
              depth + 1,
              false,
            ),
          )
        } else if (ts.isShorthandPropertyAssignment(prop)) {
          leaves.push(
            ...this.resolveLeaves(file, prop.name, env, depth + 1, false),
          )
        } else if (
          ts.isMethodDeclaration(prop) ||
          ts.isGetAccessorDeclaration(prop)
        ) {
          if (prop.body) {
            leaves.push(...this.resolveBlockBody(file, prop.body, env, depth))
          }
        }
      }
      return leaves
    }
    if (ts.isConditionalExpression(expr)) {
      return [
        ...this.resolveLeaves(file, expr.whenTrue, env, depth + 1, false),
        ...this.resolveLeaves(file, expr.whenFalse, env, depth + 1, false),
      ]
    }
    if (ts.isIdentifier(expr)) {
      const bound = env.get(expr.text)
      if (bound) {
        return this.resolveLeaves(
          bound.file,
          bound.expr,
          bound.env,
          depth + 1,
          allowEnter,
        )
      }
      const looked = this.graph.lookup(file, expr.text, expr)
      if (looked.kind === "local") {
        return this.resolveLeaves(file, looked.node, env, depth + 1, allowEnter)
      }
      if (looked.kind === "import") {
        if (
          isDoor(this.config, looked.file) ||
          isEager(this.config, looked.file)
        ) {
          // A door export referenced (not called) directly — treat the
          // reference itself as the leaf; existsDoorTouch recognizes it.
          return [{ file, node: expr }]
        }
        const nextFile = this.graph.parse(looked.file)
        const resolved = nextFile
          ? this.graph.resolveExport(nextFile, looked.importedName)
          : null
        return resolved
          ? this.resolveLeaves(
              resolved.file,
              resolved.node,
              EMPTY_ENV,
              depth + 1,
              allowEnter,
            )
          : []
      }
      return []
    }
    if (ts.isPropertyAccessExpression(expr)) {
      const shape = this.resolveObjectShape(file, expr.expression, env, depth)
      if (!shape) {
        // The object side isn't a shape this interpreter can name (a
        // Promise chain link like `.then(...)`/`.catch(...)`, say) — keep
        // digging into IT, since the interesting member access
        // (`host.showAlert`) may be nested another level down inside it
        // (`host.showAlert(...).then(...).catch(...)`), plus fall back to a
        // raw leaf so existsDoorTouch's generic scan still covers whatever
        // this does not model.
        return [
          ...this.resolveLeaves(file, expr.expression, env, depth + 1, false),
          { file, node: expr },
        ]
      }
      const propName = expr.name.text
      for (const prop of shape.node.properties) {
        if (
          (ts.isPropertyAssignment(prop) ||
            ts.isShorthandPropertyAssignment(prop)) &&
          prop.name &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === propName
        ) {
          const value = ts.isPropertyAssignment(prop)
            ? prop.initializer
            : prop.name
          return this.resolveLeaves(
            shape.file,
            value,
            shape.env,
            depth + 1,
            false,
          )
        }
        if (
          (ts.isMethodDeclaration(prop) || ts.isGetAccessorDeclaration(prop)) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === propName &&
          prop.body
        ) {
          return this.resolveBlockBody(shape.file, prop.body, shape.env, depth)
        }
      }
      return []
    }
    if (ts.isCallExpression(expr)) {
      // Member-access ARGUMENTS are followed regardless of how the callee
      // itself resolves — `useSyncExternalStore(store.subscribe,
      // store.getSnapshot)` never CALLS `store.getSnapshot` itself (React
      // does, invisibly to static analysis), it just hands the member
      // access off as a value. Narrowed to property access specifically
      // (not a bare identifier argument): a plain identifier argument is
      // usually an injected object meant to stay an opaque, lazily-bound
      // parameter (`createAlert(gtkxHost)`) — eagerly resolving THAT would
      // expand the whole host shape into the call, well beyond what this
      // one factory actually reads off it.
      const argumentLeaves = expr.arguments
        .filter((arg) => ts.isPropertyAccessExpression(unwrap(arg)))
        .flatMap((arg) => this.resolveLeaves(file, arg, env, depth + 1, false))
      const callee = unwrap(expr.expression)
      if (ts.isPropertyAccessExpression(callee)) {
        // A member call (`host.showAlert(...)`) — always resolve which
        // property this is (the host-object indirection this analysis
        // exists to follow), regardless of allowEnter: this is structural,
        // not "entering one more plain call".
        return [
          ...this.resolveLeaves(file, callee, env, depth + 1, false),
          ...argumentLeaves,
        ]
      }
      if (!allowEnter) {
        // Left in place, at its original source position — existsDoorTouch
        // follows plain calls itself, with correct guard attribution.
        return [{ file, node: expr }, ...argumentLeaves]
      }
      const call = this.enterCall(file, expr, env, depth)
      if (!call) {
        return [{ file, node: expr }, ...argumentLeaves]
      }
      if (call.bodyAsLeaf) {
        return [{ file: call.file, node: call.bodyAsLeaf }, ...argumentLeaves]
      }
      const leaves = call.returns.flatMap((ret) =>
        this.resolveLeaves(call.file, ret, call.env, depth + 1, false),
      )
      return call.fullBody
        ? [
            ...leaves,
            { file: call.file, node: call.fullBody },
            ...argumentLeaves,
          ]
        : [...leaves, ...argumentLeaves]
    }
    return [{ file, node: expr }]
  }
}

// Does `testExpr` involve a call to the probe, directly or through one hop
// of a named boolean (`const useAdwChrome = contentChrome && adwAvailable()`
// then `useAdwChrome ? ... : ...`)?
const testInvolvesProbe = (
  graph: SourceGraph,
  config: DoorConfig,
  file: ParsedFile,
  testExpr: ts.Expression,
  depth: number,
): boolean => {
  if (depth > 10) {
    return false
  }
  const expr = unwrap(testExpr)
  if (ts.isCallExpression(expr)) {
    const callee = unwrap(expr.expression)
    if (ts.isIdentifier(callee)) {
      const looked = graph.lookup(file, callee.text, callee)
      if (
        looked.kind === "import" &&
        isDoor(config, looked.file) &&
        looked.importedName === config.probeExportName
      ) {
        return true
      }
    }
    return false
  }
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind
    if (
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.BarBarToken
    ) {
      return (
        testInvolvesProbe(graph, config, file, expr.left, depth + 1) ||
        testInvolvesProbe(graph, config, file, expr.right, depth + 1)
      )
    }
    return false
  }
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.ExclamationToken
  ) {
    return testInvolvesProbe(graph, config, file, expr.operand, depth + 1)
  }
  if (ts.isIdentifier(expr)) {
    const looked = graph.lookup(file, expr.text, expr)
    if (looked.kind === "local" && ts.isExpression(looked.node)) {
      return testInvolvesProbe(graph, config, file, looked.node, depth + 1)
    }
    return false
  }
  return false
}

// Is `fn` an immediately-invoked function expression — `(() => {...})()` —
// the idiomatic way to smuggle a `const` into an expression position (a
// ternary branch can't hold a statement, only an expression), exactly the
// shape app-registry.tsx's `chrome: "content"` branch uses to destructure
// `requireAdwJsx()`'s result before returning JSX with it. Its own function
// boundary is transparent for guard-walking: the ternary that decides
// whether it even runs lives one hop further up, at the CALL, not inside it.
const isImmediatelyInvoked = (fn: ts.Node): ts.CallExpression | null => {
  const parent = fn.parent
  if (ts.isParenthesizedExpression(parent)) {
    return isImmediatelyInvoked(parent)
  }
  return ts.isCallExpression(parent) && parent.expression === fn ? parent : null
}

// Walking UP from a door-touch node, is it inside the "Adw" side of a
// guard (a ternary's whenTrue, or an if-statement's thenStatement) whose
// test involves the probe? Stops at the nearest enclosing function so a
// guard in an unrelated outer scope is never credited — EXCEPT an IIFE
// boundary, which is transparent (see isImmediatelyInvoked above).
const isGuardedOccurrence = (
  graph: SourceGraph,
  config: DoorConfig,
  file: ParsedFile,
  node: ts.Node,
): boolean => {
  let current: ts.Node | undefined = node
  let child: ts.Node = node
  while (current && !ts.isSourceFile(current)) {
    if (isFunctionLike(current)) {
      const iife = isImmediatelyInvoked(current)
      if (!iife) {
        break
      }
      child = iife
      current = iife.parent
      continue
    }
    if (
      ts.isConditionalExpression(current) &&
      child === current.whenTrue &&
      testInvolvesProbe(graph, config, file, current.condition, 0)
    ) {
      return true
    }
    if (
      ts.isIfStatement(current) &&
      child === current.thenStatement &&
      testInvolvesProbe(graph, config, file, current.expression, 0)
    ) {
      return true
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      child === current.right &&
      testInvolvesProbe(graph, config, file, current.left, 0)
    ) {
      return true
    }
    child = current
    current = current.parent
  }
  return false
}

// Generic recursive scan of a leaf expression/statement for any reference to
// a door export, tagging each occurrence guarded/unguarded via
// isGuardedOccurrence. Follows same- or cross-file CALLS into plain helper
// functions (memoized) so a wrapper like `showAlert = () => adwAvailable()
// ? showAlertAdw() : showAlertPlain()` sees through to `showAlertAdw`'s own
// unconditional `requireAdwGi(...)` and correctly credits the OUTER
// ternary's guard, not `showAlertAdw`'s (guard-less) own body.
const existsDoorTouch = (
  graph: SourceGraph,
  config: DoorConfig,
  file: ParsedFile,
  node: ts.Node,
  visitedCalls: Set<string>,
  depth: number,
): { touched: boolean; hard: boolean; evidence: string[] } => {
  if (depth > 60) {
    return { touched: false, hard: false, evidence: [] }
  }
  let touched = false
  let hard = false
  const evidence: string[] = []

  const credit = (label: string, guarded: boolean): void => {
    touched = true
    evidence.push(guarded ? `${label} (guarded)` : `${label} (unguarded)`)
    if (!guarded) {
      hard = true
    }
  }

  // Resolves a bare identifier used in CALL position (`name(...)`) to
  // either a door reference or a followable function/expression node,
  // whether `name` is a same-file `const`/`function` or an import.
  const resolveCallableTarget = (
    name: string,
    fromNode: ts.Node,
  ):
    | { door: "gated" | "eager" | "probe" }
    | { file: ParsedFile; node: ts.Node }
    | null => {
    const looked = graph.lookup(file, name, fromNode)
    if (looked.kind === "local") {
      return { file, node: looked.node }
    }
    if (looked.kind === "import") {
      if (isEager(config, looked.file)) {
        return { door: "eager" }
      }
      if (isDoor(config, looked.file)) {
        if (config.gatedExportNames.includes(looked.importedName)) {
          return { door: "gated" }
        }
        if (looked.importedName === config.probeExportName) {
          return { door: "probe" }
        }
        return { door: "gated" }
      }
      const nextFile = graph.parse(looked.file)
      const resolved = nextFile
        ? graph.resolveExport(nextFile, looked.importedName)
        : null
      return resolved ? { file: resolved.file, node: resolved.node } : null
    }
    return null
  }

  const isCallCallee = (n: ts.Node): boolean =>
    ts.isCallExpression(n.parent) && n.parent.expression === n

  const isJsxTagName = (n: ts.Node): boolean => {
    const parent = n.parent
    return (
      (ts.isJsxOpeningElement(parent) ||
        ts.isJsxSelfClosingElement(parent) ||
        ts.isJsxClosingElement(parent)) &&
      parent.tagName === n
    )
  }

  // A bare identifier passed AS an argument (`createNavigatorFactory(View)`,
  // react-navigation's own pattern for handing a component off to be
  // rendered later) — the same "invoked invisibly to a plain call-graph
  // walk" shape as a JSX tag name, just via a plain function argument
  // instead of markup.
  const isCallArgument = (n: ts.Node): boolean =>
    ts.isCallExpression(n.parent) &&
    n.parent.arguments.includes(n as ts.Expression)

  // Follows a resolved plain (non-door) target — a same-file helper, or a
  // named export in another project file — into its own body, memoized so
  // a call graph with cycles or repeats stays bounded. `originNode` is
  // where the reference itself sits, used to test whether THIS particular
  // reference is guarded (a helper can be reached both guarded and
  // unguarded from different call sites; each occurrence is judged on its
  // own position, not the callee's).
  const followTarget = (
    target: { file: ParsedFile; node: ts.Node },
    originNode: ts.Node,
  ): void => {
    const key = `${target.file.path}#${target.node.getStart()}`
    if (visitedCalls.has(key)) {
      return
    }
    visitedCalls.add(key)
    const body = isFunctionLike(target.node) ? target.node.body : target.node
    if (!body) {
      return
    }
    const sub = existsDoorTouch(
      graph,
      config,
      target.file,
      body,
      visitedCalls,
      depth + 1,
    )
    if (!sub.touched) {
      return
    }
    const guardedHere = isGuardedOccurrence(graph, config, file, originNode)
    touched = true
    evidence.push(...sub.evidence)
    if (sub.hard && !guardedHere) {
      hard = true
    }
  }

  const visit = (n: ts.Node): void => {
    if (
      ts.isIdentifier(n) &&
      !ts.isPropertyAccessExpression(n.parent) &&
      !isCallCallee(n)
    ) {
      const target = resolveCallableTarget(n.text, n)
      if (target && "door" in target && target.door === "eager") {
        credit(`${n.text} (eager import)`, false)
      } else if (target && "door" in target && target.door === "gated") {
        credit(n.text, isGuardedOccurrence(graph, config, file, n))
      } else if (
        target &&
        !("door" in target) &&
        isFunctionLike(target.node) &&
        // A bare (non-call) reference is only followed when it is a JSX tag
        // name or a plain call argument — both hand a component/callback
        // off to be invoked elsewhere, invisibly to a plain AST walk
        // (`<NavigationStack>` never appears as `NavigationStack(...)`,
        // and `createNavigatorFactory(View)` never calls `View` itself —
        // react-navigation does, internally). Restricted to a FUNCTION
        // target specifically: an argument that names an object (the
        // `gtkxHost` host, injected the same way) must stay an opaque,
        // lazily-bound parameter — see resolveLeaves' own allowEnter doc —
        // not get expanded here just because it also showed up as a
        // call argument somewhere.
        (isJsxTagName(n) || isCallArgument(n))
      ) {
        followTarget(target, n)
      }
    }
    if (ts.isCallExpression(n)) {
      const callee = unwrap(n.expression)
      if (ts.isIdentifier(callee)) {
        const target = resolveCallableTarget(callee.text, callee)
        if (target && "door" in target) {
          if (target.door === "eager") {
            credit(`${callee.text}() (eager import)`, false)
          } else if (target.door === "gated") {
            credit(
              `${callee.text}()`,
              isGuardedOccurrence(graph, config, file, callee),
            )
          }
          // door === "probe": the probe itself — not a touch.
        } else if (target) {
          followTarget(target, callee)
        }
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return { touched, hard, evidence }
}

export const classifyExport = (
  graph: SourceGraph,
  config: DoorConfig,
  file: ParsedFile,
  exportName: string,
): ClassifyResult => {
  const resolved = graph.resolveExport(file, exportName)
  if (!resolved) {
    return {
      profile: "gtk",
      evidence: [`"${exportName}" not found in ${file.path}`],
    }
  }
  const interpreter = new Interpreter(graph, config)
  return interpreter.classify(resolved.file, resolved.node)
}

// Every value (non-type-only) top-level export of a module: `export const
// X = ...`, `export function X() {}`, `export { X, Y }`, `export { X } from
// "./y"` (type specifiers/whole `export type {}` blocks excluded). Used to
// derive a PAGE-level profile for a subpath entry point (see
// classifyEntryModule below) by classifying its whole public surface, the
// same way docs:check's own extractValueExportNames finds what a page must
// document — except here via the real AST rather than a line-based scan,
// since this file already parses everything with the TypeScript compiler.
export const listValueExportNames = (sourceFile: ts.SourceFile): string[] => {
  const names = new Set<string>()
  for (const statement of sourceFile.statements) {
    const hasExportModifier = (): boolean =>
      (ts.canHaveModifiers(statement)
        ? ts.getModifiers(statement)
        : undefined
      )?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      hasExportModifier()
    ) {
      names.add(statement.name.text)
    } else if (ts.isVariableStatement(statement) && hasExportModifier()) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.add(declaration.name.text)
        }
      }
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      const clause = statement.exportClause
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          if (!element.isTypeOnly) {
            names.add(element.name.text)
          }
        }
      }
      // A bare `export * from "./y"` re-exports names this pass cannot
      // enumerate without parsing "./y" too — out of scope: every subpath
      // entry point in this package spells its value exports explicitly
      // (named re-exports or local declarations), this form is only used
      // here for pure-type barrels.
    }
  }
  return [...names]
}

// Page-level variant for a subpath whose whole public surface is one doc
// entry (navigation.md, svg.md, ...): classify EVERY value export of the
// entry file itself (the same per-export interpreter classifyExport uses,
// not a blunter whole-file-reachability check) and combine to the worst
// profile found (hard-adw > probe-guarded > gtk).
//
// Why not "does any file in the transitive import graph touch the door":
// tried first, and it over-fires — reanimated-compat imports `Dimensions`
// from apis/index.ts, which ALSO wires in Alert/Appearance (both
// Adw-probe-guarded) purely because they share one barrel file; a
// file-reachability check cannot tell "this subpath's actual exports never
// touch host.showAlert" from "this subpath merely sits in the same import
// graph as something that does". Classifying the entry's OWN exports
// (exactly what classifyExport already does correctly for Alert vs
// Platform on the main surface) sidesteps that: Dimensions itself resolves
// to gtk, so importing it costs reanimated-compat nothing here.
export const classifyEntryModule = (
  graph: SourceGraph,
  config: DoorConfig,
  entryFile: string,
): ClassifyResult => {
  const parsed = graph.parse(entryFile)
  if (!parsed) {
    return { profile: "gtk", evidence: [`entry file not found: ${entryFile}`] }
  }
  const interpreter = new Interpreter(graph, config)
  let profile: Profile = "gtk"
  const evidence: string[] = []
  const rank: Record<Profile, number> = {
    gtk: 0,
    "probe-guarded": 1,
    "hard-adw": 2,
  }
  for (const name of listValueExportNames(parsed.sourceFile)) {
    const resolved = graph.resolveExport(parsed, name)
    if (!resolved) {
      continue
    }
    const result = interpreter.classify(resolved.file, resolved.node)
    if (rank[result.profile] > rank[profile]) {
      profile = result.profile
    }
    if (result.profile !== "gtk") {
      evidence.push(`${name}: ${result.evidence.join(", ")}`)
    }
  }
  return { profile, evidence }
}
