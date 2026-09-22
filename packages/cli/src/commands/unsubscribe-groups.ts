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
import { accountList } from "../lib/text.js";
import { runDelete, type DeleteFlagValues } from "../lib/mutations.js";

interface AccountOnlyFlagValues extends FormatFlagValues {
  readonly account: string | undefined;
}

const listCommand = buildCommand({
  docs: { brief: "List unsubscribe (ASM) groups" },
  parameters: { flags: { ...accountFlag, ...formatFlags } },
  async func(this: void, flags: AccountOnlyFlagValues) {
    await runCommand(async () => {
      const manager = new AccountManager();
      const results = await manager.runAcrossAccounts(
        (client) => client.getUnsubscribeGroups(),
        flags.account,
      );
      emit(results, flags, {
        text: () =>
          accountList(
            results,
            (g) =>
              `[${g.id}] ${g.name}${g.is_default ? " (default)" : ""}${
                g.unsubscribes !== undefined ? `  ${g.unsubscribes} unsubscribed` : ""
              }`,
            "No unsubscribe groups",
          ),
      });
      exitIfAllFailed(results);
    });
  },
});

const checkCommand = buildCommand({
  docs: { brief: "List the unsubscribe groups an email address has opted out of" },
  parameters: {
    flags: { ...accountFlag, ...formatFlags },
    positional: {
      kind: "tuple",
      parameters: [{ brief: "Email address to check", parse: String, placeholder: "email" }],
    },
  },
  async func(this: void, flags: AccountOnlyFlagValues, email: string) {
    await runCommand(async () => {
      const manager = new AccountManager();
      const results = await manager.runAcrossAccounts(
        (client) => client.getUnsubscribedGroups(email),
        flags.account,
      );
      emit(results, flags, {
        text: () =>
          accountList(results, (g) => `[${g.id}] ${g.name}`, "Not unsubscribed from any group"),
      });
      exitIfAllFailed(results);
    });
  },
});

interface GroupDeleteFlagValues extends DeleteFlagValues {
  readonly group: number;
}

const deleteCommand = buildCommand({
  docs: {
    brief: "Remove an email address from one unsubscribe group",
    fullDescription:
      "Requires --group <id> plus --account <name> or --all-accounts. Group ids differ per " +
      "account, so --all-accounts is rarely what you want here; prefer `sendgrid clear`.",
  },
  parameters: {
    flags: {
      group: {
        kind: "parsed",
        parse: (s: string) => {
          const n = Number(s);
          if (!Number.isInteger(n) || n <= 0) throw new Error(`expected a group id (got: "${s}")`);
          return n;
        },
        brief: "Unsubscribe group id (see `sendgrid unsubscribe-groups list`)",
      },
      ...scopeFlags,
      ...dryRunFlag,
      ...formatFlags,
    },
    positional: {
      kind: "tuple",
      parameters: [{ brief: "Email address to remove", parse: String, placeholder: "email" }],
    },
  },
  async func(this: void, flags: GroupDeleteFlagValues, email: string) {
    await runCommand(() =>
      runDelete(flags, email, `unsubscribe group ${flags.group}`, (client) =>
        client.deleteUnsubscribeGroupSuppression(flags.group, email),
      ),
    );
  },
});

export const unsubscribeGroupsRoutes = buildRouteMap({
  routes: { list: listCommand, check: checkCommand, delete: deleteCommand },
  docs: { brief: "Unsubscribe (ASM) groups and group-level opt-outs" },
});
