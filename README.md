# SendGrid Toolkit

SDK, CLI, and MCP server for SendGrid **deliverability across many accounts**.

Companies that run one SendGrid account per brand end up with a support team logging into four
dashboards to answer "why isn't this customer getting our email?". This toolkit fans every operation
out across all configured accounts in parallel and returns one report, so the answer is a single
CLI command or a single MCP tool call.

```bash
sendgrid diagnose someone@example.com          # investigate everywhere
sendgrid clear someone@example.com --all-accounts --dry-run   # preview the fix
sendgrid clear someone@example.com --all-accounts             # apply it
```

## Install the CLI

### Standalone binary (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/spenserhale/sendgrid-ai-toolkit/main/scripts/install.sh | sh
```

Detects OS and architecture, downloads the matching binary from the
[latest release](https://github.com/spenserhale/sendgrid-ai-toolkit/releases/latest), verifies its
SHA256, and installs to `$HOME/.local/bin/sendgrid`. Pin with `SENDGRID_TOOLKIT_VERSION=v0.2.0`,
change the directory with `SENDGRID_TOOLKIT_INSTALL=$HOME/bin`, add `SENDGRID_TOOLKIT_MCP=1` to
also install the `sendgrid-mcp` server binary.

**Windows:** download `sendgrid-windows-x64.exe` from the latest release and put it on `PATH`.

**Updating:**

```bash
sendgrid upgrade            # install latest (verifies sha256)
sendgrid upgrade --check    # report only
```

### From source

```bash
git clone https://github.com/spenserhale/sendgrid-ai-toolkit && cd sendgrid-ai-toolkit
bun install
bun run dev:cli -- --help
```

## Teach your AI agents about the CLI

If you use Claude Code or any agent that supports [open agent skills](https://skills.sh/), install
the `sendgrid-cli` skill so the agent reaches for the CLI whenever someone asks "why isn't this
customer getting our email?":

```bash
npx skills add spenserhale/sendgrid-ai-toolkit@sendgrid-cli
```

The skill is generated from the live command tree (`bun run build:skill`) and CI fails if it drifts.
For a machine-readable schema at runtime, run `sendgrid agent-context`.

## Packages

| Package                                   | Description                                                    |
| ----------------------------------------- | -------------------------------------------------------------- |
| [`@sendgrid-toolkit/sdk`](./packages/sdk) | Typed client, multi-account fan-out, diagnose/clear composites |
| [`@sendgrid-toolkit/cli`](./packages/cli) | `sendgrid` CLI (Stricli), text/JSON/TOON output                |
| [`@sendgrid-toolkit/mcp`](./packages/mcp) | MCP server for AI assistants (FastMCP, stdio)                  |

## Getting started

```bash
bun install
cp .env.example .env      # add your account keys
bun run dev:cli -- accounts        # sanity check: prints configured account names
bun run dev:cli -- diagnose someone@example.com
```

### Configuration

| Variable              | Purpose                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| `SENDGRID_ACCOUNTS`   | JSON array of `{ "name", "apiKey", "baseUrl"?, "timeoutMs"? }`. Preferred.        |
| `SENDGRID_API_KEY`    | Single key; becomes an account named `default` when `SENDGRID_ACCOUNTS` is unset. |
| `SENDGRID_BASE_URL`   | API base URL (default `https://api.sendgrid.com`).                                |
| `SENDGRID_TIMEOUT_MS` | Per-request timeout (default `60000`).                                            |
| `SENDGRID_OUTPUT`     | Default output format: `text`, `json`, or `toon`. Flags override it.              |

The nearest `.env` above the working directory is loaded automatically; real env vars win.

Each API key needs read access to Suppressions and ASM (unsubscribe groups), plus **Email Activity**
read access. Email Activity search also requires SendGrid's paid _Email Activity History_ add-on on
that account; without it the `messages` source is reported as unavailable, not as empty.

## CLI

```
sendgrid diagnose <email>                 investigate one address across every account
sendgrid clear <email>                    remove from every suppression list it is on
sendgrid messages [--email|--query]       search Email Activity (last --days, default 30)
sendgrid blocks|bounces                   list|get|delete
sendgrid spam-reports|invalid-emails      list|delete
sendgrid global-suppressions              check|add|delete
sendgrid unsubscribe-groups               list|check|delete --group <id>
sendgrid accounts                         list configured account names
sendgrid agent-context                    machine-readable schema of everything above
sendgrid upgrade                          self-update the standalone binary
```

**Output.** Every command takes `--format text|json|toon` (or `--text` / `--json` / `--toon`).
Text is the default for humans; JSON for integrations; TOON for coding agents. Set `SENDGRID_OUTPUT`
to change the default.

**Scope.** Read commands hit every account unless `--account <name>` narrows them. Write
commands (`delete`, `clear`, `add`) **require** `--account <name>` or `--all-accounts` and accept
`--dry-run`. There is no implicit "everywhere".

**Exit codes.** `0` success or dry run (partial per-account failures are reported inline and still
exit 0), `1` network/timeout/API, `2` validation, `3` config, `4` not found, `5` auth, `6` rate limit.
When every account fails, the exit code is the first failure's.

## MCP

See [`packages/mcp/README.md`](./packages/mcp/README.md) for the tool list, the destructive-tool
contract, and Claude Desktop setup. Headline tools: `diagnose_email` and `clear_suppressions`.

## Architecture

```
packages/sdk/     <-- Types, API client, AccountManager (fan-out, diagnose, clear)
    ^       ^
    |       |
packages/cli/   packages/mcp/
    (Stricli)    (FastMCP)
```

Both consumers are thin: all SendGrid knowledge lives in the SDK. `AccountManager.runAcrossAccounts`
uses `Promise.allSettled`, so one revoked key yields a structured per-account error rather than
failing the call.

## Development

```bash
bun run test        # vitest via vite-plus
bun run lint        # oxlint
bun run typecheck   # tsc --noEmit for every package
bun run vocab-lint  # command/flag naming consistency, from the live route tree
bun run check       # formatting
bun run build:skill # regenerate sendgrid-cli/SKILL.md
bun run compile     # local standalone binaries into dist/ (CI builds the release matrix)
```

Releases: push a `v*` tag. The Release workflow tests, compiles CLI + MCP binaries for
linux/darwin (x64, arm64) and windows-x64, attaches them with SHA256 checksums, and publishes a
GitHub Release that `scripts/install.sh` and `sendgrid upgrade` consume.

### Adding an API operation

1. Types in `packages/sdk/src/types.ts`
2. Client method in `packages/sdk/src/client.ts` (+ a test in `packages/sdk/tests/client.test.ts`)
3. CLI command in `packages/cli/src/commands/`, using `emit()` for text/json/toon and a
   `placeholder` on each positional
4. MCP tool in `packages/mcp/src/tools/`, with annotations and (if it writes) `scopeParams`
5. `bun run vocab-lint && bun run build:skill`
