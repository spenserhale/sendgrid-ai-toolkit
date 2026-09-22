# SendGrid Toolkit — Improvement Plan

_Author: Fable agent · Date: 2026-07-06 · Status updated 2026-09-22_

> **2026-09-22 update:** Phases 0, 1, 2, 4 and 6 (tests + CLAUDE.md) done; Phase 5 done except
> global-suppression _add_ (deliberately skipped: support use case is un-suppress, not suppress).
> Phase 3 done: `agent-context` + SKILL.md + vocab-lint are derived from the live Stricli route
> tree (no hand-kept `commandSpecs.ts`). Tool namespacing: kept un-prefixed names. Profiles: not
> built (env JSON is the account model). Output formats landed as
> `text` (default) / `json` / `toon` via `--format` rather than TOON-default, per owner preference.
> Not done from Phase 2: `--idempotency-key` and `--force` (DELETEs are idempotent; explicit scope +
> --dry-run replace the confirmation model).
> Added beyond plan: `clear` / `clear_suppressions` composite, `unsubscribe-groups`, `accounts`,
> time-boxed Email Activity queries (SendGrid 499s on unbounded ones).

This plan measures `sendgrid-toolkit` against the shared Toolkits architecture
(`/Users/spenser/Code/Toolkits/CLAUDE.md`) and the agent-native CLI / MCP-tool
best practices, using `invoca-toolkit` as the reference implementation of the
mature pattern.

---

## Current State

A **deliverability-diagnosis** toolkit for SendGrid. Its distinguishing feature
is **multi-account fan-out**: every operation runs across all configured SendGrid
accounts in parallel (`Promise.allSettled`) so one bad key doesn't block the rest.
The headline command, `diagnose <email>`, aggregates activity + suppressions
across accounts into one report.

**SDK** (`packages/sdk/src`)

- `client.ts` — `SendgridClient`: `fetch` wrapper over the SendGrid v3 REST API.
  Covers: Email Activity (`getMessages`, `getMessageDetail`), Blocks
  (`getBlocks`, `deleteBlock`), Bounces (`getBounces`, `deleteBounce`),
  Spam Reports (`getSpamReports`), Invalid Emails (`getInvalidEmails`),
  Global Suppressions (`checkGlobalSuppression`).
- `account-manager.ts` — `AccountManager`: builds one client per account,
  `runAcrossAccounts()` fan-out, and the composite `diagnose()` (fetches activity
  - all suppression lists per account, then enriches failed messages with the
    failure reason from message-detail events).
- `config.ts` — `resolveConfig()` (single) and `resolveAccounts()`
  (`SENDGRID_ACCOUNTS` JSON array, or single `SENDGRID_API_KEY` → `"default"`).
- `env.ts` — hand-rolled `.env` loader that walks up from cwd (no `dotenv` dep;
  no `scripts/link-env.sh` postinstall — a deliberate alternative to the shared
  symlink approach).
- `errors.ts` — `SendgridError`, `SendgridAuthError`, `SendgridNotFoundError`.
- `types.ts` — Zod schemas (all `.passthrough()`) + inferred types.

**CLI** (`packages/cli/src`) — Stricli, binary `sendgrid`, version `0.1.0`.
Commands: `diagnose`, `messages`, `blocks {list,delete}`, `bounces {list,delete}`,
`spam-reports`, `invalid-emails`, `global-suppressions`. Every command supports
`--account` and `--json`; human output is hand-rolled `console.log` per command.

**MCP** (`packages/mcp/src`) — FastMCP stdio, 9 tools across 3 files:
`search_messages`; `get_blocks` / `delete_block` / `get_bounces` /
`delete_bounce` / `get_spam_reports` / `get_invalid_emails` /
`check_global_suppression`; `diagnose_email`.

**Maturity: early / scaffold-plus.** The multi-account core is genuinely good and
well-factored, and the CLI/MCP are clean thin consumers. But it sits a full
generation behind `invoca-toolkit` on agent-native conventions, test coverage,
and docs.

