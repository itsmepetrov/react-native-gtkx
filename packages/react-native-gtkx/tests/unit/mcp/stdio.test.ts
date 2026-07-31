// The literal proof: a real MCP client talks to the real bin over an
// actual OS stdio pipe — StdioClientTransport spawns the process itself,
// same as any real MCP host would. Runs src/mcp/bin.ts straight from
// source through jiti (already a devDependency, used for eslint.config.ts)
// instead of the compiled dist/mcp/bin.js: build:dist type-checks the
// whole package, including the gtk/adw subpaths, which needs the codegen
// store and only exists on Linux (see CONTRIBUTING.md) — this test has to
// run on macOS too. src/mcp/** has no @gtkx/* import at all, so running
// it straight from source proves the same thing a build would for this
// one module: it starts and answers without GTK installed.
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { afterEach, beforeEach, expect, test } from "vitest"

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, "../../..")
const binTs = join(packageRoot, "src/mcp/bin.ts")

const require = createRequire(import.meta.url)
const jitiPackageJson = require.resolve("jiti/package.json")
const jitiCli = join(dirname(jitiPackageJson), "lib/jiti-cli.mjs")

let client: Client

beforeEach(async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [jitiCli, binTs],
    stderr: "pipe",
  })
  client = new Client({ name: "stdio-test-client", version: "0.0.0" })
  await client.connect(transport)
})

afterEach(async () => {
  await client.close()
})

test("the bin answers over a real OS stdio pipe", async () => {
  const { tools } = await client.listTools()
  expect(tools.map((tool) => tool.name).sort()).toEqual([
    "rn_gtkx_describe_component",
    "rn_gtkx_list_surface",
    "rn_gtkx_search_docs",
  ])

  const result = await client.callTool({
    name: "rn_gtkx_describe_component",
    arguments: { name: "FlatList" },
  })
  const content = result.content as { type: string; text?: string }[]
  const text = content[0]?.text ?? ""
  expect(text).toContain("windowSize")
}, 20_000)
