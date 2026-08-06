// The MCP server itself: three tools over stdio, backed entirely by the
// generated data in ./data/generated.ts — no @gtkx/* import anywhere in
// this module or its dependents, so this runs on any OS without GTK
// installed (an agent reading a react-native-gtkx project on a Mac, for
// instance). See docs/guide/toolchains.md for how a consumer registers it.
import { createRequire } from "node:module"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { listSurface, SURFACE_AREAS } from "./list.js"
import { formatEntity, resolveComponent } from "./resolve.js"
import { searchDocs } from "./search.js"
import {
  defineTool,
  registerTool,
  textContent,
  textError,
  type Tool,
} from "./tool.js"

const require = createRequire(import.meta.url)
// Package root is two levels up from dist/mcp/server.js (dist/mcp -> dist
// -> package root). package.json ships in every npm tarball regardless of
// the "files" allowlist, so this needs no extra packaging step.
const { version } = require("../../package.json") as { version: string }

const SERVER_NAME = "react-native-gtkx-mcp"
const DEFAULT_SEARCH_LIMIT = 10
const MAX_SEARCH_LIMIT = 20

const listSurfaceShape = {
  area: z
    .enum(SURFACE_AREAS)
    .optional()
    .describe(
      "Area to list. Omit for an overview with counts across all areas: " +
        SURFACE_AREAS.join(", ") +
        ".",
    ),
}

const describeComponentShape = {
  name: z
    .string()
    .describe(
      "A component/API/widget name: a portable react-native export (e.g. " +
        '"FlatList"), a react-native-gtkx/gtk or /adw widget with or ' +
        'without its Gtk/Adw prefix (e.g. "Popover" resolves to ' +
        '"GtkPopover"), or a react-native-gtkx/common export (e.g. ' +
        '"NavigationStack"). Case-insensitive.',
    ),
}

const searchDocsShape = {
  query: z
    .string()
    .describe(
      "Free-text query — a symptom, a GTK term, an option name. Use this " +
        "when rn_gtkx_describe_component does not have a name to look up, " +
        'e.g. "known issues", "chrome content", "windowSize".',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_SEARCH_LIMIT)
    .optional()
    .describe(
      `Maximum number of results (default ${DEFAULT_SEARCH_LIMIT}, max ${MAX_SEARCH_LIMIT}).`,
    ),
}

const listSurfaceTool = (): Tool =>
  defineTool({
    name: "rn_gtkx_list_surface",
    title: "List the react-native-gtkx surface",
    description:
      "Browse the react-native-gtkx surface without knowing an exact name first: " +
      "portable react-native components/APIs, the react-native-gtkx/gtk and " +
      "/adw widget lists (wrapped vs. raw), and react-native-gtkx/common. " +
      "Without `area`, returns counts and where to look next.",
    inputSchema: listSurfaceShape,
    handler: ({ area }) => textContent(listSurface(area)),
  })

const describeComponentTool = (): Tool =>
  defineTool({
    name: "rn_gtkx_describe_component",
    title: "Describe a react-native-gtkx component",
    description:
      "Look up one component/widget/API by name: does it exist, which " +
      "subpath it is exported from, what GTK widget backs it (for " +
      "portable components), what differs from React Native, and whether " +
      "a gtk/adw widget is wrapped (takes `style`/`onLayout`) or raw. The " +
      "single most useful tool here — start with this before " +
      "rn_gtkx_search_docs.",
    inputSchema: describeComponentShape,
    handler: ({ name }) => {
      const result = resolveComponent(name)
      if (result.status === "resolved") {
        const body = {
          matchedBy: result.matchedBy,
          ...formatEntity(result.entity),
        }
        return textContent(JSON.stringify(body, null, 2))
      }
      if (result.status === "ambiguous") {
        const lines = result.candidates
          .map((c) => `- ${c.name} (${c.subpath}, ${c.kind})`)
          .join("\n")
        return textError(
          `"${result.query}" matches ${result.candidates.length} names — call again with one of:\n${lines}`,
        )
      }
      const lines = result.suggestions
        .map((c) => `- ${c.name} (${c.subpath}, ${c.kind})`)
        .join("\n")
      return textError(
        `No component named "${result.query}".` +
          (lines.length > 0
            ? ` Closest known names:\n${lines}`
            : " rn_gtkx_list_surface has the full index."),
      )
    },
  })

const searchDocsTool = (): Tool =>
  defineTool({
    name: "rn_gtkx_search_docs",
    title: "Search react-native-gtkx docs",
    description:
      "Free-text search over the docs (the guide, the platform layer, " +
      "gtkx rc.3 workarounds/quirks, navigation). The fallback tool: use it " +
      "for symptoms and known-issue questions that rn_gtkx_describe_component " +
      "cannot answer by name (workarounds are keyed by mechanism, not by " +
      "component).",
    inputSchema: searchDocsShape,
    handler: ({ query, limit }) => {
      const results = searchDocs(query, limit ?? DEFAULT_SEARCH_LIMIT)
      if (results.length === 0) {
        return textContent(
          `No matches for "${query}". Try rn_gtkx_list_surface or rn_gtkx_describe_component instead.`,
        )
      }
      const body = results
        .map((r) => `## ${r.doc} — ${r.heading}\n\n${r.text}`)
        .join("\n\n---\n\n")
      return textContent(body)
    },
  })

const buildTools = (): Tool[] => [
  listSurfaceTool(),
  describeComponentTool(),
  searchDocsTool(),
]

const createMcpServer = (): McpServer => {
  const server = new McpServer({ name: SERVER_NAME, version })
  for (const tool of buildTools()) {
    registerTool(server, tool)
  }
  return server
}

const main = async (): Promise<void> => {
  const server = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

export { buildTools, createMcpServer, main, SERVER_NAME }
