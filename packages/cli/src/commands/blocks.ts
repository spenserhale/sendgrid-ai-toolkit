import { buildCommand, buildRouteMap } from "@stricli/core";
import { AccountManager } from "@sendgrid-toolkit/sdk";

interface ListFlags {
  readonly email: string | undefined;
  readonly limit: number;
  readonly account: string | undefined;
  readonly json: boolean;
}

const listCommand = buildCommand({
  docs: { brief: "List blocked email addresses" },
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
  async func(this: void, flags: ListFlags) {
    const manager = new AccountManager();
    try {
      const results = await manager.runAcrossAccounts(
        (client) => client.getBlocks({ email: flags.email, limit: flags.limit }),
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
          console.log("  No blocks found\n");
          continue;
        }
        for (const b of r.data) {
          console.log(`  ${b.email}  ${b.reason}`);
        }
        console.log();
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});

const deleteCommand = buildCommand({
  docs: { brief: "Delete a block by email address" },
  parameters: {
    flags: {
      account: {
        kind: "parsed",
        parse: String,
        brief: "Target a specific account",
        optional: true,
      },
    },
    positional: {
      kind: "tuple",
      parameters: [{ brief: "Email address to unblock", parse: String }],
    },
  },
  async func(this: void, flags: { account: string | undefined }, email: string) {
    const manager = new AccountManager();
    try {
      const results = await manager.runAcrossAccounts(
        (client) => client.deleteBlock(email),
        flags.account,
      );
      for (const r of results) {
        if (r.error) {
          console.log(`[${r.account}] Error: ${r.error}`);
        } else {
          console.log(`[${r.account}] Deleted block for ${email}`);
        }
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});

export const blocksRoutes = buildRouteMap({
  routes: { list: listCommand, delete: deleteCommand },
  docs: { brief: "Manage blocked email addresses" },
});
