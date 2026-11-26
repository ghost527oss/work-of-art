// @node: F10.8
// Fake storage that records every write and removal. Never touches real browser storage.
export function recordingStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  const writes: Array<{ key: string; value: string }> = [];
  const removals: string[] = [];
  return {
    data, writes, removals,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { writes.push({ key: k, value: v }); data.set(k, v); },
    removeItem: (k: string) => { removals.push(k); data.delete(k); },
  };
}
export const throwingStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
};
