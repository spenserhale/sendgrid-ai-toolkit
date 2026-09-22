import { buildCommand } from "@stricli/core";
import { AccountManager } from "@sendgrid-toolkit/sdk";
import { accountFlag, daysFlag, formatFlags, type FormatFlagValues } from "../lib/flags.js";
import { emit } from "../lib/output.js";
import { runCommand, exitIfAllFailed } from "../lib/errors.js";
import { diagnoseText } from "../lib/text.js";

interface DiagnoseFlagValues extends FormatFlagValues {
  readonly account: string | undefined;
  readonly days: number;
}

export const diagnoseCommand = buildCommand({
  docs: {
    brief: "Investigate one email address across every account",
    fullDescription:
      "One call, all accounts: recent email activity, blocks, bounces, spam reports, " +
      "invalid-email entries, the global unsubscribe list, and unsubscribe-group membership. " +
      "Sources that cannot be checked are reported as unavailable rather than empty. " +
      "Email Activity is limited to the last --days days (default 30) because unbounded queries time out at SendGrid.",
  },
  parameters: {
    flags: { ...accountFlag, ...daysFlag, ...formatFlags },
    positional: {
      kind: "tuple",
      parameters: [{ brief: "Email address to investigate", parse: String, placeholder: "email" }],
    },
  },
  async func(this: void, flags: DiagnoseFlagValues, email: string) {
    await runCommand(async () => {
      const manager = new AccountManager();
      const report = await manager.diagnose(email, { account: flags.account, days: flags.days });
      emit(report, flags, { text: () => diagnoseText(report) });
      exitIfAllFailed(report.accounts);
    });
  },
});
