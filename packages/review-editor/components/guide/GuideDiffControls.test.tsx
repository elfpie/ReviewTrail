import { afterEach, describe, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { configStore, useConfigValue } from '@reviewtrail/ui/config';

// The diff worker is a Vite `?worker&inline` import Bun cannot load; the
// sibling AllFilesCodeView tests stub the pool the same way.
mock.module('../../workerPool', () => ({
  useIsWorkerPoolReadyOrDisabled: () => true,
  useWorkerPoolThemeSync: () => {},
}));
import { ReviewStateProvider, type ReviewState } from '../../dock/ReviewStateContext';
import { DEMO_GUIDE, DEMO_GUIDE_ID } from '../../demoGuide';

const { GuideScreen } = await import('./GuideScreen');

// The guided review hides the dock, and with it the dock strip's Split/Unified,
// Collapse all and gear (ReviewDockRightActions). These guard that an open
// guide draws them in the top bar's slot and that Split/Unified writes the
// `diffStyle` setting the rest of code review reads.

const hasDom = typeof document !== 'undefined';
let root: Root | null = null;
let host: HTMLElement | null = null;
let bar: HTMLElement | null = null;
let originalDiffStyle: 'split' | 'unified' | null = null;
const originalFetch = globalThis.fetch;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  bar?.remove();
  host = null;
  bar = null;
  if (originalDiffStyle) configStore.set('diffStyle', originalDiffStyle);
  originalDiffStyle = null;
  globalThis.fetch = originalFetch;
});

const file = (path: string) => ({ path, oldPath: path, patch: '', additions: 1, deletions: 0 });

/** Review state as App gives it: the stored `diffStyle`, and a change handler that writes it. */
function Harness({ compact = false, jobId = DEMO_GUIDE_ID }: { compact?: boolean; jobId?: string }) {
  const diffStyle = useConfigValue('diffStyle');
  const state = {
    diffStyle,
    onDiffStyleChange: (style: 'split' | 'unified') => configStore.set('diffStyle', style),
    isCompactTouchLayout: compact,
    files: [file('src/a.ts'), file('src/b.ts')],
    allAnnotations: [],
    selectedAnnotationId: null,
    prMetadata: null,
    currentWorktreePath: null,
    generatedFiles: new Set<string>(),
  } as unknown as ReviewState;
  return (
    <ReviewStateProvider value={state}>
      <GuideScreen
        activeGuideJobId={jobId}
        jobs={[]}
        capabilities={null}
        launchJob={async () => null}
        killJob={async () => {}}
        onClose={() => {}}
        barSlot={bar}
      />
    </ReviewStateProvider>
  );
}

async function renderGuide(compact = false, jobId = DEMO_GUIDE_ID) {
  originalDiffStyle = configStore.get('diffStyle');
  configStore.set('diffStyle', 'unified');
  globalThis.fetch = (async (url: RequestInfo | URL) => String(url) === '/api/guide/saved:with-path'
    ? Response.json({ ...DEMO_GUIDE, sections: [{ title: 'Caller retries', overview: '- [Read caller](code:src/a.ts#L1) Follow the retry.', diffs: [] }] })
    : new Response(null, { status: 404 })) as unknown as typeof fetch;
  bar = document.createElement('header');
  host = document.createElement('div');
  document.body.append(bar, host);
  root = createRoot(host);
  await act(async () => root?.render(<Harness compact={compact} jobId={jobId} />));
}

describe('GuideScreen top-bar diff controls', () => {
  test.skipIf(!hasDom)('an open guide draws Split/Unified, Collapse all and the gear in the bar, and the toggle writes diffStyle', async () => {
    await renderGuide();

    const group = bar!.querySelector('[data-guide-diff-controls]')!;
    expect(group).not.toBeNull();
    // The Inbox's order: Split/Unified, Collapse all, gear.
    const buttons = Array.from(group.querySelectorAll('button'));
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Switch to Split view', 'Collapse all files', 'Diff display options']);
    // The owner's order: Close · Approve | these | Annotations · Ask AI · Review Agents | ☰. The divider after them
    // separates them from the tool icons that follow in the bar.
    expect(group.nextElementSibling?.hasAttribute('data-guide-diff-controls-divider')).toBe(true);

    const toggle = bar!.querySelector<HTMLButtonElement>('[data-diff-layout-toggle]')!;
    expect(toggle.getAttribute('data-diff-layout-toggle')).toBe('unified');
    await act(async () => toggle.click());
    expect(configStore.get('diffStyle')).toBe('split');
    expect(bar!.querySelector('[data-diff-layout-toggle]')!.getAttribute('data-diff-layout-toggle')).toBe('split');

    const collapse = bar!.querySelector<HTMLButtonElement>('[data-guide-collapse-all]')!;
    await act(async () => collapse.click());
    expect(collapse.getAttribute('aria-label')).toBe('Expand all files');
  });

  test.skipIf(!hasDom)('opens a guide containing a reading path in Full guide and diffs', async () => {
    await renderGuide(false, 'saved:with-path');
    const mode = (name: string) => [...host!.querySelectorAll('button')].find(b => b.textContent === name)!;
    expect(mode('Full guide and diffs').getAttribute('aria-pressed')).toBe('true');
    await act(async () => mode('Reading path').click());
    expect(host!.querySelector('nav[aria-label="Reading path chapters"]')).not.toBeNull();
    await act(async () => mode('Full guide and diffs').click());
    expect(bar!.querySelector('[data-guide-diff-controls]')).not.toBeNull();
  });

  test.skipIf(!hasDom)('a compact touch layout draws none of them', async () => {
    await renderGuide(true);
    expect(bar!.querySelector('button')).toBeNull();
    expect(bar!.querySelector('[data-guide-diff-controls-divider]')).toBeNull();
  });
});
