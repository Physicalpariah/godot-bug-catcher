import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GodotConnection } from "../godot-connection.js";
import { formatErrorForMcp } from "../utils/errors.js";

export function registerBatchTools(
  server: McpServer,
  godot: GodotConnection
): void {
  server.tool(
    "find_nodes_by_type",
    "Find all nodes of a specific type in the current scene",
    {
      type: z.string().describe("Node type/class to search for (e.g. 'Sprite2D', 'Label', 'CollisionShape2D')"),
      recursive: z.boolean().optional().describe("Search recursively through children (default: true)"),
    },
    async (params) => {
      try {
        const result = await godot.sendCommand("find_nodes_by_type", params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
      }
    }
  );

  server.tool(
    "find_signal_connections",
    "Find all signal connections in the current scene, optionally filtered by signal name or node",
    {
      signal_name: z.string().optional().describe("Filter by signal name (partial match)"),
      node_path: z.string().optional().describe("Filter by node path (partial match)"),
    },
    async (params) => {
      try {
        const result = await godot.sendCommand("find_signal_connections", params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
      }
    }
  );

  server.tool(
    "batch_set_property",
    "Set a property on all nodes of a given type in the current scene",
    {
      type: z.string().describe("Node type to target (e.g. 'Label', 'Sprite2D')"),
      property: z.string().describe("Property name to set (e.g. 'visible', 'modulate')"),
      value: z.union([z.string(), z.number(), z.boolean()]).describe("Value to set. Strings auto-parsed for Vector2, Color, etc."),
    },
    async (params) => {
      try {
        const result = await godot.sendCommand("batch_set_property", params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
      }
    }
  );

  server.tool(
    "batch_add_nodes",
    "Add multiple nodes in a single call. Supports building entire node trees at once — nodes added earlier can be referenced as parents by later entries. Much faster than calling add_node repeatedly.",
    {
      nodes: z.array(z.object({
        type: z.string().describe("Node type (e.g. 'Sprite2D', 'CharacterBody2D', 'Label')"),
        parent_path: z.string().optional().describe("Parent node path (default: root '.'). Can reference nodes created earlier in this batch."),
        name: z.string().optional().describe("Node name"),
        properties: z.record(z.string(), z.any()).optional().describe("Properties to set (e.g. {\"position\": \"Vector2(100, 200)\"})"),
      })).describe("Array of node definitions to add, processed in order"),
    },
    async (params) => {
      try {
        const result = await godot.sendCommand("batch_add_nodes", params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
      }
    }
  );

  server.tool(
    "find_node_references",
    "Search through project files (.tscn, .gd, .tres, .gdshader) for a text pattern",
    {
      pattern: z.string().describe("Text pattern to search for"),
    },
    async (params) => {
      try {
        const result = await godot.sendCommand("find_node_references", params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
      }
    }
  );

  server.tool(
    "get_scene_dependencies",
    "Get all resource dependencies of a scene or resource file",
    {
      path: z.string().describe("Path to the scene or resource file (e.g. 'res://scenes/player.tscn')"),
    },
    async (params) => {
      try {
        const result = await godot.sendCommand("get_scene_dependencies", params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
      }
    }
  );

  server.tool(
    "cross_scene_set_property",
    "Preview or apply a property change on all nodes of a given type across scene files in the project. Defaults to dry_run=true (returns the matching scenes and node paths without writing). To actually apply: pass force=true AND dry_run=false. Inactive open scenes are skipped and reported in skipped_open_scenes — open them as the active tab first to live-edit. The active open scene is live-edited via UndoRedo so changes are visible in the editor and undoable. Closed scenes are offline-saved. The response includes a per-scene `mode` field: dry_run / offline_saved / live_open_scene.",
    {
      type: z.string().describe("Node type to target (e.g. 'Label', 'Sprite2D')"),
      property: z.string().describe("Property name to set"),
      value: z.union([z.string(), z.number(), z.boolean()]).describe("Value to set. Strings auto-parsed for Vector2, Color, etc."),
      path_filter: z.string().optional().describe("Directory to search in (default: 'res://')"),
      exclude_addons: z.boolean().optional().describe("Exclude addons/ directory (default: true)"),
      dry_run: z.boolean().optional().describe("Preview only — list affected scenes and nodes without writing. Defaults to true unless force=true is set."),
      force: z.boolean().optional().describe("Required (alongside dry_run=false) to actually write. Acknowledges that this can modify many scene files at once."),
    },
    async (params) => {
      try {
        const result = await godot.sendCommand("cross_scene_set_property", params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
      }
    }
  );
}
