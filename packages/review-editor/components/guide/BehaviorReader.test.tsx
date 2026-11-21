import { afterEach, describe, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseDiffToFiles } from '@plannotator/core/diff-files';
import { BehaviorReader } from './BehaviorReader';
import { isReviewTest, readPassages } from './readingPath';

const patch = ['a.ts', 'b.ts', 'b.spec.ts', 'other.ts'].map(path =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,2 +1,2 @@\n-old();\n+newCode();\n done();\n`
).join('');
const overview = 'The caller now retries.\n- [Enter](code:a.ts#L1) Start here.\n- Before [Previous policy](code:b.ts#L1) Returned immediately.\n- [Return](code:a.ts#L2) Complete the call.';
const guide = {title: 'A write times out', intent: 'Retry once.', reviewed: [], sections: [
  {title: 'Caller retries', overview, diffs: [{file:'a.ts'}, {file:'b.ts'}]},
  {title: 'Tests', overview: 'Checks timeout.', diffs: [{file:'b.spec.ts'}]},
], unplacedFiles: ['other.ts']};

test('extracts cross-file passages in authored order and retains legacy prose', () => {
  const { passages, prose } = readPassages(overview);
  expect(passages.map(p => [p.path, p.side])).toEqual([['a.ts', 'new'], ['b.ts', 'old'], ['a.ts', 'new']]);
  expect(prose).toBe('The caller now retries.');
  expect(readPassages('An older chapter.').prose).toBe('An older chapter.');
  expect(readPassages('- [Bad](code:../a#L1) invalid').passages).toHaveLength(0);
  expect(isReviewTest('src/contest.ts')).toBe(false);
  expect(isReviewTest('client/retry_test.go')).toBe(true);
});

let root: Root | undefined;
let host: HTMLElement | undefined;
let restoreFetch: (() => void) | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  restoreFetch?.();
});

describe.if(typeof document !== 'undefined')('reading a saved guide', () => {
  test('uses original source, folds tests, and only anchors comments on matching files', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = mock(async () => Response.json({ patch })) as unknown as typeof fetch;
    restoreFetch = () => { globalThis.fetch = original; };
    const live = parseDiffToFiles(patch);
    live[0] = { ...live[0], patch: live[0].patch.replace('newCode', 'changedAgain') };
    const comment = mock(() => {});
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<BehaviorReader jobId="saved:1" guide={guide} liveFiles={live}
      reviewed={[]} onToggle={() => {}} onComment={comment} />));
    const cards = [...host.querySelectorAll('li')];
    expect(cards.map(c => c.querySelector('h4')?.textContent)).toEqual(['Enter','Previous policy','Return']);
    expect(cards[0].querySelector('pre')?.textContent).toContain('newCode()');
    expect(cards[0].textContent).toContain('Current diff differs');
    expect(cards[1].querySelector('pre')?.textContent).toContain('old()');
    const btn = [...cards[1].querySelectorAll('button')].find(b => b.textContent === 'Comment on lines');
    await act(async () => btn!.click());
    expect(comment).toHaveBeenCalledWith('b.ts', { start: 1, end: 1, side: 'deletions' });
    const tests = [...host.querySelectorAll('summary')].find(s => s.textContent?.startsWith('Tests ·'));
    expect(tests?.parentElement?.hasAttribute('open')).toBe(false);
    expect(host.textContent).toContain('Outside the guide · 1');
  });
});
