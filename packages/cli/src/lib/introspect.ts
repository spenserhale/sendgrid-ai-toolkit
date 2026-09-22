/**
 * Derive a machine-readable description of the CLI from the live Stricli route
 * tree. Nothing here is hand-maintained: new commands, flags and positionals
 * show up automatically in `sendgrid agent-context` and the generated SKILL.md.
 */

export interface PositionalDescription {
  name: string;
  brief: string;
  optional?: boolean;
}

export interface FlagDescription {
  type: "boolean" | "string" | "enum" | "counter";
  brief: string;
  default?: unknown;
  optional?: boolean;
  values?: readonly string[];
  variadic?: boolean;
}

export interface CommandDescription {
  brief: string;
  description?: string;
  positional?: PositionalDescription[];
  flags?: Record<string, FlagDescription>;
  /** True when the command writes to SendGrid (has --dry-run). */
  mutates?: boolean;
  subcommands?: Record<string, CommandDescription>;
}

export type CommandTree = Record<string, CommandDescription>;

interface RouteEntry {
  name: Record<string, string>;
  target: unknown;
  hidden: boolean;
}

interface RouteMapLike {
  brief: string;
  getAllEntries: () => RouteEntry[];
}

interface CommandLike {
  brief: string;
  fullDescription?: string;
  parameters: { flags?: Record<string, unknown>; positional?: unknown };
}

function isRouteMap(target: unknown): target is RouteMapLike {
  return (
    typeof target === "object" &&
    target !== null &&
    typeof (target as { getAllEntries?: unknown }).getAllEntries === "function"
  );
}

function isCommand(target: unknown): target is CommandLike {
  return (
    typeof target === "object" &&
    target !== null &&
    "parameters" in target &&
    typeof (target as { usesFlag?: unknown }).usesFlag === "function"
  );
}

function entryName(entry: RouteEntry): string {
  return entry.name["convert-camel-to-kebab"] ?? entry.name["original"] ?? "<unnamed>";
}

/** Describe the root route map as a tree keyed by command name. */
export function describeTree(root: unknown): CommandTree {
  if (!isRouteMap(root)) return {};
  const tree: CommandTree = {};
  for (const entry of root.getAllEntries()) {
    if (entry.hidden) continue;
    tree[entryName(entry)] = describeTarget(entry.target);
  }
  return tree;
}

function describeTarget(target: unknown): CommandDescription {
  if (isCommand(target)) return describeCommand(target);
  if (isRouteMap(target)) {
    return { brief: target.brief, subcommands: describeTree(target) };
  }
  return { brief: "<unknown>" };
}

function describeCommand(cmd: CommandLike): CommandDescription {
  const out: CommandDescription = { brief: cmd.brief };
  if (cmd.fullDescription) out.description = cmd.fullDescription;

  const positional = describePositional(cmd.parameters.positional);
  if (positional.length > 0) out.positional = positional;

  const flags = cmd.parameters.flags;
  if (flags && Object.keys(flags).length > 0) {
    out.flags = {};
    for (const [key, def] of Object.entries(flags)) {
      out.flags[`--${camelToKebab(key)}`] = describeFlag(def);
    }
    if ("--dry-run" in out.flags) out.mutates = true;
  }
  return out;
}

function describePositional(positional: unknown): PositionalDescription[] {
  if (!positional || typeof positional !== "object") return [];
  const p = positional as { kind?: string; parameters?: unknown[] };
  if (p.kind !== "tuple" || !Array.isArray(p.parameters)) return [];
  return p.parameters.map((param, idx) => {
    const entry = param as { brief?: string; placeholder?: string; optional?: boolean };
    return {
      name: entry.placeholder ?? `arg${idx + 1}`,
      brief: entry.brief ?? "",
      ...(entry.optional ? { optional: true } : {}),
    };
  });
}

function describeFlag(def: unknown): FlagDescription {
  const d = def as {
    kind: string;
    brief?: string;
    default?: unknown;
    optional?: boolean;
    values?: readonly string[];
    variadic?: boolean | string;
  };
  const out: FlagDescription = { type: mapKind(d.kind), brief: d.brief ?? "" };
  if (d.default !== undefined) out.default = d.default;
  if (d.optional) out.optional = true;
  if (d.values) out.values = d.values;
  if (d.variadic) out.variadic = true;
  return out;
}

function mapKind(kind: string): FlagDescription["type"] {
  switch (kind) {
    case "boolean":
      return "boolean";
    case "enum":
      return "enum";
    case "counter":
      return "counter";
    default:
      // "parsed" flags carry a parser function; we report them as strings.
      return "string";
  }
}

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** Flatten the tree into `[path, description]` pairs for leaf commands only. */
export function flattenCommands(
  tree: CommandTree,
  prefix: string[] = [],
): Array<{ path: string[]; command: CommandDescription }> {
  const out: Array<{ path: string[]; command: CommandDescription }> = [];
  for (const [name, cmd] of Object.entries(tree)) {
    const path = [...prefix, name];
    if (cmd.subcommands) out.push(...flattenCommands(cmd.subcommands, path));
    else out.push({ path, command: cmd });
  }
  return out;
}
