/**
 * ReviewTrail Data Directory
 *
 * Returns the base directory for all ReviewTrail data files.
 *
 * Priority:
 *   1.  REVIEWTRAIL_DATA_DIR environment variable (with ~ expansion)
 *   2.  ~/.reviewtrail when it already exists (legacy default), unless it is
 *       a stray folder: it holds none of ReviewTrail's data while
 *       $XDG_DATA_HOME/reviewtrail does (see below)
 *   3.  $XDG_DATA_HOME/reviewtrail when XDG_DATA_HOME is a non-empty
 *       absolute path
 *   4.  Default: ~/.reviewtrail
 *
 * This mirrors PASTE_DATA_DIR for the paste service and allows users
 * to relocate all data (plans, history, drafts, config, hooks, sessions,
 * debug logs, IPC registry, etc.) via a single variable — useful for
 * XDG-style home directory cleanliness on Unix systems.
 *
 * The XDG fallback follows git's legacy-first pattern: an existing
 * ~/.reviewtrail wins, so current installs never move. Only when the legacy
 * directory is absent AND XDG_DATA_HOME is explicitly set does the XDG
 * location apply. Deliberately NOT implemented: the spec's implicit
 * ~/.local/share default (defaults stay unchanged when XDG_DATA_HOME is
 * unset) and any config/data/cache split — ReviewTrail uses one monolithic
 * directory.
 *
 * The stray-folder exception (#2305): skills and help text used to name
 * ~/.reviewtrail outright, so on an XDG install an agent could create
 * ~/.reviewtrail/hooks/compound/ or ~/.reviewtrail/config.json, and from then
 * on every ReviewTrail process silently switched to that near-empty folder,
 * leaving the person's plans and history unreachable. ReviewTrail itself
 * never creates the XDG folder while ~/.reviewtrail exists, so the two
 * coexist only when something else made one of them. When the XDG folder
 * holds ReviewTrail data (an entry of DATA_DIR_MARKERS) and ~/.reviewtrail
 * holds none, the XDG folder wins. In every other case (no XDG folder, or
 * ~/.reviewtrail holds data too) the result is the same as before.
 *
 * The same rule is mirrored, and must stay identical, in the Claude Code mod
 * (apps/hook/hooks/mod/launch.ts `dataDirOf`), the Amp plugin
 * (apps/amp-plugin/reviewtrail.ts) and the install scripts
 * (scripts/install.sh, install.ps1, install.cmd);
 * tests/data-dir-mirrors.test.ts runs each copy it can, and
 * scripts/check-data-dir-windows.ps1 runs the Windows ones on Windows.
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { isAbsolute, join, resolve } from "path";

/**
 * Resolve the ReviewTrail data directory.
 *
 * If REVIEWTRAIL_DATA_DIR is set and non-empty, the value is used
 * as the base directory. Leading ~ is expanded to the user's home
 * directory.
 *
 * Otherwise, ~/.reviewtrail is used when it exists (unless it is a stray
 * folder, see getDefaultReviewTrailDataDir); failing that,
 * $XDG_DATA_HOME/reviewtrail when XDG_DATA_HOME holds an absolute
 * path; failing that, ~/.reviewtrail.
 */
export function getReviewTrailDataDir(): string {
  const home = homedir();

  const envDir = process.env.REVIEWTRAIL_DATA_DIR?.trim();
  if (envDir) {
    // Expand ~ to home directory
    if (envDir === "~") return home;
    if (envDir.startsWith("~/") || envDir.startsWith("~\\")) {
      return join(home, envDir.slice(2));
    }
    return resolve(envDir);
  }

  return getDefaultReviewTrailDataDir(home);
}

/**
 * Entries that only ReviewTrail itself writes into its data directory in
 * real use: plan history, the session registry (every server session),
 * annotation drafts, the Inbox, the Claude Code mod, and the installer's
 * flag record. A folder holding none of them has never been used by
 * ReviewTrail. Entries an agent was told to make (`hooks/`, `plans/`
 * reports, `config.json`) are deliberately absent. Mirrored in the mod, the
 * Amp plugin and the install scripts (see the header).
 */
export const DATA_DIR_MARKERS = [
  "history",
  "sessions",
  "drafts",
  "inbox",
  "claude-code-mod",
  "install-flags.json",
] as const;

/** Whether `dir` holds any of ReviewTrail's own data (DATA_DIR_MARKERS). */
export function holdsReviewTrailData(dir: string): boolean {
  return DATA_DIR_MARKERS.some((entry) => existsSync(join(dir, entry)));
}

/** `$XDG_DATA_HOME/reviewtrail` when XDG_DATA_HOME is a non-empty absolute path, else null. */
function xdgReviewTrailDataDir(): string | null {
  const xdgDataHome = process.env.XDG_DATA_HOME?.trim();
  return xdgDataHome && isAbsolute(xdgDataHome) ? join(xdgDataHome, "reviewtrail") : null;
}

/**
 * The data directory ReviewTrail uses when REVIEWTRAIL_DATA_DIR is unset:
 * ~/.reviewtrail when it exists (unless it holds no ReviewTrail data while
 * $XDG_DATA_HOME/reviewtrail does), else $XDG_DATA_HOME/reviewtrail when
 * XDG_DATA_HOME holds an absolute path, else ~/.reviewtrail. `home` defaults
 * to `homedir()`. Tests and dev scripts compare against it to refuse the
 * person's real data directory (tests/helpers/real-data-dir.ts).
 */
export function getDefaultReviewTrailDataDir(home: string = homedir()): string {
  const legacyDir = join(home, ".reviewtrail");
  const xdgDir = xdgReviewTrailDataDir();

  if (existsSync(legacyDir)) {
    // A stray ~/.reviewtrail never hides an XDG folder that holds the data.
    // The XDG folder's own existence is checked first: one call, and the
    // markers are probed only on the rare machine where both folders exist.
    if (xdgDir && existsSync(xdgDir) && holdsReviewTrailData(xdgDir) && !holdsReviewTrailData(legacyDir)) {
      return xdgDir;
    }
    return legacyDir;
  }

  return xdgDir ?? legacyDir;
}

/**
 * When REVIEWTRAIL_DATA_DIR is unset and both ~/.reviewtrail and
 * $XDG_DATA_HOME/reviewtrail exist: the one `getDefaultReviewTrailDataDir`
 * did not pick. Null otherwise. `reviewtrail data-dir` names it on stderr, so
 * a person whose files are split between the two can see why.
 */
export function getUnusedReviewTrailDataDir(home: string = homedir()): string | null {
  if (process.env.REVIEWTRAIL_DATA_DIR?.trim()) return null;
  const legacyDir = join(home, ".reviewtrail");
  const xdgDir = xdgReviewTrailDataDir();
  if (!xdgDir || !existsSync(legacyDir) || !existsSync(xdgDir)) return null;
  return getDefaultReviewTrailDataDir(home) === legacyDir ? xdgDir : legacyDir;
}
