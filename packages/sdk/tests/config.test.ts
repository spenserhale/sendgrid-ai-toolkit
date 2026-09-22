import { describe, expect, it } from "vite-plus/test";
import { resolveAccounts, resolveConfig } from "../src/config.js";
import { SendgridError } from "../src/errors.js";
import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from "../src/types.js";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (err) {
    return err instanceof SendgridError ? err.code : "not-a-sendgrid-error";
  }
}

describe("resolveConfig", () => {
  it("throws E_CONFIG when no key is available", () => {
    expect(codeOf(() => resolveConfig({}, {}))).toBe("E_CONFIG");
  });

  it("reads key, base URL and timeout from env", () => {
    expect(
      resolveConfig(
        {},
        {
          SENDGRID_API_KEY: "SG.x",
          SENDGRID_BASE_URL: "https://eu.test",
          SENDGRID_TIMEOUT_MS: "5000",
        },
      ),
    ).toEqual({ apiKey: "SG.x", baseUrl: "https://eu.test", timeoutMs: 5000 });
  });

  it("applies defaults and lets overrides win", () => {
    expect(resolveConfig({ apiKey: "SG.o" }, {})).toEqual({
      apiKey: "SG.o",
      baseUrl: DEFAULT_BASE_URL,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
  });

  it("rejects a malformed timeout", () => {
    expect(
      codeOf(() => resolveConfig({}, { SENDGRID_API_KEY: "SG.x", SENDGRID_TIMEOUT_MS: "soon" })),
    ).toBe("E_CONFIG");
  });
});

describe("resolveAccounts", () => {
  it("returns overrides untouched", () => {
    const list = [{ name: "a", apiKey: "SG.a" }];
    expect(resolveAccounts(list, {})).toBe(list);
  });

  it("parses SENDGRID_ACCOUNTS and applies env-wide defaults", () => {
    const env = {
      SENDGRID_ACCOUNTS: JSON.stringify([
        { name: "a", apiKey: "SG.a" },
        { name: "b", apiKey: "SG.b", baseUrl: "https://b.test", timeoutMs: 1000 },
      ]),
      SENDGRID_TIMEOUT_MS: "9000",
    };
    expect(resolveAccounts(undefined, env)).toEqual([
      { name: "a", apiKey: "SG.a", baseUrl: undefined, timeoutMs: 9000 },
      { name: "b", apiKey: "SG.b", baseUrl: "https://b.test", timeoutMs: 1000 },
    ]);
  });

  it("falls back to SENDGRID_API_KEY as the default account", () => {
    expect(resolveAccounts(undefined, { SENDGRID_API_KEY: "SG.x" })).toEqual([
      { name: "default", apiKey: "SG.x", baseUrl: undefined, timeoutMs: undefined },
    ]);
  });

  it("prefers SENDGRID_ACCOUNTS over SENDGRID_API_KEY", () => {
    const env = {
      SENDGRID_ACCOUNTS: JSON.stringify([{ name: "a", apiKey: "SG.a" }]),
      SENDGRID_API_KEY: "SG.single",
    };
    expect(resolveAccounts(undefined, env).map((a) => a.name)).toEqual(["a"]);
  });

  it.each([
    ["invalid JSON", "not json"],
    ["wrong shape", JSON.stringify({ name: "a" })],
    ["empty array", "[]"],
    ["missing apiKey", JSON.stringify([{ name: "a" }])],
    [
      "duplicate names",
      JSON.stringify([
        { name: "a", apiKey: "1" },
        { name: "a", apiKey: "2" },
      ]),
    ],
  ])("rejects %s with E_CONFIG", (_label, value) => {
    expect(codeOf(() => resolveAccounts(undefined, { SENDGRID_ACCOUNTS: value }))).toBe("E_CONFIG");
  });

  it("throws E_CONFIG when nothing is configured", () => {
    expect(codeOf(() => resolveAccounts(undefined, {}))).toBe("E_CONFIG");
  });
});
