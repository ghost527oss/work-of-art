// @node: F12.6
import { describe, expect, it } from 'vitest';
import { addBlocked, BLOCKED_TEXT, describeBlocked, type BlockedEntry } from '../src/preview/blockedReport';

describe('blocked-resources list', () => {
  it('keeps at most 200 entries, cuts addresses to 80 characters, and strips control characters', () => {
    const r = { blocked: [] as BlockedEntry[] };
    for (let i = 0; i < 250; i++) addBlocked(r, `https://x.test/${'a'.repeat(120)}`, 'not_on_list');
    expect(r.blocked).toHaveLength(200);
    expect(r.blocked[0]!.what).toHaveLength(80);
    const c = { blocked: [] as BlockedEntry[] };
    addBlocked(c, 'a\nb\u0000c', 'scripts_off');
    expect(c.blocked[0]!.what).toBe('a b c');
    addBlocked(c, '', 'scripts_off');
    expect(c.blocked[1]!.what).toBe('(empty)');
  });
  it('shows at most 20 lines, then how many more, and every reason has a plain sentence', () => {
    const r = { blocked: [] as BlockedEntry[] };
    for (let i = 0; i < 30; i++) addBlocked(r, `file${i}`, 'event_handler');
    const d = describeBlocked(r.blocked);
    expect(d.lines).toHaveLength(20);
    expect(d).toMatchObject({ more: 10, total: 30 });
    expect(d.lines[0]).toBe('file0: event handlers only run when scripts are on.');
    for (const text of Object.values(BLOCKED_TEXT)) expect(text).toMatch(/^[a-z]/);
  });
});
