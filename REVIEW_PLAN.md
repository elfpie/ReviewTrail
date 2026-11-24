# ReviewTrail plan

## Goal

Reach at least 9/10 satisfaction for each reviewer on typical 2,000-line agent-written changes. The reviewer should be able to explain the behavior, assess the design, and decide what ships. The secondary target is a 90% reduction in active reading time against upstream Plannotator’s guided review.

## Working checklist

- [x] Base the fork on upstream Plannotator and retain its review command, diff modes and annotation delivery.
- [x] Generate scenario chapters that walk from a caller or trigger to an observable outcome. Identify before/after behavior, important branches, architectural decisions, uncertainty and repeated changes.
- [x] Show excerpts in execution order with inline explanations, expandable context and line-anchored reviewer comments. Let a path revisit a file and distinguish branching or concurrent work.
- [x] Account for files outside the walkthrough and fold tests at the end. Keep the full diff accessible.
- [x] Package a review-only entry point and verify a local review round trip.
- [x] Give the fork its own command, data directory, browser preferences, Claude Code skill and Pi extension so it can run alongside Plannotator.
- [x] Rename the fork-owned packages, environment variables, UI, theme IDs and guide format to ReviewTrail. Verify that older guide files still open and that migrating a fork preference preserves the upstream cookie.
- [x] Inventory external requests, including optional transfers of review content. Record the user's approval for GitHub review operations and the configured LLM in [the network inventory](NETWORK_AUDIT.md).
- [x] Remove usage telemetry (N1), upstream starring (N4), and hosted guide sharing (N13). Keep a local, self-contained HTML export.
- [x] Extract a single review server for Claude and Pi. Remove the plan, annotation, Inbox, relay, mobile, marketing and hosted-service applications.
- [ ] Verify the installed skill in the Claude Code Desktop GUI on the target corporate machine.
- [ ] Try the fork on comparable familiar and unfamiliar PRs. Record active minutes, lines or paths revisited, missed behavior, and verdict changes on a full-diff follow-up.
- [x] Add unchanged-caller evidence, optional failure questions, design rationale, exact repeat grouping and review follow-up across revisions.
- [ ] Run the satisfaction trial below with human reviewers and prioritize the lowest-scoring task.

## Acceptance for the first version

A reviewer can follow an input through multiple files, inspect the exact code that supports a claim, leave their own feedback on a line, and find changes outside the reading path. A saved guide must retain its original evidence after the worktree changes. The reviewer explicitly controls approval and feedback submission.

## Evaluation

Alternate comparable fresh PRs between upstream and the fork. Include unfamiliar repositories and at least one change with many callers and an exceptional branch. Record the time to a decision and a short explanation of the behavior and architecture before checking the full diff. Count a missed material issue or changed verdict even when the initial pass was fast. Calculate time reduction as 1 minus fork minutes divided by baseline minutes within comparable groups.

## First build verification

- The review-only launcher returned the correct patch and reviewer feedback for staged, unstaged and last-commit changes in a disposable Git repository.
- A clean-room trial generated a guide for upstream commit `5cf5177`. The application parser resolved all 27 authored passages in its 58-file, 2,388-line patch. This checked the references, not a human review-time reduction.
- Regression tests cover old/new line anchors, changed-file comment gating, test folding, persisted snapshots and platform submission through test adapters.
- The production browser smoke test opened the 58-file guide, expanded source context, navigated between behaviors, marked progress, switched to the full diff and back, and opened the line-comment composer.
- The focused suites passed 63 checks. A standalone review-editor TypeScript check still reports errors in other upstream files.

## Side-by-side and network verification

- Ran the two launchers at the same time on one staged change. Each had a separate port, readiness file, data directory and reviewer comment.
- Pi 0.84.4 loaded both extensions and registered both slash commands once. Its ReviewTrail command opened the expected staged diff.
- Exercised the personal Claude skill instructions against the real launcher in a scratch repository. A live Claude Desktop GUI session is still pending.
- Exercised the production reader on the 58-file patch with a local stand-in for the guide provider. The browser requested 46 distinct loopback paths and zero external origins. The test also preserved an existing upstream preference cookie.
- The next iteration added prediction questions, unchanged callers and cross-revision follow-up. Human timing and satisfaction trials remain open.

## Offline guide acceptance

Downloaded a guide from the production reader for a 58-file, 2,388-line patch. After the review server stopped, Chromium opened the file with networking and JavaScript disabled. Six chapters, 27 code excerpts, and 58 expandable file diffs were present. Opening the file made zero HTTP requests.

The review-only checkout built from its frozen dependency lock. The core suite passed 5,150 tests and the isolated DOM suite passed 1,349. A fake GitHub CLI exercised PR access refusal, account selection and local clone/fetch without contacting GitHub. Pi opened a staged change from its real slash command. The server type check passed. The standalone editor type check still reports upstream errors.

## Satisfaction trial

The primary target is at least 9/10 from **each** participating reviewer after two weeks. Record individual scores and the lowest score. A 90% reduction in active review time is a separate target. Automated checks provide no estimate of either outcome.

Alternate comparable, previously unseen PRs between ReviewTrail and the upstream guided review. Include a roughly 2,000-line PR in a familiar repo and one in an unfamiliar repo. For each review, record active reading minutes separately from guide generation and interruptions. Before reading the full diff, have the reviewer explain an affected caller, predict a failure outcome, identify the supporting test or coverage gap, and record their design objection or merge decision. After an agent revision, check whether they can find their original objection and identify which previously reviewed evidence changed.

After the full-diff follow-up, record missed material issues and changes of verdict. At the end of the trial ask each reviewer “How satisfied are you using ReviewTrail for the PRs you own, from 0 to 10?” and “What took the most effort?” Keep the answers and timings locally. A higher speed or satisfaction score cannot compensate for a missed material issue.

## Evidence and follow-up verification

A fresh agent used the guide instructions in a scratch repository and produced a reading path from a changed retry default into an unchanged worker. The production reader checked and displayed the caller, both policy versions and a failure-specific test. The downloaded guide retained the caller after the server stopped with browser networking and JavaScript disabled.

On a second staged revision, the production reader presented the original comment, its original source and the changed default, and resurfaced the reviewed worker behavior. The reviewer explicitly resolved and reopened the comment and acknowledged the revision. The browser made zero external requests in this fixture. A separate regression covers an unrelated hunk changing in the same large file.

The production build and server type check passed. The unit and integration run passed 5,171 checks. The isolated DOM run passed 1,349. One timing-sensitive diff-cache test failed under concurrent suite load and passed on the full serial rerun. The standalone editor type check still reports 118 existing diagnostics. Pi opened the staged review through its registered slash command, generated the verified caller with a fixture provider, and recorded the marked behavior. The fake GitHub CLI tests passed. Live Claude Desktop on the corporate machine and human satisfaction scores are still pending.

## Upstream sync

Integrated the review changes from upstream revision `800fc3af9` (package version 0.29.3). The file tree supports include and exclude patterns, file-level comments can carry attachments, and SVG changes offer image and source views. The review now supports opening an explicit Forgejo or Gitea pull-request URL. The network inventory describes the API traffic. The review app disables external diagram resources through the renderer’s host setting.

The fork continues to use its own Claude and Pi launchers and self-contained HTML exports. The upstream Inbox, hosted guide services, telemetry and Linear integration are outside this fork.
