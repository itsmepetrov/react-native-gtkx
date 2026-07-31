// react-native-gtkx/mcp — programmatic access to the same server the
// react-native-gtkx-mcp bin runs, for embedding or testing (see
// tests/unit/mcp/). The bin (src/mcp/bin.ts) is the primary way this is
// consumed; this barrel exists for everything else.
export { buildTools, createMcpServer, main, SERVER_NAME } from "./server.js"
export {
  formatEntity,
  resolveComponent,
  type Candidate,
  type Entity,
  type ResolveResult,
} from "./resolve.js"
export { listSurface, SURFACE_AREAS, type SurfaceArea } from "./list.js"
export { searchDocs, type SearchResult } from "./search.js"
export type { Tool, ToolArgs } from "./tool.js"
