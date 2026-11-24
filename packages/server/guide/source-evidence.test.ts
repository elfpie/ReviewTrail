import { expect, test } from "bun:test";
import { attachEvidence } from "./source-evidence";
import { sanitizeGuideSection } from "@reviewtrail/core/guide-prompt";
import { buildGuideSnapshot, parseGuideSnapshot } from "@reviewtrail/core/guide-format";
import { createOfflineGuide } from "@reviewtrail/core/offline-guide";
import { readBehavior, repeatedEditGroups } from "@reviewtrail/core/reading-path";
import { parseDiffToFiles } from "@reviewtrail/core/diff-files";

const file = (path: string, replacement: string) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old();\n+${replacement}\n`;
const patch = file("policy.ts", "retry();");

test("only retain real unchanged caller bytes, including in the standalone document", async () => {
  const overview = "Calls retry.\n- [Default](code:policy.ts#L1) Check policy.\n### Caller impact\n- [Caller](code:caller.ts#L2) Omits limit.\n- [Stale](code:other.ts#L1)\n- [Gone](code:caller.ts#L4)\n### What if a call fails?\n- Before [Old behavior](code:policy.ts#L1) Returned immediately.";
  const section = sanitizeGuideSection({ title: "Send", overview, diffs: [{ file: "policy.ts" }], evidence: [{text:"forged"}] })!;
  expect(section.evidence).toBeUndefined();
  const calls: string[] = [];
  await attachEvidence([section], patch, async (side, path) => {
    calls.push(path);
    const text = path === "caller.ts" ? "function call() {\n  return retry();\n}\n" : side;
    return { kind:"ok", bytes:new TextEncoder().encode(text) };
  });
  expect(calls.sort()).toEqual(["caller.ts","caller.ts","other.ts","other.ts"]);
  expect(section.evidence).toEqual([{path:"caller.ts",start:2,end:2,text:"  return retry();"}]);
  const reading = readBehavior(overview);
  expect(reading.passages.map(p=>p.path)).toEqual(["policy.ts"]);
  expect(reading.details.map(d=>d.title)).toEqual(["Caller impact", "What if a call fails?"]);
  expect(reading.details[1].passages[0].side).toBe("old");
  const snapshot = buildGuideSnapshot({ guide:{ title:"Retry", intent:"Send", sections:[section] }, reviewed:[],
    review:{ gitRef:"staged", rawPatch:patch, source:{kind:"local"} } });
  expect(snapshot.version).toBe(6);
  expect(parseGuideSnapshot(snapshot)).toEqual({ok:true,value:snapshot});
  const html = createOfflineGuide(snapshot);
  expect(html).toContain("<summary>Caller impact</summary>");
  expect(html).toContain("  return retry();</pre>");
  expect(html).not.toContain("forged");
});

test("group only exact textual edits and preserve exceptions and tests", () => {
  const files = parseDiffToFiles(patch + file("copy.ts","retry();") + file("exception.ts","retry(0);") + file("copy.test.ts","retry();"));
  expect(repeatedEditGroups(files).map(group=>group.map(f=>f.path))).toEqual([["policy.ts","copy.ts"]]);
});

test("a caller in the same large file survives a line shift outside the cited range", async () => {
  const patch = "diff --git a/policy.ts b/policy.ts\n--- a/policy.ts\n+++ b/policy.ts\n@@ -1,0 +2 @@\n+log();\n";
  const section = sanitizeGuideSection({ title:"Worker",overview:"- [Call](code:policy.ts#L3)\n- Before [Old call](code:policy.ts#L2)",diffs:[{file:"policy.ts"}] })!;
  await attachEvidence([section], patch, async side => ({kind:"ok",bytes:new TextEncoder().encode(side === "old"
    ? "policy();\nreturn retries();\n" : "policy();\nlog();\nreturn retries();\n")}));
  expect(section.evidence?.map(e => [e.side,e.start,e.text])).toEqual([["new",3,"return retries();"],["old",2,"return retries();"]]);
});
