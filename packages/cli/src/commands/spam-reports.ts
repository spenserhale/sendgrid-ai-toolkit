import { buildCommand } from "@stricli/core";
import { AccountManager } from "@sendgrid-toolkit/sdk";

interface SpamReportsFlags {
  readonly email: string | undefined;
  readonly limit: number;
  readonly account: string | undefined;
  readonly json: boolean;
}

export const spamReportsCommand = buildCommand({
  docs: { brief: "List spam reports across all accounts" },
  parameters: {
    flags: {
      email: {
        kind: "parsed",
        parse: String,
        brief: "Filter by email",
        optional: true,
      },
      limit: {
        kind: "parsed",
        parse: Number,
        brief: "Max results per account",
        default: 20,
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
  async func(this: void, flags: SpamReportsFlags) {
    const manager = new AccountManager();
    try {
      const results = await manager.runAcrossAccounts(
        (client) => client.getSpamReports({ email: flags.email, limit: flags.limit }),
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
          console.log("  No spam reports found\n");
          continue;
        }
        for (const s of r.data) {
          console.log(`  ${s.email}`);
        }
        console.log();
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});
