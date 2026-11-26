// @node: F7.5
// Basic Vue <template> and Svelte markup extraction. Nothing is evaluated.
import { tokenizeHtml, VOID } from './htmlTokens';

const CAP = 100 * 1024;

const MARK = '<span class="pb-expr">{...}</span>';

/** Rewrites start tags without the attributes whose names match `prefixes`. Uses the linear tokenizer. */
function stripAttrs(html: string, prefixes: RegExp): string {
  let out = '';
  for (const t of tokenizeHtml(html)) {
    if (t.type === 'text') out += t.text ?? '';
    else if (t.type === 'end') out += `</${t.name}>`;
    else if (t.type === 'start') {
      const kept = (t.attrs ?? []).filter((a) => !prefixes.test(a.name));
      out += `<${t.name}${kept.map((a) => (a.hasValue ? ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"` : ` ${a.name}`)).join('')}${t.selfClosing && !VOID.has(t.name ?? '') ? ' /' : ''}>`;
    }
  }
  return out;
}

export function extractVue(source0: string): { markup: string; css: string } | null {
  const source = source0.slice(0, CAP);
  const open = source.indexOf('<template');
  if (open === -1) return null;
  const start = source.indexOf('>', open) + 1;
  const end = source.lastIndexOf('</template>');
  if (start <= 0 || end <= start) return null;
  const markup = stripAttrs(source.slice(start, end).replace(/\{\{[\s\S]*?\}\}/g, MARK), /^(?:v-|:|@)/);
  const css = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  return { markup, css };
}

export function extractSvelte(source0: string): { markup: string; css: string } | null {
  const source = source0.slice(0, CAP);
  const css = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  let markup = source.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  markup = stripAttrs(markup, /^(?:on:|bind:)/);
  markup = markup.replace(/\{[#:/][^}]*\}/g, '').replace(/\{[^}]*\}/g, MARK);
  return markup.trim() === '' ? null : { markup, css };
}
