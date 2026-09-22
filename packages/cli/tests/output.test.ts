import { describe, expect, it } from "vite-plus/test";
import { renderOutput, resolveFormat } from "../src/lib/output.js";
import { exitCodeForResults, formatError } from "../src/lib/errors.js";
import { SendgridError, SendgridRateLimitError } from "@sendgrid-toolkit/sdk";

const none = { format: undefined, text: false, json: false, toon: false } as const;

describe("resolveFormat", () => {
  it("defaults to text", () => {
    expect(resolveFormat(none, {})).toBe("text");
  });

  it("honours SENDGRID_OUTPUT when no flag is set", () => {
    expect(resolveFormat(none, { SENDGRID_OUTPUT: "toon" })).toBe("toon");
    expect(resolveFormat(none, { SENDGRID_OUTPUT: "JSON" })).toBe("json");
  });

  it("lets flags beat the env", () => {
    expect(resolveFormat({ ...none, json: true }, { SENDGRID_OUTPUT: "toon" })).toBe("json");
    expect(resolveFormat({ ...none, format: "text" }, { SENDGRID_OUTPUT: "toon" })).toBe("text");
  });

  it("accepts a matching --format plus shortcut", () => {
    expect(resolveFormat({ ...none, format: "toon", toon: true }, {})).toBe("toon");
  });

  it("rejects conflicting flags with E_VALIDATION", () => {
    try {
      resolveFormat({ ...none, json: true, toon: true }, {});
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SendgridError).code).toBe("E_VALIDATION");
    }
  });

  it("rejects an unknown env format with E_CONFIG", () => {
    try {
      resolveFormat(none, { SENDGRID_OUTPUT: "yaml" });
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SendgridError).code).toBe("E_CONFIG");
    }
  });
});

describe("renderOutput", () => {
  const data = [
    { account: "a", count: 1 },
    { account: "b", count: 2 },
  ];

  it("renders JSON", () => {
    expect(JSON.parse(renderOutput(data, "json", { text: () => "" }))).toEqual(data);
  });

  it("renders TOON tabular arrays", () => {
    expect(renderOutput(data, "toon", { text: () => "" })).toBe(
      "[2]{account,count}:\n  a,1\n  b,2",
    );
  });

  it("delegates text to the command renderer", () => {
    expect(renderOutput(data, "text", { text: () => "hello" })).toBe("hello");
  });
});

describe("formatError", () => {
  it("prints code, got, valid values and hint for SendgridError", () => {
    const err = new SendgridError({
      code: "E_VALIDATION",
      message: "bad account",
      got: "x",
      validValues: ["a", "b"],
      hint: "pick one",
    });
    expect(formatError(err)).toEqual({
      exitCode: 2,
      text: 'error[E_VALIDATION]: bad account\n  got: "x"\n  valid: a, b\n  hint: pick one',
    });
  });

  it("maps rate limits to exit 6", () => {
    expect(formatError(new SendgridRateLimitError(3)).exitCode).toBe(6);
  });

  it("falls back to exit 1 for plain errors", () => {
    expect(formatError(new Error("boom"))).toEqual({ exitCode: 1, text: "error: boom" });
  });
});

describe("exitCodeForResults", () => {
  const auth = new SendgridError({ code: "E_AUTH", message: "x" }).toJSON();

  it("is 0 on full or partial success", () => {
    expect(exitCodeForResults([{ account: "a", data: 1 }])).toBe(0);
    expect(
      exitCodeForResults([
        { account: "a", data: 1 },
        { account: "b", data: null, error: auth },
      ]),
    ).toBe(0);
  });

  it("uses the first error's exit code when every account failed", () => {
    expect(exitCodeForResults([{ account: "a", data: null, error: auth }])).toBe(5);
  });
});
