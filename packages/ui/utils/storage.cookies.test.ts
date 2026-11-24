import { expect, test } from 'bun:test';
import { getItem, removeItem, setItem } from './storage';

test.skipIf(typeof document === 'undefined')('migrates only earlier fork cookies and gives current preferences precedence', () => {
  const location = window.location.href;
  const { happyDOM } = window as unknown as { happyDOM: { setURL(url: string): void } };
  happyDOM.setURL('http://localhost/');
  const upstream = 'plannotator-storage-test';
  const previous = 'reviewtrail-' + upstream;
  const current = 'reviewtrail-storage-test';
  try {
    document.cookie = upstream + '=upstream; path=/';
    expect(getItem(current)).toBeNull();
    document.cookie = previous + '=old; path=/';
    expect(getItem(current)).toBe('old');
    expect(document.cookie.split('; ')).toContain(current + '=old');
    expect(document.cookie.split('; ')).not.toContain(previous + '=old');

    document.cookie = previous + '=stale; path=/';
    setItem(current, 'new');
    expect(getItem(current)).toBe('new');
    removeItem(current);
    expect(getItem(current)).toBeNull();
    expect(document.cookie.split('; ')).toContain(upstream + '=upstream');
  } finally {
    for (const name of [upstream, previous, current]) {
      document.cookie = name + '=; path=/; max-age=-1';
    }
    happyDOM.setURL(location);
  }
});
