import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const FALLBACK_INSTRUCTIONS = `# Godot MCP Pro

You have access to the Godot MCP Pro toolset for building and testing Godot games through the editor.

## Critical rules
- Tools are split into **editor** (always available) and **runtime** (require \`play_scene\` first).
- Never edit \`project.godot\` directly — use \`set_project_setting\`.
- For input simulation, use short \`simulate_key\` durations (0.3–0.5s), not integer seconds.
- \`execute_editor_script\` / \`execute_game_script\` must be valid GDScript; use \`_mcp_print(value)\` to return output.

## Getting oriented
- \`get_project_info\` — project overview
- \`get_scene_tree\` — current scene structure
- For a full usage guide, see \`instructions/CLAUDE.md\` in the installed package.
`;

/**
 * Loads CLAUDE.md from the shipped `instructions/` directory so Claude has
 * the essential usage guide from message #1 of every session. Falls back to
 * a terse built-in string if the file can't be located (e.g. custom layouts).
 */
export function loadInstructions(): string {
  const here = dirname(fileURLToPath(import.meta.url));

  const candidates = [
    resolve(here, "../../instructions/CLAUDE.md"),
    resolve(here, "../../../instructions/CLAUDE.md"),
    resolve(here, "../../../../instructions/CLAUDE.md"),
  ];

  for (const path of candidates) {
    try {
      const content = readFileSync(path, "utf8");
      if (content.trim().length > 0) return content;
    } catch {
      // try next
    }
  }

  return FALLBACK_INSTRUCTIONS;
}
