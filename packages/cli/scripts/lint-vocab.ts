#!/usr/bin/env bun
/**
 * Vocabulary lint: keeps command verbs and flag names consistent so agents can
 * predict the CLI. Runs against the live route tree; no separate spec to maintain.
 */
import { app } from "../src/app.js";
import { describeTree, flattenCommands } from "../src/lib/introspect.js";

const CANONICAL_LEAF_VERBS = new Set([
  "list",
  "get",
  "check",
  "add",
  "delete",
  "diagnose",
  "clear",
  "messages",
  "accounts",
  "agent-context",
  "upgrade",
]);

const BANNED_FLAGS = new Set([
  "--yes",
  "-y",
  "--output",
  "--no-confirm",
  "--skip-confirmations",
  "--all",
]);

const FORMAT_FLAGS = ["--format", "--text", "--json", "--toon"];

const errors: string[] = [];
const commands = flattenCommands(describeTree(app.root));

for (const { path, command } of commands) {
  const label = path.join(" ");
  const leaf = path[path.length - 1]!;
  if (!CANONICAL_LEAF_VERBS.has(leaf)) {
    errors.push(
      `${label}: leaf "${leaf}" is not a canonical verb (${[...CANONICAL_LEAF_VERBS].join(", ")})`,
    );
  }

  const flags = Object.keys(command.flags ?? {});
  for (const b of BANNED_FLAGS) if (flags.includes(b)) errors.push(`${label}: banned flag ${b}`);

  const isData = leaf !== "upgrade";
  if (isData) {
    for (const f of FORMAT_FLAGS) {
      if (!flags.includes(f)) errors.push(`${label}: missing format flag ${f}`);
    }
  }

  if (command.mutates) {
    if (!flags.includes("--account") || !flags.includes("--all-accounts")) {
      errors.push(`${label}: write command must take both --account and --all-accounts`);
    }
  }
  if (flags.includes("--all-accounts") && !flags.includes("--dry-run")) {
    errors.push(`${label}: has --all-accounts but no --dry-run`);
  }

  // Positionals should carry a placeholder so agent-context names them.
  for (const p of command.positional ?? []) {
    if (/^arg\d+$/.test(p.name))
      errors.push(`${label}: positional "${p.brief}" lacks a placeholder`);
  }
}

if (commands.length === 0) errors.push("no commands found in route tree");

if (errors.length > 0) {
  console.error(`vocab-lint: ${errors.length} issue(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`vocab-lint: ${commands.length} commands checked, no issues`);
