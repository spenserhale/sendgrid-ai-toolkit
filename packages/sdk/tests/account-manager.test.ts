import { afterEach, describe, expect, it } from "vite-plus/test";
import { AccountManager } from "../src/account-manager.js";
import { SendgridError } from "../src/errors.js";
import { mockFetch, type MockFetchHandle } from "./helpers/mock-fetch.js";

const ACCOUNTS = [
  { name: "alpha", apiKey: "SG.a", baseUrl: "https://alpha.test" },
  { name: "beta", apiKey: "SG.b", baseUrl: "https://beta.test" },
];

let fetchMock: MockFetchHandle | undefined;

afterEach(() => {
  fetchMock?.restore();
  fetchMock = undefined;
});

/** Route every read endpoint for one account to "clean" responses. */
function cleanAccount(m: MockFetchHandle, host: string) {
  m.route(`${host}/v3/messages`, { body: { messages: [] } }, "GET");
  m.route(`${host}/v3/suppression/blocks`, { body: [] }, "GET");
  m.route(`${host}/v3/suppression/bounces`, { body: [] }, "GET");
  m.route(`${host}/v3/suppression/spam_reports`, { body: [] }, "GET");
  m.route(`${host}/v3/suppression/invalid_emails`, { body: [] }, "GET");
  m.route(`${host}/v3/asm/suppressions/global/`, { body: {} }, "GET");
  m.route(new RegExp(`${host}/v3/asm/suppressions/[^/]+$`), { body: { suppressions: [] } }, "GET");
}

describe("AccountManager basics", () => {
  it("exposes account names in config order", () => {
    expect(new AccountManager(ACCOUNTS).getAccountNames()).toEqual(["alpha", "beta"]);
  });

  it("rejects unknown account names with E_VALIDATION and the valid list", () => {
    const manager = new AccountManager(ACCOUNTS);
    try {
      manager.getClient("gamma");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SendgridError);
      expect((err as SendgridError).code).toBe("E_VALIDATION");
      expect((err as SendgridError).validValues).toEqual(["alpha", "beta"]);
    }
  });
});

describe("resolveScope", () => {
  const manager = new AccountManager(ACCOUNTS);

  it("requires an explicit target", () => {
    expect(() => manager.resolveScope({})).toThrowError(/explicit target/);
  });

  it("rejects both flags together", () => {
    expect(() => manager.resolveScope({ account: "alpha", allAccounts: true })).toThrowError(
      /not both/,
    );
  });

  it("returns the account name for a single target", () => {
    expect(manager.resolveScope({ account: "beta" })).toBe("beta");
  });

  it("returns undefined for all accounts", () => {
    expect(manager.resolveScope({ allAccounts: true })).toBeUndefined();
  });

  it("validates the account name", () => {
    expect(() => manager.resolveScope({ account: "gamma" })).toThrowError(/Unknown account/);
  });
});

describe("runAcrossAccounts", () => {
  it("isolates one account's failure from the others", async () => {
    fetchMock = mockFetch();
    fetchMock.route("alpha.test", { body: [{ email: "x@y.com", created: 1, reason: "r" }] });
    fetchMock.route("beta.test", { status: 401, body: { errors: [{ message: "bad key" }] } });

    const results = await new AccountManager(ACCOUNTS).runAcrossAccounts((c) => c.getBlocks());

    expect(results[0]).toMatchObject({ account: "alpha" });
    expect(results[0]!.data).toHaveLength(1);
    expect(results[1]!.account).toBe("beta");
    expect(results[1]!.data).toBeNull();
    expect(results[1]!.error).toMatchObject({ code: "E_AUTH", exitCode: 5, statusCode: 401 });
  });

  it("targets only the named account", async () => {
    fetchMock = mockFetch({ body: [] });
    const results = await new AccountManager(ACCOUNTS).runAcrossAccounts(
      (c) => c.getBlocks(),
      "beta",
    );
    expect(results.map((r) => r.account)).toEqual(["beta"]);
    expect(fetchMock.calls[0]!.url.startsWith("https://beta.test")).toBe(true);
  });
});

