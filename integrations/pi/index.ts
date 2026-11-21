import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function reviewTrail(pi: ExtensionAPI) {
  const pending = new Set<AbortController>();
  pi.on('session_shutdown', () => {
    for (const review of pending) review.abort();
  });
  pi.registerCommand('reviewtrail', {
    description: 'Open ReviewTrail on local changes or a pull request',
    async handler(args, ctx) {
      const sessionId = ctx.sessionManager.getSessionId();
      const review = new AbortController();
      pending.add(review);
      try {
        const signal = ctx.signal ? AbortSignal.any([ctx.signal, review.signal]) : review.signal;
        const result = await pi.exec('reviewtrail', ['--pi-command', args ?? ''], { cwd: ctx.cwd, signal });
        if (review.signal.aborted || result.killed) return;
        if (result.code !== 0) throw new Error(result.stderr.trim() || 'ReviewTrail exited before returning a review.');
        const { decision, message } = JSON.parse(result.stdout);
        if (typeof message !== 'string' || !['approved', 'annotated', 'dismissed', 'info'].includes(decision)) {
          throw new Error('ReviewTrail returned an unrecognized review result.');
        }
        if (decision === 'info' || decision === 'dismissed' || !message.trim() || ctx.sessionManager.getSessionId() !== sessionId) {
          ctx.ui.notify(message || 'Review closed.', 'info');
          return;
        }
        pi.sendUserMessage(message, { deliverAs: 'followUp' });
      } catch (error) {
        if (!review.signal.aborted) ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
      } finally {
        pending.delete(review);
      }
    },
  });
}
