// @node: F9.6
// Myers' shortest edit script on line arrays, with a work limit and a safe single-edit fallback.
export type Op = { kind: 'equal' | 'delete' | 'insert'; a: number; b: number };

export function diffLines(a: readonly string[], b: readonly string[], workLimit = 4_000_000): Op[] {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf);
  const B = b.slice(pre, b.length - suf);
  const ops: Op[] = [];
  for (let i = 0; i < pre; i++) ops.push({ kind: 'equal', a: i, b: i });
  const mid = myers(A, B, workLimit);
  for (const o of mid) ops.push({ kind: o.kind, a: o.a + pre, b: o.b + pre });
  for (let i = 0; i < suf; i++) ops.push({ kind: 'equal', a: a.length - suf + i, b: b.length - suf + i });
  return ops;
}

function myers(A: readonly string[], B: readonly string[], workLimit: number): Op[] {
  const n = A.length, m = B.length;
  const fallback = (): Op[] => [...A.map((_, i) => ({ kind: 'delete' as const, a: i, b: 0 })), ...B.map((_, j) => ({ kind: 'insert' as const, a: n, b: j }))];
  if (n === 0 || m === 0) return fallback();
  const max = n + m;
  const off = max + 1; // one slot of padding on each side, so the saved band below never starts below 0
  const v = new Int32Array(2 * max + 4);
  // Per step d only the band k in [-(d+1), d+1] is saved (memory about d squared, bounded by the work limit).
  const trace: Int32Array[] = [];
  let work = 0;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1]! < v[off + k + 1]!) ? v[off + k + 1]! : v[off + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) { x++; y++; work++; }
      v[off + k] = x;
      if (++work > workLimit) return fallback();
      if (x >= n && y >= m) return backtrack(trace, A, B, d);
    }
  }
  return fallback();
}

function backtrack(tr: Int32Array[], A: readonly string[], B: readonly string[], dEnd: number): Op[] {
  const out: Op[] = [];
  let x = A.length, y = B.length;
  for (let d = dEnd; d > 0; d--) {
    const band = tr[d]!;
    const at = (k: number) => band[k + d + 1]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x--; y--; out.push({ kind: 'equal', a: x, b: y }); }
    if (x === prevX) { y--; out.push({ kind: 'insert', a: x, b: y }); } else { x--; out.push({ kind: 'delete', a: x, b: y }); }
  }
  while (x > 0 && y > 0) { x--; y--; out.push({ kind: 'equal', a: x, b: y }); }
  return out.reverse();
}
