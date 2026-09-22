import { afterEach, describe, expect, it } from "vite-plus/test";
import { SendgridClient } from "../src/client.js";
import {
  SendgridAuthError,
  SendgridError,
  SendgridNotFoundError,
  SendgridRateLimitError,
  SendgridTimeoutError,
} from "../src/errors.js";
import { mockFetch, type MockFetchHandle } from "./helpers/mock-fetch.js";

const BASE = "https://sg.test";
let fetchMock: MockFetchHandle | undefined;

function client(timeoutMs = 60_000) {
  return new SendgridClient({ apiKey: "SG.key", baseUrl: BASE, timeoutMs });
}

afterEach(() => {
  fetchMock?.restore();
  fetchMock = undefined;
});

describe("SendgridClient constructor", () => {
  it("rejects an empty API key with E_CONFIG", () => {
    expect(() => new SendgridClient({ apiKey: "" })).toThrowError(SendgridError);
    try {
      new SendgridClient({ apiKey: "" });
    } catch (err) {
      expect((err as SendgridError).code).toBe("E_CONFIG");
    }
  });

  it("applies defaults", () => {
    expect(new SendgridClient({ apiKey: "SG.x" })).toBeDefined();
  });
});

describe("request plumbing", () => {
  it("sends bearer auth and query params, skipping undefined", async () => {
    fetchMock = mockFetch({ body: { messages: [] } });
    await client().getMessages(undefined, 5);
    const call = fetchMock.calls[0]!;
    expect(call.method).toBe("GET");
    expect(call.url).toBe(`${BASE}/v3/messages?limit=5`);
    expect(call.headers.authorization).toBe("Bearer SG.key");
  });

  it("returns [] for an empty 200 body on list endpoints", async () => {
    fetchMock = mockFetch({ body: "" });
    expect(await client().getBlocks()).toEqual([]);
  });

  it("maps 401 to SendgridAuthError", async () => {
    fetchMock = mockFetch({ status: 401, body: { errors: [{ message: "bad key" }] } });
    const err = await client()
      .getBlocks()
      .catch((e) => e);
    expect(err).toBeInstanceOf(SendgridAuthError);
    expect(err.code).toBe("E_AUTH");
    expect(err.exitCode).toBe(5);
    expect(err.message).toContain("bad key");
  });

  it("maps 403 to SendgridAuthError with status 403", async () => {
    fetchMock = mockFetch({ status: 403, body: { errors: [{ message: "access forbidden" }] } });
    const err = await client()
      .getMessages()
      .catch((e) => e);
    expect(err).toBeInstanceOf(SendgridAuthError);
    expect(err.statusCode).toBe(403);
  });

  it("maps 404 to SendgridNotFoundError", async () => {
    fetchMock = mockFetch({ status: 404, body: { errors: [{ message: "not found" }] } });
    const err = await client()
      .deleteBlock("x@y.com")
      .catch((e) => e);
    expect(err).toBeInstanceOf(SendgridNotFoundError);
    expect(err.exitCode).toBe(4);
  });

  it("maps 429 to SendgridRateLimitError and reads Retry-After", async () => {
    fetchMock = mockFetch({ status: 429, body: "", headers: { "Retry-After": "7" } });
    const err = await client()
      .getBounces()
      .catch((e) => e);
    expect(err).toBeInstanceOf(SendgridRateLimitError);
    expect(err.retryAfterSeconds).toBe(7);
    expect(err.exitCode).toBe(6);
  });

  it("maps other non-2xx to E_API with field-qualified messages", async () => {
    fetchMock = mockFetch({
      status: 400,
      body: { errors: [{ message: "invalid", field: "email" }] },
    });
    const err = await client()
      .getBounces()
      .catch((e) => e);
    expect(err).toBeInstanceOf(SendgridError);
    expect(err.code).toBe("E_API");
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain("email: invalid");
  });

  it("uses raw text when the error body is not the SendGrid shape", async () => {
    fetchMock = mockFetch({ status: 499, body: "rows iteration error: context deadline exceeded" });
    const err = await client()
      .getMessages()
      .catch((e) => e);
    expect(err.code).toBe("E_API");
    expect(err.message).toContain("context deadline exceeded");
  });

  it("wraps fetch failures as E_NETWORK", async () => {
    fetchMock = mockFetch({ throwError: new TypeError("fetch failed") });
    const err = await client()
      .getBlocks()
      .catch((e) => e);
    expect(err.code).toBe("E_NETWORK");
    expect(err.exitCode).toBe(1);
  });

  it("aborts slow requests as SendgridTimeoutError", async () => {
    fetchMock = mockFetch({ delayMs: 200, body: [] });
    const err = await client(20)
      .getBlocks()
      .catch((e) => e);
    expect(err).toBeInstanceOf(SendgridTimeoutError);
    expect(err.code).toBe("E_TIMEOUT");
    expect(err.message).toContain("20ms");
  });

  it("wraps invalid JSON as E_PARSE", async () => {
    fetchMock = mockFetch({ body: "{not json" });
    const err = await client()
      .getBlocks()
      .catch((e) => e);
    expect(err.code).toBe("E_PARSE");
  });
});

