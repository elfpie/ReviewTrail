export interface ParsedTitleOption {
  /** The tab title the caller chose, whitespace collapsed; absent when not given or blank. */
  title?: string;
  remainingArgs: string[];
}

/**
 * Take `--title <text>` out of the arguments (#2289). The text becomes the
 * whole tab title, as given: runs of whitespace (a newline included) collapse
 * to one space, the ends are trimmed, and nothing is cut, so the browser
 * truncates a long title the way it truncates any other. A blank title is the
 * same as none. Throws on a missing value, a second `--title`, or a command
 * that opens no page.
 */
export function parseTitleOption(args: string[]): ParsedTitleOption {
  let title: string | undefined;
  let seen = false;
  const remainingArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg !== "--title") {
      remainingArgs.push(arg);
      continue;
    }
    if (seen) throw new Error("--title may only be specified once");
    seen = true;
    const value = args[index + 1];
    // Like --result-file: a following flag is a forgotten value, not a title.
    if (value === undefined || value.startsWith("--")) throw new Error("Missing value for --title");
    const collapsed = value.replace(/\s+/g, " ").trim();
    if (collapsed) title = collapsed;
    index += 1;
  }
  return title === undefined ? { remainingArgs } : { title, remainingArgs };
}

export const REVIEW_HELP = [
    "Usage:",
    "  reviewtrail [--git | --gitbutler] [--base <ref>] [--diff-type <type>] [--local | --no-local] [--patch-file <path | ->] [--no-git-remote-check] [--title <text>] [--tailscale | --cloudflare-access] [--gate] [--json] [DIRECTORY | PR_URL]",
    "",
    "Review local VCS changes or a GitHub, GitLab or Bitbucket Cloud pull request in the browser.",
    "",
    "Options:",
    "  --git         Force git as the VCS (skip auto-detection)",
    "  --gitbutler   Force GitButler as the VCS (requires but 0.21.0+)",
    "  --base <ref>  Open the session against this compare target (branch, origin/<branch>,",
    "                tag, or commit). Session-only; never changes your saved defaults. Git only.",
    "  --diff-type <type>",
    "                Open the session in this diff mode: since-base, local-vs-remote,",
    "                uncommitted, staged, unstaged, last-commit, branch, merge-base, all.",
    "                Session-only; never changes your saved defaults. Git only.",
    "  --local       For PR review, prepare a local checkout for full file access (default)",
    "  --no-local    For PR review, skip the local checkout (diff only)",
    "  --patch-file  Display a static unified diff from a file, or use - for stdin",
    "  --no-git-remote-check",
    "                Never contact the git remote this session: no ls-remote for the",
    "                default branch or the \"behind GitHub\" check. The compare target",
    "                stays what local refs resolve to; Fetch still works. Useful when",
    "                SSH auth costs a hardware-key touch. Also REVIEWTRAIL_GIT_REMOTE_CHECK=0",
    "                or { \"gitRemoteCheck\": false } in the data dir's config.json.",
    "  --title <text>",
    "                Name the browser tab this, in place of \"<repo> · Code Review\"",
    "  --tailscale   Publish the loopback session over your tailnet via tailscale serve (HTTPS)",
    "  --cloudflare-access",
    "                Open the session at the address of an existing Cloudflare Access connector.",
    "  --gate        You wait for the sign-off: a bare Approve reaches you too. The approval",
    "                is printed either way; an agent host that only logs a bare Approve",
    "                (the Claude Code mod) delivers it as a message.",
    "  --json        Emit one decision/message JSON record instead of plaintext",
    "  PR_URL        GitHub, GitLab, Bitbucket Cloud or Forgejo/Gitea review URL to review",
    "  DIRECTORY     Review a repo, worktree, or multi-repo workspace at this path",
    "                Relative to the invoking directory; quote paths containing spaces.",
    "",
    "  Accepts one DIRECTORY or PR_URL. Neither can be combined with --patch-file.",
    "  A sole word is a directory target: if no such folder exists (or it is a file),",
    "  the command stops with an error and opens nothing. Among several words, a",
    "  path-like word (./x, ../x, a/b, ~/x) that names a folder is the target;",
    "  other words are ignored with a notice.",
    "",
    "JSON output:",
    '  { "decision": "approved" | "annotated" | "dismissed", "message": string }',
    "  message is the rendered plaintext output without its final console newline:",
    "  configured prompts, approval-with-notes framing, and annotation-dependent instructions included.",
    "  Identify the outcome by decision, not message text.",
    "",
    "Examples:",
    "  reviewtrail",
    "  reviewtrail --git",
    "  reviewtrail ../feature-worktree",
    "  reviewtrail ./backend --diff-type last-commit",
    "  reviewtrail --gitbutler",
    "  reviewtrail --base feature/part-1   # review one layer of a stacked branch",
    "  reviewtrail --patch-file reading.diff",
    "  reviewtrail https://github.com/owner/repo/pull/123",
  ].join("\n");
