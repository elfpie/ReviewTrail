/**
 * Historical snapshot fixtures. One entry per shipped snapshot version, plus
 * one per `source.kind`. `guide-format.test.ts` parses every fixture with the
 * CURRENT parser — that test is the compatibility promise behind pinned
 * exports (decision record D8/D10): a viewer released today must still open
 * every document ever exported.
 *
 * Add fixtures; never edit or delete one that shipped.
 */

import { GUIDE_SNAPSHOT_KIND, type GuideSnapshot, type GuideSnapshotV1, type GuideSnapshotV2 } from "./guide-format";

type Shipped<T extends GuideSnapshot> = Omit<T, "kind"> & { readonly kind: "plannotator-guided-review" };

export const FIXTURE_PATCH_TS_JSON = `diff --git a/src/auth.ts b/src/auth.ts
index 1111111..2222222 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,4 +1,6 @@
 export function refresh(token: string) {
-  return token;
+  if (!token) throw new Error("missing token");
+  const html = '</script><!--';
+  return token + "!";
 }
diff --git a/package.json b/package.json
index 3333333..4444444 100644
--- a/package.json
+++ b/package.json
@@ -1,3 +1,4 @@
 {
-  "name": "demo"
+  "name": "demo",
+  "version": "1.0.1"
 }
`;

/** v1, local since-base guide — the canonical minimal document. */
const SHIPPED_V1_LOCAL: Shipped<GuideSnapshotV1> = {
  kind: "plannotator-guided-review",
  version: 1,
  exportedAt: "2026-08-15T20:00:00.000Z",
  guide: {
    title: "Auth token refresh",
    intent: "Harden the refresh path and bump the package version.",
    sections: [
      {
        title: "Guard the refresh entry point",
        overview: "The refresh function now rejects a missing token instead of echoing it back.",
        diffs: [{ file: "src/auth.ts", summary: "Adds the guard and a trailing marker." }],
      },
      { title: "Housekeeping", overview: "Version bump only.", diffs: [{ file: "package.json", summary: "1.0.1" }] },
    ],
    unplacedFiles: [],
    reviewed: [true, false],
  },
  review: { rawPatch: FIXTURE_PATCH_TS_JSON, gitRef: "origin/main..HEAD", diffType: "since-base", base: "origin/main" },
  source: { kind: "local", repo: "acme/demo", branch: "feat/refresh", headSha: "0123456789abcdef0123456789abcdef01234567" },
  generator: { engine: "claude", model: "sonnet", generatedAt: "2026-08-15T19:58:00.000Z" },
};

/** v1, PR guide with generator provenance including custom instructions and a theme hint. */
const SHIPPED_V1_PR: Shipped<GuideSnapshotV1> = {
  ...SHIPPED_V1_LOCAL,
  guide: { ...SHIPPED_V1_LOCAL.guide, title: "PR: auth token refresh" },
  source: {
    kind: "pr",
    repo: "acme/demo",
    branch: "feat/refresh",
    headSha: "0123456789abcdef0123456789abcdef01234567",
    pr: { url: "https://github.com/acme/demo/pull/42", number: 42, title: "Auth token refresh", platform: "github" },
  },
  generator: { engine: "codex", model: "gpt-5.5", customInstructions: "Focus on security implications." },
  theme: { palette: "plannotator" },
};

/** v1, single-commit guide. */
const SHIPPED_V1_COMMIT: Shipped<GuideSnapshotV1> = {
  ...SHIPPED_V1_LOCAL,
  review: { rawPatch: FIXTURE_PATCH_TS_JSON, gitRef: "Commit 0123456 — Auth token refresh", diffType: "commit:0123456789abcdef0123456789abcdef01234567" },
  source: { kind: "commit", repo: "acme/demo", commitSha: "0123456789abcdef0123456789abcdef01234567" },
};

/** v1, multi-repo workspace guide (folder-prefixed paths). */
const SHIPPED_V1_WORKSPACE: Shipped<GuideSnapshotV1> = {
  ...SHIPPED_V1_LOCAL,
  guide: {
    ...SHIPPED_V1_LOCAL.guide,
    sections: [
      { title: "API", overview: "Server side.", diffs: [{ file: "api/src/auth.ts" }] },
      { title: "Web", overview: "Client side.", diffs: [{ file: "web/package.json" }] },
    ],
    reviewed: [false, false],
  },
  review: {
    // Folder-prefixed paths, as multi-repo workspace reviews emit them.
    rawPatch: FIXTURE_PATCH_TS_JSON.replaceAll("/src/auth.ts", "/api/src/auth.ts").replaceAll("/package.json", "/web/package.json"),
    gitRef: "api | web",
    diffType: "workspace-current",
  },
  source: { kind: "workspace", repo: "monorepo-parent" },
  generator: undefined,
};

