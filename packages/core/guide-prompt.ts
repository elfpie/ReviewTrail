/**
 * Guided Review generation, the pure half: the organizer prompt, its JSON
 * output schema, the user message that frames the changeset, and the
 * validator that holds model output to the coverage rule. Browser-safe and
 * zero-dependency, so any host (the Plannotator servers, Pi, or an external
 * app such as Workspaces) generates guides with Plannotator's exact prompt.
 * Moved verbatim from packages/server/guide/guide-review.ts, which
 * re-exports every name; the engine plumbing (commands, output parsing,
 * sessions) stays there.
 */

import type { CodeGuideOutput, GuideDiffRef, GuideSection } from "./guide";
import type { DiffType } from "./diff-type";
import {
  buildWorkspacePromptContextLines,
  getLocalDiffInstruction,
  type WorkspaceReviewPromptContext,
} from "./review-prompt";

/** The PR fields buildGuideUserMessage reads. Structural, so the server's
 *  full `PRMetadata` (GitHub or GitLab) is accepted as-is. */
export interface GuidePromptPRMetadata {
  url: string;
  baseBranch: string;
  /** Carry the diff inline when there is no local checkout: set for platforms
   *  no agent-allowed CLI can read (Bitbucket), where the URL alone is not
   *  enough. Absent keeps the URL-only message. */
  inlineDiff?: boolean;
}

/** Generic structural validation failure (no sections / blank overviews).
 *  onJobComplete deliberately does NOT surface this string on the job card —
 *  the caller substitutes GUIDE_EMPTY_OUTPUT_ERROR — whereas the informative
 *  outside-changeset validation error passes through verbatim. */
export const GUIDE_NO_SECTIONS_ERROR = "No sections survived validation";

export const GUIDE_SCHEMA_JSON = JSON.stringify({
  type: "object",
  properties: {
    title: { type: "string" },
    intent: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          overview: { type: "string" },
          diffs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                file: { type: "string" },
                summary: { type: "string" },
              },
              required: ["file", "summary"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "overview", "diffs"],
        additionalProperties: false,
      },
    },
    unplacedFiles: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["title", "intent", "sections", "unplacedFiles"],
  additionalProperties: false,
});

/** The review fork encodes anchored passages as ordinary guide Markdown.
 * Older readers and portable exports can display the same guide. */