describe("email activity", () => {
  it("passes the query through and unwraps messages", async () => {
    fetchMock = mockFetch({ body: { messages: [{ msg_id: "a", status: "delivered" }] } });
    const result = await client().getMessages('to_email="x@y.com"', 3);
    expect(result).toEqual([{ msg_id: "a", status: "delivered" }]);
    expect(decodeURIComponent(fetchMock.calls[0]!.url)).toContain('query=to_email="x@y.com"');
  });

  it("validates message detail and surfaces schema errors as E_PARSE", async () => {
    fetchMock = mockFetch({ body: { msg_id: "a", events: "nope" } });
    const err = await client()
      .getMessageDetail("a")
      .catch((e) => e);
    expect(err.code).toBe("E_PARSE");
    expect(err.message).toContain("events");
  });

  it("returns parsed message detail", async () => {
    fetchMock = mockFetch({
      body: { msg_id: "a", events: [{ event_name: "bounce", reason: "mailbox full" }] },
    });
    const detail = await client().getMessageDetail("a/b");
    expect(detail.events?.[0]?.reason).toBe("mailbox full");
    expect(fetchMock.calls[0]!.url).toBe(`${BASE}/v3/messages/a%2Fb`);
  });
});

describe("suppression lists", () => {
  it("maps list params to SendGrid query names", async () => {
    fetchMock = mockFetch({ body: [] });
    await client().getBlocks({ email: "x@y.com", limit: 5, offset: 10, startTime: 1, endTime: 2 });
    const url = new URL(fetchMock.calls[0]!.url);
    expect(url.pathname).toBe("/v3/suppression/blocks");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      email: "x@y.com",
      limit: "5",
      offset: "10",
      start_time: "1",
      end_time: "2",
    });
  });

  it.each([
    ["deleteBlock", "/v3/suppression/blocks/"],
    ["deleteBounce", "/v3/suppression/bounces/"],
    ["deleteSpamReport", "/v3/suppression/spam_reports/"],
    ["deleteInvalidEmail", "/v3/suppression/invalid_emails/"],
    ["deleteGlobalSuppression", "/v3/asm/suppressions/global/"],
  ] as const)("%s issues DELETE with an encoded email", async (method, path) => {
    fetchMock = mockFetch({ status: 204 });
    await client()[method]("a+b@y.com");
    const call = fetchMock.calls[0]!;
    expect(call.method).toBe("DELETE");
    expect(call.url).toBe(`${BASE}${path}a%2Bb%40y.com`);
  });

  it("hits every list endpoint", async () => {
    fetchMock = mockFetch({ body: [] }, { body: [] }, { body: [] }, { body: [] });
    const c = client();
    await c.getBounces();
    await c.getSpamReports();
    await c.getInvalidEmails();
    await c.getUnsubscribeGroups();
    expect(fetchMock.calls.map((c) => new URL(c.url).pathname)).toEqual([
      "/v3/suppression/bounces",
      "/v3/suppression/spam_reports",
      "/v3/suppression/invalid_emails",
      "/v3/asm/groups",
    ]);
  });
});

describe("global suppression", () => {
  it("returns null for an empty object (not suppressed)", async () => {
    fetchMock = mockFetch({ body: {} });
    expect(await client().checkGlobalSuppression("x@y.com")).toBeNull();
  });

  it("returns the record when suppressed", async () => {
    fetchMock = mockFetch({ body: { recipient_email: "x@y.com" } });
    expect(await client().checkGlobalSuppression("x@y.com")).toEqual({
      recipient_email: "x@y.com",
    });
  });

  it("treats 404 as not suppressed", async () => {
    fetchMock = mockFetch({ status: 404, body: "" });
    expect(await client().checkGlobalSuppression("x@y.com")).toBeNull();
  });
});

describe("unsubscribe groups", () => {
  it("filters to suppressed groups only", async () => {
    fetchMock = mockFetch({
      body: {
        suppressions: [
          { id: 1, name: "A", suppressed: false },
          { id: 2, name: "B", suppressed: true },
        ],
      },
    });
    const groups = await client().getUnsubscribedGroups("x@y.com");
    expect(groups.map((g) => g.id)).toEqual([2]);
    expect(fetchMock.calls[0]!.url).toBe(`${BASE}/v3/asm/suppressions/x%40y.com`);
  });

  it("deletes a group suppression by id", async () => {
    fetchMock = mockFetch({ status: 204 });
    await client().deleteUnsubscribeGroupSuppression(42, "x@y.com");
    expect(fetchMock.calls[0]!.url).toBe(`${BASE}/v3/asm/groups/42/suppressions/x%40y.com`);
    expect(fetchMock.calls[0]!.method).toBe("DELETE");
  });
});

describe("single suppression lookups", () => {
  it("getBlock returns the first element", async () => {
    fetchMock = mockFetch({ body: [{ email: "x@y.com", created: 1, reason: "r" }] });
    expect(await client().getBlock("x@y.com")).toEqual({
      email: "x@y.com",
      created: 1,
      reason: "r",
    });
    expect(fetchMock.calls[0]!.url).toBe(`${BASE}/v3/suppression/blocks/x%40y.com`);
  });

  it("getBounce returns null for [] and for 404", async () => {
    fetchMock = mockFetch({ body: [] }, { status: 404, body: "" });
    expect(await client().getBounce("x@y.com")).toBeNull();
    expect(await client().getBounce("x@y.com")).toBeNull();
  });
});

describe("addGlobalSuppressions", () => {
  it("POSTs recipient_emails and returns the accepted list", async () => {
    fetchMock = mockFetch({ status: 201, body: { recipient_emails: ["a@y.com", "b@y.com"] } });
    expect(await client().addGlobalSuppressions(["a@y.com", "b@y.com"])).toEqual([
      "a@y.com",
      "b@y.com",
    ]);
    const call = fetchMock.calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${BASE}/v3/asm/suppressions/global`);
    expect(JSON.parse(call.body!)).toEqual({ recipient_emails: ["a@y.com", "b@y.com"] });
  });
});
