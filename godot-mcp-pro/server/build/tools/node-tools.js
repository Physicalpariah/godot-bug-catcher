import { z } from "zod";
import { formatErrorForMcp } from "../utils/errors.js";
export function registerNodeTools(server, godot) {
    server.tool("add_node", "Add a new node to the current scene. Supports built-in Godot types and script-defined classes (class_name).", {
        type: z.string().describe("Node type — built-in (e.g. 'Sprite2D', 'Camera2D') or script class_name (e.g. 'HoverDetector', 'StationBuilder')"),
        parent_path: z.string().optional().describe("Parent node path (default: root '.')"),
        name: z.string().optional().describe("Node name"),
        properties: z.record(z.string(), z.any()).optional().describe("Properties to set (e.g. {\"position\": \"Vector2(100, 200)\"})"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("add_node", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("delete_node", "Delete a node from the current scene (supports undo)", {
        node_path: z.string().describe("Path to the node to delete"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("delete_node", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("duplicate_node", "Duplicate a node and all its children in the current scene", {
        node_path: z.string().describe("Path to the node to duplicate"),
        name: z.string().optional().describe("Name for the duplicate (default: original_copy)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("duplicate_node", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("move_node", "Move/reparent a node to a new parent in the scene tree", {
        node_path: z.string().describe("Path to the node to move"),
        new_parent_path: z.string().describe("Path to the new parent node"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("move_node", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("update_property", "Change a property on any node. Supports Vector2, Color, and other Godot types via string parsing.", {
        node_path: z.string().describe("Path to the target node"),
        property: z.string().describe("Property name (e.g. 'position', 'modulate', 'visible')"),
        value: z.any().describe("New value. Strings are auto-parsed: 'Vector2(10,20)', 'Color(1,0,0)', '#ff0000', etc."),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("update_property", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("get_node_properties", "Get all editor-visible properties of a node with their current values", {
        node_path: z.string().describe("Path to the node"),
        category: z.string().optional().describe("Filter by property category prefix (e.g. 'transform', 'texture')"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("get_node_properties", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("add_resource", "Add a resource (Shape2D, Material, Texture, etc.) to a node's property", {
        node_path: z.string().describe("Path to the target node"),
        property: z.string().describe("Property to set the resource on (e.g. 'shape', 'material', 'texture')"),
        resource_type: z.string().describe("Resource class name (e.g. 'RectangleShape2D', 'CircleShape2D', 'StandardMaterial3D')"),
        resource_properties: z.record(z.string(), z.any()).optional().describe("Properties to set on the created resource"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("add_resource", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("set_anchor_preset", "Set a Control node's anchor preset (e.g. full_rect, center, top_left)", {
        node_path: z.string().describe("Path to the Control node"),
        preset: z.string().describe("Anchor preset name: top_left, top_right, bottom_left, bottom_right, center_left, center_top, center_right, center_bottom, center, left_wide, top_wide, right_wide, bottom_wide, vcenter_wide, hcenter_wide, full_rect"),
        keep_offsets: z.boolean().optional().describe("Keep current offsets (default: false)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("set_anchor_preset", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("rename_node", "Rename a node in the current scene", {
        node_path: z.string().describe("Path to the node to rename"),
        new_name: z.string().describe("New name for the node"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("rename_node", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("connect_signal", "Connect a signal from one node to a method on another node. The connection is persistent (saved into the .tscn on save_scene).", {
        source_path: z.string().describe("Path to the source node (emitter)"),
        signal_name: z.string().describe("Signal name to connect"),
        target_path: z.string().describe("Path to the target node (receiver)"),
        method_name: z.string().describe("Method name on target to call"),
        deferred: z.boolean().optional().describe("Use a deferred connection (CONNECT_DEFERRED)"),
        one_shot: z.boolean().optional().describe("Disconnect automatically after the first emission (CONNECT_ONE_SHOT)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("connect_signal", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("disconnect_signal", "Disconnect a signal connection between two nodes", {
        source_path: z.string().describe("Path to the source node (emitter)"),
        signal_name: z.string().describe("Signal name to disconnect"),
        target_path: z.string().describe("Path to the target node (receiver)"),
        method_name: z.string().describe("Method name on target"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("disconnect_signal", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("get_node_groups", "Get all groups a node belongs to (excludes internal groups starting with '_')", {
        node_path: z.string().describe("Path to the node"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("get_node_groups", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("set_node_groups", "Set the groups a node belongs to. Computes diff with current groups and adds/removes as needed.", {
        node_path: z.string().describe("Path to the node"),
        groups: z.array(z.string()).describe("Desired list of group names (replaces current groups)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("set_node_groups", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("find_nodes_in_group", "Find all nodes in the current scene that belong to a specific group", {
        group: z.string().describe("Group name to search for"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("find_nodes_in_group", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("get_editor_selection", "Get the nodes currently selected in the editor Scene dock", {
        top_only: z.boolean().optional().describe("Return only the topmost selected nodes, excluding a node whose parent is already selected (default: false)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("get_editor_selection", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("select_nodes", "Select one or more nodes in the editor Scene dock, optionally focusing and inspecting them", {
        node_path: z.string().optional().describe("Path to a single node to select"),
        node_paths: z.array(z.string()).optional().describe("Paths to multiple nodes to select (use instead of node_path)"),
        mode: z.enum(["replace", "add", "remove"]).optional().describe("How to apply the selection (default: replace)"),
        inspect: z.boolean().optional().describe("Show the node in the Inspector (only applied when a single node is selected; default: true)"),
        focus: z.boolean().optional().describe("Focus the node in the Scene dock (only applied when a single node is selected; default: follows inspect)"),
        for_property: z.string().optional().describe("Inspector property to focus on"),
        inspector_only: z.boolean().optional().describe("Show in Inspector without changing the edited node (default: false)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("select_nodes", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("clear_editor_selection", "Clear the current editor Scene-dock selection", {}, async (params) => {
        try {
            const result = await godot.sendCommand("clear_editor_selection", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
}
//# sourceMappingURL=node-tools.js.map