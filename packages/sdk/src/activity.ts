import { SendgridError } from "./errors.js";

/**
 * Default look-back window for Email Activity queries. Unbounded queries make
 * SendGrid scan the whole retention period and routinely time out server-side
 * (HTTP 499 after ~60s), so every convenience query is time-boxed.
 */
export const DEFAULT_ACTIVITY_DAYS = 30;

export interface ActivityQueryOptions {
  /** Recipient address; becomes `to_email="…"`. */
  toEmail?: string;
  /** Look-back window in days ending now. Omit or 0 to leave the query unbounded. */
  days?: number;
  /** "now" override for deterministic tests. */
  now?: Date;
}

/** Escape a value for a double-quoted SendGrid Email Activity string literal. */
export function quoteActivityValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Build a SendGrid Email Activity query string.
 * Syntax reference: https://docs.sendgrid.com/for-developers/sending-email/getting-started-email-activity-api
 */
export function buildActivityQuery(options: ActivityQueryOptions): string | undefined {
  const clauses: string[] = [];
  if (options.toEmail) clauses.push(`to_email=${quoteActivityValue(options.toEmail)}`);

  if (options.days !== undefined && options.days !== 0) {
    if (!Number.isFinite(options.days) || options.days < 0) {
      throw new SendgridError({
        code: "E_VALIDATION",
        message: "days must be a non-negative number",
        got: String(options.days),
      });
    }
    const end = options.now ?? new Date();
    const start = new Date(end.getTime() - options.days * 86_400_000);
    clauses.push(
      `last_event_time BETWEEN TIMESTAMP ${quoteActivityValue(toTimestamp(start))} AND TIMESTAMP ${quoteActivityValue(toTimestamp(end))}`,
    );
  }

  return clauses.length > 0 ? clauses.join(" AND ") : undefined;
}

function toTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
