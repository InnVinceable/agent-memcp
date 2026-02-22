# agent-memcp

An MCP (Model Context Protocol) server that gives AI coding agents persistent memory across sessions. Agents can remember project conventions, decisions, gotchas, and any other context that would otherwise be lost when a session ends.

Runs as a **stdio MCP server** — your MCP client starts it as a child process automatically, no separate server process to manage.

---

## Connecting to Your Agent

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "agent-memcp": {
      "command": "node",
      "args": ["/absolute/path/to/agent-memcp/build/index.js"]
    }
  }
}
```

Restart Claude Desktop. The four memory tools will appear automatically.

### OpenCode

Add to your project's `.opencode/config.json` or global OpenCode config:

```json
{
  "mcp": {
    "agent-memcp": {
      "type": "local",
      "command": "node",
      "args": ["/absolute/path/to/agent-memcp/build/index.js"]
    }
  }
}
```

### Other MCP Clients

Any client that supports the MCP stdio transport can connect. The command is:

```
node /absolute/path/to/agent-memcp/build/index.js
```

To pass environment variables (e.g. to switch backend):

```json
{
  "command": "node",
  "args": ["/path/to/agent-memcp/build/index.js"],
  "env": {
    "MEMCP_BACKEND": "sqlite"
  }
}
```