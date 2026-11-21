import { expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { followUpItems, keepBehaviorMarks, keepConcerns, setFollowUpState } from "./review-follow-up";

const key = () => createHash("sha256").update(randomUUID()).digest("hex");
const file = (path: string, n = 1) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-default(0)\n+default(${n})\n`;
const patch = file("policy.ts");
const next = file("policy.ts", 2);
const target = { snapshotId: "a", diffType: "staged", localTarget: "repo-branch-staged" };

test("submitted objections persist with their original anchor and only the reviewer closes them", () => {
  const scope = key();
  const a = { text:"Should the worker inherit this?", filePath:"policy.ts", lineStart:1, lineEnd:1 };
  keepConcerns(scope, patch, target, [a,a,{...a,text:"other target",localReviewTarget:"other"},{...a,text:"tool",source:"tool"}]);
  const [item] = followUpItems(scope,next,true);
  expect(followUpItems(scope,next,true)).toHaveLength(1);
  expect(item.files).toEqual([{path:"policy.ts",original:"default(1)",current:"default(2)",changed:true}]);
  expect(followUpItems(scope,patch,true)[0].files[0].changed).toBe(false);
  expect(followUpItems(key(),next,true)).toEqual([]);
  expect(followUpItems(scope,next,false)).toEqual([]);
  expect(setFollowUpState(scope,item.id,true,next,false)).toBe(false);
  expect(setFollowUpState(scope,item.id,true,next,true)).toBe(true);
  expect(followUpItems(scope,next,true)[0].resolved).toBe(true);
  expect(setFollowUpState(scope,item.id,false,next,true)).toBe(true);
  expect(followUpItems(scope,"",true)[0].resolved).toBe(false);
});

test("a reviewed behavior resurfaces for its changed evidence, including a newly edited caller", () => {
  const scope = key();
  const sections = [{title:"Worker retries",overview:"- [Original caller](code:worker.ts#L1)",diffs:[{file:"policy.ts"}]}];
  keepBehaviorMarks(scope,patch,sections,[],[true]);
  expect(followUpItems(scope,patch+file("unrelated.ts"),true)).toEqual([]);
  expect(followUpItems(scope,patch+file("worker.ts"),false)[0].files.filter(f=>f.changed).map(f=>f.path)).toEqual(["worker.ts"]);
  const [item] = followUpItems(scope,next,true);
  expect(item.text).toBe("Worker retries");
  expect(setFollowUpState(scope,item.id,true,next,true)).toBe(true);
  expect(followUpItems(scope,next,true)).toEqual([]);
  expect(followUpItems(scope,patch,true)).toHaveLength(1);
  keepBehaviorMarks(scope,patch,sections,[true],[false]);
  expect(followUpItems(scope,next,true)).toEqual([]);
});

test("an unrelated hunk in the same class leaves the reviewed behavior alone", () => {
  const scope = key();
  const sections = [{title:"Default retry",overview:"- [Policy](code:policy.ts#L1)",diffs:[{file:"policy.ts"}]}];
  keepBehaviorMarks(scope,patch,sections,[],[true]);
  expect(followUpItems(scope,patch+"@@ -500 +500 @@\n-oldLogger()\n+newLogger()\n",true)).toEqual([]);
  expect(followUpItems(scope,next,true)[0].files[0].current).toBe("default(2)");
});
