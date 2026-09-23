#!/usr/bin/env bun
/**
 * Generate the agent skill (sendgrid-cli/SKILL.md) from the live command tree.
 * Run `bun run build:skill` after changing any command; CI fails if it drifts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EXIT_CODES } from "@sendgrid-toolkit/sdk";
import { app } from "../src/app.js";
import { buildAgentContext, REPO } from "../src/agent-context.js";
import { flattenCommands, type CommandDescription } from "../src/lib/introspect.js";
import { CLI_NAME, CLI_VERSION } from "../src/version.js";

const out = resolve(import.meta.dirname, "..", "..", "..", "sendgrid-cli", "SKILL.md");
const ctx = buildAgentContext(app.root);

function flagLine(name: string, f: NonNullable<CommandDescription["flags"]>[string]): string {
  const values = f.values ? ` <${f.values.join("|")}>` : f.type === "string" ? " <value>" : "";
  const dflt =
    f.default !== undefined && f.default !== false ? ` (default ${String(f.default)})` : "";
  const variadic = f.variadic ? " (repeatable)" : "";
  return `- \`${name}${values}\`${variadic}${dflt} — ${f.brief}`;
}

const SHARED_FLAGS = new Set([
  "--format",
  "--text",
  "--json",
  "--toon",
  "--account",
  "--all-accounts",
  "--dry-run",
]);

const DESCRIPTION =
  `Reference for the \`${CLI_NAME}\` CLI (from ${REPO}, installed on this machine), which investigates and fixes email deliverability for one address across several SendGrid accounts at once. ` +
  "Trigger whenever the user asks why someone is not receiving email, mentions SendGrid bounces, blocks, spam reports, suppressions, unsubscribes, or wants to search SendGrid email activity — even if they do not name the CLI. " +
  "Prefer it over hand-rolling curl against api.sendgrid.com: it handles multi-account fan-out, auth, time-boxed activity queries, and safe destructive scoping.";

function md(): string {
  const L: string[] = [];
  L.push("---");
  L.push(`name: ${CLI_NAME}-cli`);
  // Double-quoted YAML scalar: the description contains ": " which would
  // otherwise be parsed as a nested mapping. JSON string syntax is valid YAML.
  L.push(`description: ${JSON.stringify(DESCRIPTION)}`);
  L.push("---");
  L.push("");
  L.push(`# ${CLI_NAME} CLI`);
  L.push("");
  L.push(`Version ${CLI_VERSION}. ${ctx.purpose}`);
  L.push("");
  L.push("## Start here");
  L.push("");
  L.push("```bash");
  for (const step of ctx.workflow) L.push(step);
  L.push("```");
  L.push("");
  L.push("Run `sendgrid agent-context` for the full machine-readable schema (JSON by default).");
  L.push("");
  L.push("## Output");
  L.push("");
  L.push(
    `Formats: ${ctx.output.formats.map((f) => `\`${f}\``).join(", ")}. Default \`${ctx.output.default}\`; ${ctx.output.env}. Use \`--toon\` when you are the consumer (fewest tokens), \`--json\` when piping to another program.`,
  );
  L.push("");
  L.push("## Scope and safety");
  L.push("");
  L.push(`- ${ctx.scope.read}`);
  L.push(`- ${ctx.scope.write}`);
  L.push(`- ${ctx.scope.dry_run}`);
  L.push("");
  L.push("## Configuration");
  L.push("");
  for (const [k, v] of Object.entries(ctx.environment)) L.push(`- \`${k}\` — ${v}`);
  L.push("");
  L.push("## Exit codes");
  L.push("");
  const byCode = new Map<number, string[]>();
  for (const [code, exit] of Object.entries(EXIT_CODES)) {
    byCode.set(exit, [...(byCode.get(exit) ?? []), code]);
  }
  for (const [exit, codes] of [...byCode.entries()].sort((a, b) => a[0] - b[0])) {
    L.push(`- \`${exit}\` — ${codes.join(", ")}`);
  }
  L.push("");
  L.push("Fan-out results are `{ account, data, error? }[]`. " + ctx.quirks[0]!);
  L.push("");
  L.push("## Quirks worth knowing");
  L.push("");
  for (const q of ctx.quirks.slice(1)) L.push(`- ${q}`);
  L.push("");
  L.push("## Shared flags");
  L.push("");
  L.push("Most commands accept these; they are omitted from the per-command lists below.");
  L.push("");
  L.push("- `--format <text|json|toon>`, `--text`, `--json`, `--toon` — output format");
  L.push(
    "- `--account <name>` — narrow to one account (read commands: optional; write commands: required unless `--all-accounts`)",
  );
  L.push("- `--all-accounts` — write commands only: target every account");
  L.push("- `--dry-run` — write commands only: print the plan, change nothing");
  L.push("");
  L.push("## Commands");
  L.push("");
  for (const { path, command } of flattenCommands(ctx.commands)) {
    const positional = (command.positional ?? []).map((p) => ` <${p.name}>`).join("");
    L.push(
      `### \`${CLI_NAME} ${path.join(" ")}${positional}\`${command.mutates ? " (write)" : ""}`,
    );
    L.push("");
    L.push(command.description ?? command.brief);
    L.push("");
    const own = Object.entries(command.flags ?? {}).filter(([n]) => !SHARED_FLAGS.has(n));
    if (own.length > 0) {
      for (const [name, f] of own) L.push(flagLine(name, f));
      L.push("");
    }
  }
  L.push("## Install / update");
  L.push("");
  L.push("```bash");
  L.push(`curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh | sh`);
  L.push(`${CLI_NAME} upgrade --check`);
  L.push("```");
  return L.join("\n");
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${md()}\n`);
console.log(`wrote ${out}`);
