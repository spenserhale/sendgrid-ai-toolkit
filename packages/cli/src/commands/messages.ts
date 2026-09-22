import { buildCommand } from "@stricli/core";
import { AccountManager, SendgridError, buildActivityQuery } from "@sendgrid-toolkit/sdk";
import {
  accountFlag,
  daysFlag,
  formatFlags,
  limitFlag,
  type FormatFlagValues,
} from "../lib/flags.js";
import { emit } from "../lib/output.js";
import { runCommand, exitIfAllFailed } from "../lib/errors.js";
import { accountList, messageRow } from "../lib/text.js";

interface MessagesFlagValues extends FormatFlagValues {
  readonly query: string | undefined;
  readonly email: string | undefined;
  readonly limit: number;
  readonly days: number;
  readonly account: string | undefined;
}

export const messagesCommand = buildCommand({
  docs: {
    brief: "Search email activity across every account",
    fullDescription:
      "Query the Email Activity feed (requires SendGrid's Email Activity History add-on on each " +
      'account). Use --email for the common case, or --query for raw SendGrid syntax such as subject="Welcome". ' +
      "--email and the no-filter default are limited to the last --days days; --query is sent verbatim, so include " +
      "your own last_event_time bound or SendGrid may time out.",
  },
  parameters: {
    flags: {
      email: {
        kind: "parsed",
        parse: String,
        brief: "Recipient address to search for (shorthand for --query 'to_email=\"…\"')",
        optional: true,
      },
      query: {
        kind: "parsed",
        parse: String,
        brief: 'Raw SendGrid query, e.g. to_email="user@example.com" AND status="not_delivered"',
        optional: true,
      },
      ...limitFlag,
      ...daysFlag,
      ...accountFlag,
      ...formatFlags,
    },
  },
  async func(this: void, flags: MessagesFlagValues) {
    await runCommand(async () => {
      if (flags.email && flags.query) {
        throw new SendgridError({
          code: "E_VALIDATION",
          message: "Use either --email or --query, not both",
        });
      }
      // --query is passed through verbatim (caller owns the time bound); --email is windowed.
      const query = flags.query ?? buildActivityQuery({ toEmail: flags.email, days: flags.days });
      const manager = new AccountManager();
      const results = await manager.runAcrossAccounts(
        (client) => client.getMessages(query, flags.limit),
        flags.account,
      );
      emit(results, flags, { text: () => accountList(results, messageRow, "No messages found") });
      exitIfAllFailed(results);
    });
  },
});