describe("diagnose", () => {
  it("aggregates every source, enriches failed messages, and flags suppression", async () => {
    fetchMock = mockFetch();
    cleanAccount(fetchMock, "beta.test");
    const a = "alpha.test";
    fetchMock.route(
      `${a}/v3/messages/m1`,
      { body: { msg_id: "m1", events: [{ event_name: "bounce", reason: "mailbox full" }] } },
      "GET",
    );
    fetchMock.route(
      `${a}/v3/messages`,
      {
        body: {
          messages: [
            { msg_id: "m0", status: "delivered" },
            { msg_id: "m1", status: "not_delivered" },
          ],
        },
      },
      "GET",
    );
    fetchMock.route(`${a}/v3/suppression/blocks`, { body: [] }, "GET");
    fetchMock.route(
      `${a}/v3/suppression/bounces`,
      { body: [{ email: "x@y.com", created: 1, reason: "550" }] },
      "GET",
    );
    fetchMock.route(`${a}/v3/suppression/spam_reports`, { body: [] }, "GET");
    fetchMock.route(`${a}/v3/suppression/invalid_emails`, { body: [] }, "GET");
    fetchMock.route(
      `${a}/v3/asm/suppressions/global/`,
      { body: { recipient_email: "x@y.com" } },
      "GET",
    );
    fetchMock.route(
      new RegExp(`${a}/v3/asm/suppressions/[^/]+$`),
      {
        body: {
          suppressions: [
            { id: 1, name: "News", suppressed: true },
            { id: 2, name: "Alerts", suppressed: false },
          ],
        },
      },
      "GET",
    );

    const report = await new AccountManager(ACCOUNTS).diagnose("x@y.com", { days: 7 });

    expect(report.email).toBe("x@y.com");
    expect(report.activityWindowDays).toBe(7);
    const alpha = report.accounts[0]!.data!;
    expect(alpha.messages[1]!.reason).toBe("mailbox full");
    expect(alpha.bounces).toHaveLength(1);
    expect(alpha.globalSuppression).toEqual({ recipient_email: "x@y.com" });
    expect(alpha.unsubscribeGroups.map((g) => g.id)).toEqual([1]);
    expect(alpha.errors).toEqual([]);
    expect(alpha.summary).toEqual({
      suppressed: true,
      suppressedIn: ["bounces", "globalSuppression", "unsubscribeGroups"],
      messagesAvailable: true,
      messageCount: 2,
      failedMessageCount: 1,
    });

    const beta = report.accounts[1]!.data!;
    expect(beta.summary.suppressed).toBe(false);
    expect(beta.summary.suppressedIn).toEqual([]);

    // Activity query is time-boxed to the requested window.
    const activityCall = fetchMock.calls.find((c) => c.url.includes("alpha.test/v3/messages?"));
    expect(new URL(activityCall!.url).searchParams.get("query")).toMatch(
      /^to_email="x@y.com" AND last_event_time BETWEEN TIMESTAMP ".+" AND TIMESTAMP ".+"$/,
    );
  });

  it("records per-source failures instead of treating them as empty", async () => {
    fetchMock = mockFetch();
    cleanAccount(fetchMock, "alpha.test");
    // Override the messages route for alpha with a 403 (Email Activity add-on missing).
    fetchMock.route(
      "alpha.test/v3/messages",
      { status: 403, body: { errors: [{ message: "access forbidden" }] } },
      "GET",
    );
    // route() is first-match, so re-register the winning routes ahead by using a fresh mock.
    fetchMock.restore();
    fetchMock = mockFetch();
    fetchMock.route(
      "alpha.test/v3/messages",
      { status: 403, body: { errors: [{ message: "access forbidden" }] } },
      "GET",
    );
    cleanAccount(fetchMock, "alpha.test");

    const report = await new AccountManager([ACCOUNTS[0]!]).diagnose("x@y.com");
    const d = report.accounts[0]!.data!;
    expect(d.messages).toEqual([]);
    expect(d.summary.messagesAvailable).toBe(false);
    expect(d.errors).toHaveLength(1);
    expect(d.errors[0]).toMatchObject({
      source: "messages",
      error: { code: "E_AUTH", statusCode: 403 },
    });
    expect(d.summary.suppressed).toBe(false);
  });
});

