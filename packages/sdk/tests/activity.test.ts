import { describe, expect, it } from "vite-plus/test";
import { buildActivityQuery, quoteActivityValue } from "../src/activity.js";

const NOW = new Date("2026-09-22T12:00:00Z");

describe("buildActivityQuery", () => {
  it("returns undefined when nothing is requested", () => {
    expect(buildActivityQuery({})).toBeUndefined();
    expect(buildActivityQuery({ days: 0 })).toBeUndefined();
  });

  it("builds an unbounded recipient query when days is 0", () => {
    expect(buildActivityQuery({ toEmail: "x@y.com", days: 0 })).toBe('to_email="x@y.com"');
  });

  it("time-boxes the query with a BETWEEN clause", () => {
    expect(buildActivityQuery({ toEmail: "x@y.com", days: 30, now: NOW })).toBe(
      'to_email="x@y.com" AND last_event_time BETWEEN TIMESTAMP "2026-08-23T12:00:00Z" AND TIMESTAMP "2026-09-22T12:00:00Z"',
    );
  });

  it("emits only the window when no recipient is given", () => {
    expect(buildActivityQuery({ days: 1, now: NOW })).toBe(
      'last_event_time BETWEEN TIMESTAMP "2026-09-21T12:00:00Z" AND TIMESTAMP "2026-09-22T12:00:00Z"',
    );
  });

  it("escapes quotes and backslashes in values", () => {
    expect(quoteActivityValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it("rejects negative windows", () => {
    expect(() => buildActivityQuery({ days: -1 })).toThrowError(/non-negative/);
  });
});
