#!/usr/bin/env node
// Generate packages/react-native-gtkx/README.md from the root README for npm:
// npmjs.com does not resolve repo-relative links, so docs/ references are
// rewritten to absolute GitHub URLs. Wired as the package's prepack hook.
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const RAW =
  "https://raw.githubusercontent.com/itsmepetrov/react-native-gtkx/main"
const BLOB = "https://github.com/itsmepetrov/react-native-gtkx/blob/main"

const source = readFileSync(join(ROOT, "README.md"), "utf8")
const rewritten = source
  .replaceAll('src="docs/', `src="${RAW}/docs/`)
  .replaceAll("](docs/", `](${BLOB}/docs/`)
  .replaceAll("](CONTRIBUTING.md)", `](${BLOB}/CONTRIBUTING.md)`)

writeFileSync(join(ROOT, "packages/react-native-gtkx/README.md"), rewritten)
console.log("packages/react-native-gtkx/README.md regenerated")
