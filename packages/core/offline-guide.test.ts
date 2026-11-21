import { expect, test } from "bun:test";
import { createOfflineGuide } from "./offline-guide";
import { FIXTURE_V1_LOCAL } from "./guide-format-fixtures";

test("the file contains the anchored code and treats content as text even offline", () => {
  const rawPatch = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old();\n+</script><img src="https://example.invalid">\n';
  const html = createOfflineGuide({ ...FIXTURE_V1_LOCAL, review: { ...FIXTURE_V1_LOCAL.review, rawPatch }, guide: {
    title: "A retry", intent: "One attempt", reviewed: [], sections: [
      { title: "Entry", overview: "- [Retry](code:a.ts#L1) Explain the retry", diffs: [{ file: "a.ts", notes: [{ lineStart: 1, lineEnd: 1, text: "An inline note" }] }] },
    ],
  } });
  expect(html).toContain("<strong>Retry</strong>");
  expect(html).toContain("<figcaption>Explain the retry</figcaption>");
  expect(html).toContain("An inline note");
  expect(html).toContain('&lt;/script&gt;&lt;img');
  expect(html).toContain('id="file-0"');
  expect(html).not.toMatch(/<img|<script[^>]+src=|<link\b/i);
});
