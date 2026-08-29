/**
 * Minimal mode: only these tools are registered (~35 tools).
 * Designed for clients with tight tool limits (Cursor: 40, local LLMs with small context).
 */
export const MINIMAL_TOOLS = new Set([
    // project (5)
    "get_project_info",
    "get_filesystem_tree",
    "search_files",
    "search_in_files",
    "set_project_setting",
    // scene (6)
    "get_scene_tree",
    "create_scene",
    "open_scene",
    "play_scene",
    "stop_scene",
    "save_scene",
    // node (5)
    "add_node",
    "delete_node",
    "update_property",
    "get_node_properties",
    "connect_signal",
    // script (5)
    "read_script",
    "create_script",
    "edit_script",
    "attach_script",
    "validate_script",
    // editor (5)
    "get_editor_errors",
    "get_output_log",
    "get_game_screenshot",
    "execute_editor_script",
    "reload_project",
    // input (3)
    "simulate_key",
    "simulate_mouse_click",
    "simulate_action",
    // runtime (5)
    "get_game_scene_tree",
    "get_game_node_properties",
    "set_game_node_property",
    "execute_game_script",
    "find_ui_elements",
    // input-map (1)
    "get_input_actions",
]);
/**
 * Creates a proxy around McpServer that filters tool registrations.
 * Only tools in the allowSet will be registered; others are silently skipped.
 */
export function createFilteredServer(server, allowSet) {
    return new Proxy(server, {
        get(target, prop, receiver) {
            if (prop === "tool") {
                const originalTool = target.tool.bind(target);
                return function filteredTool(name, ...args) {
                    if (!allowSet.has(name))
                        return;
                    return originalTool(name, ...args);
                };
            }
            return Reflect.get(target, prop, receiver);
        },
    });
}
//# sourceMappingURL=tool-filter.js.map