import { buildCommand } from "@stricli/core";
import { AccountManager, SUPPRESSION_LISTS, type SuppressionList } from "@sendgrid-toolkit/sdk";
import {
  dryRunFlag,
  formatFlags,
  scopeFlags,
  type FormatFlagValues,
  type ScopeFlagValues,
} from "../lib/flags.js";
import { emit } from "../lib/output.js";
import { runCommand, exitIfAllFailed } from "../lib/errors.js";
import { clearText } from "../lib/text.js";

interface ClearFlagValues extends FormatFlagValues, ScopeFlagValues {
  readonly "dry-run": boolean;
  readonly list: readonly SuppressionList[] | undefined;
}

export const clearCommand = buildCommand({
  docs: {
    brief: "Remove an email address from every suppression list it is on",
    fullDescription:
      "Checks each suppression list (blocks, bounces, spam reports, invalid emails, global " +
      "unsubscribe, unsubscribe groups) and deletes the address from the ones it appears on. " +
      "Requires --account <name> or --all-accounts. Always preview with --dry-run first.",
  },
  parameters: {
    flags: {
      ...scopeFlags,
      ...dryRunFlag,
      list: {
        kind: "enum",
        values: SUPPRESSION_LISTS,
        variadic: true,
        optional: true,
        brief: "Restrict to specific lists (repeatable; default: all)",
      },
      ...formatFlags,
    },
    positional: {
      kind: "tuple",
      parameters: [{ brief: "Email address to clear", parse: String, placeholder: "email" }],
    },
  },
  async func(this: void, flags: ClearFlagValues, email: string) {
    await runCommand(async () => {
      const manager = new AccountManager();
      const report = await manager.clearSuppressions(email, {
        account: flags.account,
        allAccounts: flags["all-accounts"],
        dryRun: flags["dry-run"],
        lists: flags.list && flags.list.length > 0 ? flags.list : undefined,
      });
      emit(report, flags, { text: () => clearText(report) });
      exitIfAllFailed(report.accounts);
    });
  },
});
