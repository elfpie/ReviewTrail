import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPlannotatorDataDir } from "@plannotator/shared/data-dir";
import { diffHunkLines, parseDiffToFiles, type DiffFile } from "@plannotator/core/diff-files";
import { passageLines, readPassages, type Passage } from "@plannotator/core/reading-path";
import type { GuideSection } from "@plannotator/core/guide";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const validKey = (value: string) => /^[a-f0-9]{64}$/.test(value);
function directory(key: string) {
  if (!validKey(key)) throw Error("Invalid review identity");
  return join(getPlannotatorDataDir(), "review-follow-up", key);
}
type Anchor = Pick<Passage, "start" | "end" | "side">;
interface Evidence {
  anchors?: Anchor[];
  path: string;
  fingerprint: string | null;
  original: string;
}
interface RecordItem {
  id: string;
  kind: "concern" | "behavior";
  text: string;
  location?: string;
  resolved: boolean;
  files: Evidence[];
}
const indexPatch = (patch: string) => new Map(parseDiffToFiles(patch).map(f => [f.path, f]));
/** Compare the hunks that support a claim. A second, unrelated hunk in a
 * large class should not invalidate those reviewed lines. When coordinates
 * no longer resolve, fall back to the file and ask the reviewer to recheck. */
function inspect(file: DiffFile | undefined, anchors?: Anchor[]) {
  if (!file) return { fingerprint: null, excerpt: "" };
  if (anchors?.length) {
    const hunks = diffHunkLines(file.patch) ?? [];
    const cited = new Set<typeof hunks[number]>();
    const excerpts = [];
    for (const anchor of anchors) {
      const hunk = hunks.find(h => anchor.side === "old"
        ? h.oldStart <= anchor.start && anchor.end < h.oldEnd
        : h.newStart <= anchor.start && anchor.end < h.newEnd);
      if (!hunk) break;
      cited.add(hunk);
      const lines = passageLines([hunk], anchor);
      excerpts.push(lines.map(l => l.text).join("\n"));
    }
    if (excerpts.length === anchors.length) return {
      fingerprint: digest([file.status, ...cited]), excerpt: [...new Set(excerpts)].join("\n…\n"),
    };
  }
  return { fingerprint: digest(file.patch.replace(/\n$/, "")), excerpt: "" };
}
function read(key: string, id: string): RecordItem | undefined {
  if (!validKey(id)) return;
  try {
    const item = JSON.parse(readFileSync(join(directory(key), id + ".json"), "utf8"));
    if (item?.id === id && (item.kind === "concern" || item.kind === "behavior")
      && typeof item.text === "string" && typeof item.resolved === "boolean"
      && Array.isArray(item.files) && item.files.every((e: Evidence) => e && typeof e.path === "string"
        && typeof e.original === "string" && (e.anchors === undefined || Array.isArray(e.anchors)))) return item;
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT" && !(e instanceof SyntaxError)) throw e; }
}
function write(key: string, item: RecordItem) {
  const dir = directory(key);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = join(dir, randomUUID() + ".tmp");
  try {
    writeFileSync(tmp, JSON.stringify(item), { mode: 0o600 });
    renameSync(tmp, join(dir, item.id + ".json"));
  } finally { rmSync(tmp, { force: true }); }
}

interface Concern {
  id?: string;
  filePath?: string; text?: string; suggestedCode?: string; lineStart?: number; lineEnd?: number; side?: string;
  scope?: string; outdated?: boolean; anchorText?: string; anchorSnapshot?: string; source?: string;
  localReviewTarget?: string; prUrl?: string; diffScope?: string; commitSha?: string; gitButlerDiffType?: string;
}
interface Target { snapshotId: string; localTarget?: string | null; prUrl?: string; scope?: string; diffType: string }

/** Capture only comments belonging to the submitted comparison. A restored stale
 * line comment keeps its own original quotation, never the new occupant of that line. */
export function keepConcerns(key: string, patch: string, target: Target, annotations: unknown[]) {
  const files = indexPatch(patch);
  for (const value of annotations) {
    if (!value || typeof value !== "object") continue;
    const a = value as Concern;
    if (a.source || (a.prUrl && a.prUrl !== target.prUrl) || (a.diffScope && a.diffScope !== target.scope)
      || (a.localReviewTarget && a.localReviewTarget !== target.localTarget)
      || (a.commitSha && target.diffType !== "commit:" + a.commitSha) || a.gitButlerDiffType) continue;
    const text = [a.text, a.suggestedCode].filter(v => typeof v === "string" && v.trim()).join("\n\n").trim();
    if (!text) continue;
    const path = typeof a.filePath === "string" ? a.filePath : "";
    const file = files.get(path);
    if (path && !file && !a.outdated) continue;
    const stale = a.outdated || (a.anchorSnapshot && a.anchorSnapshot !== target.snapshotId);
    const side = a.side === "old" ? "old" : "new";
    const start = a.lineStart ?? 0;
    const end = a.lineEnd ?? start;
    const anchored = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0 && end >= start;
    const location = anchored ? `${side === "old" ? "Before" : "After"} · L${start}–${end}` : undefined;
    const anchors: Anchor[] | undefined = anchored ? [{ start, end, side }] : undefined;
    const evidence = inspect(file, anchors);
    const original = typeof a.anchorText === "string" ? a.anchorText : stale ? "" : evidence.excerpt;
    const id = digest(["concern", typeof a.id === "string" ? a.id : target.snapshotId, path, location, text, original]);
    if (read(key, id)) continue;
    write(key, { id, kind: "concern", text, resolved: false, location,
      files: path ? [{ path, anchors, fingerprint: stale ? null : evidence.fingerprint, original }] : [] });
  }
}

/** A chapter can depend on a caller absent from the original patch. Its first
 * appearance in a later revision is itself a reason to inspect the behavior. */
export function keepBehaviorMarks(key: string, patch: string, sections: GuideSection[], before: readonly boolean[], after: readonly boolean[]) {
  const files = indexPatch(patch);
  for (const [i, section] of sections.entries()) {
    if (!!before[i] === !!after[i]) continue;
    const passages = readPassages(section.overview).passages;
    const paths = [...new Set([...section.diffs.map(d => d.file), ...passages.map(p => p.path)])].sort();
    if (!paths.length) continue;
    const evidence = paths.map(path => {
      const anchors = passages.filter(p => p.path === path).map(({ start, end, side }) => ({ start, end, side }));
      const evidence = inspect(files.get(path), anchors);
      return { path, anchors, fingerprint: evidence.fingerprint,
        original: evidence.excerpt || section.evidence?.find(e => e.path === path)?.text || "" };
    });
    const id = digest(["behavior", section.title, evidence.map(e => [e.path, e.fingerprint])]);
    if (after[i]) write(key, { id, kind: "behavior", text: section.title, resolved: false, files: evidence });
    else rmSync(join(directory(key), id + ".json"), { force: true });
  }
}

export function followUpItems(key: string, patch: string, includeConcerns: boolean) {
  let names: string[];
  try { names = readdirSync(directory(key)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
  const files = indexPatch(patch);
  return names.filter(n => n.endsWith(".json")).flatMap(n => {
    const item = read(key, n.slice(0, -5));
    if (!item || (item.kind === "concern" && !includeConcerns)) return [];
    const evidence = item.files.map(e => {
      const current = inspect(files.get(e.path), e.anchors);
      return { path: e.path, original: e.original, current: current.excerpt, changed: current.fingerprint !== e.fingerprint };
    });
    if (item.kind === "behavior" && !evidence.some(e => e.changed)) return [];
    return [{ id: item.id, kind: item.kind, text: item.text, location: item.location, resolved: item.resolved, files: evidence }];
  });
}

export function setFollowUpState(key: string, id: string, resolved: boolean, patch: string, includeConcerns: boolean) {
  const item = read(key, id);
  if (!item || (item.kind === "concern" && !includeConcerns)) return false;
  if (item.kind === "behavior") {
    const files = indexPatch(patch);
    item.files = item.files.map(e => {
      const current = inspect(files.get(e.path), e.anchors);
      return { ...e, fingerprint: current.fingerprint, original: current.excerpt };
    });
  } else item.resolved = resolved;
  write(key, item);
  return true;
}
