import { exitOnPortInUse } from "./port-in-use";
import "./loopback-no-proxy";
import { startReviewServer, handleReviewServerReady } from "@reviewtrail/server/review";
import { setServerReadyTarget, setServerReadyTailnet } from "../../../packages/server/shared-handlers";
import { isRemoteSession } from "@reviewtrail/server/remote";
import { registerSession, unregisterSession } from "@reviewtrail/server/sessions";
import { readInboxRegistry } from "@reviewtrail/shared/inbox/registry";
import { parseTitleOption } from "./cli";
import { loadEmbeddedDiagramEngine } from "./diagram-engine";
import { loadEmbeddedSemDiff } from "./sem-diff";
import { getReviewTrailDataDir } from "@reviewtrail/shared/data-dir";
import { readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectOrigin } from "./detect-origin";
import { buildReviewOutput, supportsReviewApprovalNotes } from "./review-output";
import { reviewDecisionTarget } from "./decision-target";
import { detectProjectName } from "@reviewtrail/server/project";
import { buildLocalWorkspaceReview, type WorkspaceDiffType } from "@reviewtrail/server/review-workspace";
import { parseRemoteUrl } from "@reviewtrail/shared/repo";
import { childEnv, GIT_REPO_ENV } from "@reviewtrail/shared/child-env";
import { type DiffType, detectManagedVcs, prepareLocalReviewDiff, gitRuntime } from "@reviewtrail/server/vcs";
import { loadConfig, resolveAIEnabled, resolveSessionTailscale, sessionTailscaleOptOut, resolveDefaultDiffType, resolveDefaultDiffTypeFor } from "@reviewtrail/shared/config";
import { formatIgnoredReviewWords, parseReviewArgs, resolveReviewTarget, withReviewDirectory, type ParsedReviewArgs } from "@reviewtrail/shared/review-args";
import { resolveReviewOpenState, type ReviewOpenState } from "@reviewtrail/shared/review-open-state";
import { listBranches, type AvailableBranches } from "@reviewtrail/shared/review-core";
import { createWorktreePool, type WorktreePool, type PoolEntry } from "@reviewtrail/shared/worktree-pool";
import { parsePRUrl, checkPRAuth, fetchPR, type PRAuthResult, getCliName, getCliInstallUrl, getMRLabel, getMRNumberLabel, getDisplayRepo, getPlatformLabel, getPRNumber, getPRHeadFetchSpec, getPRCloneCommand } from "@reviewtrail/server/pr";
import { announceTailscaleSession, enableTailscaleServe } from "@reviewtrail/server/tailscale-serve";
import { takeEnvPullSessionBridgeConfig } from "@reviewtrail/server/ai-runtime";
import { readTailnetOwners, setSessionTailnetOwners, setSessionTailnetServedUrl } from "@reviewtrail/server/session-tailnet";
import { CF_ACCESS_SESSION_LINE, openSessionDoor } from "@reviewtrail/server/session-cf-access";
import { resolveCfAccess } from "@reviewtrail/shared/inbox/cf-access";
import { allowIgnoredLine } from "@reviewtrail/shared/inbox/tailnet-refusal";

const args = process.argv.slice(2);
const detectedOrigin = detectOrigin(process.env);
takeEnvPullSessionBridgeConfig();
process.once("SIGINT", () => process.exit(130));
process.once("SIGTERM", () => process.exit(143));
process.on("exit", () => unregisterSession());
const browserIdx = args.indexOf("--browser");
if (browserIdx !== -1 && args[browserIdx + 1]) {
  process.env.REVIEWTRAIL_BROWSER = args[browserIdx + 1];
  args.splice(browserIdx, 2);
}

