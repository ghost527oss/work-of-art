// @node: F7.2
// A tolerant, linear HTML tokenizer with offsets, lines, and columns. Never throws.
export interface HtmlAttr { name: string; value: string; hasValue: boolean }
export interface HtmlToken {
  type: 'start' | 'end' | 'text' | 'comment' | 'doctype';
  name?: string;
  attrs?: HtmlAttr[];
  selfClosing?: boolean;
  text?: string;
  start: number;
  end: number;
  line: number;
  col: number;
}

export const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const RAW = new Set(['script', 'style', 'textarea', 'title']);

export function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
}

export function tokenizeHtml(input: string): HtmlToken[] {
  const src = input.replace(/\0/g, ' ');
  const out: HtmlToken[] = [];
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  const pos = (offset: number) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid]! <= offset) lo = mid; else hi = mid - 1; }
    return { line: lo + 1, col: offset - starts[lo]! + 1 };
  };
  const push = (t: Omit<HtmlToken, 'line' | 'col'>) => out.push({ ...t, ...pos(t.start) });
  let i = 0;
  const n = src.length;
  let textStart = 0;
  const flush = (end: number) => { if (end > textStart) push({ type: 'text', text: src.slice(textStart, end), start: textStart, end }); };
  while (i < n) {
    if (src[i] !== '<') { i++; continue; }
    if (src.startsWith('<!--', i)) {
      flush(i);
      let j = src.indexOf('-->', i + 4);
      if (src.startsWith('<!-->', i)) j = i + 2;
      const end = j === -1 ? n : j + 3;
      push({ type: 'comment', start: i, end });
      i = textStart = end;
      continue;
    }
    if (src.startsWith('<![CDATA[', i)) { i += 9; continue; }
    if (src.startsWith('<!', i)) {
      flush(i);
      const j = src.indexOf('>', i);
      const end = j === -1 ? n : j + 1;
      push({ type: 'doctype', start: i, end });
      i = textStart = end;
      continue;
    }
    const closing = src[i + 1] === '/';
    const nameStart = i + (closing ? 2 : 1);
    if (!/[A-Za-z]/.test(src[nameStart] ?? '')) { i++; continue; }
    let k = nameStart;
    while (k < n && /[^\s/>]/.test(src[k]!)) k++;
    const name = src.slice(nameStart, k).toLowerCase();
    // attributes
    const attrs: HtmlAttr[] = [];
    let selfClosing = false;
    let closed = false;
    while (k < n) {
      while (k < n && /\s/.test(src[k]!)) k++;
      if (src[k] === '>') { k++; closed = true; break; }
      if (src[k] === '/') { if (src[k + 1] === '>') { selfClosing = true; k += 2; closed = true; break; } k++; continue; }
      let a = k;
      while (k < n && /[^\s=/>]/.test(src[k]!)) k++;
      const an = src.slice(a, k).toLowerCase();
      if (k === a) { k++; continue; }
      while (k < n && /\s/.test(src[k]!)) k++;
      if (src[k] === '=') {
        k++;
        while (k < n && /\s/.test(src[k]!)) k++;
        let v = '';
        if (src[k] === '"' || src[k] === "'") {
          const q = src[k]!;
          const e = src.indexOf(q, k + 1);
          v = src.slice(k + 1, e === -1 ? n : e);
          k = e === -1 ? n : e + 1;
        } else {
          a = k;
          while (k < n && /[^\s>]/.test(src[k]!)) k++;
          v = src.slice(a, k);
        }
        if (attrs.length < 50) attrs.push({ name: an, value: v, hasValue: true });
      } else if (attrs.length < 50) attrs.push({ name: an, value: '', hasValue: false });
    }
    if (!closed) { i = n; break; }
    flush(i);
    push(closing ? { type: 'end', name, start: i, end: k } : { type: 'start', name, attrs, selfClosing: selfClosing || VOID.has(name), start: i, end: k });
    i = textStart = k;
    if (!closing && RAW.has(name) && !selfClosing) {
      const re = new RegExp(`</${name}\\s*>`, 'i');
      const m = re.exec(src.slice(i));
      const bodyEnd = m ? i + m.index : n;
      if (bodyEnd > i) push({ type: 'text', text: src.slice(i, bodyEnd), start: i, end: bodyEnd });
      i = textStart = bodyEnd;
    }
  }
  flush(n);
  return out;
}
