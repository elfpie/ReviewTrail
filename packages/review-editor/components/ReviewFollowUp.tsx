import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { DiffFile } from '@plannotator/core/diff-files';

interface Item {
  id: string;
  kind: 'concern' | 'behavior';
  text: string;
  location?: string;
  resolved: boolean;
  files: { path: string; changed: boolean; original: string; current?: string }[];
}

function Comparison({ evidence, file }: { evidence: Item['files'][number]; file?: DiffFile }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer break-all py-1">{evidence.path} · {evidence.changed ? 'evidence changed' : 'same evidence'}</summary>
    {open && <div className="grid gap-2 md:grid-cols-2">
      <div><strong>Previously reviewed lines</strong><pre className="max-h-64 overflow-auto bg-muted/30 p-2">{evidence.original || 'No line excerpt retained.'}</pre></div>
      <div><strong>Current lines at the original location</strong><pre className="max-h-64 overflow-auto bg-muted/30 p-2">{evidence.current || (file ? 'Check the full diff to locate this change.' : 'This path is absent from the current diff.')}</pre>
        {file && <details><summary className="cursor-pointer">Full current diff</summary><pre className="max-h-64 overflow-auto bg-muted/30 p-2">{file.patch}</pre></details>}
      </div>
    </div>}
  </details>;
}

/** Mounted with the snapshot as its React key so a switch cannot show another review's comments. */
export function ReviewFollowUp({ snapshot, reviewKey, files }: { snapshot: string; reviewKey: string; files: DiffFile[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const request = useRef(0);
  const update = useCallback(async (change?: { id: string; resolved: boolean }) => {
    const current = ++request.current;
    setPending(true);
    try {
      const response = await fetch('/api/review-follow-up?snapshot=' + encodeURIComponent(snapshot) + '&key=' + encodeURIComponent(reviewKey), change ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change),
      } : undefined);
      if (!response.ok) throw Error('Could not load review follow-up.');
      const data = await response.json();
      if (current === request.current) {
        setItems(Array.isArray(data.items) ? data.items : []);
        setError('');
      }
    } catch {
      if (current === request.current) setError('Review follow-up is unavailable.');
    } finally { if (current === request.current) setPending(false); }
  }, [snapshot, reviewKey]);
  useEffect(() => { void update(); return () => { request.current++; }; }, [update]);
  if (!items.length && !error) return null;
  const open = items.filter(i => !i.resolved);
  const closed = items.filter(i => i.resolved);
  function row(item: Item) {
    return <li key={item.id} className="mb-2 border-l-2 border-border pl-3">
      <div className="text-muted-foreground">{item.kind === 'behavior' ? 'Reviewed behavior with changed evidence' : 'Previous comment'}{item.location && ' · ' + item.location}</div>
      <div className="whitespace-pre-wrap font-medium">{item.text}</div>
      {item.files.filter(f => item.kind === 'concern' || f.changed).map(e =>
        <Comparison key={e.path} evidence={e} file={files.find(f => f.path === e.path)} />)}
      <button className="my-1 rounded border border-border px-2 py-1" disabled={pending}
        onClick={() => void update({ id: item.id, resolved: !item.resolved })}>
        {item.kind === 'behavior' ? 'Mark revision checked' : item.resolved ? 'Reopen comment' : 'Mark resolved'}
      </button>
    </li>;
  }
  return <aside aria-label="Review follow-up" className="max-h-[45vh] shrink-0 overflow-auto border-b border-border px-4 py-2 text-sm">
    {error && <div role="status">{error} <button className="underline" disabled={pending} onClick={() => void update()}>Retry</button></div>}
    {!!items.length && <details>
      <summary className="cursor-pointer font-medium">Review follow-up · {open.length} to revisit</summary>
      <ul className="pt-2">{open.map(row)}</ul>
      {!!closed.length && <details><summary className="cursor-pointer">Resolved comments · {closed.length}</summary><ul>{closed.map(row)}</ul></details>}
    </details>}
  </aside>;
}
