import React, { useEffect, useMemo, useState } from 'react';
import { diffHunkLines, parseDiffToFiles, type DiffFile } from '@plannotator/core/diff-files';
import type { CodeGuideData, GuideDiffRef } from '@plannotator/shared/guide';
import { renderMarkdownProse } from '@plannotator/guide-viewer/renderMarkdownProse';
import { renderInlineMarkdown } from '@plannotator/guide-viewer/renderInlineMarkdown';
import type { SelectedLineRange } from '@plannotator/ui/types';
import { DEMO_GUIDE_ID } from '../../demoGuide';
import { isReviewTest, passageLines, readBehavior, repeatedEditGroups, sourceExcerpt, type GuideSourceExcerpt, type Passage } from '@plannotator/core/reading-path';

const button = 'rounded border border-border px-2.5 py-1 text-xs hover:bg-muted focus-visible:outline-primary';
type Comment = (file: string, range: SelectedLineRange) => void;

function PatchDetails({ label, file, summary }: { label: string; file?: DiffFile; summary?: string }) {
  const [open, setOpen] = useState(false);
  return <details className="my-2 border-l border-border pl-3 text-xs" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer break-all">{label}</summary>
    {open && <>
      {summary && <div className="my-2 text-sm">{renderInlineMarkdown(summary)}</div>}
      <pre className="max-h-80 overflow-auto bg-muted/25 p-2"><code>{file?.patch || 'Diff unavailable for this file.'}</code></pre>
    </>}
  </details>;
}

