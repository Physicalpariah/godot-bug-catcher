import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GodotConnection } from "../godot-connection.js";
import { formatErrorForMcp } from "../utils/errors.js";

export function registerProfilingTools(
  server: McpServer,
  godot: GodotConnection
): void {
  server.tool(
    "get_performance_monitors",
    "Get the RUNNING GAME's performance monitors (FPS, memory, draw calls, physics, navigation, etc.). Requires a scene to be playing (play_scene). For editor-process metrics use get_editor_performance. IMPORTANT: an embedded game is throttled to ~10 FPS while the editor is unfocused — always the case when driven from a terminal — so time/fps and time/process are then meaningless. The response reports fps_throttled (true / false / null when the game runs in a floating Game workspace whose focus cannot be read), plus editor_focused and game_embedded. Draw-call, primitive and memory counters are never affected.",
    {
      category: z.string().optional().describe("Filter by category prefix: 'fps', 'memory', 'render', 'physics_2d', 'physics_3d', 'navigation'"),
    },
    async (params) => {
      try {
        const result = await godot.sendCommand("get_performance_monitors", params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
      }
    }
  );

  server.tool(
    "get_editor_performance",
    "Get a quick performance summary (FPS, frame time, draw calls, memory usage)",
    {},
    async () => {
      try {
        const result = await godot.sendCommand("get_editor_performance");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
      }
    }
  );
}
