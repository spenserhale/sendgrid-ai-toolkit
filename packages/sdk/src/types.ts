import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const SendgridConfigSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  baseUrl: z.string().url().default("https://api.sendgrid.com"),
});

export type SendgridConfig = z.infer<typeof SendgridConfigSchema>;

export const AccountConfigSchema = z.object({
  name: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
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
    created: z.string(),
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
// Multi-account result wrapper
// ---------------------------------------------------------------------------

export type MultiAccountResult<T> = {
  account: string;
  data: T;
  error?: string;
};

// ---------------------------------------------------------------------------
// Diagnose report
// ---------------------------------------------------------------------------

export type AccountDiagnosis = {
  messages: EmailMessage[];
  blocks: Block[];
  bounces: Bounce[];
  spamReports: SpamReport[];
  invalidEmails: InvalidEmail[];
  globalSuppression: GlobalSuppression | null;
};

export type DiagnoseReport = {
  email: string;
  accounts: MultiAccountResult<AccountDiagnosis | null>[];
};

// ---------------------------------------------------------------------------
// Error response schemas (SendGrid uses varying shapes)
// ---------------------------------------------------------------------------

export const ErrorResponseSchema = z.object({
  errors: z.array(
    z.object({
      message: z.string(),
      field: z.string().optional(),
    }),
  ),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
