import { buildCommand } from "@stricli/core";
import { SendgridClient, resolveConfig } from "@sendgrid-toolkit/sdk";

interface GetFlags {
  readonly json: boolean;
}

export const getCommand = buildCommand({
  docs: {
    brief: "Get a resource by ID",
  },
  parameters: {
    flags: {
      json: {
        kind: "boolean",
        brief: "Output as JSON",
        default: false,
      },
    },
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Resource ID",
          parse: String,
        },
      ],
    },
  },
  async func(this: void, flags: GetFlags, id: string) {
    const config = resolveConfig();
    const client = new SendgridClient(config);

    try {
      const resource = await client.getResource(id);

      if (flags.json) {
        console.log(JSON.stringify(resource, null, 2));
        return;
      }

      console.log(`ID:        ${resource.id}`);
      console.log(`Name:      ${resource.name}`);
      console.log(`Created:   ${resource.createdAt}`);
      console.log(`Updated:   ${resource.updatedAt}`);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});
