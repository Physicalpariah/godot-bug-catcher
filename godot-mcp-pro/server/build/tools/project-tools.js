import { z } from "zod";
import { formatErrorForMcp } from "../utils/errors.js";
export function registerProjectTools(server, godot) {
    server.tool("get_project_info", "Get Godot project metadata including name, version, viewport settings, renderer, and autoloads", {}, async () => {
        try {
            const result = await godot.sendCommand("get_project_info");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("get_filesystem_tree", "Get the project's file/directory tree with optional filtering by extension (e.g. *.gd, *.tscn)", {
        path: z.string().optional().describe("Root path to scan (default: res://)"),
        filter: z.string().optional().describe("Glob filter pattern (e.g. '*.gd', '*.tscn')"),
        max_depth: z.number().optional().describe("Maximum directory depth to scan (default: 10)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("get_filesystem_tree", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("search_files", "Search for files by name using fuzzy matching or glob patterns", {
        query: z.string().describe("Search query (fuzzy match or glob pattern)"),
        path: z.string().optional().describe("Root path to search (default: res://)"),
        file_type: z.string().optional().describe("Filter by file extension (e.g. 'gd', 'tscn')"),
        max_results: z.number().optional().describe("Maximum results to return (default: 50)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("search_files", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("search_in_files", "Search for text content inside project files (grep-like). Skips every dot-prefixed file and directory, and skips addons/ unless include_addons is true — though an explicit path inside addons/ is searched regardless.", {
        query: z.string().describe("Text to search for (plain text or regex pattern)"),
        path: z.string().optional().describe("Root path to search (default: res://)"),
        regex: z.boolean().optional().describe("Use regex matching (default: false)"),
        file_type: z.string().optional().describe("Filter by file extension (e.g. 'gd', 'tscn'). Without it, only these extensions are searched: gd, tscn, tres, cfg, godot, gdshader, md, txt, json — pass file_type explicitly for anything else."),
        max_results: z.number().int().positive().optional().describe("Maximum results to return (default: 50)"),
        include_addons: z.boolean().optional().describe("Also search addons/ (default: false). Needed when debugging vendored third-party addon code."),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("search_in_files", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("get_project_settings", "Read project.godot settings by section or specific key", {
        section: z.string().optional().describe("Settings section prefix (e.g. 'display/window')"),
        key: z.string().optional().describe("Specific setting key (e.g. 'display/window/size/viewport_width')"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("get_project_settings", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("set_project_setting", "Set a project setting value (e.g. viewport size, main scene). Saves to project.godot via the editor API. For an existing key the declared type is preserved, so a string setting stays a String even when its value looks numeric. Container types are set by passing an array. Refuses to write 'editor_plugins/enabled' — use EditorInterface.set_plugin_enabled() instead.", {
        key: z.string().describe("Setting key (e.g. 'display/window/size/viewport_width', 'application/run/main_scene')"),
        value: z
            .union([
            z.string(),
            z.number(),
            z.boolean(),
            z.array(z.union([z.string(), z.number(), z.boolean()])),
            z.array(z.array(z.number())),
            z.record(z.string(), z.unknown()),
        ])
            .describe("Value to set. Arrays build container types: [x, y] for vector2/vector2i, [r, g, b, a] for color, ['a', 'b'] for packed_string_array, and nested arrays for packed_vector2_array ([[0, 0], [1, 2]]) and packed_color_array ([[1, 0, 0, 1]]). Values that cannot be represented in the target type are rejected rather than coerced."),
        type: z
            .enum([
            "string", "string_name", "int", "float", "bool",
            "vector2", "vector2i", "vector3", "vector3i",
            "rect2", "rect2i", "color", "array", "dictionary",
            "packed_string_array", "packed_int32_array", "packed_int64_array",
            "packed_float32_array", "packed_float64_array",
            "packed_vector2_array", "packed_color_array",
        ])
            .optional()
            .describe("Force the stored type. Required to create a NEW key with a non-default type, and the only way to force a String for a numeric-looking value. Existing keys keep their declared type when omitted."),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("set_project_setting", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("uid_to_project_path", "Convert a Godot UID (uid://...) to a project resource path (res://...)", {
        uid: z.string().describe("The UID string (e.g. 'uid://abc123')"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("uid_to_project_path", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("project_path_to_uid", "Convert a project resource path (res://...) to its UID (uid://...)", {
        path: z.string().describe("The resource path (e.g. 'res://scenes/player.tscn')"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("project_path_to_uid", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("add_autoload", "Add an autoload (singleton) to the project. The script/scene will be auto-loaded when the project starts.", {
        name: z.string().describe("Autoload name (e.g. 'GameManager', 'AudioManager')"),
        path: z.string().describe("Path to the script or scene file (e.g. 'res://scripts/autoload/game_manager.gd')"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("add_autoload", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("remove_autoload", "Remove an autoload (singleton) from the project settings", {
        name: z.string().describe("Autoload name to remove (e.g. 'GameManager')"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("remove_autoload", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
}
//# sourceMappingURL=project-tools.js.map