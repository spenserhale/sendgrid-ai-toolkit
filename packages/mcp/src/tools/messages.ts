import type { FastMCP } from "fastmcp";
import { z } from "zod";
import {
  AccountManager,
  SendgridError,
  buildActivityQuery,
  DEFAULT_ACTIVITY_DAYS,
} from "@sendgrid-toolkit/sdk";
import { READ_ONLY, accountParam, respond } from "../lib/respond.js";

export function registerMessageTools(server: FastMCP) {
  server.addTool({
    name: "search_messages",
    description:
      "Search SendGrid Email Activity across every configured account. Pass `email` for the " +
      'common recipient lookup, or `query` for raw SendGrid syntax (e.g. subject="Welcome" AND ' +
      'status="not_delivered"). Requires the Email Activity History add-on on each account; ' +
      "accounts without it return a per-account error rather than failing the whole call. `email` lookups " +
      "are windowed to `days`; `query` is sent verbatim, so include a last_event_time bound.",
    annotations: { title: "Search email activity", ...READ_ONLY },
    parameters: z.object({
      email: z.string().email().optional().describe("Recipient address to look up"),
      query: z.string().optional().describe("Raw SendGrid Email Activity query"),
      limit: z.number().int().positive().max(1000).default(20).describe("Max messages per account"),
      days: z
        .number()
        .int()
        .nonnegative()
        .default(DEFAULT_ACTIVITY_DAYS)
        .describe(
          "Look-back window in days for `email` lookups (0 = unbounded, likely to time out). Ignored when `query` is set.",
        ),
      account: accountParam,
    }),
    execute: async (args) => {
      if (args.email && args.query) {
        throw new SendgridError({
          code: "E_VALIDATION",
          message: "Provide either email or query, not both",
        });
      }
      const query = args.query ?? buildActivityQuery({ toEmail: args.email, days: args.days });
      const manager = new AccountManager();
      const results = await manager.runAcrossAccounts(
        (client) => client.getMessages(query, args.limit),
        args.account,
      );
      return respond(results);
    },
  });
}
