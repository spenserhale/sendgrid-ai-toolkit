import { buildCommand } from "@stricli/core";
import { AccountManager } from "@sendgrid-toolkit/sdk";
import type { EmailMessage } from "@sendgrid-toolkit/sdk";

const STATUS_LABELS: Record<string, string> = {
  delivered: "DELIVERED",
  not_delivered: "NOT DELIVERED",
  processed: "PROCESSING",
};

function messageStatusLine(messages: EmailMessage[]): string {
  if (messages.length === 0) return "0";
  const counts: Record<string, number> = {};
  for (const msg of messages) {
    const s = msg.status ?? "unknown";
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const breakdown = Object.entries(counts)
    .map(([s, n]) => `${n} ${STATUS_LABELS[s] ?? s}`)
    .join(", ");
  return `${messages.length} (${breakdown})`;
}

function formatMessageRow(msg: EmailMessage): string {
  const label = `[${STATUS_LABELS[msg.status ?? ""] ?? (msg.status?.toUpperCase() ?? "UNKNOWN")}]`;
  const subject = msg.subject ? `"${msg.subject}"` : "(no subject)";
  const time = msg.last_event_time
    ? new Date(msg.last_event_time).toISOString().replace("T", " ").slice(0, 19)
    : "—";
  const reason = msg.reason ? `  reason: ${msg.reason}` : "";
  return `    ${label.padEnd(16)} ${subject}  ${time}${reason}`;
}

interface DiagnoseFlags {
  readonly account: string | undefined;
  readonly json: boolean;
}

export const diagnoseCommand = buildCommand({
  docs: {
    brief: "Diagnose email delivery issues across all accounts",
  },
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
      parameters: [
        {
          brief: "Email address to diagnose",
          parse: String,
        },
      ],
    },
  },
  async func(this: void, flags: DiagnoseFlags, email: string) {
    const manager = new AccountManager();

    try {
      const report = await manager.diagnose(email, flags.account);

      if (flags.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      console.log(`\nDiagnosis for: ${report.email}\n`);

      for (const acct of report.accounts) {
        console.log(`── Account: ${acct.account} ──`);

        if (acct.error) {
          console.log(`  Error: ${acct.error}\n`);
          continue;
        }

        const d = acct.data;
        if (!d) {
          console.log("  No data\n");
          continue;
        }

        console.log(`  Messages:           ${messageStatusLine(d.messages)}`);
        for (const msg of d.messages) {
          console.log(formatMessageRow(msg));
        }
        console.log(`  Blocks:             ${d.blocks.length}`);
        console.log(`  Bounces:            ${d.bounces.length}`);
        console.log(`  Spam Reports:       ${d.spamReports.length}`);
        console.log(`  Invalid Emails:     ${d.invalidEmails.length}`);
        console.log(`  Global Suppression: ${d.globalSuppression ? "YES" : "no"}`);

        if (d.blocks.length > 0) {
          for (const b of d.blocks) {
            console.log(`    [BLOCK] ${b.email} — ${b.reason}`);
          }
        }
        if (d.bounces.length > 0) {
          for (const b of d.bounces) {
            console.log(`    [BOUNCE] ${b.email} — ${b.reason}`);
          }
        }
        if (d.spamReports.length > 0) {
          for (const s of d.spamReports) {
            console.log(`    [SPAM] ${s.email}`);
          }
        }
        if (d.invalidEmails.length > 0) {
          for (const inv of d.invalidEmails) {
            console.log(`    [INVALID] ${inv.email} — ${inv.reason}`);
          }
        }

        console.log();
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});
