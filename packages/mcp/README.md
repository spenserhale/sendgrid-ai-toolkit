# @sendgrid-toolkit/mcp

MCP server for SendGrid deliverability, built with [FastMCP](https://github.com/punkpeye/fastmcp).
Every tool fans out across all configured SendGrid accounts (see `SENDGRID_ACCOUNTS`) and returns
one result per account, so a support agent can ask "is this person suppressed anywhere?" once.

## Tools

Start with `diagnose_email`; fix with `clear_suppressions` (dry run first).

| Tool                                                     | Kind               | Description                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagnose_email`                                         | read               | One call, all accounts: recent activity (with failure reasons), blocks, bounces, spam reports, invalid emails, global unsubscribe, unsubscribe groups, plus a `summary`. Sources that could not be queried are listed in `errors`, never silently treated as clean. |
| `clear_suppressions`                                     | destructive        | Remove an address from every list it appears on. Checks first, deletes only where present. Supports `lists` to narrow, `dryRun` to preview.                                                                                                                         |
| `search_messages`                                        | read               | Email Activity search. `email` (windowed to `days`, default 30) or raw `query`. Requires the Email Activity History add-on per account.                                                                                                                             |
| `get_blocks` / `delete_block`                            | read / destructive | Block list                                                                                                                                                                                                                                                          |
| `get_bounces` / `delete_bounce`                          | read / destructive | Bounce list                                                                                                                                                                                                                                                         |
| `get_spam_reports` / `delete_spam_report`                | read / destructive | Spam reports                                                                                                                                                                                                                                                        |
| `get_invalid_emails` / `delete_invalid_email`            | read / destructive | Invalid emails                                                                                                                                                                                                                                                      |
| `check_global_suppression` / `delete_global_suppression` | read / destructive | Global unsubscribe list                                                                                                                                                                                                                                             |
| `add_global_suppression`                                 | write              | Put an address on the global unsubscribe list (recipient asked for no mail at all)                                                                                                                                                                                  |
| `get_unsubscribe_groups`                                 | read               | ASM groups per account (ids are account-specific)                                                                                                                                                                                                                   |
| `check_unsubscribe_groups`                               | read               | Groups an address has opted out of                                                                                                                                                                                                                                  |
| `delete_unsubscribe_group_suppression`                   | destructive        | Remove an address from one group by `groupId`                                                                                                                                                                                                                       |

### Destructive tool contract

Every `delete_*` tool, `add_global_suppression`, and `clear_suppressions`:

- requires an explicit target: `account: "<name>"` **or** `allAccounts: true`. Omitting both is an error; nothing ever defaults to "everywhere".
- accepts `dryRun: true`, which returns the plan (`status: "dry_run"` or `would_remove` actions) and performs no writes.
- carries MCP annotations `destructiveHint: true`, `idempotentHint: true`. Read tools carry `readOnlyHint: true`.

### Result shape

Fan-out results are arrays of `{ account, data, error? }`. `error` is a structured
`{ code, message, exitCode, statusCode?, hint?, retryAfterSeconds? }` and `data` is `null` when set.
Partial failure (one bad key) never fails the whole call.

Codes: `E_AUTH` (401/403), `E_NOT_FOUND`, `E_RATE_LIMIT` (429, with `retryAfterSeconds`),
`E_TIMEOUT`, `E_NETWORK`, `E_API`, `E_PARSE`, `E_VALIDATION`, `E_CONFIG`.

### Output format

Responses are JSON by default. Set `SENDGRID_OUTPUT=toon` in the server env to return
[TOON](https://github.com/toon-format/toon) instead, which is 30 to 60 percent fewer tokens for tabular data.

## Setup with Claude Desktop / Claude Code

Standalone binary (no Bun needed): `SENDGRID_TOOLKIT_MCP=1 sh scripts/install.sh` installs
`sendgrid-mcp`; use `"command": "sendgrid-mcp"` with no args. From source:

```json
{
  "mcpServers": {
    "sendgrid-toolkit": {
      "command": "bun",
      "args": ["run", "/Users/spenser/Code/Toolkits/sendgrid-toolkit/packages/mcp/src/index.ts"],
      "env": {
        "SENDGRID_ACCOUNTS": "[{\"name\":\"brand-a\",\"apiKey\":\"SG.xxx\"},{\"name\":\"brand-b\",\"apiKey\":\"SG.yyy\"}]",
        "SENDGRID_OUTPUT": "toon"
      }
    }
  }
}
```

Environment variables: `SENDGRID_ACCOUNTS` (JSON array; preferred), `SENDGRID_API_KEY` (single account
named `default`), `SENDGRID_BASE_URL`, `SENDGRID_TIMEOUT_MS` (default 60000), `SENDGRID_OUTPUT` (`json` | `toon`).
If no env is provided, the nearest `.env` file above the working directory is loaded.

## Development

```bash
# Run in stdio mode
bun run dev:mcp

# Inspect with FastMCP inspector
npx fastmcp inspect packages/mcp/src/index.ts
```