export const GUIDE_REVIEW_PROMPT = `# Guided code review

Help a human decide whether to merge this changeset. Follow concrete behaviors
in execution order across files. Use the reviewer's language and assume a
capable engineer who may be new to the library. Return the supplied JSON schema.

Read the exact diff and its changed-file list. For a PR, read its description.
Look up an unchanged caller, interface or existing implementation when it helps
establish ownership or explain an assumption. Cite the symbol in prose.
Separate observed code from inferred intent. Never claim a test ran without a result.

Use the PR title when available. In intent, state the overall observable change.
Give each independently important behavior a section with a scenario title.
In the overview, describe what happened before, what now happens and the
decision or uncertainty that deserves attention. Follow that with a short
reading path. Each passage is one Markdown bullet on its own line:

- [Accept an order](code:src/orders.ts#L12-L16) Explain who calls it and which branch matters.
- [Apply retry policy](code:src/policy.ts#L55-L59) Explain the assumption or failure case here.
- [Return to the caller](code:src/orders.ts#L24-L26) Describe the observable outcome.

These paths and numbers are examples. Copy real paths and line numbers from
the patch's hunk headers. Cite a short range (typically 1 to 8 lines) inside
one hunk. Use new-side lines by default. For removed code use this form:
- Before [Previous fallback](code:src/policy.ts#L42-L44) Explain the old path.

Paths may recur in multiple steps or scenarios. Mark conditionals, asynchronous
handoffs and alternative paths explicitly. Never invent execution order.
Choose a representative caller for repeated edits, name the other callers in
their file summaries, and give exceptional callers their own passages. For a
large file, select the small passages that carry the decision; for ordinary
wiring, the file summary is enough. Explain complex lines beside their link.
If a call or consequence cannot be resolved, say what remains unknown.
For configuration or declarative changes, follow the consumer and the effect.

Start each behavior with one sentence stating the change the reviewer must judge,
then the shortest chain of anchored production passages that explains it.
After that main path use the following optional Markdown headings verbatim.
Each heading owns its prose and passage bullets until the next heading.

### Caller impact
For a changed default, API or contract, find a real existing caller that has
not changed. Show the input it already supplies or omits. Trace that SAME input
through the old and new behavior using Before and new-side passage bullets.
Cite the unchanged caller with a normal code: link and exact repository lines,
without adding it to diffs. If there is no accessible caller, explain what
external consumers or runtime configuration prevent you from checking.

### What if the write times out?
Replace the question with a concrete consequential failure, concurrency or
boundary case. Give the answer, follow its actual path with code: bullets, and
cite the most relevant test as a passage here even if it is placed in Tests.
Describe its assertion. Say "Test source inspected" for a read test. Never
imply it ran. If no test establishes the claim, state that gap. Do not invent
a quiz for a mechanical edit.

### Why here?
Explain the ownership decision, citing an interface or precedent. Distinguish
what the code establishes from your inference. If the rationale is unknown,
give a specific question for the author.

### Repeated edits
For repeated changes, show one representative edit, name the matching paths,
say how you checked them, and give exceptions their own anchored passages.
Use this only after actually comparing the edits.

### Open question
State any remaining material uncertainty and what would resolve it.
Omit headings that add nothing. Do not repeat the main claim under each heading.

Put supporting edits in a "Supporting changes" section and tests in a final
"Tests" section. On a tests-only change describe the contract under test.
Never hide a production exception among the tests or supporting edits.

File placement and reading order are independent. Place every changed file
exactly once in sections[].diffs (file and short summary), or in unplacedFiles.
Passage links may refer back to a file placed elsewhere. Always include
unplacedFiles, empty if appropriate. A scenario that reuses only files placed
elsewhere can have an empty diffs array and a meaningful overview.
Keep the guide concise. The reviewer owns the verdict.`;

export interface GuideChangedFile {
  path: string;
  additions: number;
  deletions: number;
}

function buildChangedFilesBlock(changedFiles?: GuideChangedFile[]): string[] {
  if (!changedFiles || changedFiles.length === 0) return [];
  return [
    "",
    "Changed files (plan section placement against this exact file set; diffs[].file must match one of these paths verbatim):",
    ...changedFiles.map((f) => `${f.path} (+${f.additions}/-${f.deletions})`),
  ];
}

export function buildGuideUserMessage(
  patch: string,
  diffType: DiffType,
  options?: { defaultBranch?: string; hasLocalAccess?: boolean; prDiffScope?: string; workspace?: WorkspaceReviewPromptContext },
  prMetadata?: GuidePromptPRMetadata,
  changedFiles?: GuideChangedFile[],
): string {
  const changedFilesBlock = buildChangedFilesBlock(changedFiles);

  if (options?.workspace) {
    return buildWorkspaceGuideUserMessage(patch, options.workspace, changedFilesBlock);
  }

  if (prMetadata) {
    if (options?.prDiffScope === "full-stack") {
      return [
        `Full-stack guided review of ${prMetadata.url}`,
        "",
        "This is a stacked PR. The diff below shows ALL accumulated changes from the repository default branch through this PR's head (not just this PR's own layer).",
        "Organize the complete changeset into a guided review.",
        ...changedFilesBlock,
        "",
        "```diff",
        patch,
        "```",
      ].join("\n");
    }
    if (options?.hasLocalAccess) {
      return [
        prMetadata.url,
        "",
        "You are in a local worktree checked out at the PR head. The code is available locally.",
        `To see the PR changes, diff against the remote base branch: git diff origin/${prMetadata.baseBranch}...HEAD`,
        "Do NOT diff against the local `main` branch; it may be stale. Always use origin/.",
        "",
        "Organize this PR's changeset into a guided review.",
        ...changedFilesBlock,
      ].join("\n");
    }
    if (prMetadata.inlineDiff) {
      return [
        prMetadata.url,
        "",
        "Organize this PR's changeset into a guided review. The PR diff is below.",
        ...changedFilesBlock,
        "",
        "```diff",
        patch,
        "```",
      ].join("\n");
    }
    return [
      prMetadata.url,
      "",
      "Organize this PR's changeset into a guided review.",
      ...changedFilesBlock,
    ].join("\n");
  }

  const instruction = getLocalDiffInstruction(diffType, options?.defaultBranch);
  if (instruction) {
    return [
      `Organize ${instruction.target} into a guided review. ${instruction.inspect}`,
      ...changedFilesBlock,
    ].join("\n");
  }

  return [
    "Organize the following code changes into a guided review.",
    ...changedFilesBlock,
    "",
    "```diff",
    patch,
    "```",
  ].join("\n");
}

