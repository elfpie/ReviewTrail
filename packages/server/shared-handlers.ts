/**
 * Shared route handlers used by plan, review, and annotate servers.
 *
 * Eliminates duplication of /api/image, /api/upload, /api/draft, unmatched API
 * responses, and the server-ready handler across all three server files. Also
 * shares /api/agents for plan + review.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openBrowser as openBrowserImpl } from "./browser";
import { browserNoneReason, resolveBrowserIntent } from "@reviewtrail/shared/browser-intent";
import { isLocalOnlyAdvertisedUrl } from "@reviewtrail/shared/advertised-url";
import { writeUrlQr } from "./qr";
import { validateImagePath, validateUploadExtension, UPLOAD_DIR } from "./image";
import { saveDraft, loadDraft, deleteDraft, getDraftGeneration, missingDraftHeaders } from "./draft";
import { faviconBody, faviconIcoBody } from "@reviewtrail/shared/favicon";
import { getReviewTrailDataDir } from "@reviewtrail/shared/data-dir";
import { customThemesAnswer, pageWithCustomThemes } from "@reviewtrail/shared/theme-files";
import { getServerConfig } from "./config";
import { listReferenceSkills, readReferenceSkillContent } from "./review-skill-loader";
import { localImageContentType, localImageResponseHeaders } from "@reviewtrail/shared/local-image";

function normalizeDraftGeneration(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function readDraftGenerationFromUrl(req: Request): number | undefined {
  const url = new URL(req.url);
  const raw = url.searchParams.get("generation") ?? url.searchParams.get("draftGeneration");
  if (raw === null) return undefined;
  const value = Number(raw);
  return normalizeDraftGeneration(value);
}

export function readDraftGenerationFromBody(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  return normalizeDraftGeneration((body as { draftGeneration?: unknown }).draftGeneration);
}

/** Serve images from local paths or temp uploads. Used by all 3 servers. */
export async function handleImage(req: Request): Promise<Response> {
  // Every answer carries the sandbox CSP, nosniff and CORP (see
  // @reviewtrail/shared/local-image): an SVG opened directly must not run
  // script on the session origin.
  const text = (body: string, status: number) =>
    new Response(body, { status, headers: localImageResponseHeaders("text/plain; charset=utf-8") });
  const image = (file: ReturnType<typeof Bun.file>, path: string) =>
    new Response(file, { headers: localImageResponseHeaders(localImageContentType(path)) });

  const url = new URL(req.url);
  const imagePath = url.searchParams.get("path");
  if (!imagePath) {
    return text("Missing path parameter", 400);
  }
  const validation = validateImagePath(imagePath);
  if (!validation.valid) {
    return text(validation.error!, 403);
  }
  try {
    const file = Bun.file(validation.resolved);
    if (await file.exists()) {
      return image(file, validation.resolved);
    }
    // If not found and a base directory is provided, try resolving relative to it
    const base = url.searchParams.get("base");
    if (base && !imagePath.startsWith("/")) {
      const { resolve: resolvePath } = await import("path");
      const fromBase = resolvePath(base, imagePath);
      const baseValidation = validateImagePath(fromBase);
      if (baseValidation.valid) {
        const baseFile = Bun.file(baseValidation.resolved);
        if (await baseFile.exists()) {
          return image(baseFile, baseValidation.resolved);
        }
      }
    }
    return text("File not found", 404);
  } catch {
    return text("Failed to read file", 500);
  }
}

