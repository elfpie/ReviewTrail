/**
 * Whether the selection toolbar's Copy button copies rich text (text/html plus
 * text/plain in one write) (#1972, #2191).
 *
 * Default: false, so a host that does not opt in (Workspaces) keeps the
 * toolbar and its plain-text Copy exactly as before. ReviewTrail's own apps (plan review and annotate,
 * code review, the Inbox window) pass `configureReviewTrailUI({ richCopy: true })`.
 * Read when the Viewer and HtmlViewer render their toolbar.
 */
let richCopy = false;

export function setRichCopyEnabled(on: boolean): void {
  richCopy = on;
}

export function resetRichCopyEnabled(): void {
  richCopy = false;
}

export function getRichCopyEnabled(): boolean {
  return richCopy;
}
