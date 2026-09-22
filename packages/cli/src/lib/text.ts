import type {
  MultiAccountResult,
  SerializedError,
  DiagnoseReport,
  ClearReport,
  EmailMessage,
  AccountDiagnosis,
  DiagnoseSourceError,
} from "@sendgrid-toolkit/sdk";

// ---------------------------------------------------------------------------
// shared
// ---------------------------------------------------------------------------

export function accountHeader(name: string): string {
  return `── Account: ${name} ──`;
}

export function errorLine(err: SerializedError, indent = "  "): string {
  const hint = err.hint ? ` (${err.hint})` : "";
  return `${indent}Error [${err.code}]: ${err.message}${hint}`;
}

export function formatTimestamp(value: number | string | undefined): string {
  if (value === undefined || value === "") return "—";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Render a per-account list result. `row` formats one item; `empty` is the
 * message when an account returned nothing.
 */
export function accountList<T>(
  results: MultiAccountResult<T[]>[],
  row: (item: T) => string,
  empty: string,
): string {
  const out: string[] = [];
  for (const r of results) {
    out.push(accountHeader(r.account));
    if (r.error) {
      out.push(errorLine(r.error), "");
      continue;
    }
    if (!r.data || r.data.length === 0) {
      out.push(`  ${empty}`, "");
      continue;
    }
    for (const item of r.data) out.push(`  ${row(item)}`);
    out.push("");
  }
  return out.join("\n").trimEnd();
}

/** Render a per-account scalar/summary result. */
export function accountValue<T>(
  results: MultiAccountResult<T>[],
  render: (value: T) => string,
): string {
  const out: string[] = [];
  for (const r of results) {
    out.push(accountHeader(r.account));
    out.push(r.error ? errorLine(r.error) : `  ${render(r.data)}`, "");
  }
  return out.join("\n").trimEnd();
}

// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  delivered: "DELIVERED",
  not_delivered: "NOT DELIVERED",
  processed: "PROCESSING",
};

export function statusLabel(status: string | undefined): string {
  if (!status) return "UNKNOWN";
  return STATUS_LABELS[status] ?? status.toUpperCase();
}

export function messageRow(msg: EmailMessage): string {
  const label = `[${statusLabel(msg.status)}]`.padEnd(16);
  const subject = msg.subject ? `"${msg.subject}"` : "(no subject)";
  const route = `${msg.from_email ?? "?"} → ${msg.to_email ?? "?"}`;
  const reason = msg.reason ? `  reason: ${msg.reason}` : "";
  return `${label} ${formatTimestamp(msg.last_event_time)}  ${route}  ${subject}${reason}`;
}

// ---------------------------------------------------------------------------
// diagnose
// ---------------------------------------------------------------------------

function sourceError(errors: DiagnoseSourceError[], source: DiagnoseSourceError["source"]) {
  return errors.find((e) => e.source === source)?.error;
}

function countOrUnavailable(
  label: string,
  count: number,
  errors: DiagnoseSourceError[],
  source: DiagnoseSourceError["source"],
): string {
  const err = sourceError(errors, source);
  const value = err ? `unavailable — ${err.message}` : String(count);
  return `  ${label.padEnd(22)}${value}`;
}

