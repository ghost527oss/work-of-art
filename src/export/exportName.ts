// @node: F9.7
export function exportFileName(s: { owner: string; name: string; ref: string }, kind: string | undefined, ext: string, date: Date): string {
  const ymd = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
  const raw = `patchbay-${s.owner}-${s.name}-${s.ref}-${ymd}${kind ? `-${kind}` : ''}`.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  const room = 100 - ext.length - 1;
  return `${raw.slice(0, room)}.${ext}`;
}
