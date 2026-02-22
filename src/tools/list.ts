import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryEntry, StorageBackend } from "../types.js";

const SNIPPET_LENGTH = 120;

function formatEntryRow(entry: MemoryEntry): string {
  const key = entry.key ? ` [${entry.key}]` : "";
  const tags = entry.tags.length > 0 ? ` (${entry.tags.join(", ")})` : "";
  const snippet =
    entry.content.length > SNIPPET_LENGTH
      ? entry.content.slice(0, SNIPPET_LENGTH) + "…"
      : entry.content;
  return `• ${entry.id}${key}${tags}\n  ${snippet}\n  Updated: ${entry.updatedAt}`;
}

export function registerListTool(
  server: McpServer,
  backend: StorageBackend
): void {
  server.registerTool(
    "list_memories",
    {
      description:
        "List all stored memories, optionally filtered by project scope and/or tags. " +
        "Returns a summary of each memory (id, key, tags, content snippet). " +
        "Use project='*' to list across all scopes.",
      inputSchema: {
        project: z
          .string()
          .optional()
          .describe(
            "Scope to list. Omit for global scope only. Use '*' to list all scopes."
          ),
        tags: z
          .array(z.string())
          .optional()
          .default([])
          .describe(
            "Only return memories that have ALL of these tags. Omit for no tag filtering."
          ),
      },
    },
    async ({ project, tags = [] }) => {
      try {
        const entries = await backend.list({
          scope: project ?? null,
          tags,
        });

        const scope =
          project === "*"
            ? "all scopes"
            : project
            ? `project "${project}"`
            : "global scope";

        if (entries.length === 0) {
          const tagInfo =
            tags.length > 0 ? ` with tags [${tags.join(", ")}]` : "";
          return {
            content: [
              {
                type: "text" as const,
                text: `No memories found in ${scope}${tagInfo}.`,
              },
            ],
          };
        }

        const tagInfo =
          tags.length > 0 ? ` (filtered by tags: ${tags.join(", ")})` : "";
        const header = `${entries.length} memor${entries.length === 1 ? "y" : "ies"} in ${scope}${tagInfo}:\n\n`;
        const body = entries.map(formatEntryRow).join("\n\n");

        return {
          content: [{ type: "text" as const, text: header + body }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to list memories: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );
}
