import { buildCommand } from "@stricli/core";
import { AccountManager } from "@sendgrid-toolkit/sdk";

interface MessagesFlags {
  readonly query: string | undefined;
  readonly limit: number;
  readonly account: string | undefined;
  readonly json: boolean;
}

export const messagesCommand = buildCommand({
  docs: {
    brief: "Search email activity across all accounts",
  },
  parameters: {
    flags: {
      query: {
        kind: "parsed",
        parse: String,
        brief: 'SendGrid query string, e.g. to_email="user@example.com"',
        optional: true,
      },
      limit: {
        kind: "parsed",
        parse: Number,
        brief: "Max messages per account",
        default: 10,
      },
      account: {
        kind: "parsed",
        parse: String,
        brief: "Target a specific account",
        optional: true,
      },
      json: {
        kind: "boolean",
        brief: "Output as JSON",
        default: false,
      },
    },
  },
  async func(this: void, flags: MessagesFlags) {
    const manager = new AccountManager();

    try {
      const results = await manager.runAcrossAccounts(
        (client) => client.getMessages(flags.query, flags.limit),
        flags.account,
      );

      if (flags.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      for (const r of results) {
        console.log(`── Account: ${r.account} ──`);
        if (r.error) {
          console.log(`  Error: ${r.error}\n`);
          continue;
        }
        if (r.data.length === 0) {
          console.log("  No messages found\n");
          continue;
        }
        for (const msg of r.data) {
          console.log(
            `  ${msg.last_event_time ?? ""}  ${msg.status ?? ""}  ${msg.from_email ?? ""} → ${msg.to_email ?? ""}  ${msg.subject ?? ""}`,
          );
        }
        console.log();
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});
