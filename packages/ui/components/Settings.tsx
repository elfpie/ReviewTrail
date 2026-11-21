import { DiffDisplayOptionsBody } from './DiffDisplayOptions';
import { cookieHostDescription, type CookieHostSetting } from '../hooks/useCookieHostSetting';
import type { PackageChangesSetting } from '../hooks/usePackageChangesSetting';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Origin } from '@plannotator/core/agents';
import type { TokenHoverDelay } from '@plannotator/core/token-hover';
import {
  configStore,
  useConfigValue,
  setReviewPanelView,
  setReviewDefaultDiffType,
  getProviderReviewDefaultDiffType,
  setProviderReviewDefaultDiffType,
  setReviewAutoViewed,
  type VcsReviewSettingsDescriptor,
} from '../config';
import { setWebMcpToolsEnabled, useWebMcpToolsEnabled } from '../webmcp/preference';
import {
  agentToolAppliesWhen,
  agentToolCostNote,
  agentToolHostName,
  type AgentToolSetting,
} from '../utils/agentToolSetting';
import { loadDiffFont } from '../utils/diffFonts';
import { isFontInstalled } from '../utils/fontDetect';
import { MAX_FONT_FAMILY_LENGTH, monoFontStack, normalizeCssFontSize, normalizeFontFamilyName } from '../utils/cssFontFamily';
import { TaterSpritePullup } from './TaterSpritePullup';
import { getIdentity, regenerateIdentity, setCustomIdentity, isIdentityEditable } from '../utils/identity';
import { GitUser } from '../icons/GitUser';
import { getAgentSwitchSettings, getAgentSwitchDefaults, saveAgentSwitchSettings, AGENT_OPTIONS, type AgentSwitchSettings } from '../utils/agentSwitch';
import { getAutoCloseDelay, setAutoCloseDelay, AUTO_CLOSE_OPTIONS, type AutoCloseDelay } from '../utils/storage';
import { useAgents } from '../hooks/useAgents';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { ThemeTab } from './ThemeTab';
import { modKeyWord } from '../utils/platform';
import { getAIProviderSettings, resolveAIProviderSelection } from '../utils/aiProvider';
import { AISettingsTab } from './AISettingsTab';
import { OverlayScrollArea } from './OverlayScrollArea';
import {
  getFileBrowserSettings,
  saveFileBrowserSettings,
  type FileBrowserSettings,
} from '../utils/fileBrowser';
import { AnalysisLayerToggle } from './AnalysisLayerToggle';
import { SemanticDiffsTab } from './settings/SemanticDiffsTab';

type SettingsTab = 'general' | 'theme' | 'review' | 'display' | 'semantic' | 'analysis' | 'shortcuts' | 'ai' | 'files' | 'comments' | 'experimental';

interface SettingsProps {
  taterMode: boolean;
  onTaterModeChange: (enabled: boolean) => void;
  onIdentityChange?: (oldIdentity: string, newIdentity: string) => void;
  origin?: Origin | null;
  /**
   * Hide General's "Enter saves a comment" row (#1934). Default false: the
   * row shows. A host that drives the `enterSavesComment` setting itself, or
   * never wants it offered, passes true.
   */
  hideEnterSavesComment?: boolean;
  /**
   * Hide General's "Hide the repository owner" row. Default false: the row
   * shows. A host that never shows a repository label, or drives the
   * `hideRepoOwner` setting itself, passes true. (Not `hide` + the setting's
   * name, which would read `hideHideRepoOwner`.)
   */
  hideRepoOwnerSetting?: boolean;
  /** Externally controlled open state (for mobile menu integration) */
  externalOpen?: boolean;
  externalTab?: 'semantic';
  onExternalClose?: () => void;
  /** Available AI providers (from /api/ai/capabilities). */
  aiProviders?: Array<{ id: string; name: string; capabilities: Record<string, boolean>; models?: Array<{ id: string; label: string; default?: boolean }> }>;
  /** Git user name from `git config user.name`, for quick identity set */
  gitUser?: string;
  /** "Open Plannotator at plannotator.localhost" (#2184, useCookieHostSetting): present
   *  only when the server reports it (a local session). Hosts that omit it get no row. */
  cookieHostSetting?: CookieHostSetting;
  /** Code review's package changes switches (usePackageChangesSetting). Hosts that omit it get no rows. */
  packageChangesSetting?: PackageChangesSetting;
  /** The `plannotator` agent tool switch, as the server reports it
   *  (parseAgentToolSetting of serverConfig: present only when the session's
   *  host registers the tool). Shown only together with onAgentToolChange;
   *  hosts that omit them get no row. */
  agentToolSetting?: AgentToolSetting;
  /** Saves the agent tool switch (saveAgentToolSetting); rejects with a
   *  readable Error, which the row shows. */
  onAgentToolChange?: (enabled: boolean) => Promise<void>;
  /** Current session is a local git review where since-base ISN'T offered
   *  (base ref unresolvable) — the Review tab's Git section shows a note that
   *  the Git-status preference can't take effect in THIS repo. */
  sinceBaseUnavailable?: boolean;
  /** The host is rendering its compact touch shell (review only). Display
   *  settings that the compact shell overrides for the session are hidden
   *  there instead of silently editing the desktop preference. */
  isCompactTouchLayout?: boolean;
  /** The browser exposes WebMCP (`document.modelContext`), so the "Agent
   *  tools" opt-out is worth showing. Default false: a browser without the
   *  API gets no row at all (the provider registers nothing there). */
  webmcpAvailable?: boolean;
}

// --- Review-mode Display tab (diff display options) ---

