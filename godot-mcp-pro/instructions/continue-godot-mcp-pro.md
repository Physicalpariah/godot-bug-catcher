# Godot MCP Pro - AI Assistant Instructions

You have access to the Godot MCP Pro toolset for building and testing Godot games through the editor. Follow these rules carefully.

## Critical: Editor vs Runtime Tools

Tools are split into two categories. **Using a runtime tool without starting the game will always fail.**

### Editor Tools (always available)
These work on the currently open scene in the Godot editor:
- **Scene**: `get_scene_tree`, `create_scene`, `open_scene`, `save_scene`, `delete_scene`, `add_scene_instance`, `get_scene_file_content`, `get_scene_exports`
- **Nodes**: `add_node`, `delete_node`, `duplicate_node`, `move_node`, `rename_node`, `update_property`, `get_node_properties`, `add_resource`, `set_anchor_preset`, `connect_signal`, `disconnect_signal`, `get_node_groups`, `set_node_groups`, `find_nodes_in_group`
- **Scripts**: `create_script`, `read_script`, `edit_script`, `validate_script`, `attach_script`, `get_open_scripts`, `list_scripts`
- **Project**: `get_project_info`, `get_project_settings`, `set_project_setting`, `get_project_statistics`, `get_filesystem_tree`, `get_input_actions`, `set_input_action`
- **Editor**: `execute_editor_script`, `get_editor_errors`, `get_output_log`, `get_editor_screenshot`, `clear_output`, `reload_plugin`, `reload_project`
- **Resources**: `create_resource`, `read_resource`, `edit_resource`, `get_resource_preview`
- **Batch**: `batch_add_nodes`, `batch_set_property`, `find_nodes_by_type`, `find_signal_connections`, `find_node_references`, `get_scene_dependencies`, `cross_scene_set_property`
- **3D**: `add_mesh_instance`, `setup_environment`, `setup_lighting`, `setup_camera_3d`, `setup_collision`, `setup_physics_body`, `set_material_3d`, `add_raycast`, `add_gridmap`
- **Animation**: `create_animation`, `add_animation_track`, `set_animation_keyframe`, `list_animations`, `get_animation_info`, `remove_animation`
- **Animation Tree**: `create_animation_tree`, `get_animation_tree_structure`, `add_state_machine_state`, `add_state_machine_transition`, `remove_state_machine_state`, `remove_state_machine_transition`, `set_blend_tree_node`, `set_tree_parameter`
- **Audio**: `add_audio_player`, `add_audio_bus`, `add_audio_bus_effect`, `set_audio_bus`, `get_audio_bus_layout`, `get_audio_info`
- **Navigation**: `setup_navigation_region`, `setup_navigation_agent`, `bake_navigation_mesh`, `set_navigation_layers`, `get_navigation_info`
- **Particles**: `create_particles`, `set_particle_material`, `set_particle_color_gradient`, `apply_particle_preset`, `get_particle_info`
- **Physics**: `get_physics_layers`, `set_physics_layers`, `get_collision_info`
- **Shader**: `create_shader`, `read_shader`, `edit_shader`, `assign_shader_material`, `get_shader_params`, `set_shader_param`
- **Theme**: `create_theme`, `get_theme_info`, `set_theme_color`, `set_theme_font_size`, `set_theme_constant`, `set_theme_stylebox`
- **Tilemap**: `tilemap_get_info`, `tilemap_set_cell`, `tilemap_get_cell`, `tilemap_fill_rect`, `tilemap_clear`, `tilemap_get_used_cells`
- **Export**: `list_export_presets`, `get_export_info`, `export_project`
- **Analysis**: `analyze_scene_complexity`, `analyze_signal_flow`, `detect_circular_dependencies`, `find_unused_resources`, `get_performance_monitors`, `search_files`, `search_in_files`, `find_script_references`
- **Profiling**: `get_editor_performance`

### Runtime Tools (require `play_scene` first)
You MUST call `play_scene` before using any of these. They interact with the running game:
- **Game State**: `get_game_scene_tree`, `get_game_node_properties`, `set_game_node_property`, `execute_game_script`, `get_game_screenshot`, `get_autoload`, `find_nodes_by_script`
- **Input Simulation**: `simulate_key`, `simulate_mouse_click`, `simulate_mouse_move`, `simulate_action`, `simulate_sequence`
- **Capture/Recording**: `capture_frames`, `record_frames`, `monitor_properties`, `start_recording`, `stop_recording`, `replay_recording`, `batch_get_properties`
- **UI Interaction**: `find_ui_elements`, `click_button_by_text`, `wait_for_node`, `find_nearby_nodes`, `navigate_to`, `move_to`
- **Testing**: `run_test_scenario`, `assert_node_state`, `assert_screen_text`, `run_stress_test`, `get_test_report`
- **Screenshots**: `get_game_screenshot`, `compare_screenshots`
- **Control**: `play_scene`, `stop_scene`

