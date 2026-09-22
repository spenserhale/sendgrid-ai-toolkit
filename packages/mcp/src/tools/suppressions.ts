import type { FastMCP } from "fastmcp";
import { z } from "zod";
import {
  AccountManager,
  type SendgridClient,
  type SuppressionListParams,
} from "@sendgrid-toolkit/sdk";
import {
  READ_ONLY,
  DESTRUCTIVE,
  accountParam,
  respond,
  runDelete,
  runMutation,
  scopeParams,
} from "../lib/respond.js";

const listParams = {
  email: z.string().email().optional().describe("Filter to one email address"),
  startTime: z.number().int().optional().describe("Start of window (unix seconds)"),
  endTime: z.number().int().optional().describe("End of window (unix seconds)"),
  limit: z.number().int().positive().max(500).optional().describe("Max results per account"),
  offset: z.number().int().nonnegative().optional().describe("Pagination offset"),
  account: accountParam,
};

interface ListSpec {
  getName: string;
  deleteName: string;
  noun: string;
  plural: string;
  list: (client: SendgridClient, params: SuppressionListParams) => Promise<unknown[]>;
  remove: (client: SendgridClient, email: string) => Promise<void>;
}

const LISTS: ListSpec[] = [
  {
    getName: "get_blocks",
    deleteName: "delete_block",
    noun: "block",
    plural: "blocked email addresses (receiving server rejected the message)",
    list: (c, p) => c.getBlocks(p),
    remove: (c, e) => c.deleteBlock(e),
  },
  {
    getName: "get_bounces",
    deleteName: "delete_bounce",
    noun: "bounce",
    plural: "bounced email addresses (hard bounces; SendGrid drops future sends)",
    list: (c, p) => c.getBounces(p),
    remove: (c, e) => c.deleteBounce(e),
  },
  {
    getName: "get_spam_reports",
    deleteName: "delete_spam_report",
    noun: "spam report",
    plural: "spam reports (recipient marked a message as spam)",
    list: (c, p) => c.getSpamReports(p),
    remove: (c, e) => c.deleteSpamReport(e),
  },
  {
    getName: "get_invalid_emails",
    deleteName: "delete_invalid_email",
    noun: "invalid email",
    plural: "invalid email addresses (malformed or non-existent mailbox)",
    list: (c, p) => c.getInvalidEmails(p),
    remove: (c, e) => c.deleteInvalidEmail(e),
  },
];

