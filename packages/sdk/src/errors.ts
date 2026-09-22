export const ErrorCode = {
  E_NETWORK: "E_NETWORK",
  E_TIMEOUT: "E_TIMEOUT",
  E_API: "E_API",
  E_PARSE: "E_PARSE",
  E_VALIDATION: "E_VALIDATION",
  E_CONFIG: "E_CONFIG",
  E_NOT_FOUND: "E_NOT_FOUND",
  E_AUTH: "E_AUTH",
  E_RATE_LIMIT: "E_RATE_LIMIT",
  E_DRY_RUN: "E_DRY_RUN",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Process exit codes shared across all Toolkits CLIs:
 * network=1, validation=2, config=3, not-found=4, auth=5, rate-limit=6, dry-run=0.
 */
export const EXIT_CODES: Record<ErrorCode, number> = {
  E_DRY_RUN: 0,
  E_NETWORK: 1,
  E_TIMEOUT: 1,
  E_API: 1,
  E_PARSE: 1,
  E_VALIDATION: 2,
  E_CONFIG: 3,
  E_NOT_FOUND: 4,
  E_AUTH: 5,
  E_RATE_LIMIT: 6,
};

export interface SendgridErrorInit {
  code: ErrorCode;
  message: string;
  statusCode?: number;
  hint?: string;
  validValues?: readonly string[];
  got?: string;
  /** Seconds until the caller may retry (from a 429 Retry-After header). */
  retryAfterSeconds?: number;
  cause?: unknown;
}

export interface SerializedError {
  code: ErrorCode;
  message: string;
  exitCode: number;
  statusCode?: number;
  hint?: string;
  validValues?: readonly string[];
  got?: string;
  retryAfterSeconds?: number;
}

export class SendgridError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  readonly statusCode?: number;
  readonly hint?: string;
  readonly validValues?: readonly string[];
  readonly got?: string;
  readonly retryAfterSeconds?: number;

  constructor(init: SendgridErrorInit) {
    super(init.message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = "SendgridError";
    this.code = init.code;
    this.exitCode = EXIT_CODES[init.code];
    this.statusCode = init.statusCode;
    this.hint = init.hint;
    this.validValues = init.validValues;
    this.got = init.got;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }

  toJSON(): SerializedError {
    return {
      code: this.code,
      message: this.message,
      exitCode: this.exitCode,
      statusCode: this.statusCode,
      hint: this.hint,
      validValues: this.validValues,
      got: this.got,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }
}

export class SendgridAuthError extends SendgridError {
  constructor(message = "Authentication failed. Check your API key.", statusCode = 401) {
    super({
      code: "E_AUTH",
      message,
      statusCode,
      hint: "Verify the API key has the required scopes (suppressions, email activity, ASM).",
    });
    this.name = "SendgridAuthError";
  }
}

export class SendgridNotFoundError extends SendgridError {
  constructor(message = "Resource not found") {
    super({ code: "E_NOT_FOUND", message, statusCode: 404 });
    this.name = "SendgridNotFoundError";
  }
}

export class SendgridRateLimitError extends SendgridError {
  constructor(retryAfterSeconds?: number) {
    super({
      code: "E_RATE_LIMIT",
      message: "SendGrid rate limit exceeded (HTTP 429)",
      statusCode: 429,
      retryAfterSeconds,
      hint:
        retryAfterSeconds !== undefined
          ? `Retry after ${retryAfterSeconds}s`
          : "Retry after a short delay",
    });
    this.name = "SendgridRateLimitError";
  }
}

export class SendgridTimeoutError extends SendgridError {
  constructor(timeoutMs: number, method: string, path: string) {
    super({
      code: "E_TIMEOUT",
      message: `Request timed out after ${timeoutMs}ms: ${method} ${path}`,
      hint: "Raise SENDGRID_TIMEOUT_MS or check network connectivity",
    });
    this.name = "SendgridTimeoutError";
  }
}

export function isSendgridError(value: unknown): value is SendgridError {
  return value instanceof SendgridError;
}

/**
 * Convert any thrown value into a plain, JSON-safe error record.
 * Used when fanning out across accounts so callers get structured errors.
 */
export function serializeError(err: unknown): SerializedError {
  if (isSendgridError(err)) return err.toJSON();
  const message = err instanceof Error ? err.message : String(err);
  return { code: "E_API", message, exitCode: EXIT_CODES.E_API };
}
