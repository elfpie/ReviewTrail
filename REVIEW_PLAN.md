# ReviewTrail plan

## Goal

Cut active review time on typical 2,000-line agent-written changes by 90% while retaining the reviewer's ability to explain the behavior, assess the design, and decide what ships. The baseline is time spent using upstream Plannotator's guided review.

## Working checklist

- [x] Base the fork on upstream Plannotator and retain its review command, diff modes and annotation delivery.
- [x] Generate scenario chapters that walk from a caller or trigger to an observable outcome. Identify before/after behavior, important branches, architectural decisions, uncertainty and repeated changes.
- [x] Show excerpts in execution order with inline explanations, expandable context and line-anchored reviewer comments. Let a path revisit a file and distinguish branching or concurrent work.
- [x] Account for files outside the walkthrough and fold tests at the end. Keep the full diff accessible.
- [x] Package a review-only entry point and verify a local review round trip.
- [x] Give the fork its own command, data directory, browser preferences, Claude Code skill and Pi extension so it can run alongside Plannotator.
- [x] Inventory external requests, including optional transfers of review content. Record the user's approval for GitHub review operations and the configured LLM in [the network inventory](NETWORK_AUDIT.md).
- [ ] Apply the remaining network choices once selected and verify the resulting behavior with hosted and local review fixtures.
- [ ] Verify the installed skill in the Claude Code Desktop GUI on the target corporate machine.
- [ ] Publish the fork to the owner's GitHub account.
- [ ] Try the fork on comparable familiar and unfamiliar PRs. Record active minutes, lines or paths revisited, missed behavior, and verdict changes on a full-diff follow-up.
- [ ] Use the trial to prioritize deeper repository orientation, cross-revision decision tracking and optional prediction exercises.

## Acceptance for the first version

A reviewer can follow an input through multiple files, inspect the exact code that supports a claim, leave their own feedback on a line, and find changes outside the reading path. A saved guide must retain its original evidence after the worktree changes. The reviewer explicitly controls approval and feedback submission.

## Evaluation

Alternate comparable fresh PRs between upstream and the fork. Include unfamiliar repositories and at least one change with many callers and an exceptional branch. Record the time to a decision and a short explanation of the behavior and architecture before checking the full diff. Count a missed material issue or changed verdict even when the initial pass was fast. Calculate time reduction as 1 minus fork minutes divided by baseline minutes within comparable groups.

## First build verification

- The review-only launcher returned the correct patch and reviewer feedback for staged, unstaged and last-commit changes in a disposable Git repository.
- A clean-room trial generated a guide for upstream commit `5cf5177`. The application parser resolved all 27 authored passages in its 58-file, 2,388-line patch. This checked the references, not a human review-time reduction.
- Regression tests cover old/new line anchors, changed-file comment gating, test folding, persisted snapshots and platform submission through test adapters.
- Publication requires GitHub credentials for the fork operation. The available connector lacks that operation, and the private credential request expired.
- The production browser smoke test opened the 58-file guide, expanded source context, navigated between behaviors, marked progress, switched to the full diff and back, and opened the line-comment composer.
- The focused suites passed 63 checks. A standalone review-editor TypeScript check still reports errors in other upstream files.

## Side-by-side and network verification

- Ran the two launchers at the same time on one staged change. Each had a separate port, readiness file, data directory and reviewer comment.
- Pi 0.84.4 loaded both extensions and registered both slash commands once. Its ReviewTrail command opened the expected staged diff.
- Exercised the personal Claude skill instructions against the real launcher in a scratch repository. A live Claude Desktop GUI session is still pending.
- Exercised the production reader on the 58-file patch with a local stand-in for the guide provider. The browser requested 46 distinct loopback paths and zero external origins. The test also preserved an existing upstream preference cookie.
- Optional prediction exercises, links into unchanged callers, cross-revision decision tracking and human timing trials remain open.