// The caller may choose the entire review tab title.
// Before the boolean flags, so a title can never be read as one of them.
let sessionTitle: string | undefined;
try {
  const parsedTitle = parseTitleOption(args);
  sessionTitle = parsedTitle.title;
  args.splice(0, args.length, ...parsedTitle.remainingArgs);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const cloudflareAccessIdx = args.indexOf("--cloudflare-access");
const cloudflareAccessFlag = cloudflareAccessIdx !== -1;
if (cloudflareAccessFlag) args.splice(cloudflareAccessIdx, 1);
const tailscaleIdx = args.indexOf("--tailscale");
if (tailscaleIdx !== -1) args.splice(tailscaleIdx, 1);
if (cloudflareAccessFlag && tailscaleIdx !== -1) {
  console.error("Use --tailscale or --cloudflare-access, not both.");
  process.exit(1);
}
if (cloudflareAccessFlag) {
  process.env.REVIEWTRAIL_REMOTE = "0";
  process.env.REVIEWTRAIL_URL_HOST = "";
  process.env.REVIEWTRAIL_PUBLIC_URL = "";
}
const tailscaleResolved = !cloudflareAccessFlag
  ? resolveSessionTailscale(loadConfig(), process.env, tailscaleIdx !== -1)
  : { on: false, source: "default" as const };
const tailscaleFlag = tailscaleResolved.on;
const tailscaleOptOut = sessionTailscaleOptOut(tailscaleResolved.source);
if (tailscaleFlag) {
  if (tailscaleResolved.source !== "flag") {
    process.stderr.write(
      `[reviewtrail] Publishing over your tailnet (${tailscaleResolved.source === "env" ? "REVIEWTRAIL_TAILSCALE" : 'config.json "tailscale"'}).\n`,
    );
  }
  if (isRemoteSession()) {
    process.stderr.write(
      "[reviewtrail] --tailscale keeps the server loopback-bound behind `tailscale serve`; ignoring remote mode (REVIEWTRAIL_REMOTE/SSH detection) for this session.\n",
    );
  }
  process.env.REVIEWTRAIL_REMOTE = "0";
  // urlHost and publicUrl are irrelevant here — the advertised URL comes from
  // tailscale serve, and the session is local-bound. An empty-but-set env var
  // also suppresses the config-file key, avoiding the misleading
  // "set REVIEWTRAIL_REMOTE=1" local-session warning mid --tailscale run.
  process.env.REVIEWTRAIL_URL_HOST = "";
  process.env.REVIEWTRAIL_PUBLIC_URL = "";
  // "Ask this session" stays ON (#2166): the host's bridge config is kept
  // (taken at the top of this file). Over the tailnet the session opens only
  // for the Tailscale login that owns this machine (or, where Tailscale names
  // no owner, an inboxTailscaleAllow login; packages/server/session-tailnet.ts);
  // every other account gets the refusal page. Remote mode is unchanged: it
  // still turns the bridge off.
}

/**
 * --tailscale ready path: publish the loopback port over the tailnet, print
 * the HTTPS URL (with a QR for the device hop), and hand the reachable URL to
 * the ready-file side channel. Never opens a local browser. Publishing
 * failures resolve HERE with a clean actionable message and a nonzero exit —
 * under the bang-prefix skill a hanging session blocks the whole Claude Code
 * prompt, so this path must never leave the loopback server waiting. (The
 * server APIs also await ready handlers and stop the server on rejection,
 * which covers any other async onReady user.)
 *
 * A publish failure is a STARTUP failure: no reviewer ever saw the session.
 */
async function handleTailscaleReady(port: number): Promise<void> {
  // Who counts as the owner over the tailnet (the owner of this machine, or
  // the inboxTailscaleAllow logins when Tailscale names no owner), read before
  // the address exists: the session opens over the tailnet for them alone
  // (single player), so with nobody to open it for it is not published.
  const owners = readTailnetOwners();
  const failStartup = (lines: string[]): never => {
    for (const line of lines) process.stderr.write(`${line}\n`);
    process.stderr.write(`To keep working on this computer, ${tailscaleOptOut}.\n`);
    return process.exit(
      1,
    );
  };
  if ("reason" in owners) {
    failStartup([`Over Tailscale, ReviewTrail opens only for the Tailscale account that owns this computer, and it cannot tell which account that is: ${owners.reason}.`]);
    return;
  }
  if (owners.ignored && owners.logins[0]) process.stderr.write(`[reviewtrail] ${allowIgnoredLine(owners.logins[0])}\n`);
  setSessionTailnetOwners(owners.logins);
  const bridged = resolveAIEnabled() && takeEnvPullSessionBridgeConfig() !== undefined;
  if (bridged) {
    process.stderr.write(
      `[reviewtrail] Ask this session: on here, and over your tailnet for ${owners.logins.join(", ")}${owners.source === "allowlist" ? " (inboxTailscaleAllow: Tailscale names no owner for this machine)" : ""}.\n`,
    );
  }
  let url = "";
  try {
    ({ url } = enableTailscaleServe(port));
  } catch (error) {
    failStartup([error instanceof Error ? error.message : String(error)]);
  }
  setSessionTailnetServedUrl(url);
  setServerReadyTailnet({ ask: bridged });
  await announceTailscaleSession(url, port);
}

async function handleCloudflareAccessReady(port: number): Promise<void> {
  const failStartup = (line: string): never => {
    process.stderr.write(`${line}\nTo keep working on this computer, run the same command without --cloudflare-access.\n`);
    return process.exit(1);
  };
  const resolved = resolveCfAccess(loadConfig());
  if (!resolved.configured) return failStartup("Cloudflare Access requires a configured external connector.");
  if (!resolved.on) return failStartup("Cloudflare Access is turned off (REVIEWTRAIL_INBOX_CF_ACCESS).");
  if (!resolved.settings) return failStartup(`Cloudflare Access: ${resolved.error}`);
  if (!resolved.settings.sessionHost) return failStartup("The Cloudflare Access connector has no address configured for review sessions.");
  const sessionHost = resolved.settings.sessionHost;
  const dataDir = getReviewTrailDataDir();
  const entry = readInboxRegistry(dataDir);
  if (!entry?.cloudflare_access?.url) return failStartup(`Cloudflare Access is not open in the running Inbox${entry?.cloudflare_access?.error ? `: ${entry.cloudflare_access.error}` : "; restart the external connector"}.`);
  const { url } = openSessionDoor(dataDir, port, sessionHost);
  setServerReadyTailnet({ ask: resolveAIEnabled() && takeEnvPullSessionBridgeConfig() !== undefined });
  await announceTailscaleSession(url, port, CF_ACCESS_SESSION_LINE);
}

const gateIdx = args.indexOf("--gate");
let gateFlag = gateIdx !== -1;
if (gateFlag) args.splice(gateIdx, 1);
const jsonIdx = args.indexOf("--json");
const jsonFlag = jsonIdx !== -1;
if (jsonFlag) args.splice(jsonIdx, 1);
function resolveCliReviewDirectory(reviewArgs: ParsedReviewArgs, cwd: string): string | undefined {
  try {
    const target = resolveReviewTarget(reviewArgs, cwd);
    const notice = formatIgnoredReviewWords(target);
    if (notice) console.error(notice);
    // The named directory is the repository under review: a GIT_DIR the
    // calling shell exported (a git hook, a script) would send every git run
    // of the session, and the processes it starts, to another repository.
    if (target.directory) for (const name of GIT_REPO_ENV) delete process.env[name];
    return target.directory;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Resolve the `--base` / `--diff-type` open-state seed for a review
 * invocation: probe the requested base ref with git (in `cwd`), validate
 * against the provider/PR/workspace matrix, print notices on stderr, and exit
 * 1 on a fatal error (reviews have no strict-gate mode, so every failure here
 * is exit 1 like the other review startup failures). Returns the seed to
 * thread into `prepareLocalReviewDiff`. A flagless invocation is a no-op.
 */
async function resolveCliReviewOpenState(
  reviewArgs: ParsedReviewArgs,
  options: {
    isPRMode: boolean;
    isWorkspace: boolean;
    providerId?: "git" | "gitbutler" | "jj" | "p4";
    resolvedDefaultDiffType: DiffType;
    cwd?: string;
  },
): Promise<ReviewOpenState> {
  if (reviewArgs.base === undefined && reviewArgs.diffType === undefined) {
    return { notices: [] };
  }
  let baseResolves: boolean | undefined;
  let availableBranches: AvailableBranches | undefined;
  if (
    reviewArgs.base !== undefined &&
    !options.isPRMode &&
    !options.isWorkspace &&
    options.providerId === "git"
  ) {
    // The probe is the whole point of CLI-side resolution: without it a
    // typo'd base produces a confidently-mislabelled merge-base→HEAD diff
    // (review-core's since-base degrade). --end-of-options blocks flag
    // injection through hostile ref names.
    const probe = await gitRuntime.runGit(
      ["rev-parse", "--verify", "--quiet", "--end-of-options", `${reviewArgs.base}^{commit}`],
      { cwd: options.cwd },
    );
    baseResolves = probe.exitCode === 0;
    if (!baseResolves) {
      // Near-match suggestions: cheap (one for-each-ref) and the single most
      // useful thing an agent caller can act on.
      availableBranches = await listBranches(gitRuntime, options.cwd);
    }
  }
  const openState = resolveReviewOpenState({
    parsed: reviewArgs,
    isPRMode: options.isPRMode,
    isWorkspace: options.isWorkspace,
    providerId: options.providerId,
    resolvedDefaultDiffType: options.resolvedDefaultDiffType,
    baseResolves,
    availableBranches,
  });
  if (openState.error) {
    console.error(openState.error);
    process.exit(1);
  }
  for (const notice of openState.notices) console.error(notice);
  return openState;
}
function noteGhAccountForThisRun(access: PRAuthResult): Record<string, string> | undefined {
  if (access.notice) console.error(access.notice);
  return access.childEnv;
}

// "-" means stdin; file paths resolve against the given cwd. A read failure
// is a startup failure: exit 1 like every other review startup failure.
async function readStaticPatch(patchFile: string, cwd: string): Promise<{ rawPatch: string; gitRef: string }> {
  try {
    const rawPatch = patchFile === "-"
      ? await Bun.stdin.text()
      : await Bun.file(path.resolve(cwd, patchFile)).text();
    if (!rawPatch.trim()) {
      console.error("Static patch review requires non-empty unified-diff content.");
      process.exit(1);
    }
    return { rawPatch, gitRef: patchFile === "-" ? "stdin patch" : patchFile };
  } catch (err) {
    console.error(`Failed to read patch file: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
const reviewArgs = parseReviewArgs(args.slice(1));
// Argument-shape failures (unknown/typo'd flags) refuse to start a session:
// silently dropping them is how `--bse main` used to open a review as if
// nothing happened. Review has no strict-gate mode, so this is exit 1 like
// every other review startup failure.
if (reviewArgs.errors.length > 0) {
  for (const parseError of reviewArgs.errors) console.error(parseError);
  console.error("Run 'reviewtrail --help' for usage.");
  process.exit(1);
}
const urlArg = reviewArgs.prUrl;
const reviewDirectory = resolveCliReviewDirectory(reviewArgs, process.env.REVIEWTRAIL_CWD || process.cwd());
let reviewCwd = reviewDirectory ?? process.cwd();
const isPRMode = urlArg !== undefined;
const useLocal = isPRMode && reviewArgs.useLocal;
// Caller-pinned open state: `--base` / `--diff-type` seed this session only
// (nothing is persisted). Pinned sessions advertise openStatePinned so the
// client's mount effects don't auto-switch the diff away from the flags.
const openStatePinned = reviewArgs.base !== undefined || reviewArgs.diffType !== undefined;
let initialBaseFromFlags: string | undefined;
let initialBaseExplicit = false;

let rawPatch: string;
let gitRef: string;
let diffError: string | undefined;
let initialFingerprint: string | undefined;
let initialFileIdentities: Record<string, string> | undefined;
let gitContext: Awaited<ReturnType<typeof prepareLocalReviewDiff>>["gitContext"] | undefined;
let prMetadata: Awaited<ReturnType<typeof fetchPR>>["metadata"] | undefined;
let prPatchIncomplete = false;
let initialDiffType: DiffType | WorkspaceDiffType | undefined;
let agentCwd: string | undefined;
let worktreePool: WorktreePool | undefined;
let worktreeCleanup: (() => void | Promise<void>) | undefined;
let workspace: Awaited<ReturnType<typeof buildLocalWorkspaceReview>> | undefined;

if (reviewArgs.patchFile) {
  const patch = await readStaticPatch(reviewArgs.patchFile, process.env.REVIEWTRAIL_CWD || process.cwd());
  rawPatch = patch.rawPatch;
  gitRef = patch.gitRef;
  initialDiffType = "static-patch";
} else if (isPRMode) {
  // --- PR Review Mode ---
  // The base comes from the pull request — the open-state flags always
  // error here (validated before any auth check or platform fetch).
  await resolveCliReviewOpenState(reviewArgs, {
    isPRMode: true,
    isWorkspace: false,
    resolvedDefaultDiffType: resolveDefaultDiffType(loadConfig()),
  });
  const prRef = parsePRUrl(urlArg);
  if (!prRef) {
    console.error(`Invalid PR/MR URL: ${urlArg}`);
    console.error("Supported formats:");
    console.error("  GitHub: https://github.com/owner/repo/pull/123");
    console.error("  Forgejo / Gitea: https://codeberg.org/owner/repo/pulls/5");
    console.error("  GitLab: https://gitlab.com/group/project/-/merge_requests/42");
    console.error("  Bitbucket Cloud: https://bitbucket.org/workspace/repo/pull-requests/7");
    process.exit(1);
  }

  const cliName = getCliName(prRef);
  const cliUrl = getCliInstallUrl(prRef);

  // The token of the gh account chosen for this PR, for its checkout steps below (#2157).
  let ghAccountEnv: Record<string, string> | undefined;
  try {
    ghAccountEnv = noteGhAccountForThisRun(await checkPRAuth(prRef));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // REST-only platforms (Bitbucket, Forgejo) have no CLI to be missing; their auth
    // error already names the env vars and token scopes to set.
    if (cliName && (msg.includes("not found") || msg.includes("ENOENT"))) {
      console.error(`${getPlatformLabel(prRef)} CLI (${cliName}) is not installed.`);
      console.error(`Install it from ${cliUrl}`);
    } else {
      console.error(msg);
    }
    process.exit(1);
  }

  console.error(`Fetching ${getMRLabel(prRef)} ${getMRNumberLabel(prRef)} from ${getDisplayRepo(prRef)}...`);
  try {
    const pr = await fetchPR(prRef);
    rawPatch = pr.rawPatch;
    gitRef = `${getMRLabel(prRef)} ${getMRNumberLabel(prRef)}`;
    prMetadata = pr.metadata;
    prPatchIncomplete = pr.patchIncomplete ?? false;
  } catch (err) {
    console.error(err instanceof Error ? err.message : "Failed to fetch PR");
    process.exit(1);
  }

  // --local: create a local checkout with the PR head for full file access.
  // The checkout is built in the BACKGROUND — the platform diff is already
  // in hand, so the review server starts immediately. The pool entry starts
  // ready:false and flips to ready when the warmup completes; consumers that
  // need real files (agent jobs, full-stack diff, code-nav) await it via
  // pool.ensure().
  if (useLocal && prMetadata) {
    // Hoisted so catch block can clean up partially-created directories
    let localPath: string | undefined;
    let sessionDir: string | undefined;
    try {
      const repoDir = process.cwd();
      const identifier = `${getDisplayRepo(prMetadata).replace(/\//g, "-")}-${getPRNumber(prMetadata)}`;
      const suffix = Math.random().toString(36).slice(2, 8);
      // Resolve tmpdir to its real path — on macOS, tmpdir() returns /var/folders/...
      // but processes report /private/var/folders/... which breaks path stripping.
      sessionDir = path.join(realpathSync(tmpdir()), `reviewtrail-pr-${identifier}-${suffix}`);
      const prNumber = getPRNumber(prMetadata);
      localPath = path.join(sessionDir, "pool", `pr-${prNumber}`);
      // GitHub/GitLab: the PR head ref on origin. Bitbucket: the source
      // branch, from the fork's URL when the PR comes from one.
      const headFetch = getPRHeadFetchSpec(prMetadata);
      const fetchRefStr = headFetch.ref;
      const headRemote = headFetch.remote ?? "origin";

      // Validate inputs from platform API to prevent git flag/path injection
      if (prMetadata.baseBranch.includes('..') || prMetadata.baseBranch.startsWith('-')) throw new Error(`Invalid base branch: ${prMetadata.baseBranch}`);
      if (!/^[0-9a-f]{40,64}$/i.test(prMetadata.baseSha)) throw new Error(`Invalid base SHA: ${prMetadata.baseSha}`);

      // Detect same-repo vs cross-repo (must match both owner/repo AND host)
      let isSameRepo = false;
      try {
        const remoteResult = await gitRuntime.runGit(["remote", "get-url", "origin"]);
        if (remoteResult.exitCode === 0) {
          const remoteUrl = remoteResult.stdout.trim();
          const currentRepo = parseRemoteUrl(remoteUrl);
          const prRepo = getDisplayRepo(prMetadata);
          const repoMatches = !!currentRepo && currentRepo.toLowerCase() === prRepo.toLowerCase();
          // Extract host from remote URL to avoid cross-instance false positives (GHE)
          const sshHost = remoteUrl.match(/^[^@]+@([^:]+):/)?.[1];
          const httpsHost = (() => { try { return new URL(remoteUrl).hostname; } catch { return null; } })();
          const remoteHost = (sshHost || httpsHost || "").toLowerCase();
          const prHost = prMetadata.host.toLowerCase();
          isSameRepo = repoMatches && remoteHost === prHost;
        }
      } catch { /* not in a git repo — cross-repo path */ }

      // Capture closure values — the warmup outlives this block.
      const warmupPath = localPath;
      const warmupSessionDir = sessionDir;
      const { baseBranch, baseSha, url: prUrl } = prMetadata;
      const prRepo = getDisplayRepo(prMetadata);
      const cloneCommand = getPRCloneCommand(prMetadata, localPath);
      // Validate repo identifier to prevent flag injection via crafted URLs
      if (/^-/.test(prRepo)) throw new Error(`Invalid repository identifier: ${prRepo}`);

      // Async spawn for background steps — spawnSync would block the event
      // loop and freeze the review server while cloning. Children are
      // tracked so a process exit mid-warmup can kill them instead of
      // letting an orphaned clone/fetch resurrect the removed session dir
      // or register a stale worktree after we're gone.
      const warmupProcs = new Set<ReturnType<typeof Bun.spawn>>();
      const runStep = async (
        cmd: string[],
        opts: { cwd?: string; env?: Record<string, string> } = {},
      ): Promise<{ exitCode: number; stderr: string }> => {
        const proc = Bun.spawn(cmd, {
          cwd: opts.cwd,
          // The chosen gh account's token goes last, so a GH_TOKEN the
          // person exported can't override it for this PR's checkout.
          env: ghAccountEnv ? childEnv({ ...opts.env, ...ghAccountEnv }) : (opts.env ?? childEnv()),
          stdout: "ignore",
          stderr: "pipe",
          windowsHide: true,
        });
        warmupProcs.add(proc);
        try {
          const [stderr, exitCode] = await Promise.all([
            new Response(proc.stderr).text(),
            proc.exited,
          ]);
          return { exitCode, stderr };
        } finally {
          warmupProcs.delete(proc);
        }
      };

      const warmup: Promise<PoolEntry> = isSameRepo
        ? (async () => {
            // ── Same-repo: fast worktree path (tracked spawns — see above) ──
            // Fetch base branch so origin/<baseBranch> is current for agent
            // diffs. Ensure baseSha is available (may fetch, which overwrites
            // FETCH_HEAD). Both MUST happen before the PR head fetch since
            // FETCH_HEAD is what worktree add uses — PR head fetch is last.
            const baseFetchRes = await runStep(["git", "fetch", "origin", "--", baseBranch], { cwd: repoDir });
            if (baseFetchRes.exitCode !== 0) throw new Error(`git fetch origin ${baseBranch} failed: ${baseFetchRes.stderr.trim()}`);
            // Best-effort baseSha availability — mirrors ensureObjectAvailable
            const catRes = await runStep(["git", "cat-file", "-t", baseSha], { cwd: repoDir });
            if (catRes.exitCode !== 0) await runStep(["git", "fetch", "origin", "--", baseSha], { cwd: repoDir });
            const headFetchRes = await runStep(["git", "fetch", headRemote, "--", fetchRefStr], {
              cwd: repoDir,
              // A fork URL fetch runs in the background: never prompt for credentials.
              ...(headFetch.remote ? { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } as Record<string, string> } : {}),
            });
            if (headFetchRes.exitCode !== 0) throw new Error(`git fetch ${headRemote} ${fetchRefStr} failed: ${headFetchRes.stderr.trim()}`);

            const addRes = await runStep(["git", "worktree", "add", "--detach", warmupPath, "FETCH_HEAD"], { cwd: repoDir });
            if (addRes.exitCode !== 0) throw new Error(`git worktree add failed: ${addRes.stderr.trim()}`);
            return { path: warmupPath, prUrl, number: prNumber, ready: true };
          })()
        : (async () => {
            // ── Cross-repo: shallow clone + fetch PR head ──
            // gh/glab repo clone doesn't accept --hostname, so the clone
            // command carries GH_HOST/GITLAB_HOST env overrides instead.
            const cloneEnv = cloneCommand.env
              ? { ...process.env, ...cloneCommand.env } as Record<string, string>
              : undefined;

            // Step 1: Fast skeleton clone (no checkout, depth 1 — minimal data transfer)
            const cloneResult = await runStep(cloneCommand.argv, { env: cloneEnv });
            if (cloneResult.exitCode !== 0) {
              throw new Error(`${cloneCommand.argv[0] === "git" ? "git clone" : `${cloneCommand.argv[0]} repo clone`} failed: ${cloneResult.stderr.trim()}`);
            }

            // Step 2: Fetch only the PR head ref (targeted, much faster than full fetch)
            const fetchResult = await runStep(
              ["git", "fetch", "--depth=200", headRemote, fetchRefStr],
              { cwd: warmupPath, ...(cloneCommand.env ? { env: cloneEnv } : {}) },
            );
            if (fetchResult.exitCode !== 0) throw new Error(`Failed to fetch PR head ref: ${fetchResult.stderr.trim()}`);

            // Step 3: Checkout PR head (critical — if this fails, worktree is empty)
            const checkoutResult = await runStep(["git", "checkout", "FETCH_HEAD"], { cwd: warmupPath });
            if (checkoutResult.exitCode !== 0) {
              throw new Error(`git checkout FETCH_HEAD failed: ${checkoutResult.stderr.trim()}`);
            }

            // Best-effort: create base refs so `git diff main...HEAD` and `git diff origin/main...HEAD` work
            const baseFetch = await runStep(["git", "fetch", "--depth=200", "origin", baseSha], { cwd: warmupPath });
            if (baseFetch.exitCode !== 0) console.error("Warning: failed to fetch baseSha, agent diffs may be inaccurate");
            await runStep(["git", "branch", "--", baseBranch, baseSha], { cwd: warmupPath });
            await runStep(["git", "update-ref", `refs/remotes/origin/${baseBranch}`, baseSha], { cwd: warmupPath });

            return { path: warmupPath, prUrl, number: prNumber, ready: true };
          })();

      // --local only provides a sandbox path for agent processes.
      // Do NOT set gitContext — that would contaminate the diff pipeline.
      agentCwd = localPath;

      // Pool starts with the initial PR as a not-ready entry; the seeded
      // warmup flips it to ready (or leaves it not-ready on failure).
      worktreePool = createWorktreePool(
        { sessionDir, repoDir, isSameRepo },
        { path: localPath, prUrl, number: prNumber, ready: false },
        warmup,
      );

      worktreeCleanup = async () => {
        if (isSameRepo && worktreePool) await worktreePool.cleanup(gitRuntime);
        try { rmSync(warmupSessionDir, { recursive: true, force: true }); } catch {}
      };
      process.once("exit", () => {
        // Best-effort sync cleanup: kill in-flight warmup children first so
        // an orphaned clone/fetch can't write into the dir we're removing,
        // then remove each pool worktree from git, then rm session dir.
        for (const proc of warmupProcs) { try { proc.kill(); } catch {} }
        if (isSameRepo) {
          try {
            for (const entry of worktreePool?.entries() ?? []) {
              Bun.spawnSync(["git", "worktree", "remove", "--force", entry.path], { cwd: repoDir, env: childEnv(), windowsHide: true });
            }
          } catch {}
          // Clear any registration left by a worktree add that completed
          // after the kill (or by a not-ready entry the loop can't see).
          try { Bun.spawnSync(["git", "worktree", "prune"], { cwd: repoDir, env: childEnv(), windowsHide: true }); } catch {}
        }
        try { Bun.spawnSync(["rm", "-rf", warmupSessionDir], { env: childEnv(), windowsHide: true }); } catch {}
      });

      console.error(isSameRepo
        ? "Preparing local worktree in the background..."
        : `Cloning ${prRepo} (shallow) in the background...`);
      warmup.then(
        () => console.error(`Local checkout ready at ${warmupPath}`),
        (err) => {
          console.error("Warning: local checkout failed — features needing local files (agents, full-stack diff) are limited");
          console.error(err instanceof Error ? err.message : String(err));
          try { rmSync(warmupSessionDir, { recursive: true, force: true }); } catch {}
        },
      );
    } catch (err) {
      console.error(`Warning: --local failed, falling back to remote diff`);
      console.error(err instanceof Error ? err.message : String(err));
      if (sessionDir) try { rmSync(sessionDir, { recursive: true, force: true }); } catch {}
      agentCwd = undefined;
      worktreePool = undefined;
      worktreeCleanup = undefined;
    }
  }
} else {
  // --- Local Review Mode ---
  const config = loadConfig();
  const managedVcs = await detectManagedVcs(reviewCwd, reviewArgs.vcsType);
  if (reviewDirectory) reviewCwd = await managedVcs?.getRoot?.(reviewCwd) ?? reviewCwd;
  const forcedVcs = !!reviewArgs.vcsType && reviewArgs.vcsType !== "auto";

  if (managedVcs || forcedVcs) {
    const providerId = (managedVcs?.id ?? reviewArgs.vcsType) as
      | "git"
      | "gitbutler"
      | "jj"
      | "p4"
      | undefined;
    const openState = await resolveCliReviewOpenState(reviewArgs, {
      isPRMode: false,
      isWorkspace: false,
      providerId,
      resolvedDefaultDiffType: resolveDefaultDiffType(config),
      cwd: reviewCwd,
    });
    const diffResult = await prepareLocalReviewDiff({
      cwd: reviewCwd,
      vcsType: reviewArgs.vcsType,
      requestedDiffType: openState.requestedDiffType,
      requestedBase: openState.requestedBase,
      configuredDiffType: resolveDefaultDiffTypeFor(config, managedVcs?.id),
      hideWhitespace: config.diffOptions?.hideWhitespace ?? false,
    });
    gitContext = diffResult.gitContext;
    initialDiffType = diffResult.diffType;
    rawPatch = diffResult.rawPatch;
    gitRef = diffResult.gitRef;
    diffError = diffResult.error;
    initialFingerprint = diffResult.fingerprint;
    // Forward the base the patch was actually computed against — without it
    // the server would serve this patch under the detected default: a
    // mixed-base review (wrong file-content fetches, wrong agent prompts).
    // Evolution diff opens on the change's previous state, not the line base.
    if (openState.requestedBase !== undefined || diffResult.diffType === "jj-evolog") initialBaseFromFlags = diffResult.base;
    initialBaseExplicit = openState.requestedBase !== undefined;
    initialFileIdentities = diffResult.fileIdentities;
  } else {
    // Multi-repo workspace review has no base parameter — the open-state
    // flags always error here.
    await resolveCliReviewOpenState(reviewArgs, {
      isPRMode: false,
      isWorkspace: true,
      resolvedDefaultDiffType: resolveDefaultDiffType(config),
    });
    workspace = await buildLocalWorkspaceReview(reviewCwd, {
      configuredDiffType: resolveDefaultDiffType(config),
      hideWhitespace: config.diffOptions?.hideWhitespace ?? false,
    });
    if (workspace.repos.length === 0) {
      console.error("Not in a VCS repo and no nested Git/JJ/GitButler repositories were found.");
      process.exit(1);
    }
    rawPatch = workspace.rawPatch;
    gitRef = workspace.gitRef;
    diffError = workspace.error;
    initialDiffType = workspace.diffType;
    agentCwd = workspace.root;
  }
}

const reviewProject = (await detectProjectName(reviewCwd)) ?? "_unknown";
// What this review is of, in full: named by the ready file, the registry
// and every decision record, so a host never guesses it from words.
const reviewTarget = reviewDecisionTarget({
  prUrl: urlArg,
  patchFile: reviewArgs.patchFile,
  cwd: reviewCwd,
  invocationCwd: process.env.REVIEWTRAIL_CWD || process.cwd(),
});
setServerReadyTarget(reviewTarget);

// Start review server (even if empty - user can switch diff types in local mode)
const startReview = exitOnPortInUse(startReviewServer, message => {
  console.error(message);
  process.exit(1);
});
const server = await startReview({
  rawPatch,
  gitRef,
  error: diffError,
  origin: detectedOrigin,
  project: reviewProject,
  // `--title`: the tab names what the caller chose (#2289).
  title: sessionTitle,
  includeReviewDirectory: !!reviewDirectory,
  diffType: workspace ? (initialDiffType ?? workspace.diffType) : gitContext ? (initialDiffType ?? "unstaged") : initialDiffType,
  gitContext,
  initialBase: initialBaseFromFlags,
  initialBaseExplicit,
  openStatePinned,
  // `--no-git-remote-check` (#1553): session-only, and only ever a disable —
  // undefined leaves REVIEWTRAIL_GIT_REMOTE_CHECK / config.gitRemoteCheck deciding.
  gitRemoteCheck: reviewArgs.gitRemoteCheck,
  initialFingerprint,
  initialFileIdentities,
  prMetadata,
  prPatchIncomplete,
  workspace,
  agentCwd,
  worktreePool,
  // The approved branch below prints result.feedback after the prompt, so
  // this CLI's origins may see approve-carrying menu items (spec §6.4).
  approvalNotesSupported: supportsReviewApprovalNotes(detectedOrigin),
  htmlContent: readFileSync(new URL("../dist/index.html", import.meta.url), "utf8"),
  diagramEngine: loadEmbeddedDiagramEngine,
  semDiff: loadEmbeddedSemDiff,
  tailnetPublished: tailscaleFlag || cloudflareAccessFlag,
  onCleanup: worktreeCleanup,
  onReady: async (url, isRemote, port) => {
    if (cloudflareAccessFlag) {
      await handleCloudflareAccessReady(port);
      return;
    }
    if (tailscaleFlag) {
      await handleTailscaleReady(port);
      return;
    }
    await handleReviewServerReady(url, isRemote, port);

  },
});

registerSession({
  pid: process.pid,
  port: server.port,
  url: server.url,
  mode: "review",
  project: reviewProject,
  startedAt: new Date().toISOString(),
  label: isPRMode ? `${getMRLabel(prMetadata!).toLowerCase()}-review-${getDisplayRepo(prMetadata!)}${getMRNumberLabel(prMetadata!)}` : `review-${reviewProject}`,
  ...(reviewTarget ? { target: reviewTarget } : {}),
});

// Wait for user feedback
const result = await server.waitForDecision();

// Give browser time to receive response and update UI
await Bun.sleep(1500);

// Cleanup
server.stop();


// Output feedback (captured by slash command)
result.feedback = withReviewDirectory(result.feedback, result.reviewDirectory);
const output = buildReviewOutput(result, detectedOrigin);
console.log(jsonFlag ? JSON.stringify(output) : output.message);
process.exit(0);
