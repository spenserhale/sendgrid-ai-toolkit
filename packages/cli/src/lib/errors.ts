import {
  isSendgridError,
  type MultiAccountResult,
  type SendgridError,
} from "@sendgrid-toolkit/sdk";

export interface FormattedError {
  text: string;
  exitCode: number;
}

export function formatError(err: unknown): FormattedError {
  if (isSendgridError(err)) return formatSendgridError(err);
  if (err instanceof Error) return { text: `error: ${err.message}`, exitCode: 1 };
  return { text: `error: ${String(err)}`, exitCode: 1 };
}

function formatSendgridError(err: SendgridError): FormattedError {
  const parts: string[] = [`error[${err.code}]: ${err.message}`];
  if (err.got !== undefined) parts.push(`  got: "${err.got}"`);
  if (err.validValues && err.validValues.length > 0) {
    parts.push(`  valid: ${err.validValues.join(", ")}`);
  }
  if (err.hint) parts.push(`  hint: ${err.hint}`);
  return { text: parts.join("\n"), exitCode: err.exitCode };
}

export function exitOnError(err: unknown, exitFn: (code: number) => never = process.exit): never {
  const { text, exitCode } = formatError(err);
  process.stderr.write(`${text}\n`);
  return exitFn(exitCode);
}

/** Run a command body; any thrown error becomes a formatted stderr line + enumerated exit code. */
export async function runCommand<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    exitOnError(err);
  }
}

/**
 * Fan-out semantics: partial failure is reported inline and exits 0 (the
 * caller still got data from the other accounts). When *every* account failed
 * there is nothing useful in the output, so exit with the first error's code.
 */
export function exitCodeForResults(results: MultiAccountResult<unknown>[]): number {
  if (results.length === 0) return 0;
  const failures = results.filter((r) => r.error);
  if (failures.length < results.length) return 0;
  return failures[0]?.error?.exitCode ?? 1;
}

/** Exit non-zero (after output has been written) when every account failed. */
export function exitIfAllFailed(results: MultiAccountResult<unknown>[]): void {
  const code = exitCodeForResults(results);
  if (code !== 0) {
    process.stderr.write("error: every account failed; see per-account errors above\n");
    process.exit(code);
  }
}
