import { SendgridClient } from "./client.js";
import { resolveAccounts } from "./config.js";
import { SendgridError, serializeError } from "./errors.js";
import type {
  AccountConfig,
  AccountScope,
  MultiAccountResult,
  AccountDiagnosis,
  DiagnoseReport,
  DiagnoseSourceError,
  SuppressionList,
  ClearAction,
  ClearReport,
  AccountClearResult,
  EmailMessage,
} from "./types.js";
import { DEFAULT_BASE_URL } from "./types.js";
import { buildActivityQuery, DEFAULT_ACTIVITY_DAYS } from "./activity.js";

const DELIVERED_STATUSES = new Set(["delivered", "processed"]);

export interface DiagnoseOptions {
  /** Restrict to one account by name (default: all). */
  account?: string;
  /** Email Activity look-back window in days (default 30; 0 = unbounded, slow). */
  days?: number;
}

export interface ClearOptions extends AccountScope {
  /** Report what would be removed without calling any DELETE endpoint. */
  dryRun?: boolean;
  /** Restrict to specific lists. Default: every list the address appears on. */
  lists?: readonly SuppressionList[];
}

export class AccountManager {
  private readonly clients: Map<string, SendgridClient>;

  constructor(accounts?: AccountConfig[]) {
    this.clients = new Map();
    for (const acct of resolveAccounts(accounts)) {
      this.clients.set(
        acct.name,
        new SendgridClient({
          apiKey: acct.apiKey,
          baseUrl: acct.baseUrl ?? DEFAULT_BASE_URL,
          ...(acct.timeoutMs !== undefined ? { timeoutMs: acct.timeoutMs } : {}),
        }),
      );
    }
  }

  getClient(accountName: string): SendgridClient {
    const client = this.clients.get(accountName);
    if (!client) {
      throw new SendgridError({
        code: "E_VALIDATION",
        message: `Unknown account "${accountName}"`,
        got: accountName,
        validValues: this.getAccountNames(),
        hint: "Account names come from SENDGRID_ACCOUNTS",
      });
    }
    return client;
  }

  getAccountNames(): string[] {
    return [...this.clients.keys()];
  }

  /**
   * Validate the target scope of a destructive operation. Exactly one of
   * `account` or `allAccounts` is required; there is no "everything" default.
   * Returns the account name to target, or `undefined` for all accounts.
   */
  resolveScope(scope: AccountScope): string | undefined {
    if (scope.account && scope.allAccounts) {
      throw new SendgridError({
        code: "E_VALIDATION",
        message: "Specify either a single account or all accounts, not both",
        hint: "Drop --all-accounts, or drop --account",
      });
    }
    if (scope.account) {
      this.getClient(scope.account); // validates the name
      return scope.account;
    }
    if (scope.allAccounts) return undefined;
    throw new SendgridError({
      code: "E_VALIDATION",
      message: "Destructive operations need an explicit target: one account, or all accounts",
      hint: `Pass --account <name> (one of: ${this.getAccountNames().join(", ")}) or --all-accounts`,
      validValues: this.getAccountNames(),
    });
  }

  /**
   * Run an operation across all accounts (or a specific one) in parallel.
   * Uses Promise.allSettled so one failing account doesn't block others.
   * Per-account failures land in `error` as a structured record.
   */
  async runAcrossAccounts<T>(
    operation: (client: SendgridClient, accountName: string) => Promise<T>,
    accountName?: string,
  ): Promise<MultiAccountResult<T>[]> {
    const targets = accountName
      ? [{ name: accountName, client: this.getClient(accountName) }]
      : [...this.clients.entries()].map(([name, client]) => ({ name, client }));

    const settled = await Promise.allSettled(
      targets.map(({ name, client }) =>
        operation(client, name).then((data) => ({ account: name, data })),
      ),
    );

    return settled.map((result, i) =>
      result.status === "fulfilled"
        ? result.value
        : {
            account: targets[i]!.name,
            data: null as T,
            error: serializeError(result.reason),
          },
    );
  }

  // -------------------------------------------------------------------------
  // diagnose
  // -------------------------------------------------------------------------

