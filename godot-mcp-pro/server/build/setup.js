#!/usr/bin/env node
/**
 * godot-mcp-setup — Setup and management CLI for Godot MCP Pro
 *
 * Commands:
 *   install        Install dependencies and build the server
 *   check-update   Check if a newer version is available on GitHub
 *   configure      Auto-detect AI client and generate MCP config
 *   doctor         Diagnose environment (Node.js, npm, build status)
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Server root is one level up from build/
const SERVER_DIR = resolve(__dirname, "..");
const PACKAGE_JSON = join(SERVER_DIR, "package.json");
const BUILD_INDEX = join(SERVER_DIR, "build", "index.js");
const GITHUB_REPO = "youichi-uda/godot-mcp-pro";
// ─── Utilities ────────────────────────────────────────────────
function getVersion() {
    try {
        const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8"));
        return pkg.version || "unknown";
    }
    catch {
        return "unknown";
    }
}
function run(cmd, cwd) {
    try {
        return execSync(cmd, {
            cwd: cwd || SERVER_DIR,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
    }
    catch (err) {
        return err.stderr?.trim() || err.message || "command failed";
    }
}
function check(label, ok, detail) {
    const icon = ok ? "✓" : "✗";
    const line = detail ? `${label}: ${detail}` : label;
    console.log(`  ${icon} ${line}`);
}
/** Compare semver strings. Returns >0 if a > b, <0 if a < b, 0 if equal. */
function compareSemver(a, b) {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0)
            return diff;
    }
    return 0;
}
// ─── Commands ─────────────────────────────────────────────────
async function cmdInstall() {
    console.log("Installing Godot MCP Pro server...\n");
    console.log("[1/2] Installing dependencies...");
    try {
        execSync("npm install", { cwd: SERVER_DIR, stdio: "inherit" });
    }
    catch {
        console.error("\nFailed to install dependencies. Make sure npm is available.");
        process.exit(1);
    }
    console.log("\n[2/2] Building server...");
    try {
        execSync("npm run build", { cwd: SERVER_DIR, stdio: "inherit" });
    }
    catch {
        console.error("\nBuild failed. Check for TypeScript errors above.");
        process.exit(1);
    }
    console.log(`\nDone! Server built at: ${BUILD_INDEX}`);
    console.log(`Version: ${getVersion()}`);
    console.log("\nNext step: Run 'node build/setup.js configure' to set up your AI client.");
}
async function cmdCheckUpdate() {
    const current = getVersion();
    console.log(`Current version: ${current}\n`);
    console.log(`Checking GitHub releases for ${GITHUB_REPO}...`);
    try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { headers: { "User-Agent": "godot-mcp-pro-setup" } });
        if (!res.ok) {
            if (res.status === 404) {
                console.log("No releases found on GitHub.");
                return;
            }
            console.error(`GitHub API error: ${res.status} ${res.statusText}`);
            return;
        }
        const data = (await res.json());
        const latest = data.tag_name.replace(/^v/, "");
        if (compareSemver(latest, current) > 0) {
            console.log(`\nUpdate available: v${latest} (current: v${current})`);
            console.log(`Download: ${data.html_url}`);
            console.log("\nTo update: download the new version, replace server/src/, and run 'node build/setup.js install'");
        }
        else {
            console.log(`\nUp to date! (${current})`);
        }
    }
    catch (err) {
        console.error(`Failed to check for updates: ${err.message}`);
    }
}
async function cmdConfigure() {
    const serverPath = resolve(BUILD_INDEX).replace(/\\/g, "/");
    if (!existsSync(BUILD_INDEX)) {
        console.error("Server not built yet. Run 'node build/setup.js install' first.");
        process.exit(1);
    }
    console.log("Detecting AI clients...\n");
    // Detect available clients by checking config file locations
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const cwd = process.cwd();
    const candidates = [
        {
            name: "Claude Code (project)",
            configPath: join(cwd, ".mcp.json"),
            configKey: "godot-mcp-pro",
        },
        {
            name: "Cursor (project)",
            configPath: join(cwd, ".cursor", "mcp.json"),
            configKey: "godot-mcp-pro",
        },
        {
            name: "Windsurf (project)",
            configPath: join(cwd, ".windsurf", "mcp.json"),
            configKey: "godot-mcp-pro",
        },
        {
            name: "Claude Desktop",
            configPath: join(home, process.platform === "win32"
                ? "AppData/Roaming/Claude/claude_desktop_config.json"
                : process.platform === "darwin"
                    ? "Library/Application Support/Claude/claude_desktop_config.json"
                    : ".config/claude/claude_desktop_config.json"),
            configKey: "godot-mcp-pro",
        },
    ];
    // Find existing configs
    const existing = candidates.filter((c) => existsSync(c.configPath));
    const missing = candidates.filter((c) => !existsSync(c.configPath));
    if (existing.length > 0) {
        console.log("Found existing configs:");
        for (const c of existing) {
            console.log(`  ✓ ${c.name}: ${c.configPath}`);
        }
    }
    // Default: create .mcp.json in cwd (Claude Code)
    const target = candidates[0]; // Claude Code project-level
    // No GODOT_MCP_PORT env: lets the server auto-scan 6505-6509 so multiple
    // Claude Code sessions can each grab a free port. Pinning a single port
    // here would force every session to collide on 6505.
    const entry = {
        command: "node",
        args: [serverPath],
    };
    let config;
    if (existsSync(target.configPath)) {
        try {
            config = JSON.parse(readFileSync(target.configPath, "utf-8"));
            if (!config.mcpServers)
                config.mcpServers = {};
        }
        catch {
            config = { mcpServers: {} };
        }
    }
    else {
        config = { mcpServers: {} };
    }
    if (config.mcpServers[target.configKey]) {
        console.log(`\n${target.name} already configured in ${target.configPath}`);
        console.log("Updating server path...");
    }
    config.mcpServers[target.configKey] = entry;
    const dir = dirname(target.configPath);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    writeFileSync(target.configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`\nWrote config to: ${target.configPath}`);
    console.log(`Server path: ${serverPath}`);
    console.log("\nYou're all set! Start your AI assistant to begin using Godot MCP Pro.");
}
function cmdDoctor() {
    console.log("Godot MCP Pro — Environment Check\n");
    // Node.js
    const nodeVer = run("node --version");
    const nodeOk = nodeVer.startsWith("v") && parseInt(nodeVer.slice(1)) >= 18;
    check("Node.js", nodeOk, nodeVer);
    // npm
    const npmVer = run("npm --version");
    const npmOk = !npmVer.includes("not found") && !npmVer.includes("failed");
    check("npm", npmOk, npmVer);
    // Dependencies installed
    const nodeModules = existsSync(join(SERVER_DIR, "node_modules"));
    check("Dependencies installed", nodeModules);
    // Server built
    const built = existsSync(BUILD_INDEX);
    check("Server built", built, built ? BUILD_INDEX : "run 'node build/setup.js install'");
    // Version
    console.log(`\n  Version: ${getVersion()}`);
    // Overall
    const allOk = nodeOk && npmOk && nodeModules && built;
    console.log(allOk ? "\nAll good!" : "\nSome issues found. Fix them above.");
    if (!allOk)
        process.exit(1);
}
// ─── Main ─────────────────────────────────────────────────────
function showHelp() {
    console.log(`godot-mcp-setup — Setup and management for Godot MCP Pro

Usage: node build/setup.js <command>

Commands:
  install        Install dependencies and build the server
  check-update   Check if a newer version is available on GitHub
  configure      Auto-detect AI client and generate .mcp.json config
  doctor         Check Node.js, npm, and build status

Options:
  --help         Show this help
  --version      Show current version

Examples:
  node build/setup.js install
  node build/setup.js doctor
  node build/setup.js configure
  node build/setup.js check-update`);
}
async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0];
    if (!cmd || cmd === "--help" || cmd === "-h") {
        showHelp();
        process.exit(0);
    }
    if (cmd === "--version" || cmd === "-v") {
        console.log(getVersion());
        process.exit(0);
    }
    switch (cmd) {
        case "install":
            await cmdInstall();
            break;
        case "check-update":
            await cmdCheckUpdate();
            break;
        case "configure":
            await cmdConfigure();
            break;
        case "doctor":
            cmdDoctor();
            break;
        default:
            console.error(`Unknown command: ${cmd}`);
            showHelp();
            process.exit(1);
    }
}
main().catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(1);
});
//# sourceMappingURL=setup.js.map