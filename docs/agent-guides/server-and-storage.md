# Server and storage

`apps/review/server/index.ts` and `packages/server/review.ts` serve both supported agent integrations. The launcher gives each session its own loopback port by default. The server owns review state, Git/forge operations and optional local guide history.

Guide storage records the launch-time patch alongside the saved guide. A live job ID or a saved guide ID resolves to that snapshot. `GET /api/guide/:id/patch` serves the retained patch, `export-info` reports download availability and `export` serves a local HTML attachment. Guides without retained source cannot provide that download. `DELETE /api/guides/:id` removes local history.

Use the review endpoints and forge adapters for explicit feedback submission. See the [network inventory](../../NETWORK_AUDIT.md).