  /**
   * Diagnose delivery issues for an email address across all accounts.
   * Checks: email activity, blocks, bounces, spam reports, invalid emails,
   * global suppression, and unsubscribe-group suppressions.
   *
   * A source that fails is recorded in `errors` (not silently treated as empty)
   * so "no data" and "could not check" stay distinguishable.
   */
  async diagnose(email: string, options: DiagnoseOptions = {}): Promise<DiagnoseReport> {
    const days = options.days ?? DEFAULT_ACTIVITY_DAYS;
    const accounts = await this.runAcrossAccounts<AccountDiagnosis>(
      (client) => diagnoseAccount(client, email, days),
      options.account,
    );
    return { email, activityWindowDays: days, accounts };
  }

  // -------------------------------------------------------------------------
  // clear suppressions
  // -------------------------------------------------------------------------

  /**
   * Remove an address from every suppression list it appears on, per account.
   * Requires an explicit scope. With `dryRun`, reports `would_remove` actions
   * and performs no DELETE calls.
   */
  async clearSuppressions(email: string, options: ClearOptions): Promise<ClearReport> {
    const target = this.resolveScope(options);
    const dryRun = options.dryRun ?? false;
    const wanted = new Set<SuppressionList>(
      options.lists ?? [
        "blocks",
        "bounces",
        "spamReports",
        "invalidEmails",
        "globalSuppression",
        "unsubscribeGroups",
      ],
    );

    const accounts = await this.runAcrossAccounts<AccountClearResult>(async (client) => {
      const found = await findSuppressions(client, email, wanted);
      const actions: ClearAction[] = [];

      for (const planned of found.actions) {
        if (dryRun) {
          actions.push({ ...planned, status: "would_remove" });
          continue;
        }
        try {
          await performRemoval(client, email, planned);
          actions.push({ ...planned, status: "removed" });
        } catch (err) {
          actions.push({ ...planned, status: "failed", error: serializeError(err) });
        }
      }

      return { actions, errors: found.errors };
    }, target);

    return { email, dryRun, accounts };
  }
}

// ---------------------------------------------------------------------------
// per-account helpers
// ---------------------------------------------------------------------------

type Settled<T> = { ok: true; value: T } | { ok: false; error: DiagnoseSourceError };

async function settle<T>(
  source: DiagnoseSourceError["source"],
  promise: Promise<T>,
): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (err) {
    return { ok: false, error: { source, error: serializeError(err) } };
  }
}

function valueOr<T>(result: Settled<T>, fallback: T, errors: DiagnoseSourceError[]): T {
  if (result.ok) return result.value;
  errors.push(result.error);
  return fallback;
}

async function diagnoseAccount(
  client: SendgridClient,
  email: string,
  days: number,
): Promise<AccountDiagnosis> {
  const activityQuery = buildActivityQuery({ toEmail: email, days });
  const [messagesR, blocksR, bouncesR, spamR, invalidR, globalR, groupsR] = await Promise.all([
    settle("messages", client.getMessages(activityQuery)),
    settle("blocks", client.getBlocks({ email })),
    settle("bounces", client.getBounces({ email })),
    settle("spamReports", client.getSpamReports({ email })),
    settle("invalidEmails", client.getInvalidEmails({ email })),
    settle("globalSuppression", client.checkGlobalSuppression(email)),
    settle("unsubscribeGroups", client.getUnsubscribedGroups(email)),
  ]);

  const errors: DiagnoseSourceError[] = [];
  const messages = await enrichFailedMessages(client, valueOr(messagesR, [], errors));
  const blocks = valueOr(blocksR, [], errors);
  const bounces = valueOr(bouncesR, [], errors);
  const spamReports = valueOr(spamR, [], errors);
  const invalidEmails = valueOr(invalidR, [], errors);
  const globalSuppression = valueOr(globalR, null, errors);
  const unsubscribeGroups = valueOr(groupsR, [], errors);

  const suppressedIn: SuppressionList[] = [];
  if (blocks.length) suppressedIn.push("blocks");
  if (bounces.length) suppressedIn.push("bounces");
  if (spamReports.length) suppressedIn.push("spamReports");
  if (invalidEmails.length) suppressedIn.push("invalidEmails");
  if (globalSuppression) suppressedIn.push("globalSuppression");
  if (unsubscribeGroups.length) suppressedIn.push("unsubscribeGroups");

  return {
    messages,
    blocks,
    bounces,
    spamReports,
    invalidEmails,
    globalSuppression,
    unsubscribeGroups,
    errors,
    summary: {
      suppressed: suppressedIn.length > 0,
      suppressedIn,
      messagesAvailable: messagesR.ok,
      messageCount: messages.length,
      failedMessageCount: messages.filter((m) => !DELIVERED_STATUSES.has(m.status ?? "")).length,
    },
  };
}

