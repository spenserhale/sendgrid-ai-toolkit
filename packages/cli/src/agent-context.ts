import { ENVIRONMENT, ErrorCode, EXIT_CODES } from "@sendgrid-toolkit/sdk";
import { describeTree, type CommandTree } from "./lib/introspect.js";
import { OUTPUT_FORMATS } from "./lib/output.js";
import { CLI_NAME, CLI_VERSION } from "./version.js";

export const SCHEMA_VERSION = "1";

export interface AgentContext {
  schema_version: string;
  cli: { name: string; version: string; repo: string };
  purpose: string;
  workflow: string[];
  output: {
    formats: readonly string[];
    default: string;
    flags: Record<string, string>;
    env: string;
  };
  scope: {
    read: string;
    write: string;
    dry_run: string;
  };
  exit_codes: Record<string, number>;
  error_codes: readonly string[];
  environment: Record<string, string>;
  quirks: string[];
  commands: CommandTree;
}

export const REPO = "spenserhale/sendgrid-ai-toolkit";

export function buildAgentContext(root: unknown): AgentContext {
  return {
    schema_version: SCHEMA_VERSION,
    cli: { name: CLI_NAME, version: CLI_VERSION, repo: REPO },
    purpose:
      "Investigate and fix email deliverability for one address across every configured SendGrid account (one per brand).",
    workflow: [
      "sendgrid accounts                                  # confirm which accounts are configured",
      "sendgrid diagnose <email> --toon                   # where is this address suppressed? recent activity?",
      "sendgrid clear <email> --all-accounts --dry-run    # preview removals",
      "sendgrid clear <email> --all-accounts              # apply",
    ],
    output: {
      formats: OUTPUT_FORMATS,
      default: "text",
      flags: {
        "--format <text|json|toon>": "Explicit format",
        "--text": "Human layout (default)",
        "--json": "Pretty JSON for integrations",
        "--toon": "TOON for coding agents (fewest tokens); mutually exclusive with the others",
      },
      env: "SENDGRID_OUTPUT sets the default; flags win",
    },
    scope: {
      read: "Read commands query every account unless --account <name> narrows them.",
      write:
        "Write commands (delete, clear, add) require --account <name> OR --all-accounts. Omitting both exits 2. There is no implicit 'everywhere'.",
      dry_run: "Every write command accepts --dry-run and exits 0 with the plan.",
    },
    exit_codes: { ...EXIT_CODES },
    error_codes: Object.keys(ErrorCode),
    environment: { ...ENVIRONMENT },
    quirks: [
      "Fan-out results are arrays of { account, data, error? }. Partial failure exits 0; when every account fails the exit code is the first error's.",
      "Email Activity (messages) needs SendGrid's paid Email Activity History add-on per account. Missing add-on shows as an `errors[]` entry with source 'messages' and summary.messagesAvailable=false, never as zero messages.",
      "Email Activity lookups are windowed to --days (default 30). Unbounded queries time out at SendGrid (HTTP 499).",
      "Unsubscribe group ids differ per account; prefer `clear` over `unsubscribe-groups delete` when targeting several accounts.",
    ],
    commands: describeTree(root),
  };
}
