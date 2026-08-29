# Godot MCP Pro - Installation Guide

## What's in the zip

```
godot-mcp-pro/
├── addons/godot_mcp/   ← Godot plugin (copy into your Godot project)
├── server/             ← MCP server (keep anywhere, runs alongside Godot)
├── instructions/       ← AI client instruction files (optional)
├── INSTALL.md          ← This file
├── README.md
├── CHANGELOG.md
└── ...
```

The **addon** and **server** are two separate pieces:
- **Addon** → goes inside your Godot project
- **Server** → stays wherever you extracted it (does NOT go inside Godot)

## Step 1: Install the Godot Plugin

Copy the `addons/godot_mcp/` folder from the zip into your Godot project's `addons/` directory.

Enable the plugin in Godot:
**Project → Project Settings → Plugins → Godot MCP Pro → Enable**

You should see "MCP Pro" in the bottom panel with a green connection dot.

> **Note**: You do NOT need to download anything from the Godot Asset Library. The paid zip includes everything.

## Step 2: Build the MCP Server

The server requires **Node.js 18+**. Check with `node --version`.

Open a terminal and run from the `server/` directory inside the extracted zip:

```bash
cd /path/to/extracted/server
node build/setup.js install
```

This runs `npm install` (downloads dependencies) and `npm run build` (compiles TypeScript).

You can verify everything is working with:
```bash
node build/setup.js doctor
```

## Step 3: Configure Your AI Client

Run this from your **Godot project** directory (not the server directory):

```bash
cd /path/to/your/godot-project
node /path/to/extracted/server/build/setup.js configure
```

This auto-detects your AI client and creates a `.mcp.json` file in your project.

### Manual Configuration

If you prefer to configure manually, add this to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "godot-mcp-pro": {
      "command": "node",
      "args": ["/path/to/extracted/server/build/index.js"]
    }
  }
}
```

Replace `/path/to/extracted/` with the actual path where you extracted the zip.

### Claude Desktop

For Claude Desktop, add the same config to:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

## Step 4: Use It

1. Open your Godot project with the plugin enabled
2. Start your AI client (Claude Code, Cursor, Cline, etc.) in your project directory
3. Ask the AI to interact with your Godot editor

The MCP Pro bottom panel in Godot shows connection status. A green dot means connected.

## Updating to a New Version

Check for updates:
```bash
node /path/to/server/build/setup.js check-update
```

To update:
1. Close Godot
2. Replace `addons/godot_mcp/` in your Godot project with the new version from the zip
3. Replace the `server/` folder with the new one, then rebuild:
   ```bash
   cd /path/to/new/server
   node build/setup.js install
   ```
4. Reopen Godot

Your `.mcp.json` configuration stays the same — no need to reconfigure.

## Troubleshooting

- **Plugin not connecting**: Make sure the MCP server is running (your AI client starts it automatically via `.mcp.json`)
- **"Godot editor is not connected" error**: This is usually caused by a stale `node.exe` process from a previous session holding the port. Open Task Manager, kill all `node.exe` processes, then restart your AI client.
- **Port conflict / `GODOT_MCP_PORT`**: Avoid setting a fixed `GODOT_MCP_PORT` in your config — the server auto-scans ports 6505–6509 and Godot connects to all of them automatically. A fixed port can cause silent failures if a stale process is already using it.
- **Bottom panel shows "Waiting for connection"**: Start your AI client — it launches the MCP server which connects to Godot
- **Need help?**: Contact abyo.software@gmail.com or join [Discord](https://discord.gg/zJ2u5zNUBZ)

## Documentation

- Landing page & tool reference: https://godot-mcp.abyo.net
- Full tool list: `README.md`
