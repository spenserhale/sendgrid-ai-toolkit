import { buildCommand } from "@stricli/core";
import { AccountManager } from "@sendgrid-toolkit/sdk";
import { formatFlags, type FormatFlagValues } from "../lib/flags.js";
import { emit } from "../lib/output.js";
import { runCommand } from "../lib/errors.js";

export const accountsCommand = buildCommand({
  docs: {
    brief: "List configured account names",
    fullDescription:
      'Names come from SENDGRID_ACCOUNTS (or "default" when only SENDGRID_API_KEY is set). ' +
      "API keys are never printed.",
  },
  parameters: { flags: { ...formatFlags } },
  async func(this: void, flags: FormatFlagValues) {
    await runCommand(async () => {
      const names = new AccountManager().getAccountNames();
      emit(
        names.map((name) => ({ name })),
        flags,
        { text: () => names.join("\n") },
      );
    });
  },
});