/** Upload image to temp dir, return path. Used by all 3 servers. */
export async function handleUpload(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return new Response("No file provided", { status: 400 });
    }

    const extResult = validateUploadExtension(file.name);
    if (!extResult.valid) {
      return Response.json({ error: extResult.error }, { status: 400 });
    }
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const tempPath = `${UPLOAD_DIR}/${crypto.randomUUID()}.${extResult.ext}`;

    await Bun.write(tempPath, file);
    return Response.json({ path: tempPath, originalName: file.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

/** OpenCode agent client interface (subset of OpenCode SDK) */
export interface OpencodeClient {
  app: {
    agents: (options?: object) => Promise<{
      data?: Array<{ name: string; description?: string; mode: string; hidden?: boolean }>;
    }>;
  };
}

/** List available agents. Used by plan + review servers (OpenCode only). */
export async function handleAgents(opencodeClient?: OpencodeClient): Promise<Response> {
  if (!opencodeClient) {
    return Response.json({ agents: [] });
  }

  try {
    const result = await opencodeClient.app.agents({});
    const agents = (result.data ?? [])
      .filter((a) => a.mode === "primary" && !a.hidden)
      .map((a) => ({ id: a.name, name: a.name, description: a.description }));

    return Response.json({ agents });
  } catch {
    return Response.json({ agents: [], error: "Failed to fetch agents" });
  }
}

/** Save annotation draft. Used by all 3 servers. */
export async function handleDraftSave(req: Request, contentKey: string): Promise<Response> {
  try {
    const body = await req.json();
    saveDraft(contentKey, body);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save draft";
    console.error(`[draft] save failed: ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Load annotation draft. Used by all 3 servers. */
export function handleDraftLoad(contentKey: string): Response {
  const draft = loadDraft(contentKey);
  if (!draft) return missingDraftResponse(getDraftGeneration(contentKey));
  return Response.json(draft);
}

export function missingDraftResponse(draftGeneration: number | null): Response {
  return new Response(null, { status: 204, headers: missingDraftHeaders(draftGeneration) });
}

/** Delete annotation draft. Used by all 3 servers. */
export function handleDraftDelete(contentKey: string, req?: Request): Response {
  deleteDraft(contentKey, req ? readDraftGenerationFromUrl(req) : undefined);
  return Response.json({ ok: true });
}

/**
 * List global agent skills for comment skill references. Used by plan +
 * annotate servers. Takes no client input (fixed roots only) and degrades to an
 * empty catalog on any failure so the composer never breaks.
 */
export function handleReferenceSkills(): Response {
  try {
    return Response.json({ skills: listReferenceSkills() });
  } catch (err) {
    console.error(
      `[reviewtrail] Skill catalog failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return Response.json({ skills: [] });
  }
}

/**
 * Serve a referenced skill's SKILL.md contents for feedback injection
 * (`?name=<skill>`). Used by plan + annotate servers. The name is matched
 * against discovered skills only — it is never used as a path — so traversal
 * and absolute-path inputs answer 404, never a file outside the skill roots.
 */
export function handleReferenceSkillContent(req: Request): Response {
  try {
    const name = new URL(req.url).searchParams.get("name") ?? "";
    const skill = readReferenceSkillContent(name);
    if (!skill) {
      return Response.json({ error: "Skill not found" }, { status: 404 });
    }
    return Response.json({ skill });
  } catch (err) {
    console.error(
      `[reviewtrail] Skill content failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return Response.json({ error: "Skill content failed" }, { status: 500 });
  }
}

/** Return the shared JSON response for an unmatched API route. */
export function handleApiNotFound(path: string): Response {
  return Response.json({ error: "Not found", path }, { status: 404 });
}

/**
 * Serve the app favicon. Used by all 3 servers (plus goal-setup).
 *
 * Reads the persisted style (Glass, Face or P; Glass when nothing is
 * stored) so the first painted frame already shows the person's icon. Without
 * this the static route always answered one icon and the preference only
 * landed once React mounted, i.e. a visible flash on every load.
 *
 * Two URLs, each with three possible payloads: `/favicon.ico` (what every
 * entry HTML links, see apps/hook/index.html: Glass's multi-size .ico, so the
 * tab shows its hand-pixelled 16 or 32 frame) and `/favicon.png` (one PNG, for
 * anything that links it and for the Inbox's tab-count badge). The response
 * declares its type and is not cached: a day-long cache would re-paint the old
 * icon after a switch. loadConfig() is a small unmemoized JSON read, once per
 * page load.
 */
export function handleFavicon(pathname = "/favicon.png"): Response {
  const style = getServerConfig(null).favicon;
  const { body, contentType } = pathname === "/favicon.ico" ? faviconIcoBody(style) : faviconBody(style);
  return new Response(body, {
    headers: { "Content-Type": contentType, "Cache-Control": "no-cache" },
  });
}

/**
 * `/reviewtrail-themes.js`: the person's own themes for the page's first frame
 * (packages/shared/theme-files.ts). Every page links it in its head; it is
 * read from the data dir on every load, so a theme added since shows on reload.
 * With `?syntax=<id>`, that theme's code colours as JSON, which the page asks
 * for when code first renders in it. Pi's servers answer the same
 * (apps/pi-extension/server/handlers.ts).
 */
/**
 * The page with the person's themes written in, or no themes tag when they have
 * none (`pageWithCustomThemes`): the `page` option every server's
 * `openPackedApp` takes, so a page load asks for no themes script.
 */
export function customThemesPage(html: string, dataDir: string = getReviewTrailDataDir()): string {
  return pageWithCustomThemes(html, dataDir);
}

export function handleCustomThemesScript(search: URLSearchParams = new URLSearchParams(), dataDir: string = getReviewTrailDataDir()): Response {
  const answer = customThemesAnswer(dataDir, search);
  return new Response(answer.body, { status: answer.status, headers: answer.headers });
}

interface ServerReadyOptions {
  readyFile?: string;
  skipBrowserOpen?: boolean;
  openBrowser?: typeof openBrowserImpl;
  /**
   * Set false to suppress the stderr line(s) this function writes, while
   * still writing the ready file and opening the browser. For hosts that run
   * the server in their own process and share stderr with a TUI renderer
   * (OpenCode's embedded runtime) and already show the URL through their own
   * surface (a toast or a transcript notice). Default true: every CLI start
   * prints the line.
   */
  announce?: boolean;
}

export interface ServerReadyMetadata {
  url: string;
  isRemote: boolean;
  port: number;
  /**
   * What this server shows, in full (absolute path, URL, bundle files,
   * reviewed directory or PR URL), so a host names the right file before any
   * decision. Additive; absent when the CLI did not set it.
   */
  target?: string | string[];
  /**
   * Present only for a session published with `--tailscale` (#2166): `ask`
   * true when "Ask this session" answers the machine owner's tab over the
   * tailnet. A host that asked for a tailnet session reads its absence as a
   * CLI from before the bridge was kept there.
   */
  tailnet?: { ask: boolean };
}

let serverReadyTarget: string | string[] | undefined;
let serverReadyTailnet: { ask: boolean } | undefined;

/** The `tailnet` field the next ready line carries (`--tailscale` sessions only). */
export function setServerReadyTailnet(tailnet: { ask: boolean } | undefined): void {
  serverReadyTailnet = tailnet ? { ask: tailnet.ask } : undefined;
}

/**
 * The full target the next ready line names (`ServerReadyMetadata.target`).
 * The CLI serves one session per process and sets it once it has resolved
 * what it opens, before the server starts.
 */
export function setServerReadyTarget(target: string | readonly string[] | undefined): void {
  if (target === undefined || (typeof target === "string" ? !target.trim() : target.length === 0)) {
    serverReadyTarget = undefined;
    return;
  }
  serverReadyTarget = typeof target === "string" ? target : [...target];
}

export function writeServerReadyMetadata(readyFile: string, metadata: ServerReadyMetadata): void {
  mkdirSync(dirname(readyFile), { recursive: true });
  appendFileSync(readyFile, `${JSON.stringify(metadata)}\n`, "utf8");
}

/**
 * Stable prefix of the session URL line written to stderr on every start:
 * `  ReviewTrail session ready: <url>`.
 *
 * The format is a contract: one line, two leading spaces, this prefix, then
 * the URL last. Agents and host plugins grep it (the OpenCode CLI bridge's
 * stderr filter matches it), so anything else worth saying (port forwarding,
 * a failed browser launch) goes on its own line under it.
 */
export const SESSION_READY_LINE_PREFIX = "ReviewTrail session ready: ";

/** Announce the session URL, then attempt to open the browser for it. */
export async function handleServerReady(
  url: string,
  isRemote: boolean,
  port: number,
  options: ServerReadyOptions = {},
): Promise<void> {
  const readyFile = options.readyFile ?? process.env.REVIEWTRAIL_READY_FILE;
  if (readyFile) {
    try {
      writeServerReadyMetadata(readyFile, {
        url,
        isRemote,
        port,
        ...(serverReadyTarget !== undefined && { target: serverReadyTarget }),
        ...(serverReadyTailnet !== undefined && { tailnet: serverReadyTailnet }),
      });
    } catch (error) {
      if (options.readyFile) throw error;
      // Best effort: host plugins use this side channel to open the browser.
    }
  }

  const announce = options.announce ?? true;

  // One line, every session, URL last, printed BEFORE the launch: a launcher
  // that never exits (a blocking BROWSER) must not hide it, and a local
  // session whose browser opened fine still needs a way back to a closed tab.
  // The URL appears exactly once; the lines below only add context.
  if (announce) process.stderr.write(`\n  ${SESSION_READY_LINE_PREFIX}${url}\n`);

  // A remote/SSH session can't pop a browser on the user's machine, so say
  // what to do with the URL, independently of whether URL sharing is enabled.
  if (isRemote && announce) {
    // A non-local advertised URL (a tailnet host, a reverse-proxy origin) is
    // directly reachable, so the port-forwarding advice would be wrong.
    if (!isLocalOnlyAdvertisedUrl(url)) {
      process.stderr.write(`  Open it on your device (the URL above).\n`);
      // The URL makes a device hop; a QR skips retyping it (TTY only). A QR
      // of a localhost URL would scan to nowhere, so only render one here.
      writeUrlQr(url);
    } else {
      process.stderr.write(`  Open it on your local machine (forward port ${port} if needed).\n`);
    }
  }

  const skipBrowserOpen = options.skipBrowserOpen ?? process.env.REVIEWTRAIL_SKIP_BROWSER_OPEN === "1";
  // REVIEWTRAIL_BROWSER=none (or --browser none): open nothing, anywhere, and
  // say so under the URL instead of reporting a failed launch. A host that
  // opens the browser itself (skipBrowserOpen) has nothing to explain.
  const intent = resolveBrowserIntent(process.env);
  if (!skipBrowserOpen && intent.kind === "none") {
    if (announce) process.stderr.write(`  ${browserNoneReason(intent)}\n\n`);
    return;
  }
  if (announce) process.stderr.write("\n");
  if (skipBrowserOpen) return;

  const opened = await (options.openBrowser ?? openBrowserImpl)(url, { isRemote, useGlimpse: true });

  // The URL is already out; say the automatic launch failed (headless box,
  // devcontainer with no display, broken open/xdg-open) so nobody waits on a
  // tab that never appears. Remote sessions were told what to do above.
  if (!opened && !isRemote && announce) {
    process.stderr.write("  Could not open a browser automatically — open the URL above.\n\n");
  }
}
