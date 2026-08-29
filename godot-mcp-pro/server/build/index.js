#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { GodotConnection } from "./godot-connection.js";
import { registerProjectTools } from "./tools/project-tools.js";
import { registerSceneTools } from "./tools/scene-tools.js";
import { registerNodeTools } from "./tools/node-tools.js";
import { registerScriptTools } from "./tools/script-tools.js";
import { registerEditorTools } from "./tools/editor-tools.js";
import { registerInputTools } from "./tools/input-tools.js";
import { registerRuntimeTools } from "./tools/runtime-tools.js";
import { registerAnimationTools } from "./tools/animation-tools.js";
import { registerTilemapTools } from "./tools/tilemap-tools.js";
import { registerThemeTools } from "./tools/theme-tools.js";
import { registerProfilingTools } from "./tools/profiling-tools.js";
import { registerBatchTools } from "./tools/batch-tools.js";
import { registerShaderTools } from "./tools/shader-tools.js";
import { registerExportTools } from "./tools/export-tools.js";
import { registerResourceTools } from "./tools/resource-tools.js";
import { registerAnimationTreeTools } from "./tools/animation-tree-tools.js";
import { registerPhysicsTools } from "./tools/physics-tools.js";
import { registerScene3DTools } from "./tools/scene-3d-tools.js";
import { registerParticleTools } from "./tools/particle-tools.js";
import { registerNavigationTools } from "./tools/navigation-tools.js";
import { registerAudioTools } from "./tools/audio-tools.js";
import { registerTestTools } from "./tools/test-tools.js";
import { registerAnalysisTools } from "./tools/analysis-tools.js";
import { registerInputMapTools } from "./tools/input-map-tools.js";
import { registerAndroidTools } from "./tools/android-tools.js";
import { registerHeadlessTools } from "./tools/headless-tools.js";
import { MINIMAL_TOOLS, createFilteredServer } from "./utils/tool-filter.js";
import { loadInstructions } from "./utils/load-instructions.js";
const MINIMAL_MODE = process.argv.includes("--minimal");
const THREED_MODE = process.argv.includes("--3d");
const LITE_MODE = process.argv.includes("--lite") || MINIMAL_MODE || THREED_MODE;
const HTTP_MODE = process.argv.includes("--http");
const HTTP_PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === "--http-port") ||
    process.env.GODOT_MCP_HTTP_PORT ||
    "8001");
const explicitPort = process.env.GODOT_MCP_PORT;
const godot = new GodotConnection(parseInt(explicitPort || "6505"), !!explicitPort);
const serverName = MINIMAL_MODE
    ? "godot-mcp-pro-minimal"
    : THREED_MODE
        ? "godot-mcp-pro-3d"
        : LITE_MODE
            ? "godot-mcp-pro-lite"
            : "godot-mcp-pro";
const server = new McpServer({
    name: serverName,
    version: "1.16.0",
}, {
    instructions: loadInstructions(),
});
// In minimal mode, wrap the server to filter tool registrations
const toolServer = MINIMAL_MODE ? createFilteredServer(server, MINIMAL_TOOLS) : server;
// Core tools (always registered)
registerProjectTools(toolServer, godot);
registerSceneTools(toolServer, godot);
registerNodeTools(toolServer, godot);
registerScriptTools(toolServer, godot);
registerEditorTools(toolServer, godot);
registerInputTools(toolServer, godot);
registerRuntimeTools(toolServer, godot);
registerInputMapTools(toolServer, godot);
// 3D-critical tools (registered in FULL and --3d modes)
// Core (81) + Physics (6) + AnimationTree (8) + Navigation (5) = exactly 100 tools
if (!LITE_MODE || THREED_MODE) {
    registerPhysicsTools(server, godot);
    registerAnimationTreeTools(server, godot);
    registerNavigationTools(server, godot);
}
// Extended tools (Full mode only)
if (!LITE_MODE) {
    registerAnimationTools(server, godot);
    registerAudioTools(server, godot);
    registerBatchTools(server, godot);
    registerExportTools(server, godot);
    registerParticleTools(server, godot);
    registerProfilingTools(server, godot);
    registerResourceTools(server, godot);
    registerScene3DTools(server, godot);
    registerShaderTools(server, godot);
    registerTestTools(server, godot);
    registerThemeTools(server, godot);
    registerTilemapTools(server, godot);
    registerAnalysisTools(server, godot);
    registerAndroidTools(server, godot);
    registerHeadlessTools(server, godot);
}
// Start server
async function main() {
    // Attempt initial connection to Godot (non-blocking).
    // If this fails (all ports occupied, etc.), sendCommand retries the bind on
    // each call, so the session self-heals once a port frees up — no restart.
    godot.connect().catch((err) => {
        console.error(`[MCP] Failed to start WebSocket server: ${err.message}`);
    });
    if (HTTP_MODE) {
        // Streamable HTTP transport — clients connect via http://host:port/mcp
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
        });
        await server.connect(transport);
        const httpServer = createServer(async (req, res) => {
            const url = new URL(req.url || "/", `http://${req.headers.host}`);
            if (url.pathname === "/mcp") {
                await transport.handleRequest(req, res);
            }
            else {
                res.writeHead(404).end("Not Found");
            }
        });
        httpServer.listen(HTTP_PORT, () => {
            const mode = MINIMAL_MODE ? "MINIMAL " : THREED_MODE ? "3D " : LITE_MODE ? "LITE " : "";
            console.error(`[MCP] Godot MCP Pro ${mode}started (HTTP transport on http://127.0.0.1:${HTTP_PORT}/mcp)`);
        });
    }
    else {
        // Default stdio transport
        const transport = new StdioServerTransport();
        await server.connect(transport);
        const modeLabel = MINIMAL_MODE
            ? "[MCP] Godot MCP Pro MINIMAL started (35 tools, stdio transport)"
            : THREED_MODE
                ? "[MCP] Godot MCP Pro 3D started (103 tools, stdio transport)"
                : LITE_MODE
                    ? "[MCP] Godot MCP Pro LITE started (84 tools, stdio transport)"
                    : "[MCP] Godot MCP Pro started (stdio transport)";
        console.error(modeLabel);
    }
}
main().catch((err) => {
    console.error("[MCP] Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map