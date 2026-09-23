---
name: sendgrid-cli
description: "Reference for the `sendgrid` CLI (from spenserhale/sendgrid-ai-toolkit, installed on this machine), which investigates and fixes email deliverability for one address across several SendGrid accounts at once. Trigger whenever the user asks why someone is not receiving email, mentions SendGrid bounces, blocks, spam reports, suppressions, unsubscribes, or wants to search SendGrid email activity — even if they do not name the CLI. Prefer it over hand-rolling curl against api.sendgrid.com: it handles multi-account fan-out, auth, time-boxed activity queries, and safe destructive scoping."
---

# sendgrid CLI

Version 0.2.0. Investigate and fix email deliverability for one address across every configured SendGrid account (one per brand).

## Start here

```bash
sendgrid accounts                                  # confirm which accounts are configured
sendgrid diagnose <email> --toon                   # where is this address suppressed? recent activity?
sendgrid clear <email> --all-accounts --dry-run    # preview removals
sendgrid clear <email> --all-accounts              # apply
```

Run `sendgrid agent-context` for the full machine-readable schema (JSON by default).

## Output

Formats: `text`, `json`, `toon`. Default `text`; SENDGRID_OUTPUT sets the default; flags win. Use `--toon` when you are the consumer (fewest tokens), `--json` when piping to another program.

## Scope and safety

- Read commands query every account unless --account <name> narrows them.
- Write commands (delete, clear, add) require --account <name> OR --all-accounts. Omitting both exits 2. There is no implicit 'everywhere'.
- Every write command accepts --dry-run and exits 0 with the plan.

## Configuration

