import { z } from "zod";
import type { SerializedError } from "./errors.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const DEFAULT_BASE_URL = "https://api.sendgrid.com";
export const DEFAULT_TIMEOUT_MS = 60_000;

export const SendgridConfigSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  baseUrl: z.string().url().default(DEFAULT_BASE_URL),
  timeoutMs: z.number().int().positive().default(DEFAULT_TIMEOUT_MS),
});

export type SendgridConfig = z.infer<typeof SendgridConfigSchema>;

export const AccountConfigSchema = z.object({
  name: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export type AccountConfig = z.infer<typeof AccountConfigSchema>;

export const AccountsConfigSchema = z.array(AccountConfigSchema).min(1);

// ---------------------------------------------------------------------------
// Shared params
// ---------------------------------------------------------------------------

export const SuppressionListParamsSchema = z.object({
  startTime: z.number().int().optional(),
  endTime: z.number().int().optional(),
  limit: z.number().int().positive().max(500).optional(),
  offset: z.number().int().nonnegative().optional(),
  email: z.string().email().optional(),
});

export type SuppressionListParams = z.infer<typeof SuppressionListParamsSchema>;

/**
 * Which accounts a destructive operation targets. Exactly one of `account`
 * or `allAccounts` must be provided; there is deliberately no default.
 */
export interface AccountScope {
  account?: string;
  allAccounts?: boolean;
}

// ---------------------------------------------------------------------------
// Email Activity — GET /v3/messages
// ---------------------------------------------------------------------------

export const EmailMessageSchema = z
  .object({
    from_email: z.string().optional(),
    msg_id: z.string().optional(),
    subject: z.string().optional(),
    to_email: z.string().optional(),
    status: z.string().optional(),
    reason: z.string().optional(),
    opens_count: z.number().optional(),
    clicks_count: z.number().optional(),
    last_event_time: z.string().optional(),
  })
  .passthrough();

export const MessageEventSchema = z
  .object({
    event_name: z.string().optional(),
    processed: z.string().optional(),
    reason: z.string().optional(),
  })
  .passthrough();

export const MessageDetailSchema = EmailMessageSchema.extend({
  events: z.array(MessageEventSchema).optional(),
});

export type MessageDetail = z.infer<typeof MessageDetailSchema>;

export type EmailMessage = z.infer<typeof EmailMessageSchema>;

// ---------------------------------------------------------------------------
// Blocks — /v3/suppression/blocks
// ---------------------------------------------------------------------------

export const BlockSchema = z
  .object({
    created: z.number(),
    email: z.string(),
    reason: z.string(),
    status: z.string().optional(),
  })
  .passthrough();

export type Block = z.infer<typeof BlockSchema>;

// ---------------------------------------------------------------------------
// Bounces — /v3/suppression/bounces
// ---------------------------------------------------------------------------

export const BounceSchema = z
  .object({
    created: z.union([z.number(), z.string()]),
    email: z.string(),
    reason: z.string(),
    status: z.string().optional(),
  })
  .passthrough();

export type Bounce = z.infer<typeof BounceSchema>;

// ---------------------------------------------------------------------------
// Spam Reports — /v3/suppression/spam_reports
// ---------------------------------------------------------------------------

export const SpamReportSchema = z
  .object({
    created: z.number(),
    email: z.string(),
    ip: z.string().optional(),
  })
  .passthrough();

export type SpamReport = z.infer<typeof SpamReportSchema>;

// ---------------------------------------------------------------------------
// Invalid Emails — /v3/suppression/invalid_emails
// ---------------------------------------------------------------------------

export const InvalidEmailSchema = z
  .object({
    created: z.number(),
    email: z.string(),
    reason: z.string(),
  })
  .passthrough();

export type InvalidEmail = z.infer<typeof InvalidEmailSchema>;

// ---------------------------------------------------------------------------
// Global Suppressions — /v3/asm/suppressions/global/{email}
// ---------------------------------------------------------------------------

export const GlobalSuppressionSchema = z
  .object({
    recipient_email: z.string(),
  })
  .passthrough();

export type GlobalSuppression = z.infer<typeof GlobalSuppressionSchema>;

// ---------------------------------------------------------------------------
// Unsubscribe (ASM) Groups — /v3/asm/groups, /v3/asm/suppressions/{email}
// ---------------------------------------------------------------------------

export const AsmGroupSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    description: z.string().optional(),
    is_default: z.boolean().optional(),
    unsubscribes: z.number().optional(),
  })
  .passthrough();

