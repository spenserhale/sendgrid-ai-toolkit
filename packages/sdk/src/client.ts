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
  AsmGroup,
  AsmSuppression,
} from "./types.js";
import { SendgridConfigSchema, ErrorResponseSchema, MessageDetailSchema } from "./types.js";
import {
  SendgridError,
  SendgridAuthError,
  SendgridNotFoundError,
  SendgridRateLimitError,
  SendgridTimeoutError,
} from "./errors.js";

type QueryParams = Record<string, string | number | undefined>;

export class SendgridClient {
  private readonly config: SendgridConfig;

  constructor(config: Partial<SendgridConfig> & { apiKey: string }) {
    const parsed = SendgridConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new SendgridError({
        code: "E_CONFIG",
        message: `Invalid SendGrid client config: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      });
    }
    this.config = parsed.data;
  }

  // -------------------------------------------------------------------------
  // HTTP helpers
  // -------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    options?: { body?: unknown; params?: QueryParams },
  ): Promise<T> {
    let url = `${this.config.baseUrl}${path}`;

    if (options?.params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) searchParams.set(key, String(value));
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (isAbortError(err)) {
        throw new SendgridTimeoutError(this.config.timeoutMs, method, path);
      }
      throw new SendgridError({
        code: "E_NETWORK",
        message: `Network error: ${method} ${path}: ${err instanceof Error ? err.message : String(err)}`,
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) throw await this.toError(res, method, path);

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new SendgridError({
        code: "E_PARSE",
        message: `Invalid JSON in response: ${method} ${path}`,
        statusCode: res.status,
        cause: err,
      });
    }
  }

  private async toError(res: Response, method: string, path: string): Promise<SendgridError> {
    const detail = await readErrorMessage(res);
    const suffix = detail ? `: ${detail}` : "";

    switch (res.status) {
      case 401:
        return new SendgridAuthError(`Authentication failed${suffix}`, 401);
      case 403:
        return new SendgridAuthError(`Forbidden (missing scope?)${suffix}`, 403);
      case 404:
        return new SendgridNotFoundError(`Not found: ${method} ${path}${suffix}`);
      case 429:
        return new SendgridRateLimitError(parseRetryAfter(res.headers.get("retry-after")));
      default:
        return new SendgridError({
          code: "E_API",
          message: `HTTP ${res.status} ${method} ${path}${suffix}`,
          statusCode: res.status,
        });
    }
  }

  // -------------------------------------------------------------------------
  // Email Activity — GET /v3/messages (requires the Email Activity add-on)
  // -------------------------------------------------------------------------

  async getMessages(query?: string, limit = 20): Promise<EmailMessage[]> {
    const result = await this.request<{ messages?: EmailMessage[] } | undefined>(
      "GET",
      "/v3/messages",
      { params: { query, limit } },
    );
    return result?.messages ?? [];
  }

  async getMessageDetail(msgId: string): Promise<MessageDetail> {
    const raw = await this.request<unknown>("GET", `/v3/messages/${encodeURIComponent(msgId)}`);
    const parsed = MessageDetailSchema.safeParse(raw);
    if (!parsed.success) {
      throw new SendgridError({
        code: "E_PARSE",
        message: `Unexpected message detail shape for ${msgId}: ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  // -------------------------------------------------------------------------
  // Suppression lists — /v3/suppression/{blocks,bounces,spam_reports,invalid_emails}
  // -------------------------------------------------------------------------

  async getBlocks(params?: SuppressionListParams): Promise<Block[]> {
    return this.listSuppression<Block>("/v3/suppression/blocks", params);
  }

  /** Single block entry, or null when the address is not blocked. */
  async getBlock(email: string): Promise<Block | null> {
    return this.getOneSuppression<Block>("/v3/suppression/blocks", email);
  }

  async deleteBlock(email: string): Promise<void> {
    await this.request("DELETE", `/v3/suppression/blocks/${encodeURIComponent(email)}`);
  }

  async getBounces(params?: SuppressionListParams): Promise<Bounce[]> {
    return this.listSuppression<Bounce>("/v3/suppression/bounces", params);
  }

  /** Single bounce entry, or null when the address has not bounced. */
  async getBounce(email: string): Promise<Bounce | null> {
    return this.getOneSuppression<Bounce>("/v3/suppression/bounces", email);
  }

  async deleteBounce(email: string): Promise<void> {
    await this.request("DELETE", `/v3/suppression/bounces/${encodeURIComponent(email)}`);
  }

  async getSpamReports(params?: SuppressionListParams): Promise<SpamReport[]> {
    return this.listSuppression<SpamReport>("/v3/suppression/spam_reports", params);
  }

  async deleteSpamReport(email: string): Promise<void> {
    await this.request("DELETE", `/v3/suppression/spam_reports/${encodeURIComponent(email)}`);
  }

  async getInvalidEmails(params?: SuppressionListParams): Promise<InvalidEmail[]> {
    return this.listSuppression<InvalidEmail>("/v3/suppression/invalid_emails", params);
  }

  async deleteInvalidEmail(email: string): Promise<void> {
    await this.request("DELETE", `/v3/suppression/invalid_emails/${encodeURIComponent(email)}`);
  }

  /** GET /v3/suppression/{list}/{email}: SendGrid returns a one-element array, or [] / 404. */
  private async getOneSuppression<T>(path: string, email: string): Promise<T | null> {
    try {
      const result = await this.request<T[] | undefined>(
        "GET",
        `${path}/${encodeURIComponent(email)}`,
      );
      return result?.[0] ?? null;
    } catch (err) {
      if (err instanceof SendgridNotFoundError) return null;
      throw err;
    }
  }

  private async listSuppression<T>(path: string, params?: SuppressionListParams): Promise<T[]> {
    const result = await this.request<T[] | undefined>("GET", path, {
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
    return result ?? [];
  }

  // -------------------------------------------------------------------------
  // Global Suppressions — /v3/asm/suppressions/global/{email}
  // -------------------------------------------------------------------------

  /** Returns the suppression record, or null when the address is not globally suppressed. */
  async checkGlobalSuppression(email: string): Promise<GlobalSuppression | null> {
    let result: Partial<GlobalSuppression> | undefined;
    try {
      result = await this.request<Partial<GlobalSuppression> | undefined>(
        "GET",
        `/v3/asm/suppressions/global/${encodeURIComponent(email)}`,
      );
    } catch (err) {
      if (err instanceof SendgridNotFoundError) return null;
      throw err;
    }
    // SendGrid returns 200 with `{}` when not suppressed, `{recipient_email}` when suppressed.
    return result?.recipient_email ? (result as GlobalSuppression) : null;
  }

  /** Add addresses to the global unsubscribe list. Returns the addresses SendGrid accepted. */
  async addGlobalSuppressions(emails: string[]): Promise<string[]> {
    const result = await this.request<{ recipient_emails?: string[] } | undefined>(
      "POST",
      "/v3/asm/suppressions/global",
      { body: { recipient_emails: emails } },
    );
    return result?.recipient_emails ?? [];
  }

  async deleteGlobalSuppression(email: string): Promise<void> {
    await this.request("DELETE", `/v3/asm/suppressions/global/${encodeURIComponent(email)}`);
  }

  // -------------------------------------------------------------------------
  // Unsubscribe (ASM) Groups — /v3/asm/groups, /v3/asm/suppressions/{email}
  // -------------------------------------------------------------------------

  async getUnsubscribeGroups(): Promise<AsmGroup[]> {
    const result = await this.request<AsmGroup[] | undefined>("GET", "/v3/asm/groups");
    return result ?? [];
  }

  /** All groups for the account, each flagged `suppressed` for this address. */
  async getUnsubscribeGroupStatus(email: string): Promise<AsmSuppression[]> {
    const result = await this.request<{ suppressions?: AsmSuppression[] } | undefined>(
      "GET",
      `/v3/asm/suppressions/${encodeURIComponent(email)}`,
    );
    return result?.suppressions ?? [];
  }

  /** Only the groups this address is unsubscribed from. */
  async getUnsubscribedGroups(email: string): Promise<AsmSuppression[]> {
    const all = await this.getUnsubscribeGroupStatus(email);
    return all.filter((g) => g.suppressed);
  }

  async deleteUnsubscribeGroupSuppression(groupId: number, email: string): Promise<void> {
    await this.request(
      "DELETE",
      `/v3/asm/groups/${encodeURIComponent(String(groupId))}/suppressions/${encodeURIComponent(email)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      err instanceof DOMException &&
      err.name === "AbortError")
  );
}

async function readErrorMessage(res: Response): Promise<string | undefined> {
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  try {
    const parsed = ErrorResponseSchema.safeParse(JSON.parse(text));
    if (parsed.success) {
      return parsed.data.errors
        .map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
        .join("; ");
    }
  } catch {
    // fall through to raw text
  }
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}
