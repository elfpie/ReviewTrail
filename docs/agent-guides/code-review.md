# Code review

The launcher resolves the requested repo, diff mode, patch or PR, then starts the server in `packages/server/review.ts`. The review editor owns navigation, the diff, guide, comments and final decision. Local feedback returns through stdout to the invoking agent. Forge review, reply and approval use the forge adapter and its authenticated client.

Guided review uses the upstream chapter viewer. Keep file navigation, reviewed state and line comments working for both local changes and PRs.

See [network call types](../../NETWORK_AUDIT.md) and the [review plan](../../REVIEW_PLAN.md).
