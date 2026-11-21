import { expect, test } from "bun:test";
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("side-by-side install preserves upstream commands and refuses occupied fork paths", () => {
  const home = mkdtempSync(join(tmpdir(), "reviewtrail-install-"));
  const root = resolve(import.meta.dir, "..");
  const bin = join(home, "bin");
  const claude = join(home, "claude");
  const pi = join(home, "pi");
  const install = () => Bun.spawnSync([process.execPath, join(root, "scripts/install-reviewtrail.ts")], {
    env: { ...process.env, HOME: home, REVIEWTRAIL_BIN_DIR: bin, CLAUDE_CONFIG_DIR: claude, PI_CODING_AGENT_DIR: pi },
  });
  try {
    mkdirSync(bin);
    const upstream = join(bin, "plannotator");
    writeFileSync(upstream, "installed upstream");
    mkdirSync(join(pi, "extensions", "reviewtrail"), { recursive: true });
    expect(install().exitCode).not.toBe(0);
    expect(lstatSync(join(bin, "reviewtrail"), { throwIfNoEntry: false })).toBeUndefined();
    rmSync(join(pi, "extensions", "reviewtrail"), { recursive: true });
    expect(install().exitCode).toBe(0);
    expect(install().exitCode).toBe(0);
    expect(readFileSync(upstream, "utf8")).toBe("installed upstream");
    expect(realpathSync(join(bin, "reviewtrail"))).toBe(join(root, "bin", "reviewtrail"));
    expect(realpathSync(join(claude, "skills", "reviewtrail"))).toBe(join(root, "integrations/claude/skills/reviewtrail"));
    expect(realpathSync(join(pi, "extensions", "reviewtrail"))).toBe(join(root, "integrations/pi"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
