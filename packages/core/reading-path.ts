import { GUIDE_LINK_TARGET_SOURCE, parseGuideLink } from '@reviewtrail/core/guide-links';
import { diffHunkLines, type DiffFile, type DiffHunk, type DiffHunkLine } from '@reviewtrail/core/diff-files';

export interface Passage {
  title: string;
  explanation: string;
  path: string;
  start: number;
  end: number;
  side: 'old' | 'new';
}

const passageBullet = new RegExp(
  String.raw`^\s*[-*]\s+(?:(Before)\s+)?\[([^\]\n]+)\]\(\s*(${GUIDE_LINK_TARGET_SOURCE})\s*\)\s*(.*)$`, 'i',
);

export function readPassages(overview: string) {
  const prose: string[] = [];
  const passages: Passage[] = [];
  let fenced = false;
  for (const line of overview.split('\n')) {
    if (line.trimStart().startsWith('```')) fenced = !fenced;
    const match = fenced ? null : passageBullet.exec(line);
    const link = match && parseGuideLink(match[3]);
    if (match && link?.ok && link.link.kind === 'code' && link.link.startLine) {
      passages.push({
        title: match[2], explanation: match[4], path: link.link.path,
        start: link.link.startLine, end: link.link.endLine ?? link.link.startLine,
        side: match[1] ? 'old' : 'new',
      });
    } else {
      prose.push(line);
    }
  }
  return { prose: prose.join('\n').trim(), passages };
}

export function isReviewTest(path: string): boolean {
  return /(?:^|\/)(?:__tests__|tests?|specs?|__snapshots__|androidTest)\//i.test(path)
    || /(?:^|\/)(?:test_[^/]+|[^/]+[._-](?:test|spec)(?:\.[^/]+)?)$/i.test(path)
    || /(?:^|\/)[^/]+Tests?\.(?:java|kt|cs|php|swift)$/.test(path);
}

/** Only show excerpts whose full range exists on the requested side of one hunk. */
export function passageLines(hunks: DiffHunk[], passage: Pick<Passage, "start" | "end" | "side">, context = 0): DiffHunkLine[] {
  const { start, end, side } = passage;
  const hunk = hunks.find(h => side === 'old'
    ? h.oldStart <= start && end < h.oldEnd
    : h.newStart <= start && end < h.newEnd);
  if (!hunk) return [];
  return hunk.lines.filter(line => {
    const n = side === 'old' ? ('oldLine' in line ? line.oldLine : undefined) : ('newLine' in line ? line.newLine : undefined);
    return n !== undefined && n >= start - context && n <= end + context;
  });
}

export interface ReadingDetail {
  title: string;
  prose: string;
  passages: Passage[];
}

/** Headings keep the guide readable as ordinary Markdown in older clients. */
export function readBehavior(overview: string) {
  const blocks: { title: string; lines: string[] }[] = [{ title: '', lines: [] }];
  let fenced = false;
  for (const line of overview.split('\n')) {
    if (line.trimStart().startsWith('```')) fenced = !fenced;
    const heading = !fenced && /^### (Caller impact|Why here\?|What if .+\?|Repeated edits|Open question)\s*$/i.exec(line);
    if (heading) blocks.push({ title: heading[1], lines: [] });
    else blocks[blocks.length - 1].lines.push(line);
  }
  const [main, ...details] = blocks.map(block => ({
    title: block.title, ...readPassages(block.lines.join('\n')),
  }));
  return { ...main, details };
}

/** A copy of lines confirmed identical on both sides during guide generation. */
export interface GuideSourceExcerpt {
  side?: Passage["side"];
  path: string;
  start: number;
  end: number;
  text: string;
}

export function sourceExcerpt(excerpts: GuideSourceExcerpt[] | undefined, p: Passage) {
  return excerpts?.find(e => e.path === p.path && e.start === p.start && e.end === p.end && (!e.side || e.side === p.side));
}

/** Compare the ordered edits in each hunk, preserving whitespace and hunk
 * boundaries. Surrounding code can still give the same edit different effects. */
export function repeatedEditGroups(files: readonly DiffFile[]): DiffFile[][] {
  const groups = new Map<string, DiffFile[]>();
  for (const file of files) {
    if (isReviewTest(file.path) || !file.additions && !file.deletions) continue;
    const hunks = diffHunkLines(file.patch);
    if (!hunks?.length) continue;
    const edits = hunks.map(h => h.lines.filter(l => l.kind !== 'context').map(l => [l.kind, l.text]));
    const key = JSON.stringify([file.status, edits]);
    const group = groups.get(key);
    if (group) group.push(file);
    else groups.set(key, [file]);
  }
  return [...groups.values()].filter(group => group.length > 1);
}
