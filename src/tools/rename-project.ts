import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StorageBackend } from "../types.js";

export const renameProjectSchema = {
  old_name: z
    .string()
    .min(1)
    .describe("The current name of the project to rename"),
  new_name: z
    .string()
    .min(1)
    .describe("The new name for the project"),
};

export function registerRenameProjectTool(
  server: McpServer,
  backend: StorageBackend
): void {
  server.registerTool(
    "rename_project",
    {
      description:
        "Rename a project scope. All memories belonging to the project are moved to the new name. " +
        "Returns an error if the project does not exist or if the new name is already in use.",
      inputSchema: renameProjectSchema,
    },
    async ({ old_name, new_name }) => {
      try {
        const renamed = await backend.renameProject(old_name, new_name);

        if (!renamed) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Project "${old_name}" not found.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Project "${old_name}" successfully renamed to "${new_name}".`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to rename project: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );
}
