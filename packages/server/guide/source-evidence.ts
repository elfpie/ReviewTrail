import type { GuideSection } from "@reviewtrail/core/guide";
import { readPassages, type Passage } from "@reviewtrail/core/reading-path";
import { diffHunkLines, parseDiffToFiles, type DiffHunk } from "@reviewtrail/core/diff-files";
import type { DiffType } from "@reviewtrail/core/diff-type";
import { validateFilePath, readDiffSideBytes, readGitObjectBytes, resolveDiffSideSources, type DiffSideSource, type FileBytesRead, type ReviewGitRuntime } from "@reviewtrail/shared/review-core";

export const SOURCE_LIMIT = 512 * 1024;
type ReadSide = (path: string) => Promise<FileBytesRead>;
export type EvidenceReader = (side: "old" | "new", path: string) => Promise<FileBytesRead>;

/** Pin object names before the agent runs. An unchanged worktree excerpt must
 * still match its pinned counterpart when the guide completes. */
export async function pinGitEvidence(runtime: ReviewGitRuntime, cwd: string, mode: DiffType, base: string): Promise<EvidenceReader | undefined> {
  const pair = await resolveDiffSideSources(runtime, mode, base, "placeholder", undefined, cwd);
  if (!pair?.old || !pair.new) return;
  const dir = pair.cwd ?? cwd;
  async function pin(source: DiffSideSource): Promise<ReadSide | undefined> {
    if (source.kind === "worktree") return path => readDiffSideBytes(runtime, { kind: "worktree", path }, SOURCE_LIMIT, dir);
    if (source.rev === ":0") {
      const result = await runtime.runGit(["ls-files", "--full-name", "--stage", "-z", "--", ":/"], { cwd: dir });
      if (result.exitCode || result.truncated) return;
      const blobs = new Map<string, string>();
      for (const entry of result.stdout.split("\0")) {
        const match = /^100[0-7]{3} ([0-9a-f]+) 0\t([^\r\n]+)$/.exec(entry);
        if (match) blobs.set(match[2], match[1]);
      }
      return async path => {
        const oid = blobs.get(path);
        return oid ? readGitObjectBytes(runtime, oid, SOURCE_LIMIT, dir) : { kind: "missing" };
      };
    }
    const rev = await runtime.runGit(["rev-parse", "--verify", "--end-of-options", source.rev + "^{tree}"], { cwd: dir });
    const tree = rev.stdout.trim();
    if (rev.exitCode || !/^[a-f0-9]{40,64}$/.test(tree)) return;
    return path => readDiffSideBytes(runtime, { kind: "object", rev: tree, path }, SOURCE_LIMIT, dir);
  }
  const [old, next] = await Promise.all([pin(pair.old), pin(pair.new)]);
  if (old && next) return (side, path) => (side === "old" ? old : next)(path);
}

/** Translate a range entirely outside the changed hunks. A zero-length side
 * in a unified diff places the edit immediately after its numbered line. */
function oppositeStart(hunks: DiffHunk[], p: Passage): number | undefined {
  let offset = 0;
  for (const h of hunks) {
    const [begin, end, otherLength] = p.side === "old"
      ? [h.oldStart, h.oldEnd, h.newEnd - h.newStart]
      : [h.newStart, h.newEnd, h.oldEnd - h.oldStart];
    const length = end - begin;
    if (p.end < begin) break;
    if (p.start < end) return;
    offset += otherLength - length;
  }
  return p.start + offset;
}

/** Outside the patch we require identical blobs. Inside a modified file we
 * can also prove an unchanged range using the diff's line-number mapping. */
export async function attachEvidence(sections: GuideSection[], rawPatch: string, read?: EvidenceReader) {
  if (!read) return;
  const files = parseDiffToFiles(rawPatch);
  const changed = new Map(files.map(f => [f.path, f]));
  const renamedFrom = new Set(files.flatMap(f => f.oldPath ? [f.oldPath] : []));
  const cache = new Map<string, { old: string[]; new: string[] } | null>();
  const parsedHunks = new Map<string, DiffHunk[] | null>();
  for (const section of sections) {
    const excerpts: NonNullable<GuideSection["evidence"]> = [];
    for (const p of readPassages(section.overview).passages) {
      if (p.end - p.start > 39 || !Number.isSafeInteger(p.end) || renamedFrom.has(p.path)) continue;
      const file = changed.get(p.path);
      let counterpart: number | undefined = p.start;
      if (file) {
        if (file.status !== "modified") continue;
        if (!parsedHunks.has(p.path)) parsedHunks.set(p.path, diffHunkLines(file.patch));
        const hunks = parsedHunks.get(p.path);
        if (!hunks?.length) continue;
        counterpart = oppositeStart(hunks, p);
        if (counterpart === undefined) continue;
      }
      if (!cache.has(p.path)) {
        if (cache.size >= 48) continue;
        cache.set(p.path, null);
        try {
          validateFilePath(p.path);
          if (p.path.split("/").some(s => s.toLowerCase() === ".git")) continue;
          const [old, next] = await Promise.all([read("old", p.path), read("new", p.path)]);
          if (old.kind !== "ok" || next.kind !== "ok" || old.bytes.includes(0) || next.bytes.includes(0)) continue;
          const identical = Buffer.from(old.bytes).equals(next.bytes);
          if (!file && !identical) continue;
          const lines = (bytes: Uint8Array) => bytes.length ? new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/\n$/, "").split("\n") : [];
          const previous = lines(old.bytes);
          cache.set(p.path, { old: previous, new: identical ? previous : lines(next.bytes) });
        } catch { /* An unavailable blob leaves its citation visibly unverified. */ }
      }
      const pair = cache.get(p.path);
      if (!pair) continue;
      const current = pair[p.side];
      const other = pair[p.side === "old" ? "new" : "old"];
      const length = p.end - p.start + 1;
      if (p.end > current.length || counterpart < 1 || counterpart + length - 1 > other.length) continue;
      const text = current.slice(p.start - 1, p.end).join("\n");
      if (text !== other.slice(counterpart - 1, counterpart - 1 + length).join("\n") || text.length > 16_384) continue;
      const side = file ? p.side : undefined;
      if (!excerpts.some(e => e.path === p.path && e.start === p.start && e.end === p.end && e.side === side)) {
        excerpts.push({ path: p.path, start: p.start, end: p.end, text, ...(side && { side }) });
      }
    }
    if (excerpts.length) section.evidence = excerpts;
  }
}
