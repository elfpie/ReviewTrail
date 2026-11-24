import { diffHunkLines, parseDiffToFiles } from "./diff-files";
import { escapeHtmlText as esc, escapeJsonForHtmlScript, GUIDE_SNAPSHOT_SCRIPT_ID, type GuideSnapshot } from "./guide-format";
import { passageLines, readBehavior, repeatedEditGroups, sourceExcerpt, isReviewTest, type Passage } from "./reading-path";
import type { GuideOverviewDiagram } from "./guide";

const style = `
:root{color-scheme:light dark;font:16px/1.55 system-ui,sans-serif}body{max-width:80ch;margin:auto;padding:2rem 1rem 6rem}
h1,h2,h3{line-height:1.2}header,section{border-bottom:1px solid GrayText;padding:1rem 0}nav ol{padding-left:1.4rem}
a{color:LinkText}summary{cursor:pointer}details{margin:.7rem 0}pre{font:13px/1.5 ui-monospace,monospace;overflow:auto;padding:1rem;background:color-mix(in srgb,CanvasText 6%,Canvas)}
p{white-space:pre-wrap}code,summary{overflow-wrap:anywhere}.location,header small{color:GrayText}figure{margin:1rem 0;padding-left:1rem;border-left:3px solid GrayText}
`;

function diagram(value?: GuideOverviewDiagram): string {
  return value ? `<details><summary>Diagram source · ${esc(value.kind)}</summary><pre>${esc(value.source)}</pre></details>` : "";
}

/** A read-only document. All navigation and disclosure work with scripts and networking disabled. */
export function createOfflineGuide(snapshot: GuideSnapshot): string {
  const { guide, review } = snapshot;
  const files = parseDiffToFiles(review.rawPatch);
  const byPath = new Map(files.map((file, index) => [file.path, { index, hunks: diffHunkLines(file.patch) ?? [] }]));
  const fileLink = (path: string) => {
    const file = byPath.get(path);
    return file ? `<a href="#file-${file.index}">${esc(path)}</a>` : esc(path);
  };
  const groups = repeatedEditGroups(files).map(group => `<details><summary>Matching edit in ${group.length} files · ${esc(group[0].path)}</summary><p>These hunks add and remove the same lines in the same order.</p><ul>${group.map(f => `<li>${fileLink(f.path)}</li>`).join("")}</ul></details>`).join("");
  const chapters = guide.sections.map((section, i) => {
    const { prose, passages, details } = readBehavior(section.overview);
    const excerpt = (p: Passage) => {
      const retained = sourceExcerpt(section.evidence, p);
      const file = byPath.get(p.path);
      const lines = file && passageLines(file.hunks, p);
      const source = retained ? esc(retained.text) : lines?.length ? lines.map(line => {
        const n = p.side === "old" && "oldLine" in line ? line.oldLine : "newLine" in line ? line.newLine : "";
        return `${n}  ${line.kind === "del" ? "-" : line.kind === "add" ? "+" : " "} ${esc(line.text)}`;
      }).join("\n") : "This range is outside the retained patch.";
      return `<figure><strong>${esc(p.title)}</strong><div class="location">${fileLink(p.path)} · ${retained ? "Identical on both sides" : p.side === "old" ? "Before" : "After"} · L${p.start}–${p.end}</div>${isReviewTest(p.path) ? "<small>Test source · execution unverified</small>" : ""}<pre>${source}</pre><figcaption>${esc(p.explanation)}</figcaption></figure>`;
    };
    const excerpts = passages.map(excerpt).join("");
    const investigations = details.map(d => `<details><summary>${esc(d.title)}</summary><p>${esc(d.prose)}</p>${d.passages.map(excerpt).join("")}</details>`).join("");
    const refs = section.diffs.map(ref => {
      const notes = (ref.notes ?? []).map(n => `<p>${n.side === "old" ? "Before" : "After"} · L${n.lineStart}–${n.lineEnd} · ${esc(n.text)}</p>`).join("");
      return `<li>${fileLink(ref.file)}${ref.summary ? " — " + esc(ref.summary) : ""}${notes}</li>`;
    }).join("");
    const content = `<p>${esc(prose)}</p>${diagram(section.diagram)}${excerpts}${investigations}<ul>${refs}</ul>`;
    const title = esc(section.title);
    return /^tests?$/i.test(section.title.trim()) || (section.diffs.length > 0 && section.diffs.every(d => isReviewTest(d.file)))
      ? `<details id="chapter-${i}"><summary>${title}</summary>${content}</details>`
      : `<section id="chapter-${i}"><h2>${title}</h2>${content}</section>`;
  }).join("");
  const navigation = guide.sections.map((s,i) => `<li><a href="#chapter-${i}">${esc(s.title)}</a></li>`).join("");
  const diffs = files.map((file,i) => `<details id="file-${i}"><summary>${esc(file.path)}</summary><pre>${esc(file.patch)}</pre></details>`).join("");
  const data = escapeJsonForHtmlScript(JSON.stringify(snapshot));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="reviewtrail-guided-review" content="v${snapshot.version}"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><title>${esc(guide.title)} · ReviewTrail</title><style>${style}</style></head><body>
<header><small>ReviewTrail · ${esc(review.gitRef)}</small><h1>${esc(guide.title)}</h1><p>${esc(guide.intent)}</p></header>
${guide.overview ? `<p>${esc(guide.overview.text)}</p>${diagram(guide.overview.diagram)}` : ""}
<nav aria-label="Chapters"><ol>${navigation}<li><a href="#files">Full diff</a></li></ol></nav>${chapters}${groups}
<section id="files"><h2>Full diff</h2>${diffs || `<pre>${esc(review.rawPatch)}</pre>`}</section>
<script id="${GUIDE_SNAPSHOT_SCRIPT_ID}" type="application/json">${data}</script></body></html>`;
}
