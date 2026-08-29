# Godot MCP Pro CLI Usage Guide

This document provides instructions for using the Godot MCP Pro command-line interface (CLI) to control and interact with your Godot project.

## Quick Start

### 1. Start the MCP Server

```bash
node /home/d_msl/workspace/godot-bug-catcher/godot-mcp-pro/server/build/index.js --lite
```

The server will start and connect to Godot automatically. You'll see:
```
[MCP] Godot MCP Pro LITE started (84 tools, stdio transport)
[MCP] WebSocket server listening on ws://127.0.0.1:6508
[MCP] Godot editor connected
```

### 2. Use the CLI

The CLI provides programmatic access to all MCP tools via command line:

```bash
node /home/d_msl/workspace/godot-bug-catcher/godot-mcp-pro/server/build/cli.js <group> <command> [options]
```

## Command Groups

### `project` - Project info, files, and settings
```bash
# Get project information
godot-cli project info

# Get project settings
godot-cli project settings

# Set a project setting
godot-cli project set --key application/config/name --value "My Game"

# Get file system tree
godot-cli project filesystem
```

### `scene` - Scene tree and scene management
```bash
# Get current scene tree
godot-cli scene tree

# Open a scene
godot-cli scene open --path res://scenes/main.tscn

# Create a new scene
godot-cli scene create --path res://scenes/new_scene.tscn --root_type Control

# Delete a scene
godot-cli scene delete --path res://scenes/old_scene.tscn

# Add an existing scene as instance
godot-cli scene add_instance --scene_path res://scenes/prefab.tscn --parent_path .

# Play the main scene
godot-cli scene play --mode main

# Stop the running scene
godot-cli scene stop

# Save current scene
godot-cli scene save

# Get scene exports
godot-cli scene exports --path res://scenes/main.tscn
```

### `node` - Add, modify, and delete scene nodes
```bash
# Add a new node
godot-cli node add --type Button --name MyButton --parent VBoxContainer/HBoxContainer --text "Click Me"

# Get all properties of a node
godot-cli node get --path VBoxContainer/Title

# Set a property on a node
godot-cli node set --node_path TubButton --property text --value "tub"

# Duplicate a node
godot-cli node duplicate --path VBoxContainer/CaptureButton --name CopyButton

# Move/reparent a node
godot-cli node move --node_path TubButton --new_parent_path VBoxContainer/HBoxContainer

# Rename a node
godot-cli node rename --node_path MyNode --new_name NewName

# Delete a node
godot-cli node delete --path VBoxContainer/StatusLabel
```

### `script` - Read, create, and edit GDScript/C# files
```bash
# Read a script file
godot-cli script read --path res://scripts/main.gd

# Create a new script
godot-cli script create --path res://scripts/new_script.gd --type gdscript

# Edit an existing script (use with caution)
godot-cli script edit --path res://scripts/main.gd --code "func _ready(): print('Hello')"

# Get open scripts
godot-cli script open

# List all scripts in project
godot-cli script list
```

### `editor` - Editor state, errors, screenshots, and utilities
```bash
# Get current editor errors
godot-cli editor errors

# Get editor output log
godot-cli editor log

# Take a screenshot of the running game
godot-cli runtime screenshot

# Take a screenshot of the editor
godot-cli editor-screenshot

# Execute an editor script (GDScript in editor context)
godot-cli editor exec --code "_mcp_print(Engine.get_main_loop().name)"

# Get signals of a node type
godot-cli editor signals --type Button

# Reload the project (rescan filesystem)
godot-cli editor reload

# Clear output log
godot-cli editor clear
```

### `input` - Simulate keyboard, mouse, and input actions
```bash
# Simulate a key press
godot-cli input key --key W --duration 0.5

# Simulate mouse movement
godot-cli input mouse_move --x 100 --y 200

# Simulate mouse click
godot-cli input mouse_click --button left --x 100 --y 200

# Simulate an input action
godot-cli input action --action_name Jump --duration 0.3

# Simulate a sequence of inputs
godot-cli input sequence --inputs '[{"type":"key","key":"W","duration":0.5},{"type":"mouse_click","button":"left","x":100,"y":200}]'
```