/** v2, local guide with an overview: prose with guide links and a Mermaid diagram with `click` links. */
const SHIPPED_V2_OVERVIEW: Shipped<GuideSnapshotV2> = {
  ...SHIPPED_V1_LOCAL,
  version: 2,
  guide: {
    title: SHIPPED_V1_LOCAL.guide.title,
    intent: SHIPPED_V1_LOCAL.guide.intent,
    overview: {
      text: "The guard in [`refresh`](symbol:src/auth.ts#refresh) runs first ([code](code:src/auth.ts#L2-L3)); the version bump is [chapter 2](chapter:2).",
      diagram: {
        kind: "mermaid",
        source: 'flowchart LR\n  caller --> refresh\n  refresh --> guard\n  click refresh "symbol:refresh"\n  click guard "code:src/auth.ts#L2"',
      },
    },
    sections: SHIPPED_V1_LOCAL.guide.sections,
    unplacedFiles: SHIPPED_V1_LOCAL.guide.unplacedFiles,
    reviewed: SHIPPED_V1_LOCAL.guide.reviewed,
  },
};

/** v2, PR guide whose overview is prose only (no diagram). */
const SHIPPED_V2_PR_TEXT: Shipped<GuideSnapshotV2> = {
  ...SHIPPED_V1_PR,
  version: 2,
  guide: {
    title: SHIPPED_V1_PR.guide.title,
    intent: SHIPPED_V1_PR.guide.intent,
    overview: { text: "One guard and a version bump. Read [chapter 1](chapter:1) first." },
    sections: SHIPPED_V1_PR.guide.sections,
    unplacedFiles: SHIPPED_V1_PR.guide.unplacedFiles,
    reviewed: SHIPPED_V1_PR.guide.reviewed,
  },
};

/** v2, overview with a sanitized HTML picture (accepted by the format; no viewer draws it yet). */
const SHIPPED_V2_HTML: Shipped<GuideSnapshotV2> = {
  ...SHIPPED_V1_LOCAL,
  version: 2,
  guide: {
    title: SHIPPED_V1_LOCAL.guide.title,
    intent: SHIPPED_V1_LOCAL.guide.intent,
    overview: {
      text: "A custom picture of the refresh path.",
      diagram: { kind: "html", source: '<svg viewBox="0 0 10 10"><a href="code:src/auth.ts"><rect width="10" height="10"/></a></svg>' },
    },
    sections: SHIPPED_V1_LOCAL.guide.sections,
    unplacedFiles: SHIPPED_V1_LOCAL.guide.unplacedFiles,
    reviewed: SHIPPED_V1_LOCAL.guide.reviewed,
  },
};

export const GUIDE_SNAPSHOT_FIXTURES: ReadonlyArray<{ readonly name: string; readonly snapshot: Shipped<GuideSnapshot> }> = [
  { name: "v1-local", snapshot: SHIPPED_V1_LOCAL },
  { name: "v1-pr", snapshot: SHIPPED_V1_PR },
  { name: "v1-commit", snapshot: SHIPPED_V1_COMMIT },
  { name: "v1-workspace", snapshot: SHIPPED_V1_WORKSPACE },
  { name: "v2-overview", snapshot: SHIPPED_V2_OVERVIEW },
  { name: "v2-pr-text", snapshot: SHIPPED_V2_PR_TEXT },
  { name: "v2-html", snapshot: SHIPPED_V2_HTML },
];

// Current-format samples for producer and UI tests use the same payloads.
export const FIXTURE_V1_LOCAL: GuideSnapshotV1 = { ...SHIPPED_V1_LOCAL, kind: GUIDE_SNAPSHOT_KIND };
export const FIXTURE_V1_PR: GuideSnapshotV1 = { ...SHIPPED_V1_PR, kind: GUIDE_SNAPSHOT_KIND };
export const FIXTURE_V1_COMMIT: GuideSnapshotV1 = { ...SHIPPED_V1_COMMIT, kind: GUIDE_SNAPSHOT_KIND };
export const FIXTURE_V1_WORKSPACE: GuideSnapshotV1 = { ...SHIPPED_V1_WORKSPACE, kind: GUIDE_SNAPSHOT_KIND };
export const FIXTURE_V2_OVERVIEW: GuideSnapshotV2 = { ...SHIPPED_V2_OVERVIEW, kind: GUIDE_SNAPSHOT_KIND };
export const FIXTURE_V2_PR_TEXT: GuideSnapshotV2 = { ...SHIPPED_V2_PR_TEXT, kind: GUIDE_SNAPSHOT_KIND };
export const FIXTURE_V2_HTML: GuideSnapshotV2 = { ...SHIPPED_V2_HTML, kind: GUIDE_SNAPSHOT_KIND };
