import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { AccountManager, SUPPRESSION_LISTS, DEFAULT_ACTIVITY_DAYS } from "@sendgrid-toolkit/sdk";
import { READ_ONLY, DESTRUCTIVE, accountParam, respond, scopeParams } from "../lib/respond.js";

export function registerDiagnoseTools(server: FastMCP) {
  server.addTool({
    name: "diagnose_email",
    description:
      "Investigate why one email address is or is not receiving mail, across every configured " +
      "SendGrid account in a single call. Per account returns: recent messages (with failure " +
      "reasons), blocks, bounces, spam reports, invalid-email entries, global unsubscribe status, " +
      "unsubscribe-group opt-outs, and a `summary` with `suppressed`, `suppressedIn`, and " +
      "`messagesAvailable`. Sources that could not be queried appear in `errors` and must be " +
      "treated as unknown, not clean (e.g. the Email Activity add-on is missing on that account). " +
      "Start here for any deliverability question; follow up with `clear_suppressions` to fix.",
    annotations: { title: "Diagnose email address", ...READ_ONLY },
    parameters: z.object({
      email: z.string().email().describe("The email address to investigate"),
      days: z
        .number()
        .int()
        .nonnegative()
        .default(DEFAULT_ACTIVITY_DAYS)
        .describe("Email Activity look-back window in days (0 = unbounded, likely to time out)"),
      account: accountParam,
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const report = await manager.diagnose(args.email, { account: args.account, days: args.days });
      return respond(report);
    },
  });

  server.addTool({
    name: "clear_suppressions",
    description:
      "Remove an email address from every suppression list it currently appears on (blocks, " +
      "bounces, spam reports, invalid emails, global unsubscribe, unsubscribe groups), per " +
      "account, so SendGrid will deliver to it again. Checks each list first and only deletes " +
      "where present. Destructive: you must pass `account` or `allAccounts: true`. Call with " +
      "`dryRun: true` first and show the user the `would_remove` actions before running for real.",
    annotations: { title: "Clear all suppressions", ...DESTRUCTIVE },
    parameters: z.object({
      email: z.string().email().describe("Email address to clear"),
      lists: z
        .array(z.enum(SUPPRESSION_LISTS))
        .optional()
        .describe("Restrict to specific lists (default: all six)"),
      ...scopeParams,
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const report = await manager.clearSuppressions(args.email, {
        account: args.account,
        allAccounts: args.allAccounts,
        dryRun: args.dryRun,
        lists: args.lists,
      });
      return respond(report);
    },
  });
}