function diagnosisBody(d: AccountDiagnosis): string[] {
  const lines: string[] = [];
  const verdict = d.summary.suppressed
    ? `SUPPRESSED (${d.summary.suppressedIn.join(", ")})`
    : d.errors.length > 0
      ? "not suppressed on the lists that could be checked"
      : "not suppressed";
  lines.push(`  Verdict:              ${verdict}`);

  const msgErr = sourceError(d.errors, "messages");
  if (msgErr) {
    lines.push(`  Messages:             unavailable — ${msgErr.message}`);
    if (msgErr.statusCode === 403 || msgErr.statusCode === 401) {
      lines.push(
        "                        (Email Activity History add-on or API scope may be missing)",
      );
    }
  } else {
    const failed = d.summary.failedMessageCount;
    const breakdown =
      d.messages.length === 0
        ? "0"
        : `${d.messages.length} (${d.messages.length - failed} delivered, ${failed} not delivered)`;
    lines.push(`  Messages:             ${breakdown}`);
    for (const msg of d.messages) lines.push(`    ${messageRow(msg)}`);
  }

  lines.push(countOrUnavailable("Blocks:", d.blocks.length, d.errors, "blocks"));
  for (const b of d.blocks) lines.push(`    [BLOCK] ${formatTimestamp(b.created)}  ${b.reason}`);

  lines.push(countOrUnavailable("Bounces:", d.bounces.length, d.errors, "bounces"));
  for (const b of d.bounces) lines.push(`    [BOUNCE] ${formatTimestamp(b.created)}  ${b.reason}`);

  lines.push(countOrUnavailable("Spam Reports:", d.spamReports.length, d.errors, "spamReports"));
  for (const s of d.spamReports) lines.push(`    [SPAM] ${formatTimestamp(s.created)}`);

  lines.push(
    countOrUnavailable("Invalid Emails:", d.invalidEmails.length, d.errors, "invalidEmails"),
  );
  for (const inv of d.invalidEmails) {
    lines.push(`    [INVALID] ${formatTimestamp(inv.created)}  ${inv.reason}`);
  }

  const globalErr = sourceError(d.errors, "globalSuppression");
  lines.push(
    `  Global Unsubscribe:   ${globalErr ? `unavailable — ${globalErr.message}` : d.globalSuppression ? "YES" : "no"}`,
  );

  lines.push(
    countOrUnavailable(
      "Unsubscribe Groups:",
      d.unsubscribeGroups.length,
      d.errors,
      "unsubscribeGroups",
    ),
  );
  for (const g of d.unsubscribeGroups) lines.push(`    [GROUP ${g.id}] ${g.name}`);

  return lines;
}

export function diagnoseText(report: DiagnoseReport): string {
  const window =
    report.activityWindowDays > 0 ? ` (activity: last ${report.activityWindowDays} days)` : "";
  const lines: string[] = [`Diagnosis for: ${report.email}${window}`, ""];
  for (const acct of report.accounts) {
    lines.push(accountHeader(acct.account));
    if (acct.error) {
      lines.push(errorLine(acct.error), "");
      continue;
    }
    if (!acct.data) {
      lines.push("  No data", "");
      continue;
    }
    lines.push(...diagnosisBody(acct.data), "");
  }
  return lines.join("\n").trimEnd();
}

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

const LIST_LABELS: Record<string, string> = {
  blocks: "block",
  bounces: "bounce",
  spamReports: "spam report",
  invalidEmails: "invalid email",
  globalSuppression: "global unsubscribe",
  unsubscribeGroups: "unsubscribe group",
};

export function clearText(report: ClearReport): string {
  const title = report.dryRun
    ? `DRY RUN — would clear suppressions for: ${report.email}`
    : `Cleared suppressions for: ${report.email}`;
  const lines: string[] = [title, ""];

  for (const acct of report.accounts) {
    lines.push(accountHeader(acct.account));
    if (acct.error) {
      lines.push(errorLine(acct.error), "");
      continue;
    }
    if (!acct.data) {
      lines.push("  No data", "");
      continue;
    }
    if (acct.data.actions.length === 0 && acct.data.errors.length === 0) {
      lines.push("  Nothing to clear (not on any suppression list)");
    }
    for (const a of acct.data.actions) {
      const label = LIST_LABELS[a.list] ?? a.list;
      const group =
        a.groupId !== undefined ? ` "${a.groupName ?? a.groupId}" (id ${a.groupId})` : "";
      const status =
        a.status === "removed"
          ? "removed"
          : a.status === "would_remove"
            ? "would remove"
            : `FAILED — ${a.error?.message ?? "unknown error"}`;
      lines.push(`  ${label}${group}: ${status}`);
    }
    for (const e of acct.data.errors) {
      lines.push(`  ${LIST_LABELS[e.source] ?? e.source}: could not check — ${e.error.message}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
