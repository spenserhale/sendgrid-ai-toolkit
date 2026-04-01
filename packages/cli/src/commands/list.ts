import { buildCommand } from "@stricli/core";
import { SendgridClient, resolveConfig } from "@sendgrid-toolkit/sdk";

interface ListFlags {
  readonly page: number;
  readonly limit: number;
  readonly json: boolean;
}

export const listCommand = buildCommand({
  docs: {
    brief: "List resources",
  },
  parameters: {
    flags: {
      page: {
        kind: "parsed",
        parse: Number,
        brief: "Page number",
        default: 1,
      },
      limit: {
        kind: "parsed",
        parse: Number,
        brief: "Items per page",
        default: 20,
      },
      json: {
        kind: "boolean",
        brief: "Output as JSON",
        default: false,
      },
    },
  },
  async func(this: void, flags: ListFlags) {
    const config = resolveConfig();
    const client = new SendgridClient(config);

    try {
      const result = await client.listResources({
        page: flags.page,
        limit: flags.limit,
      });

      if (flags.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Showing ${result.data.length} of ${result.total} resources (page ${result.page})\n`);
      for (const item of result.data) {
        console.log(`  ${item.id}  ${item.name}`);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});
