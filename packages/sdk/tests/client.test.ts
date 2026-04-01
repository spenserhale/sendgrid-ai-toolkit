import { describe, expect, it } from "vitest";
import { SendgridClient } from "../src/client.js";

describe("SendgridClient", () => {
  it("should require an API key", () => {
    expect(() => new SendgridClient({ apiKey: "" })).toThrow();
  });

  it("should accept a valid config", () => {
    const client = new SendgridClient({
      apiKey: "test-key",
      baseUrl: "https://api.example.com",
    });
    expect(client).toBeDefined();
  });
});
