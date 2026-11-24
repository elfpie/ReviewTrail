# Guided review and shared UI

The authoring contract is in `packages/server/guide/`. The shared guide types and versioned snapshot parser live in `packages/core/`. The interactive reader lives in `packages/review-editor/components/guide/` and uses `packages/guide-viewer/` to display chapters and file diffs.

The portable download contains one snapshot, native HTML chapter links, inline explanations and expandable file diffs. Escape source, prose and the embedded JSON independently. Use local anchors. Preserve the recipient’s ability to read the whole file with JavaScript and networking disabled. The offline file renders diagram source as text.

The review editor uses shared components in `packages/ui`. Follow that package’s guidance when changing document rendering.
