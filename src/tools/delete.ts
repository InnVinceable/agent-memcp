import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StorageBackend } from "../types.js";

export function registerDeleteTool(
  server: McpServer,
  backend: StorageBackend
): void {
  server.registerTool(
    "delete_memory",
    {
      description:
        "Delete a specific memory by its ID. " +
        "The project scope must match the scope the memory was stored in. " +
        "Omit 'project' to delete from the global scope.",
      inputSchema: {
        id: z
          .string()
          .min(1)
          .describe("The ID of the memory to delete (returned by store_memory or list_memories)"),
        project: z
          .string()
          .optional()
          .describe(
            "Project scope the memory belongs to. Omit for global scope."
          ),
      },
    },
    async ({ id, project }) => {
      try {
        const deleted = await backend.delete(project ?? null, id);

        if (!deleted) {
          const scope = project ? `project "${project}"` : "global scope";
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Memory with ID "${id}" not found in ${scope}.`,
              },
            ],
          };
        }

        const scope = project ? `project "${project}"` : "global scope";
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory "${id}" successfully deleted from ${scope}.`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to delete memory: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );
}
