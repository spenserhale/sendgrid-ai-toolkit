import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Find the nearest .env file by walking up from `startDir`.
 */
function findEnvFile(startDir: string): string | null {
  let dir = resolve(startDir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Parse a .env file into key-value pairs.
 * Handles comments, empty lines, and single/double quoted values.
 */
function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip matching quotes
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

let loaded = false;

/**
 * Load the nearest .env file into process.env (once).
 * Does not overwrite existing env vars.
 */
export function loadEnv(startDir?: string): void {
  if (loaded) return;
  loaded = true;

  const envPath = findEnvFile(startDir ?? process.cwd());
  if (!envPath) return;

  const entries = parseEnv(readFileSync(envPath, "utf-8"));
  for (const [key, value] of Object.entries(entries)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
