import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

// `npx skills add` parses this frontmatter as YAML. An unquoted scalar with
// ": " inside is read as a nested mapping and the skill is silently skipped.
const skill = readFileSync(
  resolve(import.meta.dirname, "..", "..", "..", "sendgrid-cli", "SKILL.md"),
  "utf8",
);

function frontmatter(): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  if (!match) throw new Error("SKILL.md has no frontmatter block");
  const out: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const idx = line.indexOf(": ");
    expect(idx, `frontmatter line lacks "key: value": ${line}`).toBeGreaterThan(0);
    out[line.slice(0, idx)] = line.slice(idx + 2);
  }
  return out;
}

describe("sendgrid-cli/SKILL.md frontmatter", () => {
  it("declares name and description", () => {
    const fm = frontmatter();
    expect(fm.name).toBe("sendgrid-cli");
    expect(fm.description).toBeTruthy();
  });

  it("quotes every value that contains a YAML mapping indicator", () => {
    const fm = frontmatter();
    for (const [key, value] of Object.entries(fm)) {
      if (value.startsWith('"')) {
        // Double-quoted YAML scalars are a superset of JSON strings.
        expect(() => JSON.parse(value), `${key} is not a valid quoted scalar`).not.toThrow();
      } else {
        expect(value, `${key} must be quoted (contains ": " or " #")`).not.toMatch(/: | #/);
      }
    }
  });
});