function CodePassage({ passage, file, excerpt, canComment, onComment }: {
  passage: Passage; file?: DiffFile; excerpt?: GuideSourceExcerpt; canComment: boolean; onComment: Comment;
}) {
  const [expanded, setExpanded] = useState(false);
  const hunks = useMemo(() => file && diffHunkLines(file.patch), [file]);
  const lines = hunks ? passageLines(hunks, passage, expanded ? 6 : 0) : [];
  const { title, explanation, path, side, start, end } = passage;
  return (
    <li className="mb-5 border-l-2 border-primary/40 pl-4">
      <h4 className="font-semibold">{renderInlineMarkdown(title)}</h4>
      <div className="my-1 break-all font-mono text-xs text-muted-foreground">{path} · {excerpt ? 'Identical on both sides' : side === 'old' ? 'Before' : 'After'} · L{start}{end !== start && `–${end}`}</div>
      {isReviewTest(path) && <small className="text-muted-foreground">Test source · execution unverified</small>}
      {excerpt ? <pre className="my-2 overflow-auto rounded bg-muted/25 p-2 text-xs"><code>{excerpt.text}</code></pre> : lines.length > 0 ? (
        <pre className="my-2 max-h-80 overflow-auto rounded border border-border bg-muted/25 py-2 text-xs leading-5"><code>{lines.map(line => {
          const n = side === 'old' && 'oldLine' in line ? line.oldLine : 'newLine' in line ? line.newLine : undefined;
          return <span key={n} className={`block px-3 ${n && n >= start && n <= end ? 'text-foreground' : 'text-muted-foreground'}`}><span className="mr-3 select-none text-muted-foreground">{n}</span>{line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '} {line.text || ' '}</span>;
        })}</code></pre>
      ) : <p className="my-2 text-xs text-muted-foreground">Source unavailable for this range. This explanation needs verification.</p>}
      {explanation && <div className="my-2 text-sm">{renderInlineMarkdown(explanation)}</div>}
      {lines.length > 0 && <div className="flex flex-wrap items-center gap-2">
        <button className={button} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Less context' : 'More context'}</button>
        {canComment ? <button className={button} onClick={() => onComment(path, { start, end, side: side === 'old' ? 'deletions' : 'additions' })}>Comment on lines</button>
          : <span className="text-xs text-muted-foreground">Current diff differs. Open it to comment.</span>}
      </div>}
      {file && <PatchDetails label="Full file diff" file={file} />}
    </li>
  );
}

function FileGroup({ title, refs, files }: { title: string; refs: GuideDiffRef[]; files: Map<string, DiffFile> }) {
  if (!refs.length) return null;
  return <details className="mt-3 rounded border border-border px-3 py-2">
    <summary className="cursor-pointer text-sm font-medium">{title} · {refs.length}</summary>
    {refs.map(ref => <PatchDetails key={ref.file} label={ref.file} file={files.get(ref.file)} summary={ref.summary} />)}
  </details>;
}

export function BehaviorReader({ guide, jobId, liveFiles, reviewed, onToggle, onComment }: {
  guide: CodeGuideData; jobId: string; liveFiles: DiffFile[]; reviewed: boolean[]; onToggle: (index: number) => void; onComment: Comment;
}) {
  const [snapshot, setSnapshot] = useState<DiffFile[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (jobId === DEMO_GUIDE_ID) return;
    const abort = new AbortController();
    setLoadError(false);
    fetch(`/api/guide/${encodeURIComponent(jobId)}/patch`, { signal: abort.signal })
      .then(async r => {
        if (!r.ok) throw Error(String(r.status));
        const { patch } = await r.json();
        if (typeof patch !== 'string') throw Error('Missing patch');
        if (!abort.signal.aborted) setSnapshot(parseDiffToFiles(patch));
      })
      .catch(() => { if (!abort.signal.aborted) setLoadError(true); });
    return () => abort.abort();
  }, [jobId, attempt]);
  const retained = jobId === DEMO_GUIDE_ID ? liveFiles : snapshot;
  const repeats = useMemo(() => repeatedEditGroups(retained ?? []), [retained]);
  const files = useMemo(() => new Map(retained?.map(f => [f.path, f])), [retained]);
  const live = useMemo(() => new Map(liveFiles.map(f => [f.path, f.patch])), [liveFiles]);
  const sections = useMemo(() => guide.sections.map((s, index) => ({ ...s, index, ...readBehavior(s.overview) })), [guide.sections]);
  const testSection = (s: typeof sections[number]) => /^tests?$/i.test(s.title.trim())
    || (s.diffs.length > 0 && s.diffs.every(d => isReviewTest(d.file)) && s.passages.every(p => isReviewTest(p.path)));
  const tests = sections.filter(testSection);
  const support = sections.filter(s => !testSection(s) && s.title.trim().toLowerCase() === 'supporting changes');
  const scenarios = sections.filter(s => !testSection(s) && !support.includes(s));
  const [choice, setChoice] = useState<number | null>(null);
  const active = scenarios.find(s => s.index === choice) ?? scenarios.find(s => !reviewed[s.index]) ?? scenarios[0];
  const position = scenarios.indexOf(active);
  const refs = new Map(sections.flatMap(s => s.diffs.map(ref => [ref.file, ref] as const)));
  const testPaths = new Set(tests.flatMap(s => s.diffs.map(ref => ref.file)));
  for (const path of files.keys()) if (isReviewTest(path)) testPaths.add(path);
  const refFor = (path: string) => refs.get(path) ?? { file: path };
  const covered = new Set(scenarios.flatMap(s => [...s.passages, ...s.details.flatMap(d => d.passages)].map(p => p.path)));
  const grouped = [...files.keys()].filter(path => !covered.has(path) && !testPaths.has(path));
  const accounted = grouped.filter(path => refs.has(path));
  const unplaced = grouped.filter(path => !refs.has(path));
  const renderPassage = (p: Passage, i: number, evidence?: GuideSourceExcerpt[]) => <CodePassage key={i} passage={p} file={files.get(p.path)} excerpt={sourceExcerpt(evidence, p)}
    canComment={files.has(p.path) && live.get(p.path) === files.get(p.path)?.patch} onComment={onComment} />;

  return <article className="mx-auto max-w-4xl px-5 py-6 text-foreground">
    <h1 className="text-2xl font-semibold tracking-tight">{guide.title}</h1>
    <div className="my-2 text-sm text-muted-foreground">{renderInlineMarkdown(guide.intent)}</div>
    {scenarios.length > 0 && <nav aria-label="Behavior scenarios" className="my-6 flex flex-wrap items-center gap-2 border-y border-border py-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">Behavior
        <select className="w-full rounded border border-border bg-background p-2 text-sm text-foreground" value={active.index} onChange={e => setChoice(Number(e.target.value))}>
          {scenarios.map((s, i) => <option key={s.index} value={s.index}>{i + 1}. {s.title}{reviewed[s.index] ? ' · reviewed' : ''}</option>)}
        </select>
      </label>
      <span className="mt-4 text-xs text-muted-foreground">{scenarios.filter(s => reviewed[s.index]).length} / {scenarios.length} reviewed</span>
    </nav>}
    {!retained && (loadError ? <p role="status" className="my-3 text-sm">The original diff is unavailable. <button className={button} onClick={() => setAttempt(n => n + 1)}>Retry</button></p> : <p role="status">Loading the reviewed diff…</p>)}
    {active && <section key={active.index}>
      <h2 className="text-lg font-semibold">{active.title}</h2>
      <div className="mt-2 mb-4">{renderMarkdownProse(active.prose)}</div>
      {retained && <ol>{active.passages.filter(p => !testPaths.has(p.path)).map((p, i) => renderPassage(p, i, active.evidence))}</ol>}
      {active.details.map((detail, index) => <details key={index} open={detail.title.toLowerCase() === "open question" || undefined} className="my-3 rounded border border-border px-3 py-2">
        <summary className="cursor-pointer font-medium">{detail.title}</summary>
        <div className="my-2">{renderMarkdownProse(detail.prose)}</div>
        {retained && <ol>{detail.passages.map((p, i) => renderPassage(p, i, active.evidence))}</ol>}
      </details>)}
      <div className="flex flex-wrap gap-2">
        <button className={button} aria-pressed={!!reviewed[active.index]} onClick={() => { setChoice(active.index); onToggle(active.index); }}>{reviewed[active.index] ? 'Mark unread' : 'Mark behavior reviewed'}</button>
        {position > 0 && <button className={button} onClick={() => setChoice(scenarios[position - 1].index)}>Previous behavior</button>}
        {position + 1 < scenarios.length && <button className={button} onClick={() => setChoice(scenarios[position + 1].index)}>Next behavior →</button>}
      </div>
    </section>}
    {retained && <>
      {support.length > 0 && <details className="mt-3 rounded border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Supporting changes</summary>
        {support.map(s => <section key={s.index} className="my-3">{renderMarkdownProse([s.prose, ...s.details.map(d => d.title + "\n" + d.prose)].join("\n\n"))}
          <ol>{[...s.passages, ...s.details.flatMap(d => d.passages)].filter(p => !testPaths.has(p.path)).map((p, i) => renderPassage(p, i, s.evidence))}</ol></section>)}
      </details>}
      {repeats.map(group => <details key={group[0].path} className="my-3 rounded border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Matching edit in {group.length} files · {group[0].path}</summary>
        <p className="my-2 text-xs">These hunks add and remove the same lines in the same order. Inspect each caller for differences in behavior.</p>
        {group.map((file, i) => <PatchDetails key={file.path} label={(i === 0 ? 'Example · ' : '') + file.path} file={file} />)}
      </details>)}
      <FileGroup title="Files summarized without passages" refs={accounted.map(refFor)} files={files} />
      <FileGroup title="Outside the guide" refs={unplaced.map(refFor)} files={files} />
      {(tests.length > 0 || testPaths.size > 0) && <details open={!scenarios.length && !support.length || undefined} className="mt-4 rounded border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Tests · {testPaths.size} files</summary>
        {tests.map(s => <section key={s.index} className="my-3">{renderMarkdownProse([s.prose, ...s.details.map(d => d.title + "\n" + d.prose)].join("\n\n"))}</section>)}
        <ol>{sections.flatMap(s => s.passages.filter(p => testPaths.has(p.path))).map((p, i) => renderPassage(p, i))}</ol>
        <FileGroup title="Test diffs" refs={[...testPaths].map(refFor)} files={files} />
      </details>}
    </>}
  </article>;
}
