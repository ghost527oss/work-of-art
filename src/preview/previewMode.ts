// @node: F7.4
// Chooses the display mode and lists the possible modes. Pure.
import type { RepoSnapshot } from '../types/contracts';
import { extOf } from '../engine/sourceScan';
import { listComponents } from './workbenchDocument';
import { tokenizeHtml } from './htmlTokens';

export type PreviewMode = 'static' | 'workbench' | 'source';

export interface ModeDetection { mode: PreviewMode; reason: string; entryPath?: string; hasComponents: boolean }

const FRAMEWORKS = ['react', 'react-dom', 'vue', 'svelte', '@angular/core', 'solid-js', 'preact', 'next', 'nuxt'];

export function findEntryPage(paths: readonly string[]): string | undefined {
  const html = paths.filter((p) => /\.html?$/i.test(p)).sort();
  if (html.includes('index.html')) return 'index.html';
  if (html.includes('public/index.html')) return 'public/index.html';
  const idx = html.filter((p) => p.endsWith('/index.html')).sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1));
  return idx[0] ?? html[0];
}

function frameworkSignals(snapshot: RepoSnapshot, entry: string | undefined, effective: (p: string) => string | undefined): boolean {
  for (const f of snapshot.files) {
    if (!/(?:^|\/)package\.json$/.test(f.path) || typeof f.content !== 'string') continue;
    try {
      const j = JSON.parse(f.content) as Record<string, unknown>;
      const names = new Set([...Object.keys((j.dependencies as object) ?? {}), ...Object.keys((j.devDependencies as object) ?? {})]);
      if (FRAMEWORKS.some((n) => names.has(n))) return true;
    } catch { /* not JSON */ }
  }
  const html = entry ? effective(entry) : undefined;
  if (html === undefined) return false;
  const toks = tokenizeHtml(html);
  if (toks.some((t) => t.type === 'start' && t.name === 'script' && /type\s*$/i.test('') === false && t.attrs?.some((a) => a.name === 'type' && a.value === 'module') && t.attrs.some((a) => a.name === 'src' && ['tsx', 'jsx', 'ts', 'vue', 'svelte'].includes(extOf(a.value.split('?')[0]!)))) ) return true;
  const bodyText = toks.filter((t) => t.type === 'text').map((t) => t.text ?? '').join('').trim();
  const shell = toks.some((t) => t.type === 'start' && t.attrs?.some((a) => a.name === 'id' && (a.value === 'root' || a.value === 'app')));
  return shell && bodyText === '';
}

export function detectPreviewMode(snapshot: RepoSnapshot, effective: (p: string) => string | undefined = (p) => snapshot.files.find((f) => f.path === p)?.content): ModeDetection {
  const paths = snapshot.files.filter((f) => typeof f.content === 'string').map((f) => f.path);
  const allPaths = snapshot.inventory.entries.filter((e) => e.entryType === 'file').map((e) => e.path);
  const entry = findEntryPage(allPaths.filter((p) => paths.includes(p)));
  const fw = frameworkSignals(snapshot, entry, effective);
  const comps = listComponents({ paths, effective }).filter((c) => !c.error);
  if (fw && comps.length > 0) return { mode: 'workbench', reason: 'This project uses a screen framework, so the page is built from components. A picture is read from the source.', entryPath: entry, hasComponents: true };
  if (fw) return { mode: 'source', reason: 'This project uses a screen framework, but no component could be read from the source.', entryPath: entry, hasComponents: false };
  if (entry) return { mode: 'static', reason: 'This project is a plain web page, so it is shown as the browser would see it, with scripts off.', entryPath: entry, hasComponents: comps.length > 0 };
  return { mode: 'source', reason: 'No web page was found. This looks like a backend or a library.', hasComponents: comps.length > 0 };
}

export function modeChoices(d: ModeDetection): PreviewMode[] {
  const out: PreviewMode[] = [];
  if (d.entryPath) out.push('static');
  if (d.hasComponents) out.push('workbench');
  out.push('source');
  return out;
}

export const MODE_NAMES: Record<PreviewMode, string> = { static: 'Live Static Preview', workbench: 'Component Workbench', source: 'Source Inspection' };
