import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { AccountManager } from "@sendgrid-toolkit/sdk";
import type { EmailMessage } from "@sendgrid-toolkit/sdk";

const STATUS_LABELS: Record<string, string> = {
  delivered: "DELIVERED",
  not_delivered: "NOT DELIVERED",
  processed: "PROCESSING",
};

function statusBreakdown(messages: EmailMessage[]): string {
  if (messages.length === 0) return "0";
  const counts: Record<string, number> = {};
  for (const msg of messages) {
    const s = msg.status ?? "unknown";
    counts[s] = (counts[s] ?? 0) + 1;
  }
  const parts = Object.entries(counts)
    .map(([s, n]) => `${n} ${STATUS_LABELS[s] ?? s}`)
    .join(", ");
  return `${messages.length} (${parts})`;
}

function formatMessageRow(msg: EmailMessage): string {
  const label = `[${STATUS_LABELS[msg.status ?? ""] ?? (msg.status?.toUpperCase() ?? "UNKNOWN")}]`;
  const subject = msg.subject ? `"${msg.subject}"` : "(no subject)";
  const time = msg.last_event_time
    ? new Date(msg.last_event_time).toISOString().replace("T", " ").slice(0, 19)
    : "—";
  const reason = msg.reason ? `  reason: ${msg.reason}` : "";
  return `  ${label.padEnd(16)} ${subject}  ${time}${reason}`;
}

export function registerDiagnoseTools(server: FastMCP) {
  server.addTool({
    name: "diagnose_email",
    description:
      "Diagnose email delivery issues for a specific email address. " +
      "Searches across all SendGrid accounts for: email activity (recent messages), " +
      "blocks, bounces, spam reports, invalid email entries, and global suppressions. " +
      "Returns a consolidated report showing per-account findings and reasons " +
      "why an email might not be delivered.",
    parameters: z.object({
      email: z.string().email().describe("The email address to diagnose"),
      account: z.string().optional().describe("Target a specific account (default: all)"),
    }),
    execute: async (args) => {
      const manager = new AccountManager();
      const report = await manager.diagnose(args.email, args.account);

      const lines: string[] = [`Diagnosis for: ${report.email}`, ""];

      for (const acct of report.accounts) {
        lines.push(`── Account: ${acct.account} ──`);

        if (acct.error) {
          lines.push(`  Error: ${acct.error}`, "");
          continue;
        }

        const d = acct.data;
        if (!d) {
          lines.push("  No data", "");
          continue;
        }

        lines.push(`  Messages:           ${statusBreakdown(d.messages)}`);
        for (const msg of d.messages) {
          lines.push(formatMessageRow(msg));
        }
        lines.push(`  Blocks:             ${d.blocks.length}`);
        for (const b of d.blocks) {
          lines.push(`    [BLOCK] ${b.email} — ${b.reason}`);
        }
        lines.push(`  Bounces:            ${d.bounces.length}`);
        for (const b of d.bounces) {
          lines.push(`    [BOUNCE] ${b.email} — ${b.reason}`);
        }
        lines.push(
          `  Spam Reports:       ${d.spamReports.length}`,
          `  Invalid Emails:     ${d.invalidEmails.length}`,
          `  Global Suppression: ${d.globalSuppression ? "YES" : "no"}`,
          "",
        );
      }

      return lines.join("\n");
    },
  });
}