- **Tests**: one file, `packages/sdk/tests/client.test.ts`, two trivial
  constructor-validation cases. No HTTP mocking, no `AccountManager`/`diagnose`
  tests, no config/CLI/MCP tests. (Invoca has ~10 test files incl. mocked-fetch
  and e2e.)
- **Docs**: root `README.md` is accurate. **`packages/mcp/README.md` is stale** —
  it documents `list_resources` / `get_resource` / `create_resource` /
  `delete_resource`, none of which exist (leftover scaffold). No toolkit
  `CLAUDE.md`, no `AGENTS.md`, no CLI `SKILL.md`.

---

## Gap Analysis

Measured against the shared architecture's "CLI Conventions (Agent-Native Design)"
and "MCP Conventions" sections, plus the `agent-native-cli-creator` /
`mcp-tools-creator` skills.

### CLI — agent-native gaps (largest)

1. **Output formats** — only `--json` + ad-hoc human print. Missing the standard
   `--toon` (default), `--csv`, and `--deliver <stdout|file:|webhook:>`. No shared
   `lib/output.ts` / `lib/render.ts` / `lib/deliver.ts` (invoca has all three).
2. **Enumerated exit codes** — every command does `console.error(...); process.exit(1)`.
   No mapping to the shared code set (network=1, validation=2, config=3,
   not-found=4, auth=5, rate-limit=6, dry-run=0). `SendgridError.code` is a string
   (`"API_ERROR"`, `"CONFIG_ERROR"`, `"AUTH_ERROR"`, `"NOT_FOUND"`) but there is no
   `EXIT_CODES` table and no `formatError`/`runCommand` helper.
3. **`--dry-run` missing on all mutations** — `blocks delete` and `bounces delete`
   perform the DELETE with no dry-run and no `--force`/confirmation. Worse, both
   **default to ALL accounts** when `--account` is omitted, so an un-scoped
   `sendgrid blocks delete x@y.com` deletes across every account irreversibly.
4. **`--idempotency-key` missing** — not wired anywhere (DELETEs are naturally
   idempotent, but the flag/vocabulary is absent).
5. **`agent-context` command missing entirely** — no machine-readable schema of
   commands/flags/env/exit-codes. No `commandSpecs.ts`. This is the single most
   important introspection surface for agents and the toolkit has none.
6. **Profiles missing** — no `profile {save,list,show,delete}`; multi-account is
   env-JSON only.
7. **Minor vocab drift** — `messages` uses `--query` and defaults `--limit 10`
   while the suppression commands use `--email` and default `--limit 20`.

### MCP — tool-design gaps

8. **No behavior annotations** — tools lack `readOnlyHint` / `destructiveHint` /
   `idempotentHint`. `delete_block`/`delete_bounce` are destructive and unhinted.
9. **Destructive tools default to all accounts** — same footgun as the CLI, but
   worse via an agent: `delete_block` with no `account` deletes everywhere. No
   dry-run/confirmation parameter, no audit/action wrapper.
10. **Inconsistent return shapes** — most tools return `JSON.stringify(results)`,
    but `diagnose_email` returns preformatted human text. Agents get a different
    contract per tool.
11. **Naming** — flat verbs (`get_blocks`, `delete_block`) with no `sendgrid_`
    domain prefix; acceptable but not the `domain_verb_noun` the skill prefers,
    and collision-prone if merged with other MCP servers.
12. **Stale README** documents non-existent tools (see Current State).

### SDK — coverage & robustness gaps

13. **Incomplete suppression CRUD vs the SendGrid API**:
    - Spam Reports: no delete (`DELETE /v3/suppression/spam_reports[/{email}]`).
    - Invalid Emails: no delete (`DELETE /v3/suppression/invalid_emails[/{email}]`).
    - Global Suppressions: only check; API also supports **add**
      (`POST /v3/asm/suppressions/global`) and **remove**
      (`DELETE /v3/asm/suppressions/global/{email}`).
    - Blocks/Bounces: no single-get-by-email, no delete-all.
    - No Unsubscribe (ASM) Groups or group membership.
