#!/usr/bin/env node
// The react-native-gtkx-mcp bin: run from a consumer project (npx picks up
// the locally installed react-native-gtkx first, so this always answers
// for the exact version that project has — see docs/guide/toolchains.md).
// Executed by bare `node` (no bundler in the way, same reason
// src/runner/src/metro/src/vite stay self-contained) — hence every
// relative import in src/mcp/** carries an explicit .js extension.
import process from "node:process"
import { main } from "./server.js"

try {
  await main()
} catch (error) {
  console.error("[react-native-gtkx-mcp] fatal error:", error)
  process.exit(1)
}
