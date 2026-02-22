#!/usr/bin/env node

// Must be set BEFORE importing @huggingface/transformers to prevent
// onnxruntime-node from writing verbose logs to stdout, which would
// corrupt the stdio JSON-RPC stream.
process.env["ORT_LOG_LEVEL"] = "error";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, ensureStorageDirs } from "./config.js";
import { createBackend } from "./storage/index.js";
import { EmbeddingService } from "./embedding.js";
import { registerStoreTool } from "./tools/store.js";
import { registerRetrieveTool } from "./tools/retrieve.js";
import { registerListTool } from "./tools/list.js";
import { registerDeleteTool } from "./tools/delete.js";
import { registerRenameProjectTool } from "./tools/rename-project.js";
import { join } from "node:path";

async function main(): Promise<void> {
  // ── Load config & setup storage ──────────────────────────────────────────
  const config = loadConfig();
  ensureStorageDirs(config);

  // ── Create embedding service ──────────────────────────────────────────────
  const modelCacheDir = join(config.storageDir, "models");
  const embeddingService = new EmbeddingService(modelCacheDir);

  const backend = createBackend(config, embeddingService);
  await backend.init();

  console.error(
    `[agent-memcp] Starting — storageDir: ${config.storageDir}`
  );

  // ── Create MCP server ─────────────────────────────────────────────────────
  const server = new McpServer({
    name: "agent-memcp",
    version: "0.1.0",
    description:
      "An agent context memory tool for searching, retrieving and storing bits of information " +
      "that an agent deems useful to remember. Uses semantic (vector) search powered by " +
      "all-MiniLM-L6-v2. This is a standalone server compatible with any MCP client.",
  });

  // ── Register tools ────────────────────────────────────────────────────────
  registerStoreTool(server, backend);
  registerRetrieveTool(server, backend);
  registerListTool(server, backend);
  registerDeleteTool(server, backend);
  registerRenameProjectTool(server, backend);

  // ── Connect via stdio ─────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[agent-memcp] Server running on stdio — ready for connections");

  // ── Warm up the embedding model in the background ─────────────────────────
  // This starts loading the model after the MCP handshake is ready so the
  // first store_memory / retrieve_memories call doesn't cold-start from zero.
  embeddingService.warmUp();
}

main().catch((err) => {
  console.error("[agent-memcp] Fatal error:", err);
  process.exit(1);
});
