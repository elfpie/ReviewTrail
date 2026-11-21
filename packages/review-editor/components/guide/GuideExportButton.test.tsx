import { afterEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GuideExportButton } from './GuideExportButton';

const hasDom = typeof document !== 'undefined';
let root: Root | null = null;
let host: HTMLElement | null = null;
const originalFetch = globalThis.fetch;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  globalThis.fetch = originalFetch;
});

async function render(jobId: string) {
  // A second render inside one test replaces the previous tree instead of leaking it into document.body.
  if (root) await act(async () => root?.unmount());
  host?.remove();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<GuideExportButton jobId={jobId} />);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

test.skipIf(!hasDom)('only requests local export metadata and offers the HTML download', async () => {
  const urls: string[] = [];
  globalThis.fetch = (async input => {
    urls.push(String(input));
    return Response.json({ bytes: 2048, filename: 'review.html' });
  }) as typeof fetch;
  await render('saved:abc');
  expect(urls).toEqual(['/api/guide/saved%3Aabc/export-info']);
  const link = host!.querySelector('a[download="review.html"]');
  expect(link?.getAttribute('href')).toBe('/api/guide/saved%3Aabc/export');
  expect(host!.querySelector('button')).toBeNull();
});
