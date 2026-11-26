// @node: F7.5
// Basic Vue <template> and Svelte markup extraction. Nothing is evaluated.
const MARK = '<span class="pb-expr">{...}</span>';

function stripAttrs(html: string, prefixes: RegExp): string {
  return html.replace(/<([A-Za-z][\w-]*)((?:\s+[^\s>=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^\s>]+))?)*)\s*(\/?)>/g, (_m, tag: string, attrs: string, slash: string) => {
    const kept = (attrs.match(/\s+[^\s>=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^\s>]+))?/g) ?? []).filter((a) => !prefixes.test(a.trim()));
    return `<${tag}${kept.join('')}${slash ? ' /' : ''}>`;
  });
}

export function extractVue(source: string): { markup: string; css: string } | null {
  const open = source.indexOf('<template');
  if (open === -1) return null;
  const start = source.indexOf('>', open) + 1;
  const end = source.lastIndexOf('</template>');
  if (start <= 0 || end <= start) return null;
  const markup = stripAttrs(source.slice(start, end).replace(/\{\{[\s\S]*?\}\}/g, MARK), /^(?:v-|:|@)/);
  const css = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  return { markup, css };
}

export function extractSvelte(source: string): { markup: string; css: string } | null {
  const css = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  let markup = source.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  markup = stripAttrs(markup, /^(?:on:|bind:)/);
  markup = markup.replace(/\{[#:/][^}]*\}/g, '').replace(/\{[^}]*\}/g, MARK);
  return markup.trim() === '' ? null : { markup, css };
}
