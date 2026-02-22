# agent-memcp

An MCP (Model Context Protocol) server that gives AI coding agents persistent memory across sessions. Agents can remember project conventions, decisions, gotchas, and any other context that would otherwise be lost when a session ends.

Uses **semantic (vector) search** powered by `all-MiniLM-L6-v2` running locally — no GPU or external API required.

Runs as a **stdio MCP server** — your MCP client starts it as a child process automatically via `npx`, no separate server process to manage.

---

## Installation

No global install required. All MCP clients below use `npx agent-memcp` which downloads and runs the package on demand, caching it locally.

If you prefer a global install:

```sh
npm install -g agent-memcp
```

---

## Connecting to Your Agent

### OpenCode

Add to your OpenCode config (`~/.config/opencode/config.json` or a project-level `.opencode/config.json`):

```json
{
  "mcp": {
    "agent-memcp": {
      "type": "local",
      "command": ["npx", "agent-memcp"],
      "enabled": true
    }
  }
}
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "agent-memcp": {
      "command": "npx",
      "args": ["agent-memcp"]
    }
  }
}
```

Restart Claude Desktop. The memory tools will appear automatically.

### Claude Code

```sh
claude mcp add agent-memcp npx agent-memcp
```

Or add manually to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "agent-memcp": {
      "command": "npx",
      "args": ["agent-memcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root, or `~/.cursor/mcp.json` for global use:

```json
{
  "mcpServers": {
    "agent-memcp": {
      "command": "npx",
      "args": ["agent-memcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "agent-memcp": {
      "command": "npx",
      "args": ["agent-memcp"]
    }
  }
}
```

### Other MCP Clients

Any client that supports the MCP stdio transport can connect. The command is:

```
npx agent-memcp
```

To pass environment variables (e.g. a custom storage path):

```json
{
  "command": "npx",
  "args": ["agent-memcp"],
  "env": {
    "MEMCP_STORAGE_DIR": "/path/to/custom/dir"
  }
}
```
