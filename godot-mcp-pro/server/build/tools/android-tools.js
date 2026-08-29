import { z } from "zod";
import { formatErrorForMcp } from "../utils/errors.js";
export function registerAndroidTools(server, godot) {
    server.tool("list_android_devices", "List Android devices visible to adb (parses 'adb devices -l'). Uses the path configured in Editor Settings > Export > Android > Adb, falls back to 'adb' on PATH.", {}, async () => {
        try {
            const result = await godot.sendCommand("list_android_devices");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("get_android_preset_info", "Read metadata (package name, export path, runnable flag) from an Android export preset in export_presets.cfg. If no preset is specified, returns the first Android preset.", {
        preset_name: z.string().optional().describe("Preset name as shown in Project > Export"),
        preset_index: z.number().optional().describe("Preset index (alternative to name)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("get_android_preset_info", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
    server.tool("deploy_to_android", "Export APK via Godot CLI, install it on a connected Android device via adb, and optionally launch the main activity. Equivalent to Godot's Remote Deploy button. Requires a configured Android export preset and adb on PATH (or set in Editor Settings). This call is synchronous and may take tens of seconds to complete.", {
        preset_name: z.string().optional().describe("Android export preset name (defaults to first Android preset)"),
        preset_index: z.number().optional().describe("Preset index (alternative to name)"),
        device_serial: z.string().optional().describe("adb device serial (omit to use default device)"),
        debug: z.boolean().optional().describe("Debug export (default: true)"),
        launch: z.boolean().optional().describe("Launch the app after install (default: true)"),
        skip_export: z.boolean().optional().describe("Skip the export step and install the existing APK at the preset's export_path (default: false)"),
    }, async (params) => {
        try {
            const result = await godot.sendCommand("deploy_to_android", params);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: formatErrorForMcp(e) }], isError: true };
        }
    });
}
//# sourceMappingURL=android-tools.js.map