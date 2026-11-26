// @node: F10.1
import { describe, expect, it } from 'vitest';
import { describeSavedData } from '../src/store/sessionRecord';
import { recordingStorage, throwingStorage } from './helpers/sessionFakes';

describe('describeSavedData', () => {
  it('the five parts in order with fixed descriptions and sizes; never a stored value', () => {
    const SECRET = 'VALUE_SENTINEL_123';
    const s = recordingStorage({ 'patchbay.session.v1': `{"a":"${SECRET}"}`, 'patchbay.journal.v1': '{"version":1,"level":"simple"}' });
    const rows = describeSavedData(s);
    expect(rows.map((r) => [r.key, r.label])).toEqual([
      ['patchbay.session.v1', 'Session address and view'],
      ['patchbay.work.v1', 'Your changes, Log, and paused practice run'],
      ['patchbay.corrections.v1', 'Label corrections'],
      ['patchbay.studio-layout.v1', 'Panel layout'],
      ['patchbay.journal.v1', 'Reading level'],
    ]);
    expect(rows.map((r) => r.bytes)).toEqual([SECRET.length + 8, null, null, null, 30]);
    expect(JSON.stringify(rows)).not.toContain(SECRET);
  });
  it('blocked or missing storage gives nothing saved', () => {
    expect(describeSavedData(throwingStorage).every((r) => r.bytes === null)).toBe(true);
    expect(describeSavedData(undefined).every((r) => r.bytes === null)).toBe(true);
  });
});
