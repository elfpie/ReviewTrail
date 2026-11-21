import { GUIDE_LINK_TARGET_SOURCE, parseGuideLink } from '@plannotator/core/guide-links';
import type { DiffHunk, DiffHunkLine } from '@plannotator/core/diff-files';

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
export function passageLines(hunks: DiffHunk[], passage: Passage, context = 0): DiffHunkLine[] {
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