- `SENDGRID_ACCOUNTS` — JSON array of { "name", "apiKey", "baseUrl"?, "timeoutMs"? } (preferred)
- `SENDGRID_API_KEY` — Single API key; becomes an account named "default" when SENDGRID_ACCOUNTS is unset
- `SENDGRID_BASE_URL` — API base URL (default https://api.sendgrid.com)
- `SENDGRID_TIMEOUT_MS` — Per-request timeout in milliseconds (default 60000)
- `SENDGRID_OUTPUT` — Default output format for the CLI and MCP server: text | json | toon

## Exit codes

- `0` — E_DRY_RUN
- `1` — E_NETWORK, E_TIMEOUT, E_API, E_PARSE
- `2` — E_VALIDATION
- `3` — E_CONFIG
- `4` — E_NOT_FOUND
- `5` — E_AUTH
- `6` — E_RATE_LIMIT

Fan-out results are `{ account, data, error? }[]`. Fan-out results are arrays of { account, data, error? }. Partial failure exits 0; when every account fails the exit code is the first error's.

## Quirks worth knowing

- Email Activity (messages) needs SendGrid's paid Email Activity History add-on per account. Missing add-on shows as an `errors[]` entry with source 'messages' and summary.messagesAvailable=false, never as zero messages.
- Email Activity lookups are windowed to --days (default 30). Unbounded queries time out at SendGrid (HTTP 499).
- Unsubscribe group ids differ per account; prefer `clear` over `unsubscribe-groups delete` when targeting several accounts.

## Shared flags

Most commands accept these; they are omitted from the per-command lists below.

- `--format <text|json|toon>`, `--text`, `--json`, `--toon` — output format
- `--account <name>` — narrow to one account (read commands: optional; write commands: required unless `--all-accounts`)
- `--all-accounts` — write commands only: target every account
- `--dry-run` — write commands only: print the plan, change nothing

## Commands

### `sendgrid diagnose <email>`

One call, all accounts: recent email activity, blocks, bounces, spam reports, invalid-email entries, the global unsubscribe list, and unsubscribe-group membership. Sources that cannot be checked are reported as unavailable rather than empty. Email Activity is limited to the last --days days (default 30) because unbounded queries time out at SendGrid.

- `--days <value>` (default 30) — Email Activity look-back window in days (default 30; 0 = unbounded, slow)

### `sendgrid clear <email>` (write)

Checks each suppression list (blocks, bounces, spam reports, invalid emails, global unsubscribe, unsubscribe groups) and deletes the address from the ones it appears on. Requires --account <name> or --all-accounts. Always preview with --dry-run first.

- `--list <blocks|bounces|spamReports|invalidEmails|globalSuppression|unsubscribeGroups>` (repeatable) — Restrict to specific lists (repeatable; default: all)

### `sendgrid messages`

Query the Email Activity feed (requires SendGrid's Email Activity History add-on on each account). Use --email for the common case, or --query for raw SendGrid syntax such as subject="Welcome". --email and the no-filter default are limited to the last --days days; --query is sent verbatim, so include your own last_event_time bound or SendGrid may time out.

- `--email <value>` — Recipient address to search for (shorthand for --query 'to_email="…"')
- `--query <value>` — Raw SendGrid query, e.g. to_email="user@example.com" AND status="not_delivered"
- `--limit <value>` (default 20) — Max results per account (default 20)
- `--days <value>` (default 30) — Email Activity look-back window in days (default 30; 0 = unbounded, slow)

### `sendgrid blocks list`

List blocked email addresses across every configured account (or one with --account). Partial failures are reported per account and do not stop the others.

- `--email <value>` — Filter to a single email address
- `--limit <value>` (default 20) — Max results per account (default 20)

### `sendgrid blocks get <email>`

Per account: the block record, or null when the address is not on the list.

### `sendgrid blocks delete <email>` (write)

Delete the block entry for one email address. Requires --account <name> or --all-accounts; there is no implicit default. Use --dry-run to preview the target accounts.

### `sendgrid bounces list`

List bounced email addresses across every configured account (or one with --account). Partial failures are reported per account and do not stop the others.

- `--email <value>` — Filter to a single email address
- `--limit <value>` (default 20) — Max results per account (default 20)

### `sendgrid bounces get <email>`

Per account: the bounce record, or null when the address is not on the list.

### `sendgrid bounces delete <email>` (write)

Delete the bounce entry for one email address. Requires --account <name> or --all-accounts; there is no implicit default. Use --dry-run to preview the target accounts.

### `sendgrid spam-reports list`

List spam reports across every configured account (or one with --account). Partial failures are reported per account and do not stop the others.

- `--email <value>` — Filter to a single email address
- `--limit <value>` (default 20) — Max results per account (default 20)

### `sendgrid spam-reports delete <email>` (write)

Delete the spam report entry for one email address. Requires --account <name> or --all-accounts; there is no implicit default. Use --dry-run to preview the target accounts.

### `sendgrid invalid-emails list`

List invalid email addresses across every configured account (or one with --account). Partial failures are reported per account and do not stop the others.

- `--email <value>` — Filter to a single email address
- `--limit <value>` (default 20) — Max results per account (default 20)

### `sendgrid invalid-emails delete <email>` (write)

Delete the invalid email entry for one email address. Requires --account <name> or --all-accounts; there is no implicit default. Use --dry-run to preview the target accounts.

### `sendgrid global-suppressions check <email>`

Check whether an email address is on the global unsubscribe list

### `sendgrid global-suppressions add <email>` (write)

Suppresses all mail to the address from the targeted account(s). Use when a recipient asks to stop receiving everything. Requires --account <name> or --all-accounts; supports --dry-run.

### `sendgrid global-suppressions delete <email>` (write)

Requires --account <name> or --all-accounts. Use --dry-run to preview the target accounts.

### `sendgrid unsubscribe-groups list`

List unsubscribe (ASM) groups

### `sendgrid unsubscribe-groups check <email>`

List the unsubscribe groups an email address has opted out of

### `sendgrid unsubscribe-groups delete <email>` (write)

Requires --group <id> plus --account <name> or --all-accounts. Group ids differ per account, so --all-accounts is rarely what you want here; prefer `sendgrid clear`.

- `--group <value>` — Unsubscribe group id (see `sendgrid unsubscribe-groups list`)

### `sendgrid accounts`

Names come from SENDGRID_ACCOUNTS (or "default" when only SENDGRID_API_KEY is set). API keys are never printed.

### `sendgrid agent-context`

Defaults to JSON (use --toon or --text to override). Derived from the live command tree, so it is always in sync with --help. Pipe it to an agent before driving this CLI.

### `sendgrid upgrade`

Downloads the matching prebuilt binary from GitHub Releases, verifies its SHA256, and replaces the running executable. Only works for the binary installed via scripts/install.sh.

- `--check` — Report whether a newer version exists; install nothing
- `--force` — Reinstall even if already on the latest version
- `--version <value>` — Install a specific version (e.g. 0.2.0)

## Install / update

```bash
curl -fsSL https://raw.githubusercontent.com/spenserhale/sendgrid-ai-toolkit/main/scripts/install.sh | sh
sendgrid upgrade --check
```
