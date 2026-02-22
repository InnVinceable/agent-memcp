import { z } from "zod";
import { nanoid } from "nanoid";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StorageBackend } from "../types.js";

export const storeSchema = {
  content: z.string().min(1).describe("The text content of the memory to store"),
  key: z
    .string()
    .optional()
    .describe(
      "Optional short name for the memory. If a memory with this key already exists in the same scope it will be updated (upsert)."
    ),
  tags: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Optional list of tags to categorise the memory"),
  project: z
    .string()
    .optional()
    .describe(
      "Project name to scope this memory to. Omit to store in the global scope."
    ),
};

export function registerStoreTool(
  server: McpServer,
  backend: StorageBackend
): void {
  server.registerTool(
    "store_memory",
    {
      description:
        "Store a piece of information as a memory. " +
        "Memories can be project-specific or global. " +
        "If you provide a 'key' and a memory with that key already exists in the same scope, it will be updated instead of creating a duplicate.",
      inputSchema: storeSchema,
    },
    async ({ content, key, tags = [], project }) => {
      try {
        const entry = await backend.store(project ?? null, {
          id: nanoid(),
          content,
          key,
          tags,
        });

        const scope = project ? `project "${project}"` : "global";
        const keyInfo = entry.key ? ` (key: "${entry.key}")` : "";

        return {
          content: [
            {
              type: "text" as const,
              text: `Memory stored successfully in ${scope} scope.\nID: ${entry.id}${keyInfo}\nTags: ${entry.tags.length > 0 ? entry.tags.join(", ") : "none"}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to store memory: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );
}
