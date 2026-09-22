import { DEFAULT_ACTIVITY_DAYS } from "@sendgrid-toolkit/sdk";
import { OUTPUT_FORMATS } from "./output.js";

export const formatFlags = {
  format: {
    kind: "enum",
    values: OUTPUT_FORMATS,
    brief: "Output format: text (humans, default), json (integrations), toon (agents)",
    optional: true,
  },
  text: { kind: "boolean", brief: "Shortcut for --format text", default: false },
  json: { kind: "boolean", brief: "Shortcut for --format json", default: false },
  toon: { kind: "boolean", brief: "Shortcut for --format toon", default: false },
} as const;

/** Read commands: optional narrowing to one account; default is every account. */
export const accountFlag = {
  account: {
    kind: "parsed",
    parse: String,
    brief: "Target a single account by name (default: all configured accounts)",
    optional: true,
  },
} as const;

/** Destructive commands: exactly one of these is required. No implicit "everywhere". */
export const scopeFlags = {
  account: {
    kind: "parsed",
    parse: String,
    brief: "Target a single account by name",
    optional: true,
  },
  "all-accounts": {
    kind: "boolean",
    brief: "Target every configured account (required if --account is omitted)",
    default: false,
  },
} as const;

export const dryRunFlag = {
  "dry-run": {
    kind: "boolean",
    brief: "Show what would change; perform no writes",
    default: false,
  },
} as const;

const parsePositiveInt = (s: string): number => {
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`expected a positive integer (got: "${s}")`);
  }
  return n;
};

export const DEFAULT_LIST_LIMIT = 20;

export const limitFlag = {
  limit: {
    kind: "parsed",
    parse: parsePositiveInt,
    brief: `Max results per account (default ${DEFAULT_LIST_LIMIT})`,
    default: String(DEFAULT_LIST_LIMIT),
  },
} as const;

export const daysFlag = {
  days: {
    kind: "parsed",
    parse: (s: string): number => {
      const n = Number(s);
      if (!Number.isInteger(n) || n < 0)
        throw new Error(`expected a whole number of days (got: "${s}")`);
      return n;
    },
    brief: `Email Activity look-back window in days (default ${DEFAULT_ACTIVITY_DAYS}; 0 = unbounded, slow)`,
    default: String(DEFAULT_ACTIVITY_DAYS),
  },
} as const;

export const emailFilterFlag = {
  email: {
    kind: "parsed",
    parse: String,
    brief: "Filter to a single email address",
    optional: true,
  },
} as const;

export interface FormatFlagValues {
  readonly format: (typeof OUTPUT_FORMATS)[number] | undefined;
  readonly text: boolean;
  readonly json: boolean;
  readonly toon: boolean;
}

export interface ScopeFlagValues {
  readonly account: string | undefined;
  readonly "all-accounts": boolean;
}
