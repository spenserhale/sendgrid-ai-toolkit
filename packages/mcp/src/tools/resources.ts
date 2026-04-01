import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { SendgridClient, resolveConfig } from "@sendgrid-toolkit/sdk";

function getClient(): SendgridClient {
  const config = resolveConfig();
  return new SendgridClient(config);
}

export function registerResourceTools(server: FastMCP) {
  server.addTool({
    name: "list_resources",
    description: "List Sendgrid resources with pagination",
    parameters: z.object({
      page: z.number().int().positive().default(1).describe("Page number"),
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .default(20)
        .describe("Items per page"),
    }),
    execute: async (args) => {
      const client = getClient();
      const result = await client.listResources({
        page: args.page,
        limit: args.limit,
      });

      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: "get_resource",
    description: "Get a Sendgrid resource by its ID",
    parameters: z.object({
      id: z.string().describe("The resource ID"),
    }),
    execute: async (args) => {
      const client = getClient();
      const resource = await client.getResource(args.id);
      return JSON.stringify(resource, null, 2);
    },
  });

  server.addTool({
    name: "create_resource",
    description: "Create a new Sendgrid resource",
    parameters: z.object({
      name: z.string().min(1).describe("Name for the new resource"),
    }),
    execute: async (args) => {
      const client = getClient();
      const resource = await client.createResource({ name: args.name });
      return JSON.stringify(resource, null, 2);
    },
  });

  server.addTool({
    name: "delete_resource",
    description: "Delete a Sendgrid resource by its ID",
    parameters: z.object({
      id: z.string().describe("The resource ID to delete"),
    }),
    execute: async (args) => {
      const client = getClient();
      await client.deleteResource(args.id);
      return `Successfully deleted resource ${args.id}`;
    },
  });
}
