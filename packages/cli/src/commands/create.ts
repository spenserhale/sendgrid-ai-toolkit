import { buildCommand } from "@stricli/core";
import { SendgridClient, resolveConfig } from "@sendgrid-toolkit/sdk";

interface CreateFlags {
  readonly json: boolean;
}

export const createCommand = buildCommand({
  docs: {
    brief: "Create a new resource",
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
          brief: "Resource name",
          parse: String,
        },
      ],
    },
  },
  async func(this: void, flags: CreateFlags, name: string) {
    const config = resolveConfig();
    const client = new SendgridClient(config);

    try {
      const resource = await client.createResource({ name });

      if (flags.json) {
        console.log(JSON.stringify(resource, null, 2));
        return;
      }

      console.log(`Created resource: ${resource.id} (${resource.name})`);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});