/**
 * For non-delivered messages, fetch the detail to pull the failure reason from
 * the events array. Runs in parallel; a failed detail lookup leaves the message as-is.
 */
async function enrichFailedMessages(
  client: SendgridClient,
  messages: EmailMessage[],
): Promise<EmailMessage[]> {
  const failed = messages
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => !DELIVERED_STATUSES.has(m.status ?? "") && m.msg_id && !m.reason);
  if (failed.length === 0) return messages;

  const details = await Promise.allSettled(
    failed.map(({ m }) => client.getMessageDetail(m.msg_id!)),
  );

  const enriched = [...messages];
  details.forEach((detail, i) => {
    if (detail.status !== "fulfilled") return;
    const reason = detail.value.events?.find((e) => e.reason)?.reason;
    if (!reason) return;
    const idx = failed[i]!.i;
    enriched[idx] = { ...enriched[idx]!, reason };
  });
  return enriched;
}

type PlannedAction = Omit<ClearAction, "status">;

async function findSuppressions(
  client: SendgridClient,
  email: string,
  wanted: Set<SuppressionList>,
): Promise<{ actions: PlannedAction[]; errors: DiagnoseSourceError[] }> {
  const checks: Array<Promise<Settled<PlannedAction[]>>> = [];

  if (wanted.has("blocks")) {
    checks.push(
      settle(
        "blocks",
        client.getBlocks({ email }).then((r) => (r.length ? [{ list: "blocks" }] : [])),
      ),
    );
  }
  if (wanted.has("bounces")) {
    checks.push(
      settle(
        "bounces",
        client.getBounces({ email }).then((r) => (r.length ? [{ list: "bounces" }] : [])),
      ),
    );
  }
  if (wanted.has("spamReports")) {
    checks.push(
      settle(
        "spamReports",
        client.getSpamReports({ email }).then((r) => (r.length ? [{ list: "spamReports" }] : [])),
      ),
    );
  }
  if (wanted.has("invalidEmails")) {
    checks.push(
      settle(
        "invalidEmails",
        client
          .getInvalidEmails({ email })
          .then((r) => (r.length ? [{ list: "invalidEmails" }] : [])),
      ),
    );
  }
  if (wanted.has("globalSuppression")) {
    checks.push(
      settle(
        "globalSuppression",
        client
          .checkGlobalSuppression(email)
          .then((r) => (r ? [{ list: "globalSuppression" }] : [])),
      ),
    );
  }
  if (wanted.has("unsubscribeGroups")) {
    checks.push(
      settle(
        "unsubscribeGroups",
        client.getUnsubscribedGroups(email).then((groups) =>
          groups.map((g) => ({
            list: "unsubscribeGroups" as const,
            groupId: g.id,
            groupName: g.name,
          })),
        ),
      ),
    );
  }

  const errors: DiagnoseSourceError[] = [];
  const actions: PlannedAction[] = [];
  for (const result of await Promise.all(checks)) {
    actions.push(...valueOr(result, [], errors));
  }
  return { actions, errors };
}

async function performRemoval(
  client: SendgridClient,
  email: string,
  action: PlannedAction,
): Promise<void> {
  switch (action.list) {
    case "blocks":
      return client.deleteBlock(email);
    case "bounces":
      return client.deleteBounce(email);
    case "spamReports":
      return client.deleteSpamReport(email);
    case "invalidEmails":
      return client.deleteInvalidEmail(email);
    case "globalSuppression":
      return client.deleteGlobalSuppression(email);
    case "unsubscribeGroups":
      if (action.groupId === undefined) {
        throw new SendgridError({
          code: "E_VALIDATION",
          message: "unsubscribeGroups removal requires a groupId",
        });
      }
      return client.deleteUnsubscribeGroupSuppression(action.groupId, email);
  }
}