function buildWorkspaceGuideUserMessage(
  patch: string,
  workspace: WorkspaceReviewPromptContext,
  changedFilesBlock: string[],
): string {
  return [
    "Organize the local workspace changes across multiple nested VCS repositories into a guided review.",
    "",
    ...buildWorkspacePromptContextLines(workspace),
    ...changedFilesBlock,
    "",
    "```diff",
    patch,
    "```",
  ].join("\n");
}

/**
 * Coerces one raw (untrusted) section from model output into a well-typed
 * `GuideSection`, or drops it entirely. The validator downstream dereferences
 * `section.diffs.length` / `section.overview.trim()` unchecked — a malformed
 * section (wrong field types, missing fields) would otherwise throw there,
 * and for the guide provider that throw is swallowed upstream, leaving a
 * done-looking job that 404s on `/api/guide/:jobId`. Returns null for a
 * section with nothing of value (no title, no overview, no diffs).
 */
export function sanitizeGuideSection(raw: unknown): GuideSection | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const title = typeof s.title === "string" ? s.title : "";
  const overview = typeof s.overview === "string" ? s.overview : "";
  // Map to `{ file, summary? }` only — stray model-emitted fields never reach
  // the client. A missing/non-string/blank summary is simply omitted (the UI
  // renders nothing for it), never a reason to drop the ref or fail the guide.
  const diffs: GuideDiffRef[] = Array.isArray(s.diffs)
    ? s.diffs
        .filter((d): d is Record<string, unknown> & { file: string } => !!d && typeof d === "object" && typeof (d as Record<string, unknown>).file === "string")
        .map((d) => {
          const summary = typeof d.summary === "string" && d.summary.trim().length > 0 ? d.summary : undefined;
          return summary ? { file: d.file, summary } : { file: d.file };
        })
    : [];
  if (title.trim().length === 0 && overview.trim().length === 0 && diffs.length === 0) return null;
  // Every surviving section gets a non-empty title: a diffs-only section
  // (blank title AND overview) used to render as a blank chapter with a
  // "Guide Generated" job around it — no parse failure, so no recovery flow.
  // Keeping the section (titled) beats dropping it: its files were PLACED by
  // the model, so they're not in unplacedFiles and dropping would silently
  // orphan them from the guide's coverage story.
  return { title: title.trim() ? title : "Untitled section", overview, diffs };
}

/** Sanitizes a raw sections array (see `sanitizeGuideSection`). Shared by the
 *  stream (Claude) and file (Codex) output paths and by onJobComplete's
 *  validation, so a malformed section from either engine never reaches an
 *  unchecked `.length` / `.trim()` call. */
export function sanitizeGuideSections(raw: unknown): GuideSection[] {
  if (!Array.isArray(raw)) return [];
  const out: GuideSection[] = [];
  for (const item of raw) {
    const sanitized = sanitizeGuideSection(item);
    if (sanitized) out.push(sanitized);
  }
  return out;
}

/** Sanitizes the model-provided `unplacedFiles` array to a plain string[]. */
export function sanitizeUnplacedFiles(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((f): f is string => typeof f === "string") : [];
}