export function registerSuppressionTools(server: FastMCP) {
  for (const spec of LISTS) {
    server.addTool({
      name: spec.getName,
      description: `List ${spec.plural} across every configured SendGrid account, or one with \`account\`.`,
      annotations: { title: `List ${spec.noun}s`, ...READ_ONLY },
      parameters: z.object(listParams),
      execute: async (args) => {
        const { account, ...params } = args;
        const manager = new AccountManager();
        const results = await manager.runAcrossAccounts(
          (client) => spec.list(client, params),
          account,
        );
        return respond(results);
      },
    });

    server.addTool({
      name: spec.deleteName,
      description:
        `Remove one email address from the ${spec.noun} list so SendGrid will deliver to it again. ` +
        "Destructive. You must pass `account` or `allAccounts: true`; there is no default target. " +
        "Prefer `dryRun: true` first, or use `clear_suppressions` to handle every list at once.",
      annotations: { title: `Delete ${spec.noun}`, ...DESTRUCTIVE },
      parameters: z.object({
        email: z.string().email().describe(`Email address to remove from the ${spec.noun} list`),
        ...scopeParams,
      }),
      execute: async (args) =>
        runDelete(args, args.email, spec.noun, (client) => spec.remove(client, args.email)),
    });
  }

  // ---- Global unsubscribe list ----

  server.addTool({
    name: "check_global_suppression",
    description:
      "Check whether an email address is on the global unsubscribe list of each configured " +
      "SendGrid account. Returns per-account `suppressed: true|false`, or an error for that account.",
    annotations: { title: "Check global unsubscribe", ...READ_ONLY },
    parameters: z.object({
      email: z.string().email().describe("Email address to check"),
      account: accountParam,
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const results = await manager.runAcrossAccounts(
        (client) => client.checkGlobalSuppression(args.email),
        args.account,
      );
      return respond(
        results.map((r) => ({
          account: r.account,
          suppressed: r.error ? null : r.data !== null,
          ...(r.error ? { error: r.error } : {}),
        })),
      );
    },
  });

  server.addTool({
    name: "delete_global_suppression",
    description:
      "Remove an email address from the global unsubscribe list (re-enables all mail to them). " +
      "Destructive. You must pass `account` or `allAccounts: true`. Prefer `dryRun: true` first.",
    annotations: { title: "Delete global unsubscribe", ...DESTRUCTIVE },
    parameters: z.object({
      email: z.string().email().describe("Email address to remove"),
      ...scopeParams,
    }),
    execute: async (args) =>
      runDelete(args, args.email, "global unsubscribe", (client) =>
        client.deleteGlobalSuppression(args.email),
      ),
  });

  server.addTool({
    name: "add_global_suppression",
    description:
      "Add an email address to the global unsubscribe list so the targeted account(s) send it " +
      "nothing further. Use when a recipient asks to stop all mail. Write operation: you must pass " +
      "`account` or `allAccounts: true`; supports `dryRun: true`.",
    annotations: {
      title: "Add global unsubscribe",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    parameters: z.object({
      email: z.string().email().describe("Email address to unsubscribe from everything"),
      ...scopeParams,
    }),
    execute: async (args) =>
      runMutation(args, "add", args.email, "global unsubscribe", (client) =>
        client.addGlobalSuppressions([args.email]),
      ),
  });

  // ---- Unsubscribe (ASM) groups ----

  server.addTool({
    name: "get_unsubscribe_groups",
    description:
      "List unsubscribe (ASM) groups per configured SendGrid account. Group ids are account-specific.",
    annotations: { title: "List unsubscribe groups", ...READ_ONLY },
    parameters: z.object({ account: accountParam }),
    execute: async (args) => {
      const manager = new AccountManager();
      const results = await manager.runAcrossAccounts(
        (client) => client.getUnsubscribeGroups(),
        args.account,
      );
      return respond(results);
    },
  });

  server.addTool({
    name: "check_unsubscribe_groups",
    description:
      "List the unsubscribe groups an email address has opted out of, per configured account. " +
      "Empty array means the address is not unsubscribed from any group in that account.",
    annotations: { title: "Check group unsubscribes", ...READ_ONLY },
    parameters: z.object({
      email: z.string().email().describe("Email address to check"),
      account: accountParam,
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const results = await manager.runAcrossAccounts(
        (client) => client.getUnsubscribedGroups(args.email),
        args.account,
      );
      return respond(results);
    },
  });

  server.addTool({
    name: "delete_unsubscribe_group_suppression",
    description:
      "Remove an email address from one unsubscribe group. Group ids differ per account, so pass " +
      "`account` (not allAccounts) in almost every case. Destructive; prefer `dryRun: true` first, " +
      "or use `clear_suppressions` which resolves group ids per account automatically.",
    annotations: { title: "Delete group unsubscribe", ...DESTRUCTIVE },
    parameters: z.object({
      email: z.string().email().describe("Email address to remove"),
      groupId: z
        .number()
        .int()
        .positive()
        .describe("Unsubscribe group id (see get_unsubscribe_groups)"),
      ...scopeParams,
    }),
    execute: async (args) =>
      runDelete(args, args.email, `unsubscribe group ${args.groupId}`, (client) =>
        client.deleteUnsubscribeGroupSuppression(args.groupId, args.email),
      ),
  });
}
