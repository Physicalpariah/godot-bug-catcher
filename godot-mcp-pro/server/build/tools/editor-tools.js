import { z } from "zod";
import { formatErrorForMcp } from "../utils/errors.js";
export function registerEditorTools(server, godot) {
    server.tool("get_editor_errors", "Get recent errors and stack traces from the Godot editor log", {
        max_lines: z.number().optional().describe("Maximum log lines to scan for errors (default: 50)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("get_editor_errors", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("get_output_log", "Read the full Godot editor Output panel content. Unlike get_editor_errors which filters for errors only, this returns all output including print() statements and warnings.", {
        max_lines: z.number().optional().describe("Maximum number of lines to return from the end (default: 100)"),
        filter: z.string().optional().describe("Filter lines containing this substring (case-sensitive)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("get_output_log", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("get_editor_screenshot", "Capture a screenshot of the Godot editor's 2D/3D viewport", {
        save_path: z.string().optional().describe("Optional res:// or user:// path to save the screenshot as PNG file (e.g. 'res://screenshot.png'). When provided, the image is saved to disk and the file path is returned instead of base64 data."),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("get_editor_screenshot", params);
            if (result && typeof result === "object" && "saved_path" in result) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Screenshot saved: ${result.saved_path} (${result.width}x${result.height})`,
                        },
                    ],
                };
            }
            if (result && typeof result === "object" && "image_base64" in result) {
                return {
                    content: [
                        {
                            type: "image",
                            data: result.image_base64,
                            mimeType: "image/png",
                        },
                        {
                            type: "text",
                            text: `Screenshot captured: ${result.width}x${result.height}`,
                        },
                    ],
                };
            }
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("get_game_screenshot", "Capture a single screenshot of the running game (requires a scene to be playing). Good for checking static visual state (UI layout, scene composition, colors). For verifying animations or movement, use capture_frames instead — a single screenshot cannot confirm whether an animation is playing.", {
        save_path: z.string().optional().describe("Optional res:// or user:// path to save the screenshot as PNG file (e.g. 'res://screenshot.png'). When provided, the image is saved to disk and the file path is returned instead of base64 data."),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("get_game_screenshot", params);
            if (result && typeof result === "object" && "saved_path" in result) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Game screenshot saved: ${result.saved_path} (${result.width}x${result.height})${result.note ? ` (${result.note})` : ""}`,
                        },
                    ],
                };
            }
            if (result && typeof result === "object" && "image_base64" in result) {
                return {
                    content: [
                        {
                            type: "image",
                            data: result.image_base64,
                            mimeType: "image/png",
                        },
                        {
                            type: "text",
                            text: `Game screenshot: ${result.width}x${result.height}${result.note ? ` (${result.note})` : ""}`,
                        },
                    ],
                };
            }
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("execute_editor_script", "Execute arbitrary GDScript code inside the Godot editor process. Use _mcp_print() to output values. As an accident guard — NOT a security boundary — the submitted source is string-matched for direct file/resource write APIs (ResourceSaver.save, FileAccess WRITE, ProjectSettings.save, ConfigFile.save, DirAccess mutations) and refused, because those bypass the per-command open-resource guards. The check inspects text only: code that builds such a call dynamically, or uses a destructive API not on the list, runs regardless. Prefer the dedicated tools (save_scene, create_script, etc.) for writes, or pass allow_unsafe_editor_io=true once you have verified no open editor resource will be overwritten.", {
        code: z.string().describe("GDScript code to execute. Use _mcp_print(value) to capture output. " +
            "The code runs inside a run() function with access to the full editor API."),
        allow_unsafe_editor_io: z.boolean().optional().describe("Override the file-write safety guard. Only set this when you are certain no open scene/script/shader will be overwritten by the script. Prefer the dedicated MCP tools for ordinary save flows."),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("execute_editor_script", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("clear_output", "Clear the Godot editor output panel", {}, async () => {
        try {
            const result = await godot.sendCommand("clear_output");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("get_signals", "Get all signals of a node, including current connections", {
        node_path: z.string().describe("Path to the node to inspect"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("get_signals", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("reload_plugin", "Reload the Godot MCP Pro plugin (disable/re-enable). Connection will briefly drop and auto-reconnect. NOTE: This does NOT reload GDScript preload() caches. If you changed GDScript command files, use execute_editor_script with 'EditorInterface.restart_editor(true)' instead for a full editor restart.", {}, async () => {
        try {
            const result = await godot.sendCommand("reload_plugin");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("reload_project", "Rescan the Godot project filesystem and reload changed scripts (no reconnection needed)", {}, async () => {
        try {
            const result = await godot.sendCommand("reload_project");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("compare_screenshots", "Compare two screenshots pixel-by-pixel and return a diff analysis. Returns changed pixel count, diff percentage, and a highlighted diff image. Useful for visual regression testing. Accepts file paths (res://, user://) or base64 PNG strings.", {
        image_a: z.string().describe("First image: file path (e.g. 'user://screenshot_a.png') or base64 PNG string"),
        image_b: z.string().describe("Second image: file path (e.g. 'user://screenshot_b.png') or base64 PNG string"),
        threshold: z.number().optional().describe("Color difference threshold (0-255, default: 10). Pixels with max channel difference below this are considered identical."),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("compare_screenshots", params);
            const content = [];
            // Add summary text
            content.push({
                type: "text",
                text: JSON.stringify({
                    identical: result.identical,
                    changed_pixels: result.changed_pixels,
                    total_pixels: result.total_pixels,
                    diff_percentage: result.diff_percentage,
                    threshold: result.threshold,
                    size: `${result.width}x${result.height}`,
                }, null, 2),
            });
            // Add diff image if there are differences
            if (result.diff_image_base64 && !result.identical) {
                content.push({
                    type: "image",
                    data: result.diff_image_base64,
                    mimeType: "image/png",
                });
            }
            return { content };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("set_auto_dismiss", "Enable or disable automatic dismissal of blocking editor dialogs (e.g. 'Reload from disk?', 'Save changes?'). Enable this before operations that modify files externally, and disable when done. Disabled by default.", {
        enabled: z.boolean().describe("true to enable auto-dismiss, false to disable"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("set_auto_dismiss", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("get_editor_camera", "Get the current 3D editor viewport camera position, rotation, and FOV. Use this to understand the current view before taking editor screenshots.", {}, async () => {
        try {
            const result = await godot.sendCommand("get_editor_camera");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("set_editor_camera", "Move the 3D editor viewport camera to a specific position and orientation. Use this to frame a view before taking editor screenshots to validate changes visually.", {
        position: z.object({
            x: z.number().describe("X position"),
            y: z.number().describe("Y position"),
            z: z.number().describe("Z position"),
        }).optional().describe("Camera world position"),
        rotation_degrees: z.object({
            x: z.number().describe("Pitch (degrees)"),
            y: z.number().describe("Yaw (degrees)"),
            z: z.number().describe("Roll (degrees)"),
        }).optional().describe("Camera rotation in degrees"),
        look_at: z.object({
            x: z.number().describe("Target X"),
            y: z.number().describe("Target Y"),
            z: z.number().describe("Target Z"),
        }).optional().describe("Point to look at (overrides rotation_degrees if both set)"),
        fov: z.number().optional().describe("Field of view in degrees (default: 75)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("set_editor_camera", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
}
//# sourceMappingURL=editor-tools.js.map