/**
 * Shared validation core for guide output: sanitize the raw sections /
 * unplacedFiles, enforce the coverage rule against the CURRENT changed-file
 * set (fail-closed — a ref to a file that isn't part of the changeset is
 * dropped, not rendered as a dangling reference; a file placed twice keeps
 * only its first placement), and coerce title/intent to strings. Pure — used
 * by both onJobComplete (automatic ingestion) and submitManualOutput (manual
 * repair paste), so a malformed model or human-pasted payload is held to
 * exactly the same bar either way.
 */
export function validateGuideOutput(raw: unknown, changedFiles: string[]): { guide: CodeGuideOutput } | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "Malformed guide output (not an object)" };
  }
  const output = raw as Record<string, unknown>;

  const changedSet = new Set(changedFiles);
  const placed = new Set<string>();
  const validatedSections: GuideSection[] = [];
  const sanitizedSections = sanitizeGuideSections(output.sections);
  // Files the model referenced that are not part of the changeset — tracked
  // so a fully-invalidated guide can explain WHY nothing survived (typically
  // the model guided a different commit than the one under review).
  const outsideChangeset = new Set<string>();

  for (const section of sanitizedSections) {
    const originalDiffCount = section.diffs.length;
    const diffs: GuideDiffRef[] = [];
    for (const ref of section.diffs) {
      if (!changedSet.has(ref.file)) {
        // not a real changed file
        outsideChangeset.add(ref.file);
        continue;
      }
      if (placed.has(ref.file)) continue; // duplicate — first placement wins
      placed.add(ref.file);
      diffs.push(ref);
    }

    if (diffs.length === 0) {
      // Keep a zero-diff section ONLY if it was already zero-diff in the
      // model's output (a deliberate prose-only context section) AND has
      // real overview text. A section that LOST all its diffs to
      // validation above is dropped, not kept empty.
      if (originalDiffCount === 0 && section.overview.trim().length > 0) {
        validatedSections.push({ ...section, diffs });
      }
      continue;
    }

    validatedSections.push({ ...section, diffs });
  }

  if (validatedSections.length === 0) {
    // Nothing survived validation — a guide screen with zero sections is
    // useless (it would just be a single "Everything else" bucket for the
    // whole diff). Fail closed, same as an unparseable output. When the
    // sections died because their refs named files outside the changeset,
    // say so — that failure is actionable (guide the right commit), unlike
    // genuinely structural emptiness (no sections / blank overviews), which
    // keeps the generic message.
    if (outsideChangeset.size > 0) {
      const examples = [...outsideChangeset].slice(0, 3).join(", ");
      return {
        error:
          `Guide referenced ${outsideChangeset.size} file(s) outside the changeset under review ` +
          `(e.g. ${examples}). To guide a different commit, open it in the Commits panel first, then relaunch.`,
      };
    }
    return { error: GUIDE_NO_SECTIONS_ERROR };
  }

  // unplacedFiles = every changed file that never landed in a section,
  // merged with any model-provided unplacedFiles that are real changed files
  // AND not already placed (a file the model lists in both a section and
  // unplacedFiles must not render twice).
  const modelUnplaced = sanitizeUnplacedFiles(output.unplacedFiles).filter((f) => changedSet.has(f) && !placed.has(f));
  const unplacedSet = new Set<string>(modelUnplaced);
  for (const file of changedFiles) {
    if (!placed.has(file)) unplacedSet.add(file);
  }
  const unplacedFiles = [...unplacedSet];

  const guide: CodeGuideOutput = {
    // Marker engines are prompt-enforced only (no schema flag) — a non-string
    // title/intent would otherwise reach the client verbatim and crash
    // GuideView (React child error, or renderInlineMarkdown's .split on a
    // non-string).
    title: typeof output.title === "string" && output.title.trim().length > 0 ? output.title : "Guided review",
    intent: typeof output.intent === "string" ? output.intent : "",
    sections: validatedSections,
    ...(unplacedFiles.length > 0 && { unplacedFiles }),
  };

  return { guide };
}