### `runtime` - Inspect and control the running game
```bash
# Get runtime scene tree
godot-cli runtime tree

# Get properties of a runtime node
godot-cli runtime get_properties --path /Main/Player

# Set a property on a runtime node
godot-cli runtime set_property --path /Main/Player --property speed --value 200

# Execute game script (runs in temporary node)
godot-cli runtime exec --code "var player = get_tree().get_first_node_in_group('players'); _mcp_print(player.name)"

# Get autoload scripts
godot-cli runtime autoload

# Find nodes by script
godot-cli runtime find_nodes_by_script --script_path res://scripts/player.gd

# Get game screenshot
godot-cli runtime screenshot

# Compare two screenshots
godot-cli runtime compare_screenshots --path1 user://screenshot1.png --path2 user://screenshot2.png
```

## Common Workflows

### Adding a Button to a Scene
```bash
# 1. Check current scene tree
godot-cli scene tree

# 2. Add a new button
godot-cli node add --type Button --name MyButton --parent VBoxContainer/HBoxContainer --text "New Button"

# 3. Set the button text (if needed)
godot-cli node set --node_path MyButton --property text --value "Click Me"

# 4. Verify the change
godot-cli scene tree
```

### Inspecting Project Structure
```bash
# Get project info
godot-cli project info

# Get file system tree
godot-cli project filesystem

# Get current scene tree
godot-cli scene tree
```

### Debugging Script Errors
```bash
# Check for errors
godot-cli editor errors

# Reload to clear cache
godot-cli editor reload

# Execute a script to test it
godot-cli editor exec --code "func test(): _mcp_print('Script loaded successfully')"
```

### Testing Gameplay
```bash
# 1. Play the scene
godot-cli scene play --mode main

# 2. Simulate input
godot-cli input key --key W --duration 0.5

# 3. Get runtime state
godot-cli runtime tree

# 4. Take screenshot
godot-cli runtime screenshot

# 5. Stop when done
godot-cli scene stop
```

## Tips and Best Practices

1. **Always check the current state** before making changes:
   ```bash
   godot-cli scene tree
   godot-cli node get --path VBoxContainer/Title
   ```

2. **Use `--help` to discover commands**:
   ```bash
   godot-cli scene --help
   godot-cli node add --help
   ```

3. **Reload after major changes**:
   ```bash
   godot-cli editor reload
   ```

4. **Clear cache if errors persist**:
   ```bash
   find /home/d_msl/workspace/godot-bug-catcher -name "*.uid" -delete
   godot-cli editor reload
   ```

5. **Use runtime tools only after playing the scene**:
   ```bash
   godot-cli scene play --mode main  # Must run first!
   godot-cli runtime tree             # Then use runtime tools
   ```

## Available Options

Most commands support these common options:

- `--path` / `--node_path`: Path to the target (e.g., `VBoxContainer/Title`)
- `--type`: Node type (e.g., `Button`, `Label`, `Sprite2D`)
- `--name`: Node name
- `--parent_path` / `--new_parent_path`: Parent node path
- `--property`: Property name to set/get
- `--value`: Value to set (can be string, number, Vector2, Color, etc.)
- `--code`: GDScript code to execute

## Examples with Complex Values

### Setting a Vector2 position
```bash
godot-cli node set --node_path Player --property position --value "Vector2(100, 200)"
```

### Setting a Color
```bash
godot-cli node set --node_path Title --property color --value "Color(1, 0, 0, 1)"
```

### Executing multi-line script
```bash
godot-cli editor exec --code "
var nodes = []
for child in EditorInterface.get_edited_scene_root().get_children():
    nodes.append(child.name)
_mcp_print(str(nodes))
"
```

## Troubleshooting

### "Waiting for Godot on port..." messages
The CLI is trying to connect to Godot. Make sure:
- Godot is running
- The correct port is configured (default: 6510-6514)
- Use `--port <N>` if you need a specific port

### "Filesystem rescanned" messages
This is normal after reloading. Wait for the reload to complete before running commands.

### Script parse errors
If you see parse errors:
1. Check for syntax issues in your scripts
2. Delete `.uid` cache files: `find . -name "*.uid" -delete`
3. Reload: `godot-cli editor reload`

## See Also

- [AGENTS.md](./godot-mcp-pro/AGENTS.md) - Detailed Godot MCP Pro instructions
- [INSTALL.md](./godot-mcp-pro/INSTALL.md) - Installation guide
