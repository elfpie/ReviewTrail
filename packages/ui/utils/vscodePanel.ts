/**
 * True inside the VS Code extension's panel (its theme bridge sets
 * `window.__REVIEWTRAIL_VSCODE`). There the panel forwards keys to VS Code, so
 * a page key that shadows a VS Code window key (⌘P is Quick Open there, not
 * Print) should step aside.
 */
export function isVSCodePanel(): boolean {
  return typeof window !== 'undefined' && (window as { __REVIEWTRAIL_VSCODE?: unknown }).__REVIEWTRAIL_VSCODE === true;
}
