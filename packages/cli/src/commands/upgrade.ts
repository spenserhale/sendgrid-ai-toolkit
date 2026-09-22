import { buildCommand } from "@stricli/core";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CLI_NAME, CLI_VERSION } from "../version.js";
import { REPO } from "../agent-context.js";

interface UpgradeFlags {
  readonly check: boolean;
  readonly force: boolean;
  readonly version: string | undefined;
}

export interface UpgradeDeps {
  readonly log: (msg: string) => void;
  readonly error: (msg: string) => void;
  readonly exit: (code: number) => never;
  readonly fetch: typeof fetch;
  readonly execPath: string;
  readonly currentVersion: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly writeBinary: (path: string, bytes: Buffer) => Promise<void>;
  readonly replaceBinary: (target: string, tempSource: string) => Promise<void>;
}

const defaultDeps: UpgradeDeps = {
  log: (msg) => console.log(msg),
  error: (msg) => console.error(msg),
  exit: (code) => process.exit(code),
  fetch: fetch as typeof fetch,
  execPath: process.execPath,
  currentVersion: CLI_VERSION,
  platform: process.platform,
  arch: process.arch,
  writeBinary: async (path, bytes) => {
    await writeFile(path, bytes);
    await chmod(path, 0o755);
  },
  replaceBinary: async (target, tempSource) => {
    if (process.platform === "win32") {
      // Windows cannot overwrite a running executable; park it as .old first.
      const oldPath = `${target}.old`;
      if (existsSync(oldPath)) {
        try {
          await unlink(oldPath);
        } catch {
          // Leftover from a previous upgrade; the rename below surfaces any real failure.
        }
      }
      await rename(target, oldPath);
      await rename(tempSource, target);
    } else {
      await rename(tempSource, target);
    }
  },
};

export function resolveAssetName(platform: string, arch: string): string | null {
  if (platform === "linux" && arch === "x64") return `${CLI_NAME}-linux-x64`;
  if (platform === "linux" && arch === "arm64") return `${CLI_NAME}-linux-arm64`;
  if (platform === "darwin" && arch === "x64") return `${CLI_NAME}-darwin-x64`;
  if (platform === "darwin" && arch === "arm64") return `${CLI_NAME}-darwin-arm64`;
  if (platform === "win32" && arch === "x64") return `${CLI_NAME}-windows-x64.exe`;
  return null;
}

/** A bun-compiled binary has process.execPath pointing at itself (basename `sendgrid`). */
export function isCompiledBinary(execPath: string): boolean {
  const name = execPath.split(/[\\/]/).pop() ?? "";
  return name.replace(/\.exe$/i, "") === CLI_NAME;
}

export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => Number(n) || 0);
  const ap = parse(a);
  const bp = parse(b);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const x = ap[i] ?? 0;
    const y = bp[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function fetchLatestRelease(deps: UpgradeDeps): Promise<{ tag: string; version: string }> {
  const res = await deps.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { tag_name?: string };
  if (!data.tag_name) throw new Error("GitHub response missing tag_name");
  return { tag: data.tag_name, version: data.tag_name.replace(/^v/, "") };
}

async function downloadAndVerify(deps: UpgradeDeps, tag: string, asset: string): Promise<Buffer> {
  const base = `https://github.com/${REPO}/releases/download/${tag}`;
  const [assetRes, checksumRes] = await Promise.all([
    deps.fetch(`${base}/${asset}`),
    deps.fetch(`${base}/${asset}.sha256`),
  ]);
  if (!assetRes.ok) throw new Error(`Failed to download ${asset}: ${assetRes.status}`);
  if (!checksumRes.ok) throw new Error(`Failed to download checksum: ${checksumRes.status}`);

  const bytes = Buffer.from(await assetRes.arrayBuffer());
  const expected = (await checksumRes.text()).trim().split(/\s+/)[0];
  if (!expected) throw new Error("Could not parse checksum file");
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected)
    throw new Error(`Checksum mismatch: expected ${expected}, got ${actual}`);
  return bytes;
}

export async function runUpgrade(deps: UpgradeDeps, flags: UpgradeFlags): Promise<void> {
  if (!isCompiledBinary(deps.execPath)) {
    deps.error(`\`${CLI_NAME} upgrade\` is only supported on the standalone binary install.`);
    deps.error("You appear to be running from source or via bun/npx. Install the binary with:");
    deps.error(
      `  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh | sh`,
    );
    deps.exit(1);
  }

  const asset = resolveAssetName(deps.platform, deps.arch);
  if (!asset) {
    deps.error(`No prebuilt binary for ${deps.platform}/${deps.arch}.`);
    deps.error("Supported: linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64.");
    deps.exit(1);
  }

  const latest = flags.version
    ? {
        tag: flags.version.startsWith("v") ? flags.version : `v${flags.version}`,
        version: flags.version.replace(/^v/, ""),
      }
    : await fetchLatestRelease(deps);

  deps.log(`Current: ${deps.currentVersion}`);
  deps.log(`Latest:  ${latest.version}`);

  const cmp = compareSemver(deps.currentVersion, latest.version);

  if (flags.check) {
    deps.log(
      cmp >= 0
        ? "You are on the latest version."
        : `Update available. Run \`${CLI_NAME} upgrade\` to install.`,
    );
    return;
  }

  if (!flags.force && cmp >= 0) {
    deps.log("Already on the latest version.");
    return;
  }

  deps.log(`Downloading ${asset}...`);
  const bytes = await downloadAndVerify(deps, latest.tag, asset);

  const binDir = dirname(deps.execPath);
  const tmpPath = join(binDir, `.${CLI_NAME}-upgrade-${process.pid}.tmp`);
  await deps.writeBinary(tmpPath, bytes);
  await deps.replaceBinary(deps.execPath, tmpPath);

  deps.log(`Upgraded to ${latest.version}.`);
}

export const upgradeCommand = buildCommand({
  docs: {
    brief: "Upgrade the standalone binary to the latest GitHub release",
    fullDescription:
      "Downloads the matching prebuilt binary from GitHub Releases, verifies its SHA256, and " +
      "replaces the running executable. Only works for the binary installed via scripts/install.sh.",
  },
  parameters: {
    flags: {
      check: {
        kind: "boolean",
        brief: "Report whether a newer version exists; install nothing",
        default: false,
      },
      force: {
        kind: "boolean",
        brief: "Reinstall even if already on the latest version",
        default: false,
      },
      version: {
        kind: "parsed",
        parse: String,
        optional: true,
        brief: "Install a specific version (e.g. 0.2.0)",
      },
    },
  },
  async func(this: void, flags: UpgradeFlags) {
    try {
      await runUpgrade(defaultDeps, flags);
    } catch (err) {
      console.error(`error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  },
});