const DIFF_FONT_OPTIONS = [
  { value: '', label: 'Theme Default' },
  { value: 'Fira Code', label: 'Fira Code' },
  { value: 'Hack', label: 'Hack' },
  { value: 'IBM Plex Mono', label: 'IBM Plex Mono' },
  { value: 'Inconsolata', label: 'Inconsolata' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
  { value: 'Red Hat Mono', label: 'Red Hat Mono' },
  { value: 'Roboto Mono', label: 'Roboto Mono' },
  { value: 'Source Code Pro', label: 'Source Code Pro' },
  { value: 'Atkinson Hyperlegible Mono', label: 'Atkinson Hyperlegible' },
];

/**
 * The modifier gate is the platform's primary modifier: Cmd on macOS, Ctrl on
 * Windows and Linux. Labeled through modKeyWord so the control names the key
 * the reader actually has.
 */
export const TOKEN_HOVER_TRIGGER_OPTIONS = [
  { value: 'hover' as const, label: 'On hover' },
  { value: 'modifier' as const, label: `Hold ${modKeyWord}` },
  { value: 'off' as const, label: 'Off' },
];
/** SegmentedControl keys on strings, so the ms values ride as their digits. */
export type TokenHoverDelayOption = '150' | '300' | '700';
export const TOKEN_HOVER_DELAY_OPTIONS = [
  { value: '150' as const, label: 'Fast' },
  { value: '300' as const, label: 'Default' },
  { value: '700' as const, label: 'Relaxed' },
];
const DEFAULT_DIFF_TYPE_OPTIONS = [
  // "All Changes" belongs to since-base (the flagship composite); uncommitted
  // reverts to its plain name so the two stay distinguishable side by side.
  { value: 'since-base' as const, label: 'All Changes (Recommended)', description: "Everything since your branch split from main — committed, uncommitted, and untracked" },
  { value: 'local-vs-remote' as const, label: 'Local vs Remote Branch', description: "Your local branch and working tree compared with its last-fetched remote-tracking branch" },
  { value: 'uncommitted' as const, label: 'Uncommitted', description: "Everything you've changed since your last commit" },
  { value: 'unstaged' as const, label: 'Unstaged', description: "Only changes you haven't staged yet" },
  { value: 'staged' as const, label: 'Staged', description: "Only changes you've staged for commit" },
  { value: 'merge-base' as const, label: 'Committed changes (PR view)', description: "Everything you've committed on this branch" },
  { value: 'all' as const, label: 'All Files (HEAD)', description: "Every tracked file at HEAD, shown as additions" },
];
// Labels match the jj diff picker (getJjContext in packages/shared/jj-core.ts).
const JJ_DEFAULT_DIFF_TYPE_OPTIONS = [
  { value: 'jj-current', label: 'Current change', description: 'Only the working-copy change (@)' },
  { value: 'jj-last', label: 'Last change', description: 'The change just before the working copy (@-)' },
  { value: 'jj-line', label: 'Line of work', description: 'Every change on your line of work since it left trunk' },
  { value: 'jj-evolog', label: 'Evolution diff', description: 'How the current change has evolved' },
  { value: 'jj-all', label: 'Every file', description: 'Every file at the working copy, shown as additions' },
] as const;
const JJ_REVIEW_DEFAULTS: VcsReviewSettingsDescriptor = {
  id: 'jj',
  label: 'Jujutsu',
  defaultDiffType: 'jj-current',
  diffOptions: JJ_DEFAULT_DIFF_TYPE_OPTIONS.map(({ value, label, description }) => ({ id: value, label, description })),
};

function SegmentedControl<T extends string>({ options, value, onChange, disabled = false }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Visible but inert, for a control whose axis does not apply right now. */
  disabled?: boolean;
}) {
  return (
    <div className={['flex items-center gap-1 bg-muted/50 rounded-lg p-0.5', disabled && 'opacity-50'].filter(Boolean).join(' ')}>
      {options.map((opt) => (
        <button
          key={opt.value}
          {...(disabled ? { disabled: true } : {})}
          onClick={() => onChange(opt.value)}
          className={[
            'flex-1 px-3 py-1.5 text-xs rounded-md transition-colors',
            disabled && 'cursor-not-allowed',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground',
          ].filter(Boolean).join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Which of the cookie switch's states the row shows (a test and screenshot hook). */
function cookieHostSettingState(setting: CookieHostSetting): string {
  if (setting.env !== undefined) return 'locked-env';
  if (setting.urlHost !== undefined) return 'locked-url-host';
  return setting.on ? 'on' : 'off';
}

function ToggleSwitch({ checked, onChange, label, description, disabled = false }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-11 w-11 shrink-0 items-center disabled:cursor-not-allowed"
      >
        <span
          aria-hidden="true"
          className={`absolute inset-x-0 top-2.5 h-6 rounded-full transition-colors ${
            checked ? 'bg-primary' : 'bg-muted'
          }`}
        />
        <span
          aria-hidden="true"
          className={`absolute top-3.5 inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

/**
 * The `plannotator` agent tool switch. The value is the one the NEXT session
 * uses (the tool list is part of the model's prompt, so a running session
 * never changes it). Writes go straight to POST /api/config and wait for the
 * answer, so a failed save is reported and the switch stays where it was.
 */
function AgentToolSettingRow({ setting, onChange }: {
  readonly setting: AgentToolSetting;
  readonly onChange: (enabled: boolean) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = setting.env !== undefined;
  const change = async (next: boolean) => {
    if (saving || locked) return;
    setSaving(true);
    setError(null);
    try {
      await onChange(next);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not save the setting.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div data-agent-tool-setting={setting.host} aria-busy={saving}>
      <ToggleSwitch
        checked={setting.enabled}
        onChange={(next) => void change(next)}
        disabled={locked}
        label="Let the agent open reviews (plannotator tool)"
        description={
          locked
            ? `Set by PLANNOTATOR_AGENT_TOOL in your environment, so it is ${setting.enabled ? 'on' : 'off'} here.`
            : `${agentToolHostName(setting.host)} can open reviews itself and keep working. ${agentToolCostNote(setting.host)} Applies from ${agentToolAppliesWhen(setting.host)}.`
        }
      />
      {error && (
        <p role="alert" data-agent-tool-setting-error className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

interface VimSettingsTabProps {
  readonly vimModeEnabled: boolean;
  readonly vimHudEnabled: boolean;
  readonly vimHudKeyPanelEnabled: boolean;
  readonly onVimModeChange: (enabled: boolean) => void;
  readonly onVimHudChange: (enabled: boolean) => void;
  readonly onVimHudKeyPanelChange: (enabled: boolean) => void;
}

/** First-class Vim configuration, separate from the shortcut reference. */
function ReviewAnalysisTab({ packageChangesSetting }: { packageChangesSetting?: PackageChangesSetting }) {
  const semanticDiffEnabled = useConfigValue('semanticDiffEnabled');
  const callFlowEnabled = useConfigValue('callFlowEnabled');
  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-semibold">Analysis layers</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Add structural context to the ordinary code diff. Each layer is independent and does no work while disabled.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
        <AnalysisLayerToggle
          checked={semanticDiffEnabled}
          onChange={(enabled) => configStore.set('semanticDiffEnabled', enabled)}
          label="Semantic changes"
          description="Organize added, changed, moved, and removed functions, classes, and other named code. Enabled by default."
        />
        <div className="border-t border-border" />
        <AnalysisLayerToggle
          checked={callFlowEnabled}
          onChange={(enabled) => configStore.set('callFlowEnabled', enabled)}
          label="Call flow"
          description="Diffs for function call stacks across git commits. 22 languages supported (AST-based, built using Tree-sitter)."
        />
        {packageChangesSetting && (
          <>
            <div className="border-t border-border" />
            <AnalysisLayerToggle
              checked={packageChangesSetting.card}
              onChange={(on) => packageChangesSetting.setCard(on)}
              label="Package changes"
              description="Added, removed and changed dependencies above package.json and lockfile diffs."
            />
            <div className="border-t border-border" />
            <AnalysisLayerToggle
              checked={packageChangesSetting.lookup}
              onChange={(on) => void packageChangesSetting.setLookup(on)}
              disabled={packageChangesSetting.lookupEnv === false}
              label="Look up packages on npm"
              description={packageChangesSetting.lookupEnv === false
                ? 'Off: PLANNOTATOR_PACKAGE_LOOKUP=0.'
                : 'License, release date and weekly downloads. Sends the names of changed public packages to registry.npmjs.org and api.npmjs.org.'}
            />
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 font-mono text-primary">▣</span>
            Dock
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Open the complete analysis from the file panel. Rows jump to the relevant code location.
          </p>
        </div>
        <div className="rounded-xl border border-border p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 font-mono text-primary">⌁</span>
            File lens
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            File headers show compact counts and a focused popover for that file.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-warning/25 bg-warning/[0.05] p-4 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Call flow is syntactic.</span>{' '}
        It does not use type resolution or runtime traces, so treat it as navigation context—not proof that a path executes.
      </div>
    </div>
  );
}

/** One radio card list for a saved default diff (Git or Jujutsu). */
function DefaultDiffChoices<T extends string>({ options, value, onChange }: {
  options: ReadonlyArray<{ value: T; label: string; description: string }>;
  value: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors text-left ${
            value === opt.value
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
          }`}
        >
          <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
            value === opt.value ? 'border-primary' : 'border-muted-foreground/40'
          }`}>
            {value === opt.value && (
              <div className="w-2 h-2 rounded-full bg-primary" />
            )}
          </div>
          <div>
            <div className="text-sm font-medium">{opt.label}</div>
            <div className="text-xs text-muted-foreground">{opt.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

const REVIEW_SECTION_HEADING = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground';

const ReviewTab: React.FC<{ sinceBaseUnavailable?: boolean }> = ({ sinceBaseUnavailable }) => {
  const defaultDiffType = useConfigValue('defaultDiffType');
  useConfigValue('reviewDefaults');
  const jjDefaultDiffType = getProviderReviewDefaultDiffType(JJ_REVIEW_DEFAULTS);
  const reviewPanelView = useConfigValue('reviewPanelView');
  const reviewAutoViewed = useConfigValue('reviewAutoViewed');
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className={REVIEW_SECTION_HEADING}>Viewed files</div>
        {/* Never write `reviewAutoViewed` directly — setReviewAutoViewed also
            consumes the first-time notice, since an explicit toggle is proof
            the reviewer already found the switch. */}
        <ToggleSwitch
          checked={reviewAutoViewed}
          onChange={(v) => setReviewAutoViewed(v)}
          label="Auto-mark viewed"
          description="Mark a file viewed when you scroll past it or move on to another file. Files you un-view stay un-viewed, and files that change on refresh become un-viewed."
        />
      </div>

      <div className="border-t border-border" />

      <section className="space-y-4" aria-labelledby="settings-review-git">
        <div id="settings-review-git" className={REVIEW_SECTION_HEADING}>Git</div>
        <div className="space-y-2">
          <div>
            <div className="text-sm font-medium">Default file grouping</div>
            <div className="text-xs text-muted-foreground">How the file tree groups a code review's files when it opens</div>
            {/* This is a GLOBAL preference — never hide the options because the
                CURRENT repo can't serve them; just say so. Without this note,
                picking Git status on a repo whose base ref doesn't resolve
                silently falls back to Tree and the setting looks broken. */}
            {sinceBaseUnavailable && (
              <div className="text-xs text-warning mt-1">
                Grouping by git status isn't available in this repository (its base branch
                couldn't be resolved), so reviews here open grouped by kind. The preference
                still applies in repositories where it works.
              </div>
            )}
          </div>
          {/* No Commits option here: the Commits view is session-only (entered
              via the panel toggle) and is never the opening view. */}
          <SegmentedControl
            options={[
              { value: 'sections' as const, label: 'By git status' },
              { value: 'tree' as const, label: 'By kind' },
            ]}
            value={reviewPanelView}
            onChange={setReviewPanelView}
          />
        </div>
        <div className="space-y-2">
          <div>
            <div className="text-sm font-medium">Default diff view</div>
            <div className="text-xs text-muted-foreground">Which changes to show when you open a code review</div>
          </div>
          {/* Coupling (sections ⟺ since-base) lives in the shared setter —
              never write the pair by hand (see config/reviewView). */}
          <DefaultDiffChoices
            options={DEFAULT_DIFF_TYPE_OPTIONS}
            value={defaultDiffType}
            onChange={(value) => setReviewDefaultDiffType(value)}
          />
        </div>
      </section>

      <div className="border-t border-border" />

      <section className="space-y-4" aria-labelledby="settings-review-jj">
        <div id="settings-review-jj" className={REVIEW_SECTION_HEADING}>Jujutsu</div>
        <div className="space-y-2">
          <div>
            <div className="text-sm font-medium">Default diff view</div>
            <div className="text-xs text-muted-foreground">Which changes to show when you open a review in a Jujutsu repository</div>
          </div>
          {/* Its own saved value: Git modes mean nothing in a jj repo, and jj has
              no Git status view, so nothing here is coupled to the Git half. */}
          <DefaultDiffChoices
            options={JJ_DEFAULT_DIFF_TYPE_OPTIONS}
            value={jjDefaultDiffType}
            onChange={(value) => setProviderReviewDefaultDiffType('jj', value)}
          />
        </div>
      </section>
    </div>
  );
};

/** Sentinel for the "Custom…" select option — never persisted as a font name. */
const CUSTOM_FONT_SENTINEL = '__custom__';

/** Inline style rendering a control in the chosen font (quoted and escaped: free text). */
function stackStyle(stack: string): React.CSSProperties | undefined {
  return stack ? { fontFamily: stack } : undefined;
}

/**
 * A font row (#851, shared by Code Font and Document font): a select of the
 * built-in choices plus "Custom…", which opens a field for the family name of
 * any font installed on this machine. The typed name is saved after a short
 * pause (configStore.set writes the cookie and may POST /api/config), flushed
 * on unmount, and dropped when a built-in is picked mid-pause.
 */
const FontFamilyField: React.FC<{
  label: string;
  description: string;
  value: string;
  onSave: (value: string) => void;
  options: readonly { value: string; label: string }[];
  /** The `font-family` the controls preview a value in. */
  previewStack: (value: string) => string;
  previewText: string;
  customAriaLabel: string;
  customPlaceholder: string;
  notFoundText: string;
  /** Load a built-in's web font for the preview, if it has one. */
  loadFont?: (value: string) => void;
  previewClassName?: string;
}> = ({ label, description, value, onSave, options, previewStack, previewText, customAriaLabel, customPlaceholder, notFoundText, loadFont, previewClassName = '' }) => {
  const isBuiltIn = (v: string) => options.some((opt) => opt.value === v);
  // Custom font: progressive disclosure. customFontMode keeps the input open
  // while the user picks "Custom…" or has a non-built-in font saved.
  const [customFontMode, setCustomFontMode] = useState(() => !!value && !isBuiltIn(value));
  const [customFontDraft, setCustomFontDraft] = useState(() => (value && !isBuiltIn(value) ? value : ''));
  const customFontSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Pending debounced value. Non-null means "typed but not yet saved" — it is
  // flushed (not discarded) on unmount, and cancelled when a built-in is
  // picked so a stale timer can't overwrite the new selection.
  const pendingFontSave = useRef<string | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const customActive = customFontMode || (!!value && !isBuiltIn(value));
  // Width-measurement check — deterministic per machine, no permissions.
  const customFontInstalled = useMemo(
    () => (normalizeFontFamilyName(customFontDraft) ? isFontInstalled(customFontDraft) : null),
    [customFontDraft],
  );

  // Load font for the preview swatch
  useEffect(() => {
    if (value) loadFont?.(value);
  }, [value, loadFont]);

  // Adopt external changes (late server hydration, edits from elsewhere) into
  // the draft — but never clobber typing that hasn't been saved yet.
  useEffect(() => {
    if (pendingFontSave.current !== null) return;
    if (value && !isBuiltIn(value) && value !== normalizeFontFamilyName(customFontDraft)) {
      setCustomFontDraft(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const cancelPendingFontSave = () => {
    clearTimeout(customFontSaveTimer.current);
    pendingFontSave.current = null;
  };

  // Flush a pending save on unmount so closing the panel mid-debounce
  // doesn't lose the typed font.
  useEffect(() => () => {
    clearTimeout(customFontSaveTimer.current);
    if (pendingFontSave.current !== null) {
      onSaveRef.current(pendingFontSave.current);
    }
  }, []);

  const handleCustomFontInput = (next: string) => {
    setCustomFontDraft(next);
    // Debounce the save — per-keystroke writes would spam the cookie and
    // /api/config.
    clearTimeout(customFontSaveTimer.current);
    pendingFontSave.current = normalizeFontFamilyName(next);
    customFontSaveTimer.current = setTimeout(() => {
      if (pendingFontSave.current !== null) {
        onSaveRef.current(pendingFontSave.current);
        pendingFontSave.current = null;
      }
    }, 400);
  };

  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <select
        value={customActive ? CUSTOM_FONT_SENTINEL : value}
        aria-label={label}
        onChange={(e) => {
          if (e.target.value === CUSTOM_FONT_SENTINEL) {
            setCustomFontMode(true);
          } else {
            // Cancel any in-flight debounced custom save so a stale timer
            // can't overwrite this selection.
            cancelPendingFontSave();
            setCustomFontMode(false);
            setCustomFontDraft('');
            onSave(e.target.value);
          }
        }}
        className="w-full px-3 py-1.5 text-sm rounded-md bg-muted/50 border border-border text-foreground"
        style={value && !customActive ? stackStyle(previewStack(value)) : undefined}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
        <option value={CUSTOM_FONT_SENTINEL}>Custom…</option>
      </select>
      {customActive && (
        <div className="space-y-1">
          <input
            type="text"
            value={customFontDraft}
            onChange={(e) => handleCustomFontInput(e.target.value)}
            placeholder={customPlaceholder}
            aria-label={customAriaLabel}
            maxLength={MAX_FONT_FAMILY_LENGTH}
            autoFocus={!customFontDraft}
            spellCheck={false}
            className="w-full px-3 py-1.5 text-sm rounded-md bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
            style={stackStyle(previewStack(customFontDraft))}
          />
          <div className="text-[11px]" aria-live="polite">
            {!normalizeFontFamilyName(customFontDraft) ? (
              <span className="text-muted-foreground">Any font installed on this machine works — type its family name.</span>
            ) : customFontInstalled === true ? (
              <span className="text-success">✓ Found on this machine</span>
            ) : customFontInstalled === false ? (
              <span className="text-warning">{notFoundText}</span>
            ) : null}
          </div>
        </div>
      )}
      {value && (
        <div
          className={`text-xs text-muted-foreground px-1 py-1 rounded bg-muted/30 ${previewClassName}`}
          style={stackStyle(previewStack(value))}
        >
          {previewText}
        </div>
      )}
    </div>
  );
};

/**
 * Experimental (the owner, 2026-10-27: "its own page on settings", the last
 * tab): each experimental setting, off by default. Today one, code review's
 * Edit Code to Suggest (`editSuggestions`, the
 * `plannotator-experimental-edit-suggestions` cookie, unchanged).
 */
const ExperimentalTab: React.FC = () => {
  const editSuggestions = useConfigValue('editSuggestions');
  return (
    <div className="space-y-3" data-settings-experimental="">
      <div className="text-xs text-muted-foreground">
        Features still being tried. Each stays off until you turn it on.
      </div>
      <ToggleSwitch
        checked={editSuggestions}
        onChange={(v) => configStore.set('editSuggestions', v)}
        label="Edit Code to Suggest"
        description="Edit a file in place in the all-files view; your net change becomes a suggestion comment. Files are never written from the browser. Uses an experimental upstream editor."
      />
    </div>
  );
};

const ReviewDisplayTab: React.FC<{ isCompactTouchLayout?: boolean }> = ({ isCompactTouchLayout = false }) => {
  const diffFontFamily = useConfigValue('diffFontFamily');
  const diffFontSize = useConfigValue('diffFontSize');
  const tokenHoverTrigger = useConfigValue('tokenHoverTrigger');
  const tokenHoverDelay = useConfigValue('tokenHoverDelay');

  return (
    <>
      {/* Hover cards (internally tokenHover*; the label is what changed, not
          the ids). One trigger select rather than a toggle plus a mode: `Off`
          is a value of the same question, so there is no unreachable
          enabled-but-off state to reason about. The delay stays a separate
          axis because "too eager" is a complaint neither the hold-modifier option
          nor Off answers. */}
      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium">Hover cards</div>
          <div className="text-xs text-muted-foreground">
            Rest the pointer on a symbol in a diff to see where it is defined and who
            references it. Needs ripgrep and a local checkout; nothing appears when the
            search comes back empty. {modKeyWord}+click still opens the References panel either way.
          </div>
        </div>
        <SegmentedControl
          options={TOKEN_HOVER_TRIGGER_OPTIONS}
          value={tokenHoverTrigger}
          onChange={(v) => configStore.set('tokenHoverTrigger', v)}
        />
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            How long the pointer rests before a card is requested
          </div>
          <SegmentedControl
            options={TOKEN_HOVER_DELAY_OPTIONS}
            value={String(tokenHoverDelay) as TokenHoverDelayOption}
            onChange={(v) => configStore.set('tokenHoverDelay', Number(v) as TokenHoverDelay)}
            disabled={tokenHoverTrigger === 'off'}
          />
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Font Family */}
      <FontFamilyField
        label="Code Font"
        description="Font family for diff code lines"
        value={diffFontFamily}
        onSave={(v) => configStore.set('diffFontFamily', v)}
        options={DIFF_FONT_OPTIONS}
        previewStack={monoFontStack}
        previewText="Preview: const x = fn(42);"
        customAriaLabel="Custom code font name"
        customPlaceholder="Font name as installed, e.g. Iosevka"
        notFoundText="Not found — diffs will fall back to monospace"
        loadFont={loadDiffFont}
        previewClassName="font-mono"
      />

      <div className="border-t border-border" />

      {/* Font Size */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Code Font Size</div>
            <div className="text-xs text-muted-foreground">Font size for diff code lines</div>
          </div>
          <div className="text-xs tabular-nums text-muted-foreground min-w-[4ch] text-right">
            {normalizeCssFontSize(diffFontSize) || 'Auto'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={8}
            max={24}
            step={1}
            value={diffFontSize ? parseInt(diffFontSize) : 13}
            onChange={(e) => configStore.set('diffFontSize', `${e.target.value}px`)}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
          />
          {diffFontSize && (
            <button
              onClick={() => configStore.set('diffFontSize', '')}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-border" />

      {isCompactTouchLayout ? (
        <div className="space-y-2" data-settings-diff-display="">
          <div>
            <div className="text-sm font-medium">Diff display</div>
            <div className="text-xs text-muted-foreground">
              This layout shows unified diffs for the session; your desktop preference is unchanged.
            </div>
          </div>
          <DiffDisplayOptionsBody />
        </div>
      ) : (
        <div className="space-y-1" data-settings-diff-display="">
          <div className="text-sm font-medium">Diff display</div>
          <div className="text-xs text-muted-foreground">
            Split or Unified is the button next to the gear above the diff. The gear holds the rest: wrap, line numbers,
            backgrounds, change marks, changed words, tab size, whole file and hide whitespace.
          </div>
        </div>
      )}

    </>
  );
};

/**
 * Stored label config — serialized to JSON in the config store.
 * `blocking` controls whether the blocking/non-blocking toggle
 * appears in the picker when this label is selected.
 */
interface CCLabelConfig {
  label: string;
  display: string;
  blocking: boolean; // true = show toggle in picker, false = no decoration
}

const DEFAULT_CC_LABELS: CCLabelConfig[] = [
  { label: 'suggestion', display: 'suggestion', blocking: true },
  { label: 'nitpick',    display: 'nit',        blocking: false },
  { label: 'question',   display: 'question',   blocking: true },
  { label: 'issue',      display: 'issue',      blocking: true },
  { label: 'praise',     display: 'praise',     blocking: false },
  { label: 'thought',    display: 'thought',    blocking: false },
  { label: 'note',       display: 'note',       blocking: false },
  { label: 'todo',       display: 'todo',       blocking: true },
  { label: 'chore',      display: 'chore',      blocking: true },
];

function parseCCLabels(json: string | null): CCLabelConfig[] {
  if (!json) return DEFAULT_CC_LABELS;
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return DEFAULT_CC_LABELS;
    return parsed.map((l: Record<string, unknown>) => ({
      label: (l.label as string) || 'custom',
      display: (l.display as string) || (l.label as string) || 'custom',
      blocking: l.blocking === true || l.blocking === 'true',
    }));
  } catch {
    return DEFAULT_CC_LABELS;
  }
}

const CommentsTab: React.FC = () => {
  const conventionalComments = useConfigValue('conventionalComments');
  const labelsJson = useConfigValue('conventionalLabels');
  const [labels, setLabels] = useState(() => parseCCLabels(labelsJson));

  const isDefault = labelsJson === null;

  const save = (next: CCLabelConfig[]) => {
    setLabels(next);
    configStore.set('conventionalLabels', JSON.stringify(next));
  };

  const updateLabel = (index: number, updates: Partial<CCLabelConfig>) => {
    const next = [...labels];
    next[index] = { ...next[index], ...updates };
    save(next);
  };

  const removeLabel = (index: number) => {
    save(labels.filter((_, i) => i !== index));
  };

  const addLabel = () => {
    const existing = new Set(labels.map(l => l.label));
    let slug = 'custom';
    let n = 2;
    while (existing.has(slug)) { slug = `custom-${n++}`; }
    save([...labels, { label: slug, display: slug, blocking: false }]);
  };

  const resetToDefaults = () => {
    setLabels(DEFAULT_CC_LABELS);
    configStore.set('conventionalLabels', null);
  };

  return (
    <>
      <ToggleSwitch
        checked={conventionalComments}
        onChange={(v) => configStore.set('conventionalComments', v)}
        label="Conventional Comments"
        description="Add structured labels to review comments"
      />

      <div className={`space-y-4 transition-opacity ${conventionalComments ? '' : 'opacity-40 pointer-events-none'}`}>

      <div className="border-t border-border" />

      {/* How it works */}
      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium">How it works</div>
          <div className="text-xs text-muted-foreground leading-relaxed mt-1">
            When enabled, a label picker appears above the comment input when annotating code.
            Labels classify your feedback intent, making it clear whether a comment is a blocking issue,
            a trivial nitpick, or praise.
          </div>
        </div>

        <div className="text-xs text-muted-foreground leading-relaxed">
          Based on the{' '}
          <a
            href="https://conventionalcomments.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Conventional Comments
          </a>
          {' '}spec. Comments are exported as plain text, readable on GitHub, and parseable by tooling.
        </div>

        {/* Example output */}
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Example output</div>
          <div className="font-mono text-[11px] text-foreground/80 leading-relaxed">
            <span className="font-bold">issue</span> <span className="text-muted-foreground">(blocking)</span>: This will throw if user is null — the guard was removed in the refactor.
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Label editor */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Labels</div>
          <div className="text-xs text-muted-foreground">
            Customize labels and their default severity
          </div>
        </div>
        {!isDefault && (
          <button
            onClick={resetToDefaults}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset to defaults
          </button>
        )}
      </div>

      {/* Column headers */}
      <div className="flex items-end gap-2 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        <span className="flex-1">Label</span>
        <span className="w-20 text-center">Blocking decorator</span>
        <span className="w-6" />
      </div>

      <div className="space-y-1.5">
        {labels.map((label, index) => (
          <div
            key={index}
            className="flex items-center gap-2 p-2 rounded-lg bg-muted/40"
          >
            <input
              type="text"
              value={label.display}
              onChange={(e) => {
                const display = e.target.value;
                updateLabel(index, { display, label: display });
              }}
              className="flex-1 px-2 py-1 bg-background/80 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 min-w-0"
            />
            <div className="w-20 flex justify-center">
              <button
                role="switch"
                aria-checked={label.blocking}
                onClick={() => updateLabel(index, { blocking: !label.blocking })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  label.blocking ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                    label.blocking ? 'translate-x-4.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            <button
              onClick={() => removeLabel(index)}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
              title="Remove label"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {labels.length < 12 && (
        <button
          onClick={addLabel}
          className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg hover:border-foreground/30 transition-colors"
        >
          + Add label
        </button>
      )}

      </div>
    </>
  );
};

export const Settings: React.FC<SettingsProps> = ({ taterMode, onTaterModeChange, onIdentityChange, origin, externalOpen, externalTab, onExternalClose, aiProviders = [], gitUser, cookieHostSetting, packageChangesSetting, agentToolSetting, onAgentToolChange, sinceBaseUnavailable, isCompactTouchLayout = false, webmcpAvailable = false, hideEnterSavesComment = false, hideRepoOwnerSetting = false }) => {
  const webmcpTools = useWebMcpToolsEnabled();
  const [showDialog, setShowDialog] = useState(false);
  const [themePreview, setThemePreview] = useState(false);

  useEffect(() => {
    if (!themePreview) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setThemePreview(false); setShowDialog(true); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [themePreview]);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const vimModeEnabled = useConfigValue('vimModeEnabled');
  const enterSavesComment = useConfigValue('enterSavesComment');
  const hideRepoOwner = useConfigValue('hideRepoOwner');
  const [identity, setIdentity] = useState('');
  const [agent, setAgent] = useState<AgentSwitchSettings>(() => getAgentSwitchDefaults('review'));
  const [agentWarning, setAgentWarning] = useState<string | null>(null);
  const [autoCloseDelay, setAutoCloseDelayState] = useState<AutoCloseDelay>('off');
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [fileBrowserSettings, setFileBrowserSettings] = useState<FileBrowserSettings>({ enabled: false, directories: [] });
  const [newDirPath, setNewDirPath] = useState('');

  // Fetch available agents for OpenCode
  const { agents: availableAgents, validateAgent, getAgentWarning } = useAgents(origin ?? null, 'review');

  const mainTabs = useMemo(() => {
    const t: { id: SettingsTab; label: string }[] = [{ id: 'general', label: 'General' }];
    t.push({ id: 'theme', label: 'Theme' });
    t.push({ id: 'review', label: 'Review' });
    t.push({ id: 'display', label: 'Editor' });
    t.push({ id: 'semantic', label: 'Semantic diffs' });
    t.push({ id: 'analysis', label: 'Analysis' });
    t.push({ id: 'comments', label: 'Comments' });
    if (aiProviders.length > 0) {
      t.push({ id: 'ai', label: 'AI' });
    }
    t.push({ id: 'shortcuts', label: 'Shortcuts' });
    return t;
  }, [aiProviders.length]);

  const integrationTabs: { id: SettingsTab; label: string }[] = [
    { id: 'files', label: 'Files' },
  ];
  // Experimental is the last tab, on its own below the integrations (the owner,
  // 2026-10-27). Only where it has a setting: code review's Edit Code to Suggest.
  const experimentalTabs: { id: SettingsTab; label: string }[] = [{ id: 'experimental', label: 'Experimental' }];
  // Sync external open state
  useEffect(() => {
    if (externalOpen) {
      if (externalTab) setActiveTab(externalTab);
      setShowDialog(true);
      onExternalClose?.();
    }
  }, [externalOpen, externalTab, onExternalClose]);

  useEffect(() => {
    if (showDialog) {
      setIdentity(getIdentity())
      setAgent(getAgentSwitchSettings('review'));
      setAutoCloseDelayState(getAutoCloseDelay());
      const aiSettings = getAIProviderSettings();
      setAiProvider(resolveAIProviderSelection({ providers: aiProviders, origin, settings: aiSettings }).providerId);
      setFileBrowserSettings(getFileBrowserSettings());

      // Validate agent setting when dialog opens
      if (origin === 'opencode') {
        setAgentWarning(getAgentWarning());
      }
    }
  }, [showDialog, availableAgents, origin, getAgentWarning, aiProviders.length]);

  const handleFileBrowserChange = (updates: Partial<FileBrowserSettings>) => {
    const newSettings = { ...fileBrowserSettings, ...updates };
    setFileBrowserSettings(newSettings);
    saveFileBrowserSettings(newSettings);
  };

  const addDirectory = () => {
    const trimmed = newDirPath.trim();
    if (trimmed && !fileBrowserSettings.directories.includes(trimmed)) {
      handleFileBrowserChange({
        directories: [...fileBrowserSettings.directories, trimmed],
      });
    }
    setNewDirPath('');
  };

  const handleAgentChange = (switchTo: AgentSwitchSettings['switchTo'], customName?: string) => {
    const newSettings = { switchTo, customName: customName ?? agent.customName };
    setAgent(newSettings);
    saveAgentSwitchSettings(newSettings);
  };

  // Server write-back is handled automatically by configStore.set() (debounced POST /api/config)

  const handleRegenerateIdentity = () => {
    const oldIdentity = identity;
    const newIdentity = regenerateIdentity();
    setIdentity(newIdentity);
    onIdentityChange?.(oldIdentity, newIdentity);
  };

  const handleIdentitySave = (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === identity) return;
    const oldIdentity = identity;
    const saved = setCustomIdentity(trimmed);
    setIdentity(saved);
    onIdentityChange?.(oldIdentity, saved);
  };

  const handleUseGitName = () => {
    if (!gitUser) return;
    handleIdentitySave(gitUser);
  };

  // When a host owns identity (e.g. a logged-in user whose author is server-stamped),
  // hide the rename/regenerate controls so a local name can't diverge from it.
  // Default (Plannotator cookie identity) is editable, so this is true and the
  // controls render exactly as before.
  const identityEditable = isIdentityEditable();

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Settings"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {showDialog && !themePreview && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setShowDialog(false)}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plannotator-settings-title"
            onClick={e => e.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || event.defaultPrevented) return;
              event.preventDefault();
              event.stopPropagation();
              setShowDialog(false);
            }}
          >
            {taterMode && <TaterSpritePullup />}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 id="plannotator-settings-title" className="font-semibold text-sm">Settings</h3>
              <button
                type="button"
                aria-label="Close settings"
                onClick={() => setShowDialog(false)}
                className="p-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col md:flex-row md:min-h-[420px] flex-1 min-h-0 overflow-hidden">
              {/* Mobile: horizontal tab bar */}
              <nav className="md:hidden flex overflow-x-auto border-b border-border px-2 py-1.5 gap-1 flex-shrink-0">
                {[...mainTabs, ...integrationTabs, ...experimentalTabs].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded text-xs whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                      activeTab === tab.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              {/* Desktop: sidebar */}
              <nav className="hidden md:block w-40 border-r border-border p-2 flex-shrink-0">
                <div className="space-y-0.5">
                  {mainTabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors flex items-center justify-between ${
                        activeTab === tab.id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {integrationTabs.length > 0 && (
                  <>
                    <div className="mx-2 my-2 border-t border-border/50" />
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                      Integrations
                    </div>
                    <div className="space-y-0.5">
                      {integrationTabs.map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                            activeTab === tab.id
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {experimentalTabs.length > 0 && (
                  <>
                    <div className="mx-2 my-2 border-t border-border/50" />
                    <div className="space-y-0.5">
                      {experimentalTabs.map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                            activeTab === tab.id
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </nav>

              {/* Content — scrollable */}
              <OverlayScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-4">

                {/* === GENERAL TAB === */}
                {activeTab === 'general' && (
                  <>
                    {/* Identity */}
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Your Identity</div>
                      <div className="text-xs text-muted-foreground">
                        Used when sharing annotations with others
                      </div>
                      <div className="flex items-center gap-2">
                        {identityEditable ? (
                          <input
                            key={identity}
                            type="text"
                            defaultValue={identity}
                            onBlur={(e) => handleIdentitySave(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleIdentitySave((e.target as HTMLInputElement).value);
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className="flex-1 px-3 py-2 bg-muted rounded-lg text-xs font-mono truncate border border-transparent focus:border-primary/50 focus:outline-none transition-colors"
                            placeholder="Enter your name..."
                          />
                        ) : (
                          <div className="flex-1 px-3 py-2 bg-muted rounded-lg text-xs font-mono truncate border border-transparent">
                            {identity}
                          </div>
                        )}
                        {identityEditable && gitUser && (
                          <button
                            onClick={handleUseGitName}
                            onMouseDown={(e) => e.preventDefault()}
                            className="p-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                            title={`Use git identity: ${gitUser}`}
                          >
                            <GitUser className="w-5 h-5" />
                          </button>
                        )}
                        {identityEditable && (
                          <button
                            onClick={handleRegenerateIdentity}
                            onMouseDown={(e) => e.preventDefault()}
                            className="p-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                            title="Regenerate random identity"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Enter saves a comment (#1934): opt-in, cookie-only.
                        Governs every comment composer; never the decision keys. */}
                    {!hideEnterSavesComment && (
                      <>
                        <div className="border-t border-border" />
                        <div data-enter-saves-comment-setting="true">
                          <ToggleSwitch
                            checked={enterSavesComment}
                            onChange={(v) => configStore.set('enterSavesComment', v)}
                            label="Enter saves a comment"
                            description={`Shift+Enter adds a new line. ${modKeyWord}+Enter still saves.`}
                          />
                        </div>
                      </>
                    )}

                    {/* Hide the repository owner: opt-in, cookie-only. On names
                        the repository alone (utils/repoLabel). */}
                    {!hideRepoOwnerSetting && (
                      <>
                        <div className="border-t border-border" />
                        <div data-repo-owner-setting="true">
                          <ToggleSwitch
                            checked={hideRepoOwner}
                            onChange={(v) => configStore.set('hideRepoOwner', v)}
                            label="Hide the repository owner"
                            description="When on, documents, code review and tab titles name the repository without its owner. Hover the name to see the owner."
                          />
                        </div>
                      </>
                    )}

                    {/* Open Plannotator at plannotator.localhost (#2184): writes or
                        removes urlHost "plannotator.localhost" in config.json.
                        Locked while PLANNOTATOR_URL_HOST is set or config.json
                        holds another urlHost, which it never replaces. */}
                    {cookieHostSetting && (
                      <>
                        <div className="border-t border-border" />
                        <div data-cookie-host-setting={cookieHostSettingState(cookieHostSetting)}>
                          <ToggleSwitch
                            checked={cookieHostSetting.on}
                            onChange={(v) => cookieHostSetting.onChange(v)}
                            disabled={cookieHostSetting.env !== undefined || cookieHostSetting.urlHost !== undefined}
                            label="Open Plannotator at plannotator.localhost"
                            description={cookieHostDescription(cookieHostSetting)}
                          />
                          {cookieHostSetting.error && (
                            <div role="alert" className="mt-1 text-xs text-destructive">{cookieHostSetting.error}</div>
                          )}
                        </div>
                      </>
                    )}

                    {/* The `plannotator` agent tool switch: only where the
                        server reports a tool host (Claude Code mod, Pi,
                        OpenCode 2). Writes agentTool to config.json; applies
                        to the next session. */}
                    {agentToolSetting && onAgentToolChange && (
                      <>
                        <div className="border-t border-border" />
                        <AgentToolSettingRow setting={agentToolSetting} onChange={onAgentToolChange} />
                      </>
                    )}

                    {/* Agent tools (WebMCP). Shown only when the browser
                        exposes document.modelContext; off unregisters the
                        tools for this browser. Cookie-only and idle at its
                        default: no cookie exists until the user opts out. */}
                    {webmcpAvailable && (
                      <>
                        <div className="border-t border-border" />
                        <div className="flex items-center justify-between" data-webmcp-setting="true">
                          <div>
                            <div className="text-sm font-medium">Agent tools</div>
                            <div className="text-xs text-muted-foreground">
                              Let your browser's agent read this document and leave comments. Approving and sending feedback stay yours.
                            </div>
                          </div>
                          <button
                            role="switch"
                            aria-checked={webmcpTools}
                            aria-label="Agent tools"
                            onClick={() => setWebMcpToolsEnabled(!webmcpTools)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              webmcpTools ? 'bg-primary' : 'bg-muted'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                                webmcpTools ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </>
                    )}

                    {/* Agent Switching (OpenCode only). Applied on plan
                        approval only; annotate decisions never switch agents. */}
                    {origin === 'opencode' && (
                      <>
                        <div className="border-t border-border" />
                        <div className="space-y-2">
                          <div>
                            <div className="text-sm font-medium">Agent Switching</div>
                            <div className="text-xs text-muted-foreground">
                              Which agent to switch to after plan approval
                            </div>
                          </div>

                          {agentWarning && (
                            <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-600 dark:text-amber-400">
                              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <span>{agentWarning}</span>
                            </div>
                          )}

                          <select
                            value={agent.switchTo}
                            onChange={(e) => {
                              handleAgentChange(e.target.value);
                              setAgentWarning(null);
                            }}
                            className="w-full px-3 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
                          >
                            {availableAgents.length > 0 ? (
                              <>
                                {agent.switchTo !== 'custom' &&
                                 agent.switchTo !== 'disabled' &&
                                 !availableAgents.some(a => a.id.toLowerCase() === agent.switchTo.toLowerCase()) && (
                                  <option value={agent.switchTo} disabled>
                                    {agent.switchTo} (not found)
                                  </option>
                                )}
                                {availableAgents.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                                <option value="custom">Custom</option>
                                <option value="disabled">Disabled</option>
                              </>
                            ) : (
                              AGENT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))
                            )}
                          </select>
                          {agent.switchTo === 'custom' && (
                            <input
                              type="text"
                              value={agent.customName || ''}
                              onChange={(e) => {
                                const customName = e.target.value;
                                handleAgentChange('custom', customName);
                                if (customName && availableAgents.length > 0) {
                                  if (!validateAgent(customName)) {
                                    setAgentWarning(`Agent "${customName}" not found in OpenCode. It may cause errors.`);
                                  } else {
                                    setAgentWarning(null);
                                  }
                                } else {
                                  setAgentWarning(null);
                                }
                              }}
                              placeholder="Enter agent name..."
                              className="w-full px-3 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                            />
                          )}
                          <div className="text-[10px] text-muted-foreground/70">
                            {agent.switchTo === 'custom' && agent.customName
                              ? `Switch to "${agent.customName}" agent after approval`
                              : agent.switchTo === 'disabled'
                                ? 'Stay on current agent after approval'
                                : `Switch to ${agent.switchTo} agent after approval`}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Auto-close Tab */}
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Auto-close Tab</div>
                      <select
                        value={autoCloseDelay}
                        onChange={(e) => {
                          const next = e.target.value as AutoCloseDelay;
                          setAutoCloseDelayState(next);
                          setAutoCloseDelay(next);
                        }}
                        className="w-full px-3 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
                      >
                        {AUTO_CLOSE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <div className="text-[10px] text-muted-foreground/70">
                        {AUTO_CLOSE_OPTIONS.find(o => o.value === autoCloseDelay)?.description}
                      </div>
                    </div>
                  </>
                )}

                {/* === THEME TAB === */}
                {activeTab === 'theme' && <ThemeTab onPreview={() => { setShowDialog(false); setThemePreview(true); }} />}

                {/* === REVIEW TAB === */}
                {activeTab === 'review' && (
                  <ReviewTab sinceBaseUnavailable={sinceBaseUnavailable} />
                )}

                {/* === DISPLAY TAB === */}
                {activeTab === 'display' && (
                  <ReviewDisplayTab isCompactTouchLayout={isCompactTouchLayout} />
                )}

                {activeTab === 'semantic' && <SemanticDiffsTab />}

                {activeTab === 'experimental' && <ExperimentalTab />}

                {activeTab === 'analysis' && (
                  <ReviewAnalysisTab packageChangesSetting={packageChangesSetting} />
                )}

                {/* === SHORTCUTS TAB === */}
                {activeTab === 'shortcuts' && (
                  <KeyboardShortcuts mode="review" vimModeEnabled={vimModeEnabled} />
                )}

                {/* === COMMENTS TAB === */}
                {activeTab === 'comments' && (
                  <CommentsTab />
                )}

                {/* === AI TAB === */}
                {activeTab === 'ai' && (
                  <AISettingsTab
                    providers={aiProviders}
                    selectedProviderId={aiProvider}
                    origin={origin}
                    onProviderChange={setAiProvider}
                  />
                )}

                {/* === FILES TAB === */}
                {activeTab === 'files' && (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">File Browser</div>
                        <div className="text-xs text-muted-foreground">
                          Your project files are shown automatically. Add extra directories below.
                        </div>
                      </div>
                      <button
                        role="switch"
                        aria-checked={fileBrowserSettings.enabled}
                        onClick={() => handleFileBrowserChange({ enabled: !fileBrowserSettings.enabled })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          fileBrowserSettings.enabled ? 'bg-primary' : 'bg-muted'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                            fileBrowserSettings.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {fileBrowserSettings.enabled && (
                      <>
                        <div className="border-t border-border" />

                        {/* Directory list */}
                        {fileBrowserSettings.directories.length > 0 && (
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Directories</label>
                            {fileBrowserSettings.directories.map((dir) => (
                              <div key={dir} className="flex items-center gap-2 group">
                                <div className="flex-1 px-3 py-2 bg-muted rounded-lg text-xs font-mono truncate" title={dir}>
                                  {dir}
                                </div>
                                <button
                                  onClick={() => handleFileBrowserChange({
                                    directories: fileBrowserSettings.directories.filter((d) => d !== dir),
                                  })}
                                  className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                                  title="Remove directory"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add directory */}
                        <div className="space-y-1.5">
                          <label className="text-xs text-muted-foreground">Add Directory</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newDirPath}
                              onChange={(e) => setNewDirPath(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') addDirectory();
                              }}
                              placeholder="/path/to/directory"
                              className="flex-1 px-3 py-2 bg-muted rounded-lg text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                            />
                            <button
                              onClick={addDirectory}
                              disabled={!newDirPath.trim()}
                              className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              Add
                            </button>
                          </div>
                          <div className="text-[10px] text-muted-foreground/70">
                            Add directories outside your project that contain markdown files.
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

              </div>
              </OverlayScrollArea>
            </div>
          </div>
        </div>,
        document.body
      )}

      {themePreview && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col pointer-events-none">
          <div className="flex-1" />
          <div
            className="pointer-events-auto w-full bg-card border-t-2 border-primary/30 shadow-[0_-4px_20px_rgba(0,0,0,0.4)] flex flex-col max-h-[35vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0">
              <span className="text-xs font-medium text-muted-foreground">Theme Preview</span>
              <button
                onClick={() => { setThemePreview(false); setShowDialog(true); }}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
            <div className="p-3 overflow-y-auto flex-1 min-h-0">
              <ThemeTab compact />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
