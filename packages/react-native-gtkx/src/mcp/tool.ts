// Small defineTool/registerTool helper over @modelcontextprotocol/sdk's
// McpServer, in the same spirit as @gtkx/mcp's own src/tool.ts (a sibling
// package in this monorepo's node_modules, studied as a reference) — but
// written fresh: this server has no live-app connection to route errors
// through, so there is no ProtocolError type to special-case, only plain
// Error.
import type {
  McpServer,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { z } from "zod"

type ToolArgs<Shape extends Record<string, z.ZodType>> = {
  [K in keyof Shape]: z.output<Shape[K]>
}

type Tool<Shape extends Record<string, z.ZodType> = Record<string, z.ZodType>> =
  {
    name: string
    title: string
    description: string
    inputSchema: Shape
    handler: (args: ToolArgs<Shape>) => CallToolResult
  }

const textContent = (text: string): CallToolResult => ({
  content: [{ type: "text", text }],
})

const textError = (text: string): CallToolResult => ({
  content: [{ type: "text", text }],
  isError: true,
})

const errorToResult = (error: unknown): CallToolResult =>
  textError(error instanceof Error ? error.message : String(error))

const runTool = (
  handler: (args: ToolArgs<Record<string, z.ZodType>>) => CallToolResult,
  args: ToolArgs<Record<string, z.ZodType>>,
): CallToolResult => {
  try {
    return handler(args)
  } catch (error) {
    return errorToResult(error)
  }
}

/** Identity function with a narrower input type — keeps tool definitions
 * readable (named fields) while erasing the generic Shape at the call site,
 * matching the pattern registerTool below expects. */
const defineTool = <Shape extends Record<string, z.ZodType>>(
  tool: Tool<Shape>,
): Tool => tool as Tool

const registerTool = (server: McpServer, tool: Tool): void => {
  const callback = ((args: ToolArgs<Record<string, z.ZodType>>) =>
    runTool(tool.handler, args)) as ToolCallback<Record<string, z.ZodType>>

  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
        title: tool.title,
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    callback,
  )
}

export {
  defineTool,
  registerTool,
  textContent,
  textError,
  type Tool,
  type ToolArgs,
}
