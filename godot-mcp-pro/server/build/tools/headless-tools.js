import { z } from "zod";
import { formatErrorForMcp } from "../utils/errors.js";
const DEFAULT_TIMEOUT_SEC = 120;
const MAX_TIMEOUT_SEC = 900;
/** Slack beyond the addon's own timeout so the addon reports the kill itself. */
const RPC_GRACE_MS = 15000;
function rpcTimeoutMs(params) {
    const requested = params.timeout_sec ?? DEFAULT_TIMEOUT_SEC;
    const clamped = Math.min(Math.max(requested, 1), MAX_TIMEOUT_SEC);
    return clamped * 1000 + RPC_GRACE_MS;
}
/** The addon requires a res:// path and rejects anything else outright. */
const resPath = z.string().regex(/^res:\/\/.+/, "must be a res:// path");
const sharedArgs = {
    args: z
        .array(z.string())
        .optional()
        .describe("Extra arguments passed to the project itself (after the '--' separator). On Windows, arguments containing a double quote or a line break are rejected — a batch runner cannot represent the first and the second would end the command line."),
    timeout_sec: z
        .number()
        .min(1)
        .max(MAX_TIMEOUT_SEC)
        .optional()
        .describe("Kill the process after this many seconds (default 120, max 900). Partial output is still returned."),
    quit_after_frames: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Pass --quit-after N so the run stops after N frames. Use for scenes that do not quit on their own."),
};
export function registerHeadlessTools(server, godot) {
    server.tool("run_headless_scene", "Run a scene in a separate headless Godot process and return its stdout/stderr and exit code. This is how to run a project's own test suite (e.g. res://tests/smoke_runner.tscn) — the editor-driven tools cannot see CLI-run tests. The scene should quit on its own; otherwise set quit_after_frames or timeout_sec.", {
        scene_path: resPath.describe("Scene to run (e.g. 'res://tests/smoke_runner.tscn')"),
        ...sharedArgs,
    }, async (params) => {
        try {
            const result = await godot.sendCommand("run_headless_scene", params, rpcTimeoutMs(params));
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("run_headless_script", "Run a script with `godot --headless --script` in a separate process and return its stdout/stderr and exit code. Use for `extends SceneTree` probe/tool scripts: they can instantiate scenes, call flow functions and read Control rects without a GPU.", {
        script_path: resPath.describe("Script to run (e.g. 'res://tools/resolution_sweep.gd'). Should extend SceneTree or MainLoop."),
        ...sharedArgs,
    }, async (params) => {
        try {
            const result = await godot.sendCommand("run_headless_script", params, rpcTimeoutMs(params));
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("get_godot_executable", "Get the path of the Godot binary running the editor, plus the absolute project path and platform. Use it to shell out to Godot consistently from bash instead of guessing the install location.", {}, async () => {
        try {
            const result = await godot.sendCommand("get_godot_executable", {});
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
}
//# sourceMappingURL=headless-tools.js.map