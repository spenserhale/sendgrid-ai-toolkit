import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { AccountManager } from "@sendgrid-toolkit/sdk";

export function registerMessageTools(server: FastMCP) {
  server.addTool({
    name: "search_messages",
    description:
      'Search SendGrid email activity across all accounts. Use SendGrid query syntax, e.g. to_email="user@example.com" or subject="Welcome".',
    parameters: z.object({
      query: z.string().describe('SendGrid query string, e.g. to_email="user@example.com"'),
      limit: z.number().int().positive().max(1000).default(10).describe("Max messages per account"),
      account: z.string().optional().describe("Target a specific account (default: all)"),
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const results = await manager.runAcrossAccounts(
        (client) => client.getMessages(args.query, args.limit),
        args.account,
      );
      return JSON.stringify(results, null, 2);
    },
  });
}
