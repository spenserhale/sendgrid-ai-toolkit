import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { AccountManager } from "@sendgrid-toolkit/sdk";

export function registerSuppressionTools(server: FastMCP) {
  // ---- Blocks ----

  server.addTool({
    name: "get_blocks",
    description: "Get blocked email addresses across all SendGrid accounts.",
    parameters: z.object({
      email: z.string().email().optional().describe("Filter by email address"),
      startTime: z.number().int().optional().describe("Start time (unix)"),
      endTime: z.number().int().optional().describe("End time (unix)"),
      limit: z.number().int().positive().max(500).optional().describe("Max results per account"),
      offset: z.number().int().nonnegative().optional().describe("Pagination offset"),
      account: z.string().optional().describe("Target a specific account (default: all)"),
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const { account, ...params } = args;
      const results = await manager.runAcrossAccounts(
        (client) => client.getBlocks(params),
        account,
      );
      return JSON.stringify(results, null, 2);
    },
  });

  server.addTool({
    name: "delete_block",
    description: "Delete a blocked email address from a SendGrid account.",
    parameters: z.object({
      email: z.string().email().describe("Email address to unblock"),
      account: z.string().optional().describe("Target a specific account (default: all)"),
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const results = await manager.runAcrossAccounts(
        (client) => client.deleteBlock(args.email),
        args.account,
      );
      return JSON.stringify(
        results.map((r) => ({
          account: r.account,
          success: !r.error,
          error: r.error,
        })),
        null,
        2,
      );
    },
  });

  // ---- Bounces ----

  server.addTool({
    name: "get_bounces",
    description: "Get bounced email addresses across all SendGrid accounts.",
    parameters: z.object({
      email: z.string().email().optional().describe("Filter by email address"),
      startTime: z.number().int().optional().describe("Start time (unix)"),
      endTime: z.number().int().optional().describe("End time (unix)"),
      limit: z.number().int().positive().max(500).optional().describe("Max results per account"),
      offset: z.number().int().nonnegative().optional().describe("Pagination offset"),
      account: z.string().optional().describe("Target a specific account (default: all)"),
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const { account, ...params } = args;
      const results = await manager.runAcrossAccounts(
        (client) => client.getBounces(params),
        account,
      );
      return JSON.stringify(results, null, 2);
    },
  });

  server.addTool({
    name: "delete_bounce",
    description: "Delete a bounced email address from a SendGrid account.",
    parameters: z.object({
      email: z.string().email().describe("Email address to remove from bounce list"),
      account: z.string().optional().describe("Target a specific account (default: all)"),
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const results = await manager.runAcrossAccounts(
        (client) => client.deleteBounce(args.email),
        args.account,
      );
      return JSON.stringify(
        results.map((r) => ({
          account: r.account,
          success: !r.error,
          error: r.error,
        })),
        null,
        2,
      );
    },
  });

  // ---- Spam Reports ----

  server.addTool({
    name: "get_spam_reports",
    description: "Get spam reports across all SendGrid accounts.",
    parameters: z.object({
      email: z.string().email().optional().describe("Filter by email address"),
      startTime: z.number().int().optional().describe("Start time (unix)"),
      endTime: z.number().int().optional().describe("End time (unix)"),
      limit: z.number().int().positive().max(500).optional().describe("Max results per account"),
      offset: z.number().int().nonnegative().optional().describe("Pagination offset"),
      account: z.string().optional().describe("Target a specific account (default: all)"),
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const { account, ...params } = args;
      const results = await manager.runAcrossAccounts(
        (client) => client.getSpamReports(params),
        account,
      );
      return JSON.stringify(results, null, 2);
    },
  });

  // ---- Invalid Emails ----

  server.addTool({
    name: "get_invalid_emails",
    description: "Get invalid email addresses across all SendGrid accounts.",
    parameters: z.object({
      email: z.string().email().optional().describe("Filter by email address"),
      startTime: z.number().int().optional().describe("Start time (unix)"),
      endTime: z.number().int().optional().describe("End time (unix)"),
      limit: z.number().int().positive().max(500).optional().describe("Max results per account"),
      offset: z.number().int().nonnegative().optional().describe("Pagination offset"),
      account: z.string().optional().describe("Target a specific account (default: all)"),
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const { account, ...params } = args;
      const results = await manager.runAcrossAccounts(
        (client) => client.getInvalidEmails(params),
        account,
      );
      return JSON.stringify(results, null, 2);
    },
  });

  // ---- Global Suppressions ----

  server.addTool({
    name: "check_global_suppression",
    description:
      "Check if an email address is globally suppressed (unsubscribed) across all SendGrid accounts.",
    parameters: z.object({
      email: z.string().email().describe("Email address to check"),
      account: z.string().optional().describe("Target a specific account (default: all)"),
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const results = await manager.runAcrossAccounts(
        (client) => client.checkGlobalSuppression(args.email),
        args.account,
      );
      return JSON.stringify(results, null, 2);
    },
  });
}
