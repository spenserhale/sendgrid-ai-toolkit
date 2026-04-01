import { buildCommand } from "@stricli/core";
import { SendgridClient, resolveConfig } from "@sendgrid-toolkit/sdk";

export const deleteCommand = buildCommand({
  docs: {
    brief: "Delete a resource by ID",
  },
  parameters: {
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
  async func(this: void, _flags: {}, id: string) {
    const config = resolveConfig();
    const client = new SendgridClient(config);

    try {
      await client.deleteResource(id);
      console.log(`Deleted resource: ${id}`);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});
