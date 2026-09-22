import {
  AccountManager,
  type MultiAccountResult,
  type SendgridClient,
} from "@sendgrid-toolkit/sdk";
import type { FormatFlagValues, ScopeFlagValues } from "./flags.js";
import { emit } from "./output.js";
import { accountValue } from "./text.js";
import { exitIfAllFailed } from "./errors.js";

export interface DeleteFlagValues extends FormatFlagValues, ScopeFlagValues {
  readonly "dry-run": boolean;
}

export type MutationAction = "delete" | "add";

export type MutationOutcome = {
  account: string;
  status: "deleted" | "added" | "failed";
  error?: MultiAccountResult<unknown>["error"];
};

/** @deprecated use MutationOutcome */
export type DeleteOutcome = MutationOutcome;

export type DryRunPlan = {
  status: "dry_run";
  action: MutationAction;
  list: string;
  email: string;
  accounts: string[];
};

const DONE_STATUS: Record<MutationAction, "deleted" | "added"> = {
  delete: "deleted",
  add: "added",
};
const VERB: Record<MutationAction, [string, string]> = {
  delete: ["delete", "Deleted"],
  add: ["add", "Added"],
};

/**
 * Shared body for every single-list mutation command: validate scope, honour
 * --dry-run, fan out, print, and exit non-zero when every account failed.
 */
export async function runMutation(
  flags: DeleteFlagValues,
  action: MutationAction,
  email: string,
  list: string,
  operation: (client: SendgridClient) => Promise<unknown>,
): Promise<void> {
  const [verb, past] = VERB[action];
  const manager = new AccountManager();
  const target = manager.resolveScope({
    account: flags.account,
    allAccounts: flags["all-accounts"],
  });
  const accounts = target ? [target] : manager.getAccountNames();

  if (flags["dry-run"]) {
    const plan: DryRunPlan = { status: "dry_run", action, list, email, accounts };
    emit(plan, flags, {
      text: () => `DRY RUN — would ${verb} ${list} entry for ${email} in: ${accounts.join(", ")}`,
    });
    return;
  }

  const results = await manager.runAcrossAccounts(operation, target);
  const outcomes: MutationOutcome[] = results.map((r) => ({
    account: r.account,
    status: r.error ? "failed" : DONE_STATUS[action],
    ...(r.error ? { error: r.error } : {}),
  }));

  emit(outcomes, flags, {
    text: () => accountValue(results, () => `${past} ${list} entry for ${email}`),
  });
  exitIfAllFailed(results);
}

export function runDelete(
  flags: DeleteFlagValues,
  email: string,
  list: string,
  operation: (client: SendgridClient) => Promise<void>,
): Promise<void> {
  return runMutation(flags, "delete", email, list, operation);
}
