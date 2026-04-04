import { buildCommand } from "@stricli/core";
import { AccountManager } from "@sendgrid-toolkit/sdk";

interface CheckFlags {
  readonly account: string | undefined;
  readonly json: boolean;
}

export const globalSuppressionsCommand = buildCommand({
  docs: { brief: "Check if an email is globally suppressed" },
  parameters: {
    flags: {
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
    positional: {
      kind: "tuple",
      parameters: [{ brief: "Email address to check", parse: String }],
    },
  },
  async func(this: void, flags: CheckFlags, email: string) {
    const manager = new AccountManager();
    try {
      const results = await manager.runAcrossAccounts(
        (client) => client.checkGlobalSuppression(email),
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
        console.log(`  Globally suppressed: ${r.data ? "YES" : "no"}\n`);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});
