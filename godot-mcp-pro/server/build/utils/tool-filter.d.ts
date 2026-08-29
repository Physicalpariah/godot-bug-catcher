import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * Minimal mode: only these tools are registered (~35 tools).
 * Designed for clients with tight tool limits (Cursor: 40, local LLMs with small context).
 */
export declare const MINIMAL_TOOLS: Set<string>;
/**
 * Creates a proxy around McpServer that filters tool registrations.
 * Only tools in the allowSet will be registered; others are silently skipped.
 */
export declare function createFilteredServer(server: McpServer, allowSet: Set<string>): McpServer;
//# sourceMappingURL=tool-filter.d.ts.map