# Plannotator Review

A personal code review fork of [Plannotator](https://github.com/backnotprop/plannotator). Follow a changed behavior from its caller through the implementation to its outcome. Each scenario shows the agent's explanation alongside short source passages from the exact patch under review.

## Run the fork

Install Bun 1.4.4 or newer, Node.js 22.19 or newer, and Git. GitHub PR review also uses an authenticated GitHub CLI. Guide generation uses an agent CLI configured in Plannotator.

From the fork checkout, build the review UI and its command host:

```sh
bun install --frozen-lockfile
bun run build:review && bun run build:hook
export PATH="$PWD/bin:$PATH"
```

In the repository you want to review, launch one of these:

```sh
plannotator-review --diff-type unstaged
plannotator-review --diff-type staged
plannotator-review --diff-type last-commit
plannotator-review --base main --diff-type since-base
plannotator-review https://github.com/OWNER/REPO/pull/123
```

If you already use the upstream slash command, start your agent from the shell with the fork's bin directory on PATH. Its existing `/plannotator-review` command invokes `plannotator review`, which opens this checkout's UI. You can also run the review-only launcher by absolute path. The underlying source checkout includes the upstream packages that supply local and hosted reviews.

Select **Guide → Generate guide → Reading path**. Choose a behavior, follow the passages in order, and use **More context** or **Full file diff** to inspect the evidence. **Comment on lines** opens the normal annotation composer. Send your comments to the agent, or submit them to GitHub from a PR review. You choose the final review action.

The tests section starts folded. Summarized files and files outside the guide remain accessible. **Full guide and diffs** opens Plannotator's original annotated view. Older saved guides retain their original prose and file summaries. Generate a new guide to get linked passages.

## Development

Use `bun run dev:review` for the UI. Rebuild the review app before its command host after editing the UI. For the bundled OpenCode plugin, run `bun run build:opencode` after the host build.

The [review plan](REVIEW_PLAN.md) tracks implementation, open work, and how to evaluate the 90% time-reduction target. Upstream's MIT and Apache 2.0 license files are included in this checkout.
