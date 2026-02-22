# agent-memcp

An MCP (Model Context Protocol) server that gives AI coding agents persistent memory across sessions. Agents can remember project conventions, decisions, gotchas, and any other context that would otherwise be lost when a session ends.

Runs as a **stdio MCP server** — your MCP client starts it as a child process automatically, no separate server process to manage.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Installation](#installation)
- [Connecting to Your Agent](#connecting-to-your-agent)
  - [Claude Desktop](#claude-desktop)
  - [OpenCode](#opencode)
  - [Other MCP Clients](#other-mcp-clients)
- [Tools Reference](#tools-reference)
  - [store\_memory](#store_memory)
  - [retrieve\_memories](#retrieve_memories)
  - [list\_memories](#list_memories)
  - [delete\_memory](#delete_memory)
- [Scoping: Global vs Project](#scoping-global-vs-project)
- [Practical Usage Examples](#practical-usage-examples)
- [Storage Layout](#storage-layout)
- [Configuration](#configuration)
- [Switching to SQLite](#switching-to-sqlite)
- [Development](#development)
- [Roadmap](#roadmap)

---

## How It Works

`agent-memcp` speaks the MCP stdio transport. Your MCP client (Claude Desktop, OpenCode, etc.) spawns it as a child process and communicates over stdin/stdout. It exposes four tools: `store_memory`, `retrieve_memories`, `list_memories`, and `delete_memory`.

Memories are text entries with optional metadata (a short key name and tags). They are scoped either to a **specific project** or kept **global** (shared across all projects). Data is stored in plain JSON files under `~/.agent-memcp/` by default — human-readable and easy to inspect.

```
Agent session starts (client spawns agent-memcp process)
  └─> Agent calls list_memories(project: "my-app")       → loads stored context
  └─> Agent works... learns something important
  └─> Agent calls store_memory(content: "...", project: "my-app")  → persisted to disk
Agent session ends (process exits)

Next session (new process, same data on disk)
  └─> Agent calls retrieve_memories("architecture", project: "my-app")
        └─> returns what the previous session stored
```

---

## Installation

**Requirements:** Node.js 18 or later.

```bash
git clone <repo-url>
cd agent-memcp
npm install
npm run build
```

The compiled server is at `build/index.js`. You can verify it works:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node build/index.js
```

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

---

## Tools Reference

### `store_memory`

Stores a piece of text as a memory. Returns the memory's `id` which can be used to delete it later.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `content` | string | **yes** | The text content to remember |
| `key` | string | no | A short unique name. If a memory with this key already exists in the same scope, it is **updated** (upsert) rather than duplicated. |
| `tags` | string[] | no | Tags for categorising and filtering. Any number of tags per memory. |
| `project` | string | no | Project name to scope this memory to. **Omit for global scope.** |

**Returns:** Confirmation with the memory `id`, key, and tags.

**Example calls:**

```
// Store a global memory (no project)
store_memory(
  content: "Always check the GitHub issue tracker before starting new work",
  key: "workflow-reminder",
  tags: ["workflow", "process"]
)

// Store a project-specific memory
store_memory(
  content: "This project uses Zod for all runtime validation. Never use joi or yup.",
  key: "validation-library",
  tags: ["conventions", "dependencies"],
  project: "agent-memcp"
)

// Update an existing memory (same key, same project = upsert)
store_memory(
  content: "This project uses Zod v3 for validation. Upgrade to v4 is planned for Q3.",
  key: "validation-library",
  project: "agent-memcp"
)
```

---

### `retrieve_memories`

Searches memories by keyword. Matches are case-insensitive substrings checked against both the `key` and `content` fields. Results are sorted by most recently updated first.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | **yes** | Keyword or phrase to search for |
| `project` | string | no | Scope to search. Omit for global only. Use `"*"` to search **all scopes** (global + all projects). |
| `tags` | string[] | no | Restrict results to memories that have **all** of these tags |
| `limit` | number | no | Max results to return. Default `20`, max `100`. |

**Returns:** Matching memories with full content, or a "no results" message.

**Example calls:**

```
// Search global memories
retrieve_memories(query: "code review")

// Search within a project
retrieve_memories(query: "database", project: "my-app")

// Search everywhere
retrieve_memories(query: "authentication", project: "*")

// Search with tag filter
retrieve_memories(query: "error", project: "my-app", tags: ["conventions"])

// Limit results
retrieve_memories(query: "setup", project: "*", limit: 5)
```

---

### `list_memories`

Lists all memories in a scope without a text query. Useful for reviewing everything stored, or for loading context at the start of a session.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string | no | Scope to list. Omit for global only. Use `"*"` to list **all scopes**. |
| `tags` | string[] | no | Only return memories that have **all** of these tags |

**Returns:** A summary list of each memory (id, key, tags, content snippet, last updated).

**Example calls:**

```
// List all global memories
list_memories()

// List all memories for a project
list_memories(project: "my-app")

// List everything stored
list_memories(project: "*")

// List only memories tagged "conventions" in a project
list_memories(project: "my-app", tags: ["conventions"])
```

---

### `delete_memory`

Deletes a specific memory by its ID. The `project` argument must match the scope the memory was stored in.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | **yes** | The memory ID (from `store_memory` or `list_memories`) |
| `project` | string | no | The scope the memory belongs to. Omit for global. |

**Returns:** Confirmation of deletion, or an error if the ID was not found in that scope.

**Example calls:**

```
// Delete a global memory
delete_memory(id: "V1StGXR8_Z5jdHi6B-myT")

// Delete a project-scoped memory
delete_memory(id: "abc123", project: "my-app")
```

---

## Scoping: Global vs Project

Every memory belongs to exactly one scope: **global** or a **named project**.

| Scope | When to use | How to specify |
|---|---|---|
| Global | Preferences, habits, and knowledge that apply across all work — e.g. "I prefer functional style", "always write tests first" | Omit the `project` parameter |
| Project | Information specific to one codebase — architecture decisions, library choices, known bugs, team conventions | Pass `project: "project-name"` |

The `project` value is just a string — it doesn't need to match a directory name. A good convention is to use the repository name (e.g. `"agent-memcp"`, `"my-saas-app"`).

**Searching across scopes:** Pass `project: "*"` to `retrieve_memories` or `list_memories` to query across global and all project scopes at once.

---

## Practical Usage Examples

### Remembering project conventions

At the start of a new session, ask the agent to load context:

> "Before we start, retrieve any memories you have about this project."

The agent can call:
```
retrieve_memories(query: "conventions", project: "my-app")
retrieve_memories(query: "architecture", project: "my-app")
list_memories(project: "my-app")
```

### Storing a decision mid-session

> "Remember that we decided to use React Query instead of SWR for all data fetching in this project."

The agent stores:
```
store_memory(
  content: "Use React Query (not SWR) for all data fetching. Chosen for its better devtools and cache invalidation API.",
  key: "data-fetching-library",
  tags: ["conventions", "dependencies"],
  project: "my-saas-app"
)
```

In the next session, searching for "data fetching" or "react query" or filtering by the `"dependencies"` tag will surface this.

### Tracking a known bug or quirk

```
store_memory(
  content: "The /api/users endpoint returns 500 on staging when more than 50 results are requested. Known issue, tracked in GH-412.",
  key: "users-endpoint-bug",
  tags: ["bugs", "api", "staging"],
  project: "my-saas-app"
)
```

### Storing personal global preferences

```
store_memory(
  content: "I prefer small, focused commits with conventional commit messages (feat:, fix:, chore:, etc.).",
  key: "commit-style",
  tags: ["git", "workflow"]
)

store_memory(
  content: "Always add JSDoc comments to exported functions. Use TSDoc syntax for TypeScript projects.",
  key: "documentation-style",
  tags: ["documentation", "conventions"]
)
```

### Cleaning up stale memories

```
// Review what's stored
list_memories(project: "old-project")

// Delete entries that are no longer relevant
delete_memory(id: "V1StGXR8_Z5jdHi6B-myT", project: "old-project")
```

### Prompting your agent to use memory proactively

Add this to your agent's system prompt or project rules file:

```
At the start of every session:
1. Call list_memories(project: "<current project>") to load project context.
2. Call list_memories() to load relevant global preferences.

During the session, when you learn something important (a decision, a gotcha, a convention),
call store_memory to persist it for future sessions.

At the end of a session, store any important discoveries or decisions that were made.
```

---

## Storage Layout

Memories are stored under `~/.agent-memcp/` by default:

```
~/.agent-memcp/
├── config.json               # Server configuration
├── global.json               # Global memories
└── projects/
    ├── my-app.json           # Memories for project "my-app"
    ├── agent-memcp.json      # Memories for project "agent-memcp"
    └── ...
```

Each `.json` file is a plain array of memory entries:

```json
[
  {
    "id": "V1StGXR8_Z5jdHi6B-myT",
    "key": "validation-library",
    "content": "This project uses Zod v3 for all runtime validation.",
    "tags": ["conventions", "dependencies"],
    "createdAt": "2025-02-21T10:00:00.000Z",
    "updatedAt": "2025-02-21T10:00:00.000Z"
  }
]
```

These files are human-readable. You can edit, delete, or version-control them directly.

---

## Configuration

Configuration is resolved in priority order (highest first):

1. **Environment variables**
2. **`~/.agent-memcp/config.json`**
3. **Built-in defaults**

| Option | Env var | Config key | Default |
|---|---|---|---|
| Storage backend | `MEMCP_BACKEND` | `backend` | `"json"` |
| Storage directory | `MEMCP_STORAGE_DIR` | `storageDir` | `~/.agent-memcp` |
| SQLite DB path | `MEMCP_SQLITE_PATH` | `sqlitePath` | `~/.agent-memcp/memories.db` |

**Example: custom storage directory via env**

```bash
MEMCP_STORAGE_DIR=/data/memories node build/index.js
```

**Example: `~/.agent-memcp/config.json`**

```json
{
  "backend": "json",
  "storageDir": "/data/memories"
}
```

---

## Switching to SQLite

For large memory stores or better query performance, switch to the SQLite backend.

**Via environment variable:**
```bash
MEMCP_BACKEND=sqlite node build/index.js
```

**Via MCP client config `env`:**
```json
{
  "command": "node",
  "args": ["/path/to/agent-memcp/build/index.js"],
  "env": { "MEMCP_BACKEND": "sqlite" }
}
```

**Via `~/.agent-memcp/config.json`:**
```json
{
  "backend": "sqlite",
  "sqlitePath": "/home/user/.agent-memcp/memories.db"
}
```

The SQLite database is created automatically on first run.

> **Note:** Memories are not automatically migrated between backends when you switch. If you have existing data, stay on one backend or migrate manually.

---

## Development

```bash
# Install dependencies
npm install

# Build once
npm run build

# Watch mode (recompiles on save)
npm run dev

# Launch the MCP Inspector — an interactive GUI for testing tools
npm run inspector
```

The MCP Inspector opens a browser UI where you can call each tool manually and inspect the JSON-RPC traffic. Useful for verifying behaviour without a full agent setup.

### Project structure

```
agent-memcp/
├── src/
│   ├── index.ts                  # Server entry point, stdio transport
│   ├── types.ts                  # MemoryEntry, StorageBackend, Config types
│   ├── config.ts                 # Config loading (env → file → defaults)
│   ├── storage/
│   │   ├── index.ts              # Backend factory
│   │   ├── json-backend.ts       # JSON file storage implementation
│   │   └── sqlite-backend.ts     # SQLite storage implementation
│   └── tools/
│       ├── store.ts              # store_memory tool
│       ├── retrieve.ts           # retrieve_memories tool
│       ├── list.ts               # list_memories tool
│       └── delete.ts             # delete_memory tool
├── build/                        # Compiled JS output (git-ignored)
├── package.json
├── tsconfig.json
└── README.md
```

To add a new storage backend: implement the `StorageBackend` interface in `src/types.ts` and register it in `src/storage/index.ts`.

---

## Roadmap

- Remote sync backends (S3, GitHub Gist, custom HTTP endpoint)
- Semantic / vector search via Ollama (local embeddings)
- `export_memories` and `import_memories` tools (JSON and Markdown)
- `summarize_memories` tool — uses LLM sampling to consolidate related memories
- Per-project config override files (`.agent-memcp.json` in repo root)
- Migration utility for moving data between backends
