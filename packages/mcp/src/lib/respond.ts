import { encode } from "@toon-format/toon";
import { z } from "zod";
import { AccountManager, type AccountScope } from "@sendgrid-toolkit/sdk";

/**
 * MCP tools return structured data as a string. Default is JSON; set
 * SENDGRID_OUTPUT=toon to return TOON (fewer tokens for coding agents).
 * Text is intentionally not offered here: the calling model does the prose.
 */
export function respond(data: unknown): string {
  const format = process.env.SENDGRID_OUTPUT?.toLowerCase();
  return format === "toon" ? encode(data) : JSON.stringify(data, null, 2);
}

export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const accountParam = z
  .string()
  .optional()
  .describe("Restrict to one configured account by name (default: every account)");

/** Shared parameters for destructive tools: explicit scope + dry run. */
export const scopeParams = {
  account: z
    .string()
    .optional()
    .describe("Target one configured account by name. Required unless allAccounts is true."),
  allAccounts: z
    .boolean()
    .optional()
    .describe(
      "Target every configured account. Required unless account is set. Never defaults on.",
    ),
  dryRun: z
    .boolean()
    .optional()
    .describe("When true, report what would be deleted and perform no writes."),
};

export type ScopeArgs = AccountScope & { dryRun?: boolean };

export type MutationAction = "delete" | "add";

export type MutationOutcome = {
  account: string;
  status: "deleted" | "added" | "failed";
  error?: unknown;
};

/**
 * Shared body for single-list mutation tools: validate scope, honour dryRun,
 * fan out, return structured per-account outcomes.
 */
export async function runMutation(
  args: ScopeArgs,
  action: MutationAction,
  email: string,
  list: string,
  operation: Parameters<AccountManager["runAcrossAccounts"]>[0],
): Promise<string> {
  const manager = new AccountManager();
  const target = manager.resolveScope(args);
  const accounts = target ? [target] : manager.getAccountNames();

  if (args.dryRun) {
    return respond({ status: "dry_run", action, list, email, accounts });
  }

  const results = await manager.runAcrossAccounts(operation, target);
  const outcomes: MutationOutcome[] = results.map((r) => ({
    account: r.account,
    status: r.error ? "failed" : action === "delete" ? "deleted" : "added",
    ...(r.error ? { error: r.error } : {}),
  }));
  return respond(outcomes);
}

export function runDelete(
  args: ScopeArgs,
  email: string,
  list: string,
  operation: Parameters<AccountManager["runAcrossAccounts"]>[0],
): Promise<string> {
  return runMutation(args, "delete", email, list, operation);
}
