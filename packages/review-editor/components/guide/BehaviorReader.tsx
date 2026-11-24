import React, { useEffect, useMemo, useRef, useState } from 'react';
import { diffHunkLines, parseDiffToFiles, type DiffFile } from '@reviewtrail/core/diff-files';
import type { CodeGuideData, GuideDiffRef } from '@reviewtrail/shared/guide';
import { renderMarkdownProse } from '@reviewtrail/guide-viewer/renderMarkdownProse';
import { renderInlineMarkdown } from '@reviewtrail/guide-viewer/renderInlineMarkdown';
import type { SelectedLineRange } from '@reviewtrail/ui/types';
import { HighlightedCode } from '../HighlightedCode';
import { fileHighlightLanguage } from '../../utils/highlightLanguage';
import { Check, Plus } from 'lucide-react';
import { DEMO_GUIDE_ID } from '../../demoGuide';
import { isReviewTest, passageLines, readBehavior, repeatedEditGroups, sourceExcerpt, type GuideSourceExcerpt, type Passage } from '@reviewtrail/core/reading-path';

const button = 'rounded border border-border px-2.5 py-1 text-xs hover:bg-muted focus-visible:outline-primary';
type Comment = (file: string, range: SelectedLineRange) => void;

function CodePassage({ passage, file, excerpt, canComment, onComment }: {
  passage: Passage; file?: DiffFile; excerpt?: GuideSourceExcerpt; canComment: boolean; onComment: Comment;
}) {
  const [expanded, setExpanded] = useState(false);
  const { title, explanation, path, side, start, end } = passage;
  const hunks = useMemo(() => file && diffHunkLines(file.patch), [file]);
  const context = hunks && !excerpt ? passageLines(hunks, passage, 6) : [];
  const rows = context.map(line => ({
    number: line.kind === 'context' ? (side === 'old' ? line.oldLine : line.newLine)
      : line.kind === 'del' ? line.oldLine : line.newLine,
    sign: line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : '',
    text: line.text,
  }));
  const selected = rows.filter(row => row.number >= start && row.number <= end);
  const visible = expanded ? rows : selected;
  const code = excerpt?.text ?? visible.map(row => row.text).join('\n');
  const gutter = excerpt ? excerpt.text.split('\n').map((_, i) => ({ number: start + i, sign: '' })) : visible;
  const commentSide = side === 'old' ? 'deletions' : 'additions';
  return <li className="my-5 min-w-0">
    <h4 className="font-semibold">{renderInlineMarkdown(title)}</h4>
    <div className="mt-2 overflow-hidden rounded-md border border-border">
      <header className="flex flex-wrap items-baseline gap-x-2 border-b border-border bg-muted/30 px-3 py-2 font-mono text-xs">
        <span className="break-all">{path}</span>
        <span className="text-muted-foreground">· {excerpt ? 'Identical on both sides' : side === 'old' ? 'Before' : 'After'} · L{start}{end !== start && `–${end}`}</span>
        {isReviewTest(path) && <span className="text-muted-foreground">Test source · execution unverified</span>}
      </header>
      {gutter.length > 0 ? <div className="reading-path-source">
        <div className="reading-path-gutter">{gutter.map(({ number, sign }) => {
          const label = <><span>{number}</span><span aria-hidden="true" className="reading-path-sign">{sign}</span></>;
          return canComment && !excerpt
            ? <button type="button" key={number} data-passage-line={number >= start && number <= end || undefined} aria-label={`Comment on ${path} line ${number}`}
                title={`Comment on line ${number}`} onClick={() => onComment(path, { start: number, end: number, side: commentSide })}>
                <Plus aria-hidden="true" size={12} />{label}
              </button>
            : <div key={number}>{label}</div>;
        })}</div>
        <pre><HighlightedCode code={code} language={fileHighlightLanguage(path)} /></pre>
      </div> : <p className="px-3 py-2 text-xs text-muted-foreground">Source unavailable for this range. This explanation needs verification.</p>}
      {rows.length > selected.length && <button type="button" className="w-full border-t border-border py-1 text-xs text-muted-foreground hover:bg-muted" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Less context' : 'More context'}
      </button>}
    </div>
    {explanation && <div className="mt-2 text-sm">{renderInlineMarkdown(explanation)}</div>}
    {!excerpt && selected.length > 0 && !canComment && <small className="text-muted-foreground">Current diff differs from this passage.</small>}
  </li>;
}

function FileList({ refs }: { refs: GuideDiffRef[] }) {
  return <ul className="mt-2 divide-y divide-border">{refs.map(ref => <li key={ref.file} className="py-2 text-sm">
    <span className="break-all font-mono text-xs">{ref.file}</span>
    {ref.summary && <div className="mt-1 text-muted-foreground">{renderInlineMarkdown(ref.summary)}</div>}
  </li>)}</ul>;
}

