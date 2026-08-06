// Speaks the real MCP protocol against the real server: a genuine SDK
// Client exchanges JSON-RPC requests/responses with our McpServer over
// InMemoryTransport (a first-class SDK transport built for exactly this —
// see @modelcontextprotocol/sdk/inMemory.js), not a call into internal
// handler functions with an asserted shape. tests/unit/mcp/stdio.test.ts
// covers the same tools over a literal OS pipe.
import type { Client as ClientType } from "@modelcontextprotocol/sdk/client/index.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createMcpServer } from "../../../src/mcp/server"

let server: McpServer
let client: ClientType

beforeEach(async () => {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  server = createMcpServer()
  client = new Client({ name: "test-client", version: "0.0.0" })
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ])
})

afterEach(async () => {
  await client.close()
  await server.close()
})

type CallToolResult = Awaited<ReturnType<ClientType["callTool"]>>

const textOf = (result: CallToolResult): string => {
  const content = result.content as { type: string; text?: string }[]
  const first = content[0]
  if (!first || first.type !== "text" || typeof first.text !== "string") {
    throw new Error(`expected text content, got: ${JSON.stringify(result)}`)
  }
  return first.text
}

describe("tools/list", () => {
  test("exposes exactly the three rn_gtkx tools", async () => {
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "rn_gtkx_describe_component",
      "rn_gtkx_list_surface",
      "rn_gtkx_search_docs",
    ])
  })
})

describe("rn_gtkx_list_surface", () => {
  test("overview reports counts matching the generated data", async () => {
    const result = await client.callTool({
      name: "rn_gtkx_list_surface",
      arguments: {},
    })
    const text = textOf(result)
    expect(text).toContain("portable-components (20)")
    expect(text).toContain("portable-apis (22)")
    expect(text).toContain("gtk-widgets (86 wrapped + 16 raw)")
    expect(text).toContain("adw-widgets (46 wrapped + 16 raw)")
    expect(text).toContain("common (4)")
  })

  test("area=common lists the declarative primitives by name", async () => {
    const result = await client.callTool({
      name: "rn_gtkx_list_surface",
      arguments: { area: "common" },
    })
    const text = textOf(result)
    expect(text).toContain("NavigationStack")
    expect(text).toContain("SlotContent")
  })

  test("rejects an area outside the known set at the protocol level", async () => {
    // zod's enum validation runs in the SDK before our handler ever sees
    // the call — the SDK Client surfaces that as a normal isError:true
    // result carrying the MCP protocol error message, not a thrown
    // exception.
    const result = await client.callTool({
      name: "rn_gtkx_list_surface",
      arguments: { area: "not-a-real-area" },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(
      "Invalid arguments for tool rn_gtkx_list_surface",
    )
  })
})

describe("rn_gtkx_describe_component", () => {
  test("resolves a known portable component with its RN differences", async () => {
    const result = await client.callTool({
      name: "rn_gtkx_describe_component",
      arguments: { name: "FlatList" },
    })
    const body = JSON.parse(textOf(result)) as Record<string, unknown>
    expect(body.matchedBy).toBe("exact")
    expect(body.kind).toBe("portable-component")
    expect(body.subpath).toBe("react-native")
    expect(body.differences).toContain("windowSize")
    expect(body.differences).toContain("11")
  })

  test("resolves a bare widget name through the Gtk prefix heuristic", async () => {
    const result = await client.callTool({
      name: "rn_gtkx_describe_component",
      arguments: { name: "Popover" },
    })
    const body = JSON.parse(textOf(result)) as Record<string, unknown>
    expect(body.matchedBy).toBe("prefix")
    expect(body.name).toBe("GtkPopover")
    expect(body.subpath).toBe("react-native-gtkx/gtk")
    expect(body.wrapped).toBe(true)
  })

  test("is case-insensitive on an exact name", async () => {
    const result = await client.callTool({
      name: "rn_gtkx_describe_component",
      arguments: { name: "flatlist" },
    })
    const body = JSON.parse(textOf(result)) as Record<string, unknown>
    expect(body.matchedBy).toBe("case-insensitive")
    expect(body.name).toBe("FlatList")
  })

  test("reports ambiguous substring matches instead of guessing", async () => {
    const result = await client.callTool({
      name: "rn_gtkx_describe_component",
      arguments: { name: "Switcher" },
    })
    expect(result.isError).toBe(true)
    const text = textOf(result)
    expect(text).toContain("GtkStackSwitcher")
    expect(text).toContain("AdwViewSwitcher")
  })

  test("reports not-found for a real GTK type that is not a widget", async () => {
    const result = await client.callTool({
      name: "rn_gtkx_describe_component",
      arguments: { name: "GtkAdjustment" },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('No component named "GtkAdjustment"')
  })
})

describe("rn_gtkx_search_docs", () => {
  test("finds the FlatList windowSize row", async () => {
    const result = await client.callTool({
      name: "rn_gtkx_search_docs",
      arguments: { query: "windowSize" },
    })
    const text = textOf(result)
    expect(text).toContain("FlatList")
    expect(text).toContain("windowSize")
  })

  test("reports no matches for a nonsense query instead of erroring", async () => {
    const result = await client.callTool({
      name: "rn_gtkx_search_docs",
      arguments: { query: "zzzznonexistentzzzz" },
    })
    expect(result.isError).toBeFalsy()
    expect(textOf(result)).toContain("No matches")
  })
})
