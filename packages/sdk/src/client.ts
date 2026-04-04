import type {
  SendgridConfig,
  EmailMessage,
  MessageDetail,
  Block,
  Bounce,
  SpamReport,
  InvalidEmail,
  GlobalSuppression,
  SuppressionListParams,
} from "./types.js";
import { SendgridConfigSchema, ErrorResponseSchema, MessageDetailSchema } from "./types.js";
import { SendgridError, SendgridAuthError } from "./errors.js";

export class SendgridClient {
  private readonly config: SendgridConfig;

  constructor(config: Partial<SendgridConfig> & { apiKey: string }) {
    this.config = SendgridConfigSchema.parse(config);
  }

  // -------------------------------------------------------------------------
  // HTTP helpers
  // -------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string | number | undefined>;
    },
  ): Promise<T> {
    let url = `${this.config.baseUrl}${path}`;

    if (options?.params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          searchParams.set(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 204) return undefined as T;

    if (!res.ok) {
      if (res.status === 401) throw new SendgridAuthError();

      const errorBody = await res.json().catch(() => null);
      const parsed = ErrorResponseSchema.safeParse(errorBody);

      throw new SendgridError(
        parsed.success ? parsed.data.errors.map((e) => e.message).join("; ") : `HTTP ${res.status}`,
        "API_ERROR",
        res.status,
      );
    }

    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Email Activity — GET /v3/messages
  // -------------------------------------------------------------------------

  async getMessages(query?: string, limit = 10): Promise<EmailMessage[]> {
    const result = await this.request<{ messages: EmailMessage[] }>("GET", "/v3/messages", {
      params: { query, limit },
    });
    return result.messages ?? [];
  }

  async getMessageDetail(msgId: string): Promise<MessageDetail> {
    const raw = await this.request<unknown>("GET", `/v3/messages/${encodeURIComponent(msgId)}`);
    return MessageDetailSchema.parse(raw);
  }

  // -------------------------------------------------------------------------
  // Blocks — /v3/suppression/blocks
  // -------------------------------------------------------------------------

  async getBlocks(params?: SuppressionListParams): Promise<Block[]> {
    return this.request<Block[]>("GET", "/v3/suppression/blocks", {
      params: params
        ? {
            start_time: params.startTime,
            end_time: params.endTime,
            limit: params.limit,
            offset: params.offset,
            email: params.email,
          }
        : undefined,
    });
  }

  async deleteBlock(email: string): Promise<void> {
    await this.request("DELETE", `/v3/suppression/blocks/${encodeURIComponent(email)}`);
  }

  // -------------------------------------------------------------------------
  // Bounces — /v3/suppression/bounces
  // -------------------------------------------------------------------------

  async getBounces(params?: SuppressionListParams): Promise<Bounce[]> {
    return this.request<Bounce[]>("GET", "/v3/suppression/bounces", {
      params: params
        ? {
            start_time: params.startTime,
            end_time: params.endTime,
            limit: params.limit,
            offset: params.offset,
            email: params.email,
          }
        : undefined,
    });
  }

  async deleteBounce(email: string): Promise<void> {
    await this.request("DELETE", `/v3/suppression/bounces/${encodeURIComponent(email)}`);
  }

  // -------------------------------------------------------------------------
  // Spam Reports — /v3/suppression/spam_reports
  // -------------------------------------------------------------------------

  async getSpamReports(params?: SuppressionListParams): Promise<SpamReport[]> {
    return this.request<SpamReport[]>("GET", "/v3/suppression/spam_reports", {
      params: params
        ? {
            start_time: params.startTime,
            end_time: params.endTime,
            limit: params.limit,
            offset: params.offset,
            email: params.email,
          }
        : undefined,
    });
  }

  // -------------------------------------------------------------------------
  // Invalid Emails — /v3/suppression/invalid_emails
  // -------------------------------------------------------------------------

  async getInvalidEmails(params?: SuppressionListParams): Promise<InvalidEmail[]> {
    return this.request<InvalidEmail[]>("GET", "/v3/suppression/invalid_emails", {
      params: params
        ? {
            start_time: params.startTime,
            end_time: params.endTime,
            limit: params.limit,
            offset: params.offset,
            email: params.email,
          }
        : undefined,
    });
  }

  // -------------------------------------------------------------------------
  // Global Suppressions — /v3/asm/suppressions/global/{email}
  // -------------------------------------------------------------------------

  async checkGlobalSuppression(email: string): Promise<GlobalSuppression | null> {
    try {
      const result = await this.request<{ recipient_email: string }>(
        "GET",
        `/v3/asm/suppressions/global/${encodeURIComponent(email)}`,
      );
      return result.recipient_email ? result : null;
    } catch (err) {
      if (err instanceof SendgridError && err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }
}
