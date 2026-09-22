import type { SendgridConfig, AccountConfig } from "./types.js";
import { AccountsConfigSchema, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from "./types.js";
import { SendgridError } from "./errors.js";
import { loadEnv } from "./env.js";

export type Env = Record<string, string | undefined>;

/**
 * Environment variables read by the toolkit. Documented here so the CLI's
 * introspection and the README stay in sync with the code.
 */
export const ENVIRONMENT = {
  SENDGRID_ACCOUNTS: 'JSON array of { "name", "apiKey", "baseUrl"?, "timeoutMs"? } (preferred)',
  SENDGRID_API_KEY:
    'Single API key; becomes an account named "default" when SENDGRID_ACCOUNTS is unset',
  SENDGRID_BASE_URL: `API base URL (default ${DEFAULT_BASE_URL})`,
  SENDGRID_TIMEOUT_MS: `Per-request timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS})`,
  SENDGRID_OUTPUT: "Default output format for the CLI and MCP server: text | json | toon",
} as const;

function readTimeout(env: Env): number | undefined {
  const raw = env.SENDGRID_TIMEOUT_MS;
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new SendgridError({
      code: "E_CONFIG",
      message: "SENDGRID_TIMEOUT_MS must be a positive integer (milliseconds)",
      got: raw,
    });
  }
  return n;
}

/**
 * Resolve a single-client configuration from environment variables.
 * Throws E_CONFIG when no API key is available.
 */
export function resolveConfig(
  overrides: Partial<SendgridConfig> = {},
  env: Env = process.env,
): SendgridConfig {
  if (env === process.env) loadEnv();

  const apiKey = overrides.apiKey ?? env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new SendgridError({
      code: "E_CONFIG",
      message: "No API key configured. Set SENDGRID_API_KEY (or use SENDGRID_ACCOUNTS).",
      hint: "Copy .env.example to .env and fill in your keys",
    });
  }

  return {
    apiKey,
    baseUrl: overrides.baseUrl ?? env.SENDGRID_BASE_URL ?? DEFAULT_BASE_URL,
    timeoutMs: overrides.timeoutMs ?? readTimeout(env) ?? DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Resolve multi-account configuration from environment variables.
 *
 * Priority:
 * 1. `overrides` (explicit list, no env lookup)
 * 2. SENDGRID_ACCOUNTS — JSON array of { name, apiKey, baseUrl?, timeoutMs? }
 * 3. SENDGRID_API_KEY  — single account named "default"
 */
export function resolveAccounts(
  overrides?: AccountConfig[],
  env: Env = process.env,
): AccountConfig[] {
  if (overrides) return overrides;
  if (env === process.env) loadEnv();

  const defaultTimeout = readTimeout(env);
  const defaultBaseUrl = env.SENDGRID_BASE_URL;

  const accountsJson = env.SENDGRID_ACCOUNTS;
  if (accountsJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(accountsJson);
    } catch (err) {
      throw new SendgridError({
        code: "E_CONFIG",
        message: `SENDGRID_ACCOUNTS is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        hint: 'Expected e.g. [{"name":"brand-a","apiKey":"SG.xxx"}]',
        cause: err,
      });
    }
    const result = AccountsConfigSchema.safeParse(parsed);
    if (!result.success) {
      throw new SendgridError({
        code: "E_CONFIG",
        message: `SENDGRID_ACCOUNTS is malformed: ${result.error.issues
          .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
          .join("; ")}`,
        hint: 'Expected a non-empty array of {"name","apiKey","baseUrl"?,"timeoutMs"?}',
      });
    }
    const names = new Set<string>();
    for (const acct of result.data) {
      if (names.has(acct.name)) {
        throw new SendgridError({
          code: "E_CONFIG",
          message: `SENDGRID_ACCOUNTS has duplicate account name "${acct.name}"`,
        });
      }
      names.add(acct.name);
    }
    return result.data.map((acct) => ({
      ...acct,
      baseUrl: acct.baseUrl ?? defaultBaseUrl,
      timeoutMs: acct.timeoutMs ?? defaultTimeout,
    }));
  }

  const apiKey = env.SENDGRID_API_KEY;
  if (apiKey) {
    return [{ name: "default", apiKey, baseUrl: defaultBaseUrl, timeoutMs: defaultTimeout }];
  }

  throw new SendgridError({
    code: "E_CONFIG",
    message: "No accounts configured. Set SENDGRID_ACCOUNTS or SENDGRID_API_KEY.",
    hint: "Copy .env.example to .env and fill in your keys",
  });
}
