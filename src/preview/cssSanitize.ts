// @node: F7.3
// Removes @import, non-data url(...), expression(), binding rules, and every "<". One linear pass over strings and comments.
export function sanitizeCss(css: string): string {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    const c = css[i]!;
    if (c === '/' && css[i + 1] === '*') { const j = css.indexOf('*/', i + 2); i = j === -1 ? n : j + 2; out += ' '; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && css[j] !== c && css[j] !== '\n') j += css[j] === '\\' ? 2 : 1;
      out += css.slice(i, Math.min(j + 1, n));
      i = Math.min(j + 1, n);
      continue;
    }
    out += c;
    i++;
  }
  out = out.replace(/@import[^;{}]*;?/gi, '');
  out = out.replace(/url\(\s*(['"]?)\s*data:(?:image|font)\/[^)]*\1\s*\)/gi, (m) => m.replace(/</g, ''));
  out = out.replace(/url\(\s*(['"]?)[^)]*\1\s*\)/gi, (m) => (/^url\(\s*['"]?\s*data:(?:image|font)\//i.test(m) ? m : 'none'));
  out = out.replace(/expression\s*\(/gi, 'none(').replace(/-moz-binding\s*:[^;}]*/gi, '').replace(/behavior\s*:[^;}]*/gi, '');
  return out.replace(/</g, '');
}

/** CSS placed inside a <style> element: every "<" is escaped so "</style>" cannot appear. */
export function styleBody(css: string): string {
  return sanitizeCss(css).replace(/</g, '\\3c ');
}