export type AsmGroup = z.infer<typeof AsmGroupSchema>;

/** One row from GET /v3/asm/suppressions/{email}: every group plus a `suppressed` flag. */
export const AsmSuppressionSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    description: z.string().optional(),
    is_default: z.boolean().optional(),
    suppressed: z.boolean(),
  })
  .passthrough();

export type AsmSuppression = z.infer<typeof AsmSuppressionSchema>;

// ---------------------------------------------------------------------------
// Multi-account result wrapper
// ---------------------------------------------------------------------------

export type MultiAccountResult<T> = {
  account: string;
  data: T;
  error?: SerializedError;
};

// ---------------------------------------------------------------------------
// Diagnose report
// ---------------------------------------------------------------------------

export const SUPPRESSION_LISTS = [
  "blocks",
  "bounces",
  "spamReports",
  "invalidEmails",
  "globalSuppression",
  "unsubscribeGroups",
] as const;

export type SuppressionList = (typeof SUPPRESSION_LISTS)[number];

export type DiagnoseSource = "messages" | SuppressionList;

/** A per-source failure inside one account's diagnosis. */
export type DiagnoseSourceError = {
  source: DiagnoseSource;
  error: SerializedError;
};

export type AccountDiagnosis = {
  /** Recent messages to this address. Empty when none, or when `errors` names `messages`. */
  messages: EmailMessage[];
  blocks: Block[];
  bounces: Bounce[];
  spamReports: SpamReport[];
  invalidEmails: InvalidEmail[];
  globalSuppression: GlobalSuppression | null;
  /** Unsubscribe groups the address is suppressed in (only `suppressed: true` rows). */
  unsubscribeGroups: AsmSuppression[];
  /** Sources that could not be queried. Consumers must treat these as "unknown", not "clean". */
  errors: DiagnoseSourceError[];
  summary: {
    /** True when the address appears on at least one suppression list in this account. */
    suppressed: boolean;
    /** Which lists the address appears on. */
    suppressedIn: SuppressionList[];
    /** False when the Email Activity source failed (e.g. add-on not enabled). */
    messagesAvailable: boolean;
    messageCount: number;
    /** Count of messages whose status is not delivered/processed. */
    failedMessageCount: number;
  };
};

export type DiagnoseReport = {
  email: string;
  /** Look-back window applied to the Email Activity search (0 = unbounded). */
  activityWindowDays: number;
  accounts: MultiAccountResult<AccountDiagnosis | null>[];
};

// ---------------------------------------------------------------------------
// Clear suppressions report
// ---------------------------------------------------------------------------

export type ClearActionStatus = "removed" | "would_remove" | "failed";

export type ClearAction = {
  list: SuppressionList;
  /** Set for `unsubscribeGroups` actions. */
  groupId?: number;
  groupName?: string;
  status: ClearActionStatus;
  error?: SerializedError;
};

export type AccountClearResult = {
  actions: ClearAction[];
  /** Lists that could not be checked; nothing was attempted for them. */
  errors: DiagnoseSourceError[];
};

export type ClearReport = {
  email: string;
  dryRun: boolean;
  accounts: MultiAccountResult<AccountClearResult | null>[];
};

// ---------------------------------------------------------------------------
// Error response schemas (SendGrid uses varying shapes)
// ---------------------------------------------------------------------------

export const ErrorResponseSchema = z.object({
  errors: z.array(
    z.object({
      message: z.string(),
      field: z.string().nullable().optional(),
    }),
  ),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
