import { afterAll, mock } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NO_BROWSER } from "../helpers/no-browser";
import { isScratchDataDir } from "../helpers/real-data-dir";

/**
 * Sandbox every test-run store before production modules capture their paths.
 * Override even a contributor's configured data directory; tests that need a
 * different directory can set and restore the env var inside their bodies.
 */
const testDataDir = mkdtempSync(join(tmpdir(), "reviewtrail-test-"));
process.env.REVIEWTRAIL_DATA_DIR = testDataDir;
// Marks the sandbox for tests/helpers/real-data-dir.ts (the scratch check the
// Inbox helpers and tests/setup/sandbox-data-dir.ts apply).
process.env.REVIEWTRAIL_TEST_SANDBOX = testDataDir;

// A test's home is a scratch folder too: HOME for code that reads the variable and
// every child that inherits it, and a replaced `os.homedir()` in this process,
// which Bun otherwise fixes at startup. mock.module, because an earlier preload's
// named import keeps the old binding when the export is only reassigned. The real-home
// guards ask /bin/sh, so they still see the account's home. A HOME that is already
// scratch (a child `bun test`) stays. tests/never-real-home.test.ts.
const givenHome = process.env.HOME?.trim();
const ownHome = givenHome && isScratchDataDir(givenHome) ? null : realpathSync(mkdtempSync(join(tmpdir(), "reviewtrail-test-home-")));
const testHome = ownHome ?? givenHome!;
process.env.HOME = testHome;
if (process.platform === "win32") process.env.USERPROFILE = testHome;
const realOs = require("node:os");
realOs.homedir = () => testHome;
for (const name of ["node:os", "os"]) mock.module(name, () => ({ ...realOs, default: realOs }));
// These would send the skill loader back to a real folder from the contributor's shell.
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.CODEX_HOME;
delete process.env.XDG_CONFIG_HOME;

// A preload's global afterAll runs after file hooks and their awaited subprocesses.
// Use the runner lifecycle: bun test does not reliably emit process "exit".
// Only this process owns this path: never clean up the current env value, which
// a test may have overridden, or a directory inherited from a parent test run.
afterAll(() => {
  rmSync(testDataDir, { recursive: true, force: true });
  if (ownHome) rmSync(ownHome, { recursive: true, force: true });
});

// Keep the archive off by default, even when enabled in the contributor's shell.
// Archive tests opt back in inside their bodies and restore it in afterEach.
process.env.REVIEWTRAIL_FEEDBACK_HISTORY = "0";

// The agent tool switch decides whether the reviewtrail tool is registered at
// all; a contributor who set it in their shell must not change what the tests
// see (host defaults apply). Tests that need it on set it in their bodies.
delete process.env.REVIEWTRAIL_AGENT_TOOL;

// Session tests must never publish to the contributor’s tailnet.
delete process.env.REVIEWTRAIL_TAILSCALE;

// Every session a test starts, in this process or in a child that inherits
// this environment, runs a program that exits at once instead of a browser.
// Not a sentinel such as `none`: packages/server/browser.ts reads those as
// unset and opens the system default browser (tests/helpers/no-browser.ts).
// Overrides a contributor's own value too (a VS Code terminal sets one that
// routes every session into an editor tab). Tests of the browser launch set
// and restore their own value inside their bodies.
process.env.REVIEWTRAIL_BROWSER = NO_BROWSER;
