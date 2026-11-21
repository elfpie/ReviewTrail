# Code review

The launcher resolves the requested repo, diff mode, patch or PR, then starts the server in `packages/server/review.ts`. The review editor owns navigation, the diff, guide, comments and final decision. Local feedback returns through stdout to the invoking agent. Forge review, reply and approval use the forge adapter and its authenticated client.

The reading path follows a behavior across files. Its passages refer to old or new line ranges in the reviewed patch. Keep full-file navigation, reviewed state, inline comments, the folded tests section and visibility into uncovered files when changing the reader. An old saved guide can still open after the worktree changes. A comment about an older file must target matching live lines before submission.

See [network call types](../../NETWORK_AUDIT.md) and the [review plan](../../REVIEW_PLAN.md).
