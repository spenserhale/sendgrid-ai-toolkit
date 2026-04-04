import type { SendgridConfig, AccountConfig } from "./types.js";
import { AccountsConfigSchema } from "./types.js";
import { SendgridError } from "./errors.js";
import { loadEnv } from "./env.js";

/**
 * Resolve a single-client configuration from environment variables.
 */
export function resolveConfig(overrides: Partial<SendgridConfig> = {}): SendgridConfig {
  loadEnv();
  return {
    apiKey: overrides.apiKey ?? process.env.SENDGRID_API_KEY ?? "",
    baseUrl: overrides.baseUrl ?? process.env.SENDGRID_BASE_URL ?? "https://api.sendgrid.com",
  };
}

/**
 * Resolve multi-account configuration from environment variables.
 *
 * Priority:
 * 1. SENDGRID_ACCOUNTS — JSON array of { name, apiKey, baseUrl? }
 * 2. SENDGRID_API_KEY  — single account named "default"
 */
export function resolveAccounts(overrides?: AccountConfig[]): AccountConfig[] {
  if (overrides) return overrides;
  loadEnv();

  const accountsJson = process.env.SENDGRID_ACCOUNTS;
  if (accountsJson) {
    try {
      const parsed = JSON.parse(accountsJson);
      return AccountsConfigSchema.parse(parsed);
    } catch (err) {
      throw new SendgridError(
        `Failed to parse SENDGRID_ACCOUNTS: ${err instanceof Error ? err.message : String(err)}`,
        "CONFIG_ERROR",
      );
    }
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  if (apiKey) {
    return [
      {
        name: "default",
        apiKey,
        baseUrl: process.env.SENDGRID_BASE_URL,
      },
    ];
  }

  throw new SendgridError(
    "No accounts configured. Set SENDGRID_ACCOUNTS or SENDGRID_API_KEY.",
    "CONFIG_ERROR",
  );
}
