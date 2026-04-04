import { SendgridClient } from "./client.js";
import { resolveAccounts } from "./config.js";
import type {
  AccountConfig,
  MultiAccountResult,
  AccountDiagnosis,
  DiagnoseReport,
} from "./types.js";

export class AccountManager {
  private readonly clients: Map<string, SendgridClient>;
  private readonly accounts: AccountConfig[];

  constructor(accounts?: AccountConfig[]) {
    this.accounts = resolveAccounts(accounts);
    this.clients = new Map();
    for (const acct of this.accounts) {
      this.clients.set(
        acct.name,
        new SendgridClient({
          apiKey: acct.apiKey,
          baseUrl: acct.baseUrl ?? "https://api.sendgrid.com",
        }),
      );
    }
  }

  getClient(accountName: string): SendgridClient {
    const client = this.clients.get(accountName);
    if (!client) {
      throw new Error(
        `Unknown account: "${accountName}". Available: ${this.getAccountNames().join(", ")}`,
      );
    }
    return client;
  }

  getAccountNames(): string[] {
    return [...this.clients.keys()];
  }

  /**
   * Run an operation across all accounts (or a specific one) in parallel.
   * Uses Promise.allSettled so one failing account doesn't block others.
   */
  async runAcrossAccounts<T>(
    operation: (client: SendgridClient) => Promise<T>,
    accountName?: string,
  ): Promise<MultiAccountResult<T>[]> {
    const targets = accountName
      ? [{ name: accountName, client: this.getClient(accountName) }]
      : [...this.clients.entries()].map(([name, client]) => ({ name, client }));

    const settled = await Promise.allSettled(
      targets.map(({ name, client }) =>
        operation(client).then((data) => ({ account: name, data })),
      ),
    );

    return settled.map((result, i) =>
      result.status === "fulfilled"
        ? result.value
        : {
            account: targets[i]!.name,
            data: null as T,
            error: String(result.reason),
          },
    );
  }

  /**
   * Diagnose delivery issues for an email address across all accounts.
   * Checks: email activity, blocks, bounces, spam reports, invalid emails,
   * and global suppressions.
   */
  async diagnose(email: string, accountName?: string): Promise<DiagnoseReport> {
    const results = await this.runAcrossAccounts<AccountDiagnosis>(async (client) => {
      const [messages, blocks, bounces, spamReports, invalidEmails, globalSuppression] =
        await Promise.all([
          client.getMessages(`to_email="${email}"`).catch(() => []),
          client.getBlocks({ email }).catch(() => []),
          client.getBounces({ email }).catch(() => []),
          client.getSpamReports({ email }).catch(() => []),
          client.getInvalidEmails({ email }).catch(() => []),
          client.checkGlobalSuppression(email).catch(() => null),
        ]);

      // For non-delivered messages, fetch the detail to get the failure reason
      // from the events array. Run in parallel, silently skip failures.
      const failedIndexes = messages
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.status !== "delivered" && m.status !== "processed" && m.msg_id);

      const details = await Promise.allSettled(
        failedIndexes.map(({ m }) => client.getMessageDetail(m.msg_id!)),
      );

      const enriched = [...messages];
      for (let i = 0; i < failedIndexes.length; i++) {
        const detail = details[i];
        if (detail?.status !== "fulfilled") continue;
        const reason = detail.value.events?.find((e) => e.reason)?.reason;
        if (!reason) continue;
        const idx = failedIndexes[i]!.i;
        enriched[idx] = { ...enriched[idx]!, reason };
      }

      return {
        messages: enriched,
        blocks,
        bounces,
        spamReports,
        invalidEmails,
        globalSuppression,
      };
    }, accountName);

    return { email, accounts: results };
  }
}
