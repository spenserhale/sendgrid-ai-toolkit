import { createHash } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import {
  compareSemver,
  isCompiledBinary,
  resolveAssetName,
  runUpgrade,
  type UpgradeDeps,
} from "../src/commands/upgrade.js";

function deps(overrides: Partial<UpgradeDeps> = {}) {
  const logs: string[] = [];
  const errors: string[] = [];
  const d: UpgradeDeps = {
    log: (m) => logs.push(m),
    error: (m) => errors.push(m),
    exit: ((code: number) => {
      throw new Error(`exit ${code}`);
    }) as UpgradeDeps["exit"],
    fetch: (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch,
    execPath: "/usr/local/bin/sendgrid",
    currentVersion: "0.2.0",
    platform: "darwin",
    arch: "arm64",
    writeBinary: async () => {},
    replaceBinary: async () => {},
    ...overrides,
  };
  return { d, logs, errors };
}

describe("upgrade helpers", () => {
  it("compares semver with and without v prefix", () => {
    expect(compareSemver("0.2.0", "v0.2.0")).toBe(0);
    expect(compareSemver("0.2.0", "0.10.0")).toBe(-1);
    expect(compareSemver("1.0.0", "0.9.9")).toBe(1);
  });

  it("maps platform/arch to release asset names", () => {
    expect(resolveAssetName("darwin", "arm64")).toBe("sendgrid-darwin-arm64");
    expect(resolveAssetName("win32", "x64")).toBe("sendgrid-windows-x64.exe");
    expect(resolveAssetName("freebsd", "x64")).toBeNull();
  });

  it("detects the compiled binary by exec path", () => {
    expect(isCompiledBinary("/home/u/.local/bin/sendgrid")).toBe(true);
    expect(isCompiledBinary("C:\\bin\\sendgrid.exe")).toBe(true);
    expect(isCompiledBinary("/usr/bin/bun")).toBe(false);
  });
});

describe("runUpgrade", () => {
  it("refuses when not running as the compiled binary", async () => {
    const { d, errors } = deps({ execPath: "/usr/bin/bun" });
    await expect(runUpgrade(d, { check: false, force: false, version: undefined })).rejects.toThrow(
      "exit 1",
    );
    expect(errors[0]).toContain("standalone binary");
  });

  it("--check reports up to date without downloading", async () => {
    let fetches = 0;
    const { d, logs } = deps({
      fetch: (async () => {
        fetches++;
        return new Response(JSON.stringify({ tag_name: "v0.2.0" }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    await runUpgrade(d, { check: true, force: false, version: undefined });
    expect(fetches).toBe(1);
    expect(logs.at(-1)).toBe("You are on the latest version.");
  });

  it("downloads, verifies the checksum, and replaces the binary", async () => {
    const payload = Buffer.from("binary-bytes");
    const sha = createHash("sha256").update(payload).digest("hex");
    const written: string[] = [];
    const replaced: string[] = [];
    const { d, logs } = deps({
      fetch: (async (url: string | URL | Request) => {
        const u = String(url);
        if (u.endsWith("/releases/latest")) {
          return new Response(JSON.stringify({ tag_name: "v0.3.0" }), { status: 200 });
        }
        if (u.endsWith(".sha256")) return new Response(`${sha}  sendgrid-darwin-arm64\n`);
        return new Response(payload);
      }) as unknown as typeof fetch,
      writeBinary: async (path) => {
        written.push(path);
      },
      replaceBinary: async (target, tmp) => {
        replaced.push(`${tmp} -> ${target}`);
      },
    });
    await runUpgrade(d, { check: false, force: false, version: undefined });
    expect(written[0]).toMatch(/\.sendgrid-upgrade-\d+\.tmp$/);
    expect(replaced[0]).toContain("-> /usr/local/bin/sendgrid");
    expect(logs.at(-1)).toBe("Upgraded to 0.3.0.");
  });

  it("rejects a checksum mismatch", async () => {
    const { d } = deps({
      fetch: (async (url: string | URL | Request) => {
        const u = String(url);
        if (u.endsWith(".sha256")) return new Response("deadbeef  x\n");
        return new Response("bytes");
      }) as unknown as typeof fetch,
    });
    await expect(runUpgrade(d, { check: false, force: true, version: "0.9.0" })).rejects.toThrow(
      /Checksum mismatch/,
    );
  });
});
