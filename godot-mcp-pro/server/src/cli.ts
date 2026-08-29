#!/usr/bin/env node

/**
 * godot-cli — Command-line interface for Godot MCP Pro
 *
 * Connects directly to the Godot editor plugin via WebSocket (JSON-RPC 2.0).
 * Designed for LLMs that can use bash/terminal tools but have tight MCP tool limits.
 * Progressive disclosure via --help at each command level.
 */

import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { createServer } from "net";

const BASE_PORT = 6510;
const MAX_PORT = 6514;
const CONNECT_TIMEOUT_MS = 10000;
const COMMAND_TIMEOUT_MS = 30000;

// ─── Command definitions ──────────────────────────────────────────────

interface CommandDef {
  description: string;
  args?: Record<string, { description: string; required?: boolean; type?: string }>;
  method: string; // JSON-RPC method name
  mapArgs?: (parsed: Record<string, string>) => Record<string, unknown>;
}

interface GroupDef {
  description: string;
  commands: Record<string, CommandDef>;
}

const COMMANDS: Record<string, GroupDef> = {
  project: {
    description: "Project info, files, and settings",
    commands: {
      info: {
        description: "Get project metadata (name, version, viewport, renderer, autoloads)",
        method: "get_project_info",
      },
      files: {
        description: "List project file/directory tree",
        method: "get_filesystem_tree",
        args: {
          path: { description: "Root path (default: res://)" },
          filter: { description: "Glob filter (e.g. '*.gd', '*.tscn')" },
        },
      },
      search: {
        description: "Search for files by name pattern",
        method: "search_files",
        args: {
          query: { description: "Search query (fuzzy match or glob)", required: true },
          path: { description: "Directory to search in" },
          file_type: { description: "Filter by extension (e.g. 'gd', 'tscn')" },
        },
      },
      grep: {
        description: "Search inside file contents",
        method: "search_in_files",
        args: {
          query: { description: "Text/regex pattern", required: true },
          path: { description: "Directory to search in" },
          file_type: { description: "File extension filter (e.g. 'gd', 'tscn')" },
          include_addons: { description: "Also search addons/ (default: false)", type: "boolean" },
        },
        mapArgs: (p) => {
          const out: Record<string, unknown> = { query: p.query };
          if (p.path) out.path = p.path;
          if (p.file_type) out.file_type = p.file_type;
          if (p.include_addons) out.include_addons = p.include_addons !== "false";
          return out;
        },
      },
      "get-setting": {
        description: "Get project settings",
        method: "get_project_settings",
        args: {
          section: { description: "Settings section prefix (e.g. display/window)" },
          key: { description: "A single setting key to read" },
        },
      },
      "set-setting": {
        description: "Set a project setting",
        method: "set_project_setting",
        args: {
          setting: { description: "Setting path (e.g. display/window/size/viewport_width)", required: true },
          value: { description: "Value to set. JSON arrays build container types, e.g. '[640, 480]'", required: true },
          type: { description: "Force the stored type: string, int, float, bool, vector2i, color, packed_string_array, ..." },
        },
        // The addon parameter is `key`; sending `setting` made this command
        // fail every time. The value is passed through as the raw string
        // unless it is JSON: the addon converts it to the setting's declared
        // type, which is what keeps "119" a String on a string-typed setting.
        // Guessing a type here would defeat that.
        mapArgs: (p) => {
          const out: Record<string, unknown> = {
            key: p.setting,
            value: jsonOrString(p.value),
          };
          if (p.type) out.type = p.type;
          return out;
        },
      },
    },
  },
  scene: {
    description: "Scene tree and scene management",
    commands: {
      tree: {
        description: "Get the current scene tree",
        method: "get_scene_tree",
        args: {
          max_depth: { description: "Maximum depth to display", type: "number" },
        },
        mapArgs: (p) => (p.max_depth ? { max_depth: parseInt(p.max_depth) } : {}),
      },
      create: {
        description: "Create a new scene with a root node",
        method: "create_scene",
        args: {
          path: { description: "Scene path (e.g. res://scenes/player.tscn)", required: true },
          root_type: { description: "Root node type (default: Node2D)" },
          root_name: { description: "Root node name" },
        },
      },
      open: {
        description: "Open a scene in the editor",
        method: "open_scene",
        args: {
          path: { description: "Scene path to open", required: true },
        },
      },
      save: {
        description: "Save the current scene",
        method: "save_scene",
        args: {
          path: { description: "Optional path to save as" },
        },
      },
      play: {
        description: "Run the current/specified scene",
        method: "play_scene",
        args: {
          mode: { description: "'main' (default), 'current', or a scene path" },
        },
      },
      stop: {
        description: "Stop the running scene",
        method: "stop_scene",
      },
      content: {
        description: "Get scene file content (tscn format parsed)",
        method: "get_scene_file_content",
        args: {
          path: { description: "Scene file path", required: true },
        },
      },
      exports: {
        description: "Get exported variables of a scene",
        method: "get_scene_exports",
        args: {
          path: { description: "Scene file path", required: true },
        },
      },
      delete: {
        description: "Delete a scene file",
        method: "delete_scene",
        args: {
          path: { description: "Scene file path to delete", required: true },
        },
      },
      instance: {
        description: "Add a scene instance as child node",
        method: "add_scene_instance",
        args: {
          scene_path: { description: "Path to .tscn file to instance", required: true },
          parent_path: { description: "Parent node path (default: selected/root)" },
          name: { description: "Instance name" },
        },
      },
    },
  },
  node: {
    description: "Add, modify, and delete scene nodes",
    commands: {
      add: {
        description: "Add a new node to the scene",
        method: "add_node",
        args: {
          type: { description: "Node type (e.g. CharacterBody3D, Sprite2D)", required: true },
          name: { description: "Node name" },
          parent_path: { description: "Parent node path (default: root '.')" },
        },
      },
      delete: {
        description: "Delete a node from the scene",
        method: "delete_node",
        args: {
          node_path: { description: "Node path to delete", required: true },
        },
      },
      get: {
        description: "Get all properties of a node",
        method: "get_node_properties",
        args: {
          node_path: { description: "Node path", required: true },
        },
      },
      set: {
        description: "Set a property on a node",
        method: "update_property",
        args: {
          node_path: { description: "Node path", required: true },
          property: { description: "Property name", required: true },
          value: { description: "Value to set", required: true },
        },
        mapArgs: (p) => ({ node_path: p.node_path, property: p.property, value: autoType(p.value) }),
      },
      duplicate: {
        description: "Duplicate a node",
        method: "duplicate_node",
        args: {
          node_path: { description: "Node path to duplicate", required: true },
          name: { description: "Name for the duplicate" },
        },
      },
      move: {
        description: "Move/reparent a node",
        method: "move_node",
        args: {
          node_path: { description: "Node path to move", required: true },
          new_parent_path: { description: "New parent path", required: true },
        },
      },
      rename: {
        description: "Rename a node",
        method: "rename_node",
        args: {
          node_path: { description: "Node path", required: true },
          new_name: { description: "New name", required: true },
        },
      },
      connect: {
        description: "Connect a signal between nodes",
        method: "connect_signal",
        args: {
          source_path: { description: "Source node path", required: true },
          signal_name: { description: "Signal name", required: true },
          target_path: { description: "Target node path", required: true },
          method_name: { description: "Target method name", required: true },
        },
      },
      groups: {
        description: "Get groups a node belongs to",
        method: "get_node_groups",
        args: {
          node_path: { description: "Node path", required: true },
        },
      },
    },
  },
  script: {
    description: "Read, create, and edit GDScript/C# files",
    commands: {
      read: {
        description: "Read a script file",
        method: "read_script",
        args: {
          path: { description: "Script path (e.g. res://player.gd)", required: true },
        },
      },
      create: {
        description: "Create a new script file (.gd or .cs only)",
        method: "create_script",
        args: {
          path: { description: "Script path", required: true },
          content: { description: "Script content. Omit to generate an extends/_ready template." },
          base_type: { description: "Base class to extend (default: Node)" },
          force: { description: "Override open-script-editor guard" },
        },
        mapArgs: (p) => {
          const r: Record<string, unknown> = { path: p.path };
          if (p.content) r.content = p.content;
          if (p.base_type) r.extends = p.base_type;
          if (p.force !== undefined) r.force = p.force === "true";
          return r;
        },
      },
      edit: {
        description: "Edit an existing script (full replace or 1-based inclusive line range)",
        method: "edit_script",
        args: {
          path: { description: "Script path", required: true },
          content: { description: "New content", required: true },
          start_line: { description: "Start line for partial edit (1-based inclusive)", type: "number" },
          end_line: { description: "End line for partial edit (1-based inclusive)", type: "number" },
          force: { description: "Override open-script-editor guard" },
        },
        mapArgs: (p) => {
          const r: Record<string, unknown> = { path: p.path, content: p.content };
          if (p.start_line) r.start_line = parseInt(p.start_line);
          if (p.end_line) r.end_line = parseInt(p.end_line);
          if (p.force !== undefined) r.force = p.force === "true";
          return r;
        },
      },
      attach: {
        description: "Attach a script to a node",
        method: "attach_script",
        args: {
          node_path: { description: "Node path", required: true },
          script_path: { description: "Script path", required: true },
        },
      },
      validate: {
        description: "Validate a GDScript for errors",
        method: "validate_script",
        args: {
          path: { description: "Script path to validate", required: true },
        },
      },
      list: {
        description: "List all scripts in the project",
        method: "list_scripts",
      },
    },
  },
  editor: {
    description: "Editor state, errors, screenshots, and utilities",
    commands: {
      errors: {
        description: "Get current editor errors/warnings",
        method: "get_editor_errors",
      },
      log: {
        description: "Get editor output log",
        method: "get_output_log",
        args: {
          lines: { description: "Number of lines (default: 100)", type: "number" },
        },
        mapArgs: (p) => (p.lines ? { max_lines: parseInt(p.lines) } : {}),
      },
      screenshot: {
        description: "Take a screenshot of the running game",
        method: "get_game_screenshot",
      },
      "editor-screenshot": {
        description: "Take a screenshot of the editor",
        method: "get_editor_screenshot",
      },
      exec: {
        description: "Execute an editor script (GDScript in editor context)",
        method: "execute_editor_script",
        args: {
          code: { description: "GDScript code to execute", required: true },
        },
      },
      signals: {
        description: "Get signals of a node type",
        method: "get_signals",
        args: {
          node_path: { description: "Node path", required: true },
        },
      },
      reload: {
        description: "Reload the project",
        method: "reload_project",
      },
    },
  },
  input: {
    description: "Simulate keyboard, mouse, and input actions",
    commands: {
      key: {
        description: "Simulate a key press in the running game",
        method: "simulate_key",
        args: {
          key: { description: "Key name (e.g. W, A, S, D, Space) or a KEY_* constant", required: true },
          pressed: { description: "true=press (default), false=release" },
        },
        // The addon parameter is `keycode`. There is no hold-duration support
        // on that side, so the flag that used to be advertised here did
        // nothing at all; issue a press and a release instead.
        mapArgs: (p) => {
          const r: Record<string, unknown> = { keycode: p.key };
          if (p.pressed !== undefined) r.pressed = p.pressed === "true";
          return r;
        },
      },
      click: {
        description: "Simulate a mouse click in the running game",
        method: "simulate_mouse_click",
        args: {
          x: { description: "X coordinate", required: true, type: "number" },
          y: { description: "Y coordinate", required: true, type: "number" },
          button: { description: "Mouse button: left, right, or middle (default: left)" },
        },
        mapArgs: (p) => {
          const buttonMap: Record<string, number> = { left: 1, right: 2, middle: 3 };
          const r: Record<string, unknown> = { x: parseInt(p.x), y: parseInt(p.y) };
          if (p.button) r.button = buttonMap[p.button.toLowerCase()] ?? (parseInt(p.button) || 1);
          return r;
        },
      },
      action: {
        description: "Simulate an input action (as defined in Input Map)",
        method: "simulate_action",
        args: {
          action: { description: "Action name (e.g. ui_accept, move_left)", required: true },
          pressed: { description: "true=press (default), false=release" },
        },
        mapArgs: (p) => {
          const r: Record<string, unknown> = { action: p.action };
          if (p.pressed !== undefined) r.pressed = p.pressed === "true";
          return r;
        },
      },
      actions: {
        description: "List all configured input actions",
        method: "get_input_actions",
      },
    },
  },
  runtime: {
    description: "Inspect and control the running game",
    commands: {
      tree: {
        description: "Get the running game's scene tree",
        method: "get_game_scene_tree",
        args: {
          max_depth: { description: "Max depth (-1 for unlimited)", type: "number" },
        },
        mapArgs: (p) => {
          const r: Record<string, unknown> = {};
          if (p.max_depth) r.max_depth = parseInt(p.max_depth);
          return r;
        },
      },
      get: {
        description: "Get properties of a node in the running game",
        method: "get_game_node_properties",
        args: {
          node_path: { description: "Node path", required: true },
          properties: { description: "Comma-separated property names (default: all)" },
        },
        mapArgs: (p) => {
          const r: Record<string, unknown> = { node_path: p.node_path };
          if (p.properties) r.properties = p.properties.split(",").map(s => s.trim());
          return r;
        },
      },
      set: {
        description: "Set a property on a running game node",
        method: "set_game_node_property",
        args: {
          node_path: { description: "Node path", required: true },
          property: { description: "Property name", required: true },
          value: { description: "Value to set", required: true },
        },
        mapArgs: (p) => ({ node_path: p.node_path, property: p.property, value: autoType(p.value) }),
      },
      exec: {
        description: "Execute GDScript in the running game",
        method: "execute_game_script",
        args: {
          code: { description: "GDScript code. Runs in the game process; use print() for output.", required: true },
        },
      },
      ui: {
        description: "Find UI elements (buttons, labels, etc.) in the running game",
        method: "find_ui_elements",
        args: {
          type_filter: { description: "Filter by type (Button, Label, etc.)" },
        },
      },
    },
  },
};

