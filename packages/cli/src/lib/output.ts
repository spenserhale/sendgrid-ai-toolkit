import { encode } from "@toon-format/toon";
import { SendgridError } from "@sendgrid-toolkit/sdk";

/**
 * Output formats:
 * - text  — human-readable, per-command layout (default)
 * - json  — pretty JSON, for integrations
 * - toon  — Token-Oriented Object Notation, for coding agents
 */
export const OUTPUT_FORMATS = ["text", "json", "toon"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export interface FormatFlags {
  readonly format?: OutputFormat;
  readonly text?: boolean;
  readonly json?: boolean;
  readonly toon?: boolean;
}

export function isOutputFormat(value: unknown): value is OutputFormat {
  return typeof value === "string" && (OUTPUT_FORMATS as readonly string[]).includes(value);
}

/**
 * Precedence: --format <f> and the --text/--json/--toon shortcuts (mutually
 * exclusive), then SENDGRID_OUTPUT, then "text".
 */
export function resolveFormat(
  flags: FormatFlags,
  env: Record<string, string | undefined> = process.env,
): OutputFormat {
  const picked = new Set<OutputFormat>();
  if (flags.format) picked.add(flags.format);
  for (const f of OUTPUT_FORMATS) if (flags[f]) picked.add(f);

  if (picked.size > 1) {
    throw new SendgridError({
      code: "E_VALIDATION",
      message: `Only one output format may be set (got: ${[...picked].join(", ")})`,
      validValues: OUTPUT_FORMATS,
      hint: "Use --format <text|json|toon>, or exactly one of --text / --json / --toon",
    });
  }
  const fromFlags = [...picked][0];
  if (fromFlags) return fromFlags;

  const fromEnv = env.SENDGRID_OUTPUT?.toLowerCase();
  if (fromEnv) {
    if (!isOutputFormat(fromEnv)) {
      throw new SendgridError({
        code: "E_CONFIG",
        message: "SENDGRID_OUTPUT has an unknown format",
        got: fromEnv,
        validValues: OUTPUT_FORMATS,
      });
    }
    return fromEnv;
  }
  return "text";
}

export interface Renderers {
  /** Human layout. Required because text is the default format. */
  text: () => string;
}

export function renderOutput(data: unknown, format: OutputFormat, renderers: Renderers): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2);
    case "toon":
      return encode(data);
    case "text":
      return renderers.text();
  }
}

/** Resolve format, render, and write to stdout. */
export function emit(data: unknown, flags: FormatFlags, renderers: Renderers): void {
  const output = renderOutput(data, resolveFormat(flags), renderers);
  process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
}