describe("clearSuppressions", () => {
  function suppressedAlpha(m: MockFetchHandle) {
    const a = "alpha.test";
    m.route(`${a}/v3/suppression/blocks`, { body: [] }, "GET");
    m.route(
      `${a}/v3/suppression/bounces`,
      { body: [{ email: "x@y.com", created: 1, reason: "r" }] },
      "GET",
    );
    m.route(
      `${a}/v3/suppression/spam_reports`,
      { body: [{ email: "x@y.com", created: 1 }] },
      "GET",
    );
    m.route(`${a}/v3/suppression/invalid_emails`, { body: [] }, "GET");
    m.route(`${a}/v3/asm/suppressions/global/`, { body: {} }, "GET");
    m.route(
      new RegExp(`${a}/v3/asm/suppressions/[^/]+$`),
      { body: { suppressions: [{ id: 9, name: "News", suppressed: true }] } },
      "GET",
    );
  }

  it("refuses to run without an explicit scope", async () => {
    await expect(
      new AccountManager(ACCOUNTS).clearSuppressions("x@y.com", {}),
    ).rejects.toThrowError(/explicit target/);
  });

  it("dry run plans removals and issues no DELETE", async () => {
    fetchMock = mockFetch();
    suppressedAlpha(fetchMock);
    const report = await new AccountManager(ACCOUNTS).clearSuppressions("x@y.com", {
      account: "alpha",
      dryRun: true,
    });
    expect(report.dryRun).toBe(true);
    expect(report.accounts).toHaveLength(1);
    expect(report.accounts[0]!.data!.actions).toEqual([
      { list: "bounces", status: "would_remove" },
      { list: "spamReports", status: "would_remove" },
      { list: "unsubscribeGroups", groupId: 9, groupName: "News", status: "would_remove" },
    ]);
    expect(fetchMock.calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("removes from each list where present and reports per-action failures", async () => {
    fetchMock = mockFetch();
    suppressedAlpha(fetchMock);
    fetchMock.route("/v3/suppression/bounces/", { status: 204 }, "DELETE");
    fetchMock.route("/v3/suppression/spam_reports/", { status: 500, body: "boom" }, "DELETE");
    fetchMock.route("/v3/asm/groups/9/suppressions/", { status: 204 }, "DELETE");

    const report = await new AccountManager(ACCOUNTS).clearSuppressions("x@y.com", {
      account: "alpha",
    });
    const actions = report.accounts[0]!.data!.actions;
    expect(actions.map((a) => [a.list, a.status])).toEqual([
      ["bounces", "removed"],
      ["spamReports", "failed"],
      ["unsubscribeGroups", "removed"],
    ]);
    expect(actions[1]!.error).toMatchObject({ code: "E_API", statusCode: 500 });
    const deletes = fetchMock.calls
      .filter((c) => c.method === "DELETE")
      .map((c) => new URL(c.url).pathname);
    expect(deletes).toEqual([
      "/v3/suppression/bounces/x%40y.com",
      "/v3/suppression/spam_reports/x%40y.com",
      "/v3/asm/groups/9/suppressions/x%40y.com",
    ]);
  });

  it("honours a list restriction", async () => {
    fetchMock = mockFetch();
    suppressedAlpha(fetchMock);
    fetchMock.route("/v3/suppression/bounces/", { status: 204 }, "DELETE");
    const report = await new AccountManager(ACCOUNTS).clearSuppressions("x@y.com", {
      account: "alpha",
      lists: ["bounces"],
    });
    expect(report.accounts[0]!.data!.actions).toEqual([{ list: "bounces", status: "removed" }]);
    expect(fetchMock.calls.map((c) => new URL(c.url).pathname)).toEqual([
      "/v3/suppression/bounces",
      "/v3/suppression/bounces/x%40y.com",
    ]);
  });
});