14. **No timeout / retry / rate-limit handling** — `fetch` has no
    `AbortController` timeout; 429 and 5xx surface as generic `SendgridError`
    (no `SendgridRateLimitError`, no `Retry-After`). Only 401 is specialized;
    403/404/429 are not. (Invoca models `E_TIMEOUT`/`E_RATE_LIMIT`.)
15. **`getMessageDetail` leaks ZodError** — `MessageDetailSchema.parse(raw)` throws
    a raw `ZodError` (unmapped) instead of a typed `SendgridError`.
16. **`resolveConfig` inconsistency** — returns `apiKey: ""` when unset (defers to
    a Zod throw in the client constructor) while `resolveAccounts` throws a clean
    `CONFIG_ERROR`. Single-client path should fail the same way.

### Tests & docs

17. **Test coverage ~nil** (see Current State) — no confidence net for a refactor.
18. **Missing `CLAUDE.md` / `AGENTS.md` / CLI `SKILL.md`**; stale MCP README.

---

## Plan

Phased by impact. Each task is one-sitting-sized with an effort tag (S ≤ ~1h,
M ≤ ~half day, L ≥ ~1 day). Do the SDK safety pieces (Phase 0) before the
consumer-facing format work so both consumers refactor against a stable base.

### Phase 0 — Safety & correctness (do first)

- [x] **(S)** Fix `resolveConfig` to throw `SendgridError("CONFIG_ERROR")` on
      missing key, matching `resolveAccounts`.
- [x] **(S)** Wrap `getMessageDetail`'s `parse` so a `ZodError` becomes a typed
      `SendgridError` (`code: "PARSE_ERROR"`).
- [x] **(M)** Add request timeout via `AbortController` (env `SENDGRID_TIMEOUT_MS`,
      default 30000) and specialize `429` → new `SendgridRateLimitError`
      (capture `Retry-After`), `403` → auth, `404` → not-found.
- [x] **(S)** Fix the destructive-default footgun: make `blocks delete` /
      `bounces delete` (and the matching MCP tools) **require** an explicit
      `--account` OR an explicit `--all-accounts` flag; never delete everywhere by
      default. (Pairs with dry-run in Phase 2.)

### Phase 1 — Enumerated errors & exit codes (foundation for the CLI)

- [x] **(M)** Refactor `errors.ts` to the invoca model: an `ErrorCode` union +
      `EXIT_CODES` table (network=1, validation=2, config=3, not-found=4, auth=5,
      rate-limit=6, dry-run=0), `exitCode`/`hint`/`got`/`validValues` fields, and a
      `toJSON()`. Keep `SendgridError`/`SendgridAuthError`/`SendgridNotFoundError`
      as thin subclasses for API compatibility.
- [x] **(S)** Add `packages/cli/src/lib/errors.ts` with `formatError` / `runCommand`
      / `exitOnError` (port from invoca). Replace every command's
      `try/catch → console.error/exit(1)` with `runCommand`.

### Phase 2 — Structured output & mutation safety (CLI)

- [x] **(M)** Add `lib/output.ts` (`toon`/`json`/`csv`, `resolveFormat`),
      `lib/render.ts` (`emit`), `lib/deliver.ts` (`stdout`/`file:`/`webhook:`).
      Port from invoca; TOON becomes the default. Add shared `lib/flags.ts`
      (`formatFlags`, `deliverFlag`, `safetyFlags`, `idempotencyFlag`).
- [x] **(M)** Migrate all read commands (`messages`, `blocks list`, `bounces list`,
      `spam-reports`, `invalid-emails`, `global-suppressions`, `diagnose`) to
      `emit(data, flags)` — delete the hand-rolled `console.log` formatters.
- [x] **(S)** Add `--dry-run` + `--force` + `--idempotency-key` to `blocks delete`
      and `bounces delete`; on `--dry-run` emit `{ status: "dry_run", method,
target }` and exit 0.
- [x] **(S)** Normalize vocab: give `messages` an `--email` convenience flag and a
      consistent default `--limit` (pick one default across all list commands).

### Phase 3 — Introspection (`agent-context`)

