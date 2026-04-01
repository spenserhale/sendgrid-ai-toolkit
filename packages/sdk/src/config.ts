import type { SendgridConfig } from "./types.js";

/**
 * Resolve configuration from environment variables.
 * Useful for both CLI and MCP contexts.
 */
export function resolveConfig(
  overrides: Partial<SendgridConfig> = {}
): SendgridConfig {
  return {
    apiKey: overrides.apiKey ?? process.env.SENDGRID_API_KEY ?? "",
    baseUrl:
      overrides.baseUrl ??
      process.env.SENDGRID_BASE_URL ??
      "https://api.sendgrid.com",
  };
}
