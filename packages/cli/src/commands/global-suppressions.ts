import { buildCommand, buildRouteMap } from "@stricli/core";
import { AccountManager } from "@sendgrid-toolkit/sdk";
import {
  accountFlag,
  dryRunFlag,
  formatFlags,
  scopeFlags,
  type FormatFlagValues,
} from "../lib/flags.js";
import { emit } from "../lib/output.js";
import { runCommand, exitIfAllFailed } from "../lib/errors.js";
import { accountValue } from "../lib/text.js";
import { runDelete, runMutation, type DeleteFlagValues } from "../lib/mutations.js";

interface CheckFlagValues extends FormatFlagValues {
  readonly account: string | undefined;
}

const checkCommand = buildCommand({
  docs: { brief: "Check whether an email address is on the global unsubscribe list" },
  parameters: {
    flags: { ...accountFlag, ...formatFlags },
    positional: {
      kind: "tuple",
      parameters: [{ brief: "Email address to check", parse: String, placeholder: "email" }],
    },
  },
  async func(this: void, flags: CheckFlagValues, email: string) {
    await runCommand(async () => {
      const manager = new AccountManager();
      const results = await manager.runAcrossAccounts(
        (client) => client.checkGlobalSuppression(email),
        flags.account,
      );
      const data = results.map((r) => ({
        account: r.account,
        suppressed: r.error ? null : r.data !== null,
        ...(r.error ? { error: r.error } : {}),
      }));
      emit(data, flags, {
        text: () => accountValue(results, (v) => `Globally unsubscribed: ${v ? "YES" : "no"}`),
      });
      exitIfAllFailed(results);
    });
  },
});

const deleteCommand = buildCommand({
  docs: {
    brief: "Remove an email address from the global unsubscribe list",
    fullDescription:
      "Requires --account <name> or --all-accounts. Use --dry-run to preview the target accounts.",
  },
  parameters: {
    flags: { ...scopeFlags, ...dryRunFlag, ...formatFlags },
    positional: {
      kind: "tuple",
      parameters: [{ brief: "Email address to remove", parse: String, placeholder: "email" }],
    },
  },
  async func(this: void, flags: DeleteFlagValues, email: string) {
    await runCommand(() =>
      runDelete(flags, email, "global unsubscribe", (client) =>
        client.deleteGlobalSuppression(email),
      ),
    );
  },
});

const addCommand = buildCommand({
  docs: {
    brief: "Add an email address to the global unsubscribe list",
    fullDescription:
      "Suppresses all mail to the address from the targeted account(s). Use when a recipient asks " +
      "to stop receiving everything. Requires --account <name> or --all-accounts; supports --dry-run.",
  },
  parameters: {
    flags: { ...scopeFlags, ...dryRunFlag, ...formatFlags },
    positional: {
      kind: "tuple",
      parameters: [{ brief: "Email address to unsubscribe", parse: String, placeholder: "email" }],
    },
  },
  async func(this: void, flags: DeleteFlagValues, email: string) {
    await runCommand(() =>
      runMutation(flags, "add", email, "global unsubscribe", (client) =>
        client.addGlobalSuppressions([email]),
      ),
    );
  },
});

export const globalSuppressionsRoutes = buildRouteMap({
  routes: { check: checkCommand, add: addCommand, delete: deleteCommand },
  docs: { brief: "Global unsubscribe list" },
});
