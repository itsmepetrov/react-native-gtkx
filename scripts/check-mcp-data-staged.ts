#!/usr/bin/env node
// Pre-commit guard for packages/react-native-gtkx/src/mcp/data/generated.ts.
//
// Three PRs in a row edited a doc that feeds scripts/generate-mcp-data.mjs,
// forgot to regenerate, and burned a full CI cycle on `npm run mcp:check-data`
// failing. The regeneration is deterministic — there is nothing for a human
// to decide — so this hook fixes it instead of failing: if the commit
// touches a generator input, it regenerates the output and stages it.
//
// Fast path: a commit that doesn't touch any input exits after one `git
// diff` call, no generator spawn.
import { execFileSync } from "node:child_process"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")

const GENERATOR = "scripts/generate-mcp-data.mjs"
const OUTPUT = "packages/react-native-gtkx/src/mcp/data/generated.ts"

// Keep in sync with the "Sources of truth" list at the top of
// scripts/generate-mcp-data.mjs. docs/reference/ is a directory of pages
// (any of which can gain or lose an export row) — including the nested
// docs/reference/components/ directory, one page per portable component —
// so it is matched by prefix below rather than listed file by file.
const REFERENCE_PREFIX = "docs/reference/"
const INPUTS = [
  GENERATOR,
  "docs/reference/apis.md",
  "docs/reference/styling.md",
  "docs/reference/globals.md",
  "docs/reference/aliases.md",
  "docs/reference/navigation.md",
  "docs/reference/svg.md",
  "docs/reference/dnd.md",
  "docs/reference/gesture-handler.md",
  "docs/reference/reanimated-compat.md",
  "docs/guide/installation.md",
  "docs/guide/first-app.md",
  "docs/guide/toolchains.md",
  "docs/guide/plain-gtk.md",
  "docs/guide/packaging.md",
  "docs/architecture/overview.md",
  "docs/architecture/layout-and-styling.md",
  "docs/architecture/integration.md",
  "docs/architecture/gestures.md",
  "docs/getting-started.md",
  "docs/gtkx-1.2-notes.md",
  "docs/research/navigation-extensibility.md",
  "scripts/widget-surface/classification.json",
]

const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8" })

const stagedFiles = git([
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=ACMR",
])
  .split("\n")
  .filter(Boolean)

const touchesInput = stagedFiles.some(
  (file) => INPUTS.includes(file) || file.startsWith(REFERENCE_PREFIX),
)
if (!touchesInput) {
  process.exit(0)
}

// Regenerate unconditionally rather than running --check first: if the
// output is already fresh this is a fast no-op (no diff below, nothing
// staged, nothing printed); if it's stale, this is the fix.
execFileSync("node", [GENERATOR], { cwd: ROOT, stdio: "ignore" })

const unstagedDiff = git(["diff", "--name-only", "--", OUTPUT]).trim()
if (unstagedDiff) {
  git(["add", "--", OUTPUT])
  console.log(
    `pre-commit: regenerated and staged ${OUTPUT} (a generator input changed).`,
  )
}
