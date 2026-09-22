# CLAUDE.md — sendgrid-toolkit

Product-specific notes for working in this toolkit. The shared three-layer architecture is described
in the parent `../CLAUDE.md`.

## What this toolkit is for

Deliverability **diagnosis and remediation across several SendGrid accounts** (one per brand). It does
not send mail. The headline surfaces are `diagnose` / `diagnose_email` (investigate one address
everywhere) and `clear` / `clear_suppressions` (remove it from every suppression list it is on).

## SendGrid quirks that shape the code

- **Email Activity is an add-on.** `GET /v3/messages` needs the paid Email Activity History add-on and
  an API key with that scope. Accounts without it return 401/403. `diagnose` records this under
  `errors[]` with `summary.messagesAvailable: false`; never treat it as "no messages".
- **Unbounded activity queries time out server-side** (HTTP 499 "context deadline exceeded" after
  about 60s). `buildActivityQuery` always adds a `last_event_time BETWEEN` window (default 30 days,
  `DEFAULT_ACTIVITY_DAYS`). Raw `--query` / `query` is passed through verbatim; the caller owns the bound.
- **Global suppression check returns 200 with `{}`** when not suppressed, `{ recipient_email }` when
  suppressed. Some tenants return 404; both map to `null`.
- **ASM (unsubscribe) group ids are per account.** `GET /v3/asm/suppressions/{email}` lists every group
  with a `suppressed` flag; `getUnsubscribedGroups` filters to `suppressed: true`. `clear` resolves ids
  per account, which is why it is preferred over the single-group delete for multi-account use.
- **Bounce `created` may be a number or a string** depending on endpoint version; the schema accepts both.

## Safety rules (enforced in `AccountManager.resolveScope`)

- Destructive operations require `account` **or** `allAccounts: true`. Omitting both throws
  `E_VALIDATION`. Do not add a default.
- Every delete path accepts `dryRun`. `clearSuppressions` checks each list first and only deletes
  where present; dry run reports `would_remove` actions.

## Errors and exit codes

`SendgridError` carries `code` (`E_AUTH`, `E_NOT_FOUND`, `E_RATE_LIMIT`, `E_TIMEOUT`, `E_NETWORK`,
`E_API`, `E_PARSE`, `E_VALIDATION`, `E_CONFIG`, `E_DRY_RUN`) and `exitCode` from `EXIT_CODES`
(network/timeout/api/parse=1, validation=2, config=3, not-found=4, auth=5, rate-limit=6, dry-run=0).
Fan-out results serialise errors via `serializeError` into `{ account, data: null, error }`.

## Output

CLI: `emit(data, flags, { text })` in `packages/cli/src/lib/output.ts`. Formats `text` (default),
`json`, `toon` (`@toon-format/toon`). Env default `SENDGRID_OUTPUT`. Text renderers live in
`packages/cli/src/lib/text.ts`. MCP: `respond()` in `packages/mcp/src/lib/respond.ts` returns JSON, or
TOON when `SENDGRID_OUTPUT=toon`.

## Commands

```bash
bun run test        # vp test (vitest). Import test utils from "vite-plus/test", not "vitest".
bun run lint        # oxlint
bun run typecheck   # tsc --noEmit per package
bun run vocab-lint  # naming rules over the live route tree (packages/cli/scripts/lint-vocab.ts)
bun run build:skill # regenerate sendgrid-cli/SKILL.md; CI diffs it
bun run check --fix # oxfmt
bun run dev:cli -- <args>
bun run dev:mcp
```

Tests run under Node via vitest, not Bun: no `Bun.*` globals in tests. Tests never hit the network: `packages/sdk/tests/helpers/mock-fetch.ts` scripts `globalThis.fetch`.
Config tests pass an explicit `env` object so the real `.env` is not loaded.

## Introspection is derived, never hand-written

`packages/cli/src/lib/introspect.ts` walks Stricli's route tree. `agent-context`, `build-skill.ts`
and `lint-vocab.ts` all consume it. Give every positional a `placeholder` and every write command
`--dry-run` plus both scope flags; vocab-lint enforces this.

## Releasing

Bump `version` in the three `packages/*/package.json`, commit, tag `vX.Y.Z`, push the tag.
`.github/workflows/release.yml` compiles binaries and publishes the GitHub Release consumed by
`scripts/install.sh` and `sendgrid upgrade`. Do not run `bun build --compile` locally on Apple
Silicon (hangs); use `bun run build` for a JS bundle smoke test.

## Env loading

`packages/sdk/src/env.ts` walks up from cwd to the nearest `.env` (no `dotenv`, no symlink postinstall).
This differs from other toolkits on purpose: the MCP server is launched from arbitrary cwd by clients.