function FileGroup({ title, refs }: { title: string; refs: GuideDiffRef[] }) {
  if (!refs.length) return null;
  return <details className="mt-3 rounded border border-border px-3 py-2">
    <summary className="cursor-pointer text-sm font-medium">{title} · {refs.length}</summary>
    <FileList refs={refs} />
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
  const sections = useMemo(() => guide.sections.map((s, index) => ({ ...readBehavior(s.overview), ...s, index })), [guide.sections]);
  const testSection = (s: typeof sections[number]) => /^tests?$/i.test(s.title.trim())
    || (s.diffs.length > 0 && s.diffs.every(d => isReviewTest(d.file)) && s.passages.every(p => isReviewTest(p.path)));
  const tests = sections.filter(testSection);
  const support = sections.filter(s => !testSection(s) && s.title.trim().toLowerCase() === 'supporting changes');
  const scenarios = sections.filter(s => !testSection(s) && !support.includes(s));
  const [choice, setChoice] = useState<number | null>(null);
  const active = scenarios.find(s => s.index === choice) ?? scenarios.find(s => !reviewed[s.index]) ?? scenarios[0];
  const chapterHeading = useRef<HTMLHeadingElement>(null);
  const jumpRequested = useRef(false);
  const goToChapter = (index: number) => {
    if (index === active?.index) {
      chapterHeading.current?.focus();
      return;
    }
    jumpRequested.current = true;
    setChoice(index);
  };
  useEffect(() => {
    if (!jumpRequested.current) return;
    jumpRequested.current = false;
    chapterHeading.current?.focus({ preventScroll: true });
    chapterHeading.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active?.index]);
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

  return <article className="reading-path w-full min-w-0 px-4 py-5 text-foreground sm:px-6">
    <header className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{guide.title}</h1>
      <div className="mt-2 text-sm text-muted-foreground">{renderInlineMarkdown(guide.intent)}</div>
    </header>
    <div className={scenarios.length ? 'reading-path-layout' : undefined}>
      {scenarios.length > 0 && <nav aria-label="Reading path chapters" className="reading-path-outline">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-2 text-xs">
          <span className="font-semibold">Chapters</span>
          <span className="text-muted-foreground">{scenarios.filter(s => reviewed[s.index]).length} / {scenarios.length} reviewed</span>
        </div>
        {scenarios.map((s, i) => <button type="button" key={s.index}
          aria-current={s.index === active.index ? 'step' : undefined}
          onClick={() => goToChapter(s.index)}
          className="flex w-full items-baseline gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted aria-[current=step]:bg-muted aria-[current=step]:font-semibold">
          <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
          <span className="min-w-0 break-words">{s.title}</span>
          {reviewed[s.index] && <><Check size={14} aria-hidden="true" className="ml-auto shrink-0 text-primary" /><span className="sr-only">Reviewed</span></>}
        </button>)}
      </nav>}
      <div className="min-w-0">
        {!retained && (loadError ? <p role="status" className="my-3 text-sm">The original diff is unavailable. <button className={button} onClick={() => setAttempt(n => n + 1)}>Retry</button></p> : <p role="status">Loading the reviewed diff…</p>)}
        {active && <section key={active.index}>
          <h2 ref={chapterHeading} tabIndex={-1} className="text-xl font-semibold">{active.title}</h2>
          <div className="mt-2 mb-4">{renderMarkdownProse(active.prose)}</div>
          {retained && <ol>{active.passages.filter(p => !testPaths.has(p.path)).map((p, i) => renderPassage(p, i, active.evidence))}</ol>}
          {active.details.map((detail, index) => <details key={index} open={detail.title.toLowerCase() === "open question" || undefined} className="my-3 rounded border border-border px-3 py-2">
            <summary className="cursor-pointer font-medium">{detail.title}</summary>
            <div className="my-2">{renderMarkdownProse(detail.prose)}</div>
            {retained && <ol>{detail.passages.map((p, i) => renderPassage(p, i, active.evidence))}</ol>}
          </details>)}
          <div className="flex flex-wrap gap-2">
            <button className={button} aria-pressed={!!reviewed[active.index]} onClick={() => { setChoice(active.index); onToggle(active.index); }}>{reviewed[active.index] ? 'Mark unread' : 'Mark behavior reviewed'}</button>
            {position > 0 && <button className={button} onClick={() => goToChapter(scenarios[position - 1].index)}>Previous behavior</button>}
            {position + 1 < scenarios.length && <button className={button} onClick={() => goToChapter(scenarios[position + 1].index)}>Next behavior →</button>}
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
            <FileList refs={group.map(file => refFor(file.path))} />
          </details>)}
          <FileGroup title="Files summarized without passages" refs={accounted.map(refFor)} />
          <FileGroup title="Outside the guide" refs={unplaced.map(refFor)} />
          {(tests.length > 0 || testPaths.size > 0) && <details open={!scenarios.length && !support.length || undefined} className="mt-4 rounded border border-border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">Tests · {testPaths.size} files</summary>
            {tests.map(s => <section key={s.index} className="my-3">{renderMarkdownProse([s.prose, ...s.details.map(d => d.title + "\n" + d.prose)].join("\n\n"))}</section>)}
            <ol>{sections.map(s => <React.Fragment key={s.index}>{s.passages.filter(p => testPaths.has(p.path)).map((p, i) => renderPassage(p, i, s.evidence))}</React.Fragment>)}</ol>
            <FileGroup title="Test files" refs={[...testPaths].map(refFor)} />
          </details>}
        </>}
      </div>
    </div>
  </article>;
}