- [x] **(L)** Add `packages/cli/src/commandSpecs.ts` describing every command
      (path, brief, positional, flags, examples, `mutates`), plus `ENVIRONMENT`
      (`SENDGRID_API_KEY`, `SENDGRID_ACCOUNTS`, `SENDGRID_BASE_URL`,
      `SENDGRID_TIMEOUT_MS`) and the exit-code table, with a `SCHEMA_VERSION`.
- [x] **(S)** Add the `agent-context` command (defaults to `--json`) rendering
      `buildAgentContext()`; register it in `app.ts`.
- [x] **(S)** Optional: `commandSpecs` vocab-lint script (port invoca's
      `lint-vocab.ts`) to keep flag names consistent.

### Phase 4 — MCP hardening

- [x] **(S)** Fix `packages/mcp/README.md` to document the real 9 tools.
- [x] **(M)** Add behavior annotations to every tool (`readOnlyHint: true` on all
      `get_*`/`search_*`/`check_*`/`diagnose_*`; `destructiveHint: true`,
      `idempotentHint: true` on `delete_*`).
- [x] **(S)** Add a `dryRun` boolean param + require explicit `account` (or
      `allAccounts: true`) on `delete_block` / `delete_bounce`.
- [x] **(S)** Make `diagnose_email` return structured JSON like the other tools
      (move human formatting to the CLI only), for a consistent agent contract.
- [x] **(S)** Optionally namespace tools (`sendgrid_search_messages`, …) — decide
      in Open Questions.

### Phase 5 — SDK coverage (additive)

- [x] **(M)** Add `deleteSpamReport(email)` + `deleteInvalidEmail(email)` and wire
      CLI `delete` subcommands + MCP tools (with dry-run per Phase 2/4).
- [x] **(M)** Add global-suppression **add** (`addGlobalSuppression(emails[])`) and
      **remove** (`deleteGlobalSuppression(email)`); wire consumers.
- [x] **(S)** Add single-get-by-email for blocks/bounces (`GET .../{email}`).
- [x] **(L)** Optional: Unsubscribe (ASM) Groups — list groups, get/add/remove
      group suppressions. Larger surface; gate on demand.

### Phase 6 — Tests & docs

- [x] **(M)** Add a mocked-`fetch` harness (port invoca's `tests/helpers/mockFetch.ts`)
      and cover every `SendgridClient` method incl. error/status mapping.
- [x] **(M)** Test `AccountManager.runAcrossAccounts` (partial-failure isolation)
      and `diagnose()` (message-detail enrichment path).
- [x] **(S)** Test `resolveConfig`/`resolveAccounts` and `lib/output.ts`
      (toon/csv/format-conflict).
- [x] **(S)** Add toolkit `CLAUDE.md` (SendGrid quirks: multi-account model,
      Email Activity add-on requirement, env vars) and `AGENTS.md`.
- [x] **(M)** Add CLI `SKILL.md` (+ optional `build-skill.ts`) documenting the
      agent-native surface, mirroring invoca.

---

## Open Questions

1. **Scope: send vs. diagnose.** This is currently a _deliverability-diagnosis_
   toolkit — no `mail/send`. Keep it read/suppression-focused, or add sending
   (`POST /v3/mail/send`)? That materially changes the MCP risk profile.
2. **ASM Groups (Phase 5, last task).** Worth the surface, or is global +
   per-list suppression enough for the real use case?
3. **MCP tool namespacing.** Prefix all tools with `sendgrid_`? Improves
   multi-server hygiene but breaks any existing Claude Desktop configs referencing
   the current names.
4. **Default output format.** Adopt TOON-as-default to match the shared spec, or
   keep JSON default here to avoid changing current `--json`-less behavior for
   existing scripts?
5. **Destructive default.** Confirm the intended fix: require explicit `--account`
   for deletes, vs. keep all-accounts default but force `--force`. (Plan assumes
   the former.)
6. **`.env` strategy.** Keep the bespoke walk-up `env.ts`, or align with the shared
   `scripts/link-env.sh` postinstall symlink used by other toolkits?
