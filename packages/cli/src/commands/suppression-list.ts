import { buildCommand, buildRouteMap } from "@stricli/core";
import {
  AccountManager,
  type SendgridClient,
  type SuppressionListParams,
} from "@sendgrid-toolkit/sdk";
import {
  accountFlag,
  emailFilterFlag,
  formatFlags,
  limitFlag,
  scopeFlags,
  dryRunFlag,
  type FormatFlagValues,
} from "../lib/flags.js";
import { emit } from "../lib/output.js";
import { runCommand, exitIfAllFailed } from "../lib/errors.js";
import { accountList, accountValue } from "../lib/text.js";
import { runDelete, type DeleteFlagValues } from "../lib/mutations.js";

interface ListFlagValues extends FormatFlagValues {
  readonly email: string | undefined;
  readonly limit: number;
  readonly account: string | undefined;
}

export interface SuppressionListSpec<T> {
  /** Singular noun used in messages, e.g. "block". */
  noun: string;
  /** Plural noun used in briefs, e.g. "blocked email addresses". */
  plural: string;
  list: (client: SendgridClient, params: SuppressionListParams) => Promise<T[]>;
  remove: (client: SendgridClient, email: string) => Promise<void>;
  /** Optional single-address lookup; adds a `get <email>` subcommand. */
  getOne?: (client: SendgridClient, email: string) => Promise<T | null>;
  row: (item: T) => string;
}

interface GetFlagValues extends FormatFlagValues {
  readonly account: string | undefined;
}

/**
 * Build `list` + `delete` subcommands for one SendGrid suppression list.
 * Blocks, bounces, spam reports and invalid emails share this exact shape.
 */
export function buildSuppressionListRoutes<T>(spec: SuppressionListSpec<T>) {
  const listCommand = buildCommand({
    docs: {
      brief: `List ${spec.plural}`,
      fullDescription:
        `List ${spec.plural} across every configured account (or one with --account). ` +
        "Partial failures are reported per account and do not stop the others.",
    },
    parameters: {
      flags: { ...emailFilterFlag, ...limitFlag, ...accountFlag, ...formatFlags },
    },
    async func(this: void, flags: ListFlagValues) {
      await runCommand(async () => {
        const manager = new AccountManager();
        const results = await manager.runAcrossAccounts(
          (client) => spec.list(client, { email: flags.email, limit: flags.limit }),
          flags.account,
        );
        emit(results, flags, {
          text: () => accountList(results, spec.row, `No ${spec.plural} found`),
        });
        exitIfAllFailed(results);
      });
    },
  });

  const deleteCommand = buildCommand({
    docs: {
      brief: `Remove an email address from the ${spec.noun} list`,
      fullDescription:
        `Delete the ${spec.noun} entry for one email address. ` +
        "Requires --account <name> or --all-accounts; there is no implicit default. " +
        "Use --dry-run to preview the target accounts.",
    },
    parameters: {
      flags: { ...scopeFlags, ...dryRunFlag, ...formatFlags },
      positional: {
        kind: "tuple",
        parameters: [
          {
            brief: `Email address to remove from the ${spec.noun} list`,
            parse: String,
            placeholder: "email",
          },
        ],
      },
    },
    async func(this: void, flags: DeleteFlagValues, email: string) {
      await runCommand(() =>
        runDelete(flags, email, spec.noun, (client) => spec.remove(client, email)),
      );
    },
  });

  const getOne = spec.getOne;
  const getCommand = getOne
    ? buildCommand({
        docs: {
          brief: `Show the ${spec.noun} entry for one email address`,
          fullDescription: `Per account: the ${spec.noun} record, or null when the address is not on the list.`,
        },
        parameters: {
          flags: { ...accountFlag, ...formatFlags },
          positional: {
            kind: "tuple",
            parameters: [
              { brief: "Email address to look up", parse: String, placeholder: "email" },
            ],
          },
        },
        async func(this: void, flags: GetFlagValues, email: string) {
          await runCommand(async () => {
            const manager = new AccountManager();
            const results = await manager.runAcrossAccounts(
              (client) => getOne(client, email),
              flags.account,
            );
            emit(results, flags, {
              text: () =>
                accountValue(results, (item) =>
                  item ? spec.row(item) : `Not on the ${spec.noun} list`,
                ),
            });
            exitIfAllFailed(results);
          });
        },
      })
    : undefined;

  const docs = { brief: `Manage ${spec.plural}` };
  return getCommand
    ? buildRouteMap({ routes: { list: listCommand, get: getCommand, delete: deleteCommand }, docs })
    : buildRouteMap({ routes: { list: listCommand, delete: deleteCommand }, docs });
}
