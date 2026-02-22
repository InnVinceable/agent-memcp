import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryEntry, StorageBackend } from "../types.js";

const CONTENT_SNIPPET_LENGTH = 200;

function formatEntry(entry: MemoryEntry, includeFullContent = false): string {
  const lines: string[] = [];
  lines.push(`ID: ${entry.id}`);
  if (entry.key) lines.push(`Key: ${entry.key}`);
  if (entry.tags.length > 0) lines.push(`Tags: ${entry.tags.join(", ")}`);

  const content = includeFullContent
    ? entry.content
    : entry.content.length > CONTENT_SNIPPET_LENGTH
    ? entry.content.slice(0, CONTENT_SNIPPET_LENGTH) + "…"
    : entry.content;

  lines.push(`Content: ${content}`);
  lines.push(`Updated: ${entry.updatedAt}`);
  return lines.join("\n");
}

export function registerRetrieveTool(
  server: McpServer,
  backend: StorageBackend
): void {
  server.registerTool(
    "retrieve_memories",
    {
      description:
        "Search for memories using semantic (vector) similarity. " +
        "The query is embedded and compared against stored memory vectors — " +
        "results are returned by semantic relevance, not exact keyword match. " +
        "Use project='*' to search across all scopes (global + all projects). " +
        "Results are sorted by descending similarity score.",
      inputSchema: {
        query: z.string().min(1).describe("Natural-language phrase to search for semantically"),
        project: z
          .string()
          .optional()
          .describe(
            "Scope to search within. Omit for global scope only. Use '*' to search all scopes."
          ),
        tags: z
          .array(z.string())
          .optional()
          .default([])
          .describe(
            "Filter results to only memories that have ALL of these tags"
          ),
        limit: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .default(20)
          .describe("Maximum number of results to return (default 20, max 100)"),
      },
    },
    async ({ query, project, tags = [], limit = 20 }) => {
      try {
        const results = await backend.retrieve({
          scope: project ?? null,
          query,
          tags,
          limit,
        });

        if (results.length === 0) {
          const scope = project === "*" ? "all scopes" : project ? `project "${project}"` : "global scope";
          return {
            content: [
              {
                type: "text" as const,
                text: `No memories found matching "${query}" in ${scope}.`,
              },
            ],
          };
        }

        const scope = project === "*" ? "all scopes" : project ? `project "${project}"` : "global scope";
        const header = `Found ${results.length} memor${results.length === 1 ? "y" : "ies"} matching "${query}" in ${scope}:\n`;
        const body = results
          .map((e, i) => `--- [${i + 1}] ---\n${formatEntry(e, true)}`)
          .join("\n\n");

        return {
          content: [{ type: "text" as const, text: header + body }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to retrieve memories: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );
}
