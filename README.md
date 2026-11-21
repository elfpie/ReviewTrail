# ReviewTrail

ReviewTrail is a personal code-review fork of [Plannotator](https://github.com/backnotprop/plannotator). Read a change in execution order. A behavior can start in a caller, cross several files and revisit the original caller to show the outcome. Each step pairs the agent’s explanation with lines from the reviewed patch.

## Install alongside Plannotator

The source install requires Bun 1.4.4 or newer, Node.js 22.19 or newer, and Git. For GitHub PRs, authenticate the GitHub CLI. To generate a guide, configure a supported agent CLI on the same machine.

```sh
bun install --frozen-lockfile
bun run build
bun run install:reviewtrail
```

The installer links the executable into `~/.local/bin`, a personal Claude skill into `~/.claude/skills/reviewtrail`, and a Pi extension into `~/.pi/agent/extensions/reviewtrail`. Keep the checkout at its installed path and make `~/.local/bin` and Bun available on the agent’s PATH. The installer honors `REVIEWTRAIL_BIN_DIR`, `CLAUDE_CONFIG_DIR` and `PI_CODING_AGENT_DIR`. It refuses occupied destinations and can be rerun. The upstream installation keeps its own commands and plan hooks.

Start a new **local Claude Code Desktop** or **Pi** session in the repo you want to review. Run `/reviewtrail --diff-type staged` or `/reviewtrail https://github.com/OWNER/REPO/pull/123`. The personal skill uses Desktop’s Code tab. SSH sessions require installation on the SSH host. Pi returns submitted feedback to the invoking session. Questions from inside the browser use the configured review provider. [Claude Code Desktop skills](https://code.claude.com/docs/en/desktop#use-skills)

## Review from a terminal

```sh
reviewtrail --diff-type unstaged
reviewtrail --diff-type staged
reviewtrail --diff-type last-commit
reviewtrail --base main --diff-type since-base
reviewtrail https://github.com/OWNER/REPO/pull/123
```

Select **Guide → Generate guide → Reading path**. Use **More context** to expand a difficult passage, **Next behavior** to continue, or **Comment on lines** to flag an implementation detail. Tests start folded. The coverage list shows files outside the walkthrough and opens their diffs. **Full guide and diffs** restores the annotated view. Older guides retain their original prose and summaries. A newly generated guide includes source anchors.

On a contract change, expand **Caller impact** to read the existing caller and follow the same input through the old and new code. ReviewTrail labels an unchanged excerpt **Identical on both sides** after checking its source. A **What if…?** question lets you predict the outcome before opening the branch and its relevant test. **Why here?** covers the design choice. Material **Open question** sections start expanded. Groups of identical edits link back to each individual patch.

After sending feedback, reopen the same PR or local branch and comparison. **Review follow-up** lists previous comments and marked behaviors whose cited hunks changed. Expand a path to compare the original lines with the current coordinates. A moved or missing range leads back to the full diff. You can resolve or reopen each comment and mark a revision checked. Follow-up is stored on this machine. Set `REVIEWTRAIL_FEEDBACK_HISTORY=0` to turn off comment retention, or `REVIEWTRAIL_REVIEW_PROGRESS=0` to turn off cross-revision follow-up. Patch-file reviews have no stable branch or PR identity, so their guides and comments work within the review without cross-revision matching.

**Send Feedback** returns your notes to the calling agent. In a GitHub PR review, the platform submission action lets you publish comments and your verdict. You make the decision.

## Share a guide as a file

Open a generated guide and choose **Download portable guide**, or use the menu on a saved guide. Send the resulting `.html` through your chosen channel. It includes the guide, verified excerpts from unchanged callers, and the entire retained patch, including files outside the reading path. The recipient can navigate chapters, read inline explanations and expand file diffs offline in a browser. Diagrams are included as source. The live review handles comments, approval and GitHub submission.

## Settings and network traffic

ReviewTrail uses `~/.reviewtrail`, an ephemeral local port, and its own browser preference keys. Use `REVIEWTRAIL_DATA_DIR` or `REVIEWTRAIL_PORT` to override these. A policy stored only in your upstream config file needs an equivalent ReviewTrail setting. The launcher carries forward shared environment opt-outs and service destination overrides listed in [the launcher](bin/reviewtrail). For example, `reviewtrail --no-git-remote-check --diff-type staged` skips automatic Git remote discovery for that session. An explicit fetch still contacts the remote.

The [network inventory](NETWORK_AUDIT.md) lists each request type, destination, trigger, payload, and the traffic controlled by Claude Desktop and Pi. The [review plan](REVIEW_PLAN.md) tracks implementation and how to measure the 90% time-reduction target.

## Development

Run `bun run dev:review` for the UI. Run `bun run build` after editing it to refresh the local launcher’s assets. Claude and Pi both run the same Bun review server. The source includes the upstream MIT and Apache 2.0 licenses.
