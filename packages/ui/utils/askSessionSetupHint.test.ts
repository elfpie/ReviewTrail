import { describe, expect, test } from 'bun:test';
import { askSessionSetupHint } from './askSessionSetupHint';

const sdk = { name: 'claude-agent-sdk' };
const bridge = { name: 'session-bridge', sessionBridge: { host: 'pi', status: 'ready' as const, modes: { turn: true, transient: false } } };

describe('askSessionSetupHint (#1814)', () => {
  test('the CLI run from Oh My Pi (no bridge) explains the available feedback path', () => {
    const hint = askSessionSetupHint('oh-my-pi', [sdk]);
    expect(hint).toContain("send feedback");
  });

  test('also with no providers at all, the state where Ask AI otherwise offers nothing', () => {
    expect(askSessionSetupHint('oh-my-pi', [])).toContain("configured provider");
  });

  test('a session that already has a bridge gets no hint', () => {
    expect(askSessionSetupHint('oh-my-pi', [bridge])).toBeNull();
  });

  test('other origins get no hint, bridge or not', () => {
    for (const origin of ['pi', 'claude-code', 'codex', 'opencode', null, undefined] as const) {
      expect(askSessionSetupHint(origin, [sdk])).toBeNull();
    }
  });
});