## Workflow Patterns

### Building a scene from scratch
1. `create_scene` or `open_scene`
2. Use `add_node` or `batch_add_nodes` to add nodes
3. `create_script` + `attach_script` for behavior
4. `save_scene`

### Testing gameplay
1. Build scene with editor tools (above)
2. `play_scene` to start the game
3. Use `simulate_key`/`simulate_mouse_click` for input
4. `get_game_screenshot` or `capture_frames` to observe results
5. `stop_scene` when done

### Inspecting a project
1. `get_project_info` for overview
2. `get_scene_tree` for current scene structure
3. `read_script` to read code
4. `get_node_properties` for specific node details

### Migrating code properties to inspector
When a script hardcodes visual properties (colors, sizes, positions, theme overrides) that should be in the inspector:
1. `read_script` to find hardcoded property assignments (e.g. `modulate = Color(...)`, `add_theme_color_override(...)`)
2. `get_node_properties` to see current inspector values
3. `update_property` to set the same values as node properties in the inspector
4. `edit_script` to remove the hardcoded lines from the script
5. `save_scene` to persist the inspector changes
6. `validate_script` to verify the script still works

## Formatting Rules

### execute_editor_script
The `code` parameter must be valid GDScript. Use `_mcp_print(value)` to return output.

```
# Correct
_mcp_print("hello")

# Correct - multi-line
var nodes = []
for child in EditorInterface.get_edited_scene_root().get_children():
    nodes.append(child.name)
_mcp_print(str(nodes))
```

### execute_game_script
Same as above but runs inside the running game. Additional rules:
- No nested functions (`func` inside `func` is invalid GDScript)
- Use `.get("property")` instead of `.property` for safe access
- Runs in a temporary node — use `get_tree()` to access the scene tree

### batch_add_nodes
Pass an array of node definitions. Nodes are processed in order, so earlier nodes can be parents for later ones:
```json
{
  "nodes": [
    {"type": "Node2D", "name": "Container", "parent_path": "."},
    {"type": "Sprite2D", "name": "Icon", "parent_path": "Container"},
    {"type": "Label", "name": "Title", "parent_path": "Container", "properties": {"text": "Hello"}}
  ]
}
```

## Best Practices

1. **Prefer inspector properties over code** — When changing visual properties (colors, sizes, theme overrides, transforms, etc.), use `update_property` to set them directly on the node. This keeps values visible in the Godot inspector and easy to tweak. Only use GDScript when the property isn't available in the inspector or needs to be dynamic at runtime.

## Common Pitfalls

1. **Never edit project.godot directly** — Use `set_project_setting` instead. The Godot editor overwrites the file.
2. **GDScript type inference** — Use explicit type annotations in for-loops: `for item: String in array` instead of `for item in array`.
3. **Reload after script changes** — After `create_script`, call `reload_project` if the script doesn't take effect.
4. **Property values as strings** — Properties like position accept string format: `"Vector2(100, 200)"`, `"Color(1, 0, 0, 1)"`.
5. **simulate_key duration** — Use short durations (0.3-0.5s) for precise movement. Integer seconds (1, 2, 3) cause overshooting.
6. **compare_screenshots** — Pass file paths (`user://screenshot.png`), not base64 data.

## CLI Mode (Alternative to MCP Tools)

If MCP tools are unavailable or you have a terminal/bash tool, you can control Godot via the CLI.
The CLI requires the server to be built first (`node build/setup.js install` in the server directory).

```bash
# Discover available command groups
node /path/to/server/build/cli.js --help

# Discover commands in a group
node /path/to/server/build/cli.js scene --help

# Discover options for a specific command
node /path/to/server/build/cli.js node add --help

# Execute commands
node /path/to/server/build/cli.js project info
node /path/to/server/build/cli.js scene tree
node /path/to/server/build/cli.js node add --type CharacterBody3D --name Player --parent /root/Main
node /path/to/server/build/cli.js script read --path res://player.gd
node /path/to/server/build/cli.js scene play
node /path/to/server/build/cli.js input key --key W --duration 0.5
node /path/to/server/build/cli.js runtime tree
```

**Command groups**: project, scene, node, script, editor, input, runtime

Always start by running `--help` to discover available commands. Use the CLI when MCP tools are not loaded or when you need to reduce context usage.
