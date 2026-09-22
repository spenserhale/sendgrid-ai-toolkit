import { buildCommand } from "@stricli/core";
import { formatFlags, type FormatFlagValues } from "../lib/flags.js";
import { emit } from "../lib/output.js";
import { runCommand } from "../lib/errors.js";
import { buildAgentContext } from "../agent-context.js";

/**
 * Registered lazily to avoid an import cycle (app.ts imports this file; this
 * file needs the built app's route tree at call time).
 */
export const agentContextCommand = buildCommand({
  docs: {
    brief: "Emit a machine-readable description of every command, flag, exit code and env var",
    fullDescription:
      "Defaults to JSON (use --toon or --text to override). Derived from the live command tree, " +
      "so it is always in sync with --help. Pipe it to an agent before driving this CLI.",
  },
  parameters: { flags: { ...formatFlags } },
  async func(this: void, flags: FormatFlagValues) {
    await runCommand(async () => {
      const { app } = await import("../app.js");
      const context = buildAgentContext(app.root);
      const effective: FormatFlagValues =
        flags.format || flags.text || flags.json || flags.toon ? flags : { ...flags, json: true };
      emit(context, effective, { text: () => JSON.stringify(context, null, 2) });
    });
  },
});