// ─── Argument parsing ─────────────────────────────────────────────────

/**
 * Parses a JSON array or object, and otherwise hands the string back
 * untouched. Unlike autoType() this never turns "119" into a number: on the
 * setting path the addon knows the declared type and converts to it, so
 * guessing here is how a string-typed setting used to get an int written into
 * it with no way to opt out.
 */
function jsonOrString(value: string): unknown {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* not JSON after all — send it as the literal string */
    }
  }
  return value;
}

function autoType(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== "") return num;
  // Try JSON for arrays/objects
  if ((value.startsWith("[") || value.startsWith("{")) && (value.endsWith("]") || value.endsWith("}"))) {
    try { return JSON.parse(value); } catch { /* fall through */ }
  }
  return value;
}

function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

// ─── Help formatting ──────────────────────────────────────────────────

function showMainHelp(): void {
  console.log(`godot-cli — Control Godot editor from the command line

Usage: godot-cli <group> <command> [options]

Groups:`);
  for (const [name, group] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(12)} ${group.description}`);
  }
  console.log(`
Options:
  --port <N>   Godot WebSocket port (default: auto-detect 6510-6514)
  --help       Show help for a group or command

Examples:
  godot-cli project info
  godot-cli scene tree
  godot-cli node add --type CharacterBody3D --name Player
  godot-cli script read --path res://player.gd
  godot-cli scene play
  godot-cli input key --key W`);
}

function showGroupHelp(groupName: string, group: GroupDef): void {
  console.log(`godot-cli ${groupName} — ${group.description}

Commands:`);
  for (const [name, cmd] of Object.entries(group.commands)) {
    console.log(`  ${name.padEnd(18)} ${cmd.description}`);
  }
  console.log(`\nUse: godot-cli ${groupName} <command> --help for details`);
}

function showCommandHelp(groupName: string, cmdName: string, cmd: CommandDef): void {
  console.log(`godot-cli ${groupName} ${cmdName} — ${cmd.description}`);
  if (cmd.args && Object.keys(cmd.args).length > 0) {
    console.log(`\nOptions:`);
    for (const [name, arg] of Object.entries(cmd.args)) {
      const req = arg.required ? " (required)" : "";
      console.log(`  --${name.padEnd(16)} ${arg.description}${req}`);
    }
  }
}

// ─── WebSocket connection ─────────────────────────────────────────────
// The Godot plugin is a WebSocket CLIENT that connects to servers on ports 6505-6514.
// The CLI starts a temporary WebSocket SERVER on an available port and waits for
// the Godot plugin to connect (it polls every 3 seconds).

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort(preferredPort?: number): Promise<number | null> {
  if (preferredPort) {
    if (await isPortFree(preferredPort)) return preferredPort;
    return null;
  }
  for (let p = BASE_PORT; p <= MAX_PORT; p++) {
    if (await isPortFree(p)) return p;
  }
  return null;
}

/**
 * Start a WebSocket server and wait for the Godot plugin to connect.
 * Returns the connected client WebSocket and the server (for cleanup).
 */
function waitForGodot(port: number): Promise<{ client: WebSocket; wss: WebSocketServer }> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port, host: "127.0.0.1" });
    const timeout = setTimeout(() => {
      wss.close();
      reject(new Error(
        `Godot plugin did not connect within ${CONNECT_TIMEOUT_MS / 1000}s.\n` +
        "Make sure the Godot editor is running with the MCP plugin enabled."
      ));
    }, CONNECT_TIMEOUT_MS);

    wss.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    wss.on("connection", (ws) => {
      clearTimeout(timeout);
      resolve({ client: ws, wss });
    });
  });
}

function sendCommand(
  ws: WebSocket,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timeout = setTimeout(() => {
      reject(new Error(`Command '${method}' timed out after ${COMMAND_TIMEOUT_MS}ms`));
    }, COMMAND_TIMEOUT_MS);

    const handler = (data: Buffer) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      // Ignore ping/pong
      if ((msg as { method?: string }).method === "pong" || (msg as { method?: string }).method === "ping") return;
      if (msg.id !== id) return;

      clearTimeout(timeout);
      ws.off("message", handler);

      if (msg.error) {
        reject(new Error(`Godot error: ${msg.error.message || JSON.stringify(msg.error)}`));
      } else {
        resolve(msg.result);
      }
    };

    ws.on("message", handler);
    ws.send(JSON.stringify({ jsonrpc: "2.0", method, params, id }));
  });
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  const userArgs = process.argv.slice(2);
  const { positional, flags } = parseArgs(userArgs);

  // Global --help
  if (positional.length === 0 || flags.help === "true" && positional.length === 0) {
    showMainHelp();
    process.exit(0);
  }

  const groupName = positional[0];
  const group = COMMANDS[groupName];

  if (!group) {
    console.error(`Unknown group: ${groupName}`);
    showMainHelp();
    process.exit(1);
  }

  // Group-level --help
  if (positional.length === 1 || (flags.help === "true" && positional.length === 1)) {
    showGroupHelp(groupName, group);
    process.exit(0);
  }

  const cmdName = positional[1];
  const cmd = group.commands[cmdName];

  if (!cmd) {
    console.error(`Unknown command: ${groupName} ${cmdName}`);
    showGroupHelp(groupName, group);
    process.exit(1);
  }

  // Command-level --help
  if (flags.help === "true") {
    showCommandHelp(groupName, cmdName, cmd);
    process.exit(0);
  }

  // Validate required args
  if (cmd.args) {
    for (const [name, arg] of Object.entries(cmd.args)) {
      if (arg.required && !flags[name]) {
        console.error(`Missing required option: --${name}`);
        showCommandHelp(groupName, cmdName, cmd);
        process.exit(1);
      }
    }
  }

  // Build params
  const params = cmd.mapArgs ? cmd.mapArgs(flags) : { ...flags };
  // Remove internal flags
  delete params.port;
  delete params.help;

  // Connect and execute
  const preferredPort = flags.port ? parseInt(flags.port) : undefined;
  const port = await findFreePort(preferredPort);
  if (!port) {
    console.error(
      `No free ports in range ${BASE_PORT}-${MAX_PORT}.\n` +
      "All ports are occupied by MCP server instances."
    );
    process.exit(1);
  }

  let client: WebSocket;
  let wss: WebSocketServer;
  try {
    process.stderr.write(`Waiting for Godot on port ${port}...`);
    ({ client, wss } = await waitForGodot(port));
    process.stderr.write(" connected!\n");
  } catch (err) {
    process.stderr.write("\n");
    console.error((err as Error).message);
    process.exit(1);
  }

  try {
    const result = await sendCommand(client, cmd.method, params);
    if (result !== undefined && result !== null) {
      console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  } finally {
    client.close();
    wss.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
