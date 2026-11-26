// @node: F7.5
// The Component Workbench: an approximate, static picture read from source. Not run, not annotated.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import type { AnalysisResult } from '../engine/understandTypes';
import { extOf } from '../engine/sourceScan';
import { findComponents, jsxToHtml, type FoundComponent, type JsxNode } from './jsxExtract';
import { buildStaticPreview, type PreviewBuild } from './previewDocument';
import { extractSvelte, extractVue } from './templateExtract';

export interface WorkbenchInput {
  paths: readonly string[];
  effective: (path: string) => string | undefined;
  analysis?: AnalysisResult;
  componentKey?: string; // `${path}#${name}`
  previewStyles?: ReadonlyArray<{ elementKey: string; property: string; value: string }>;
  nonce: string;
  origin: string;
}

export interface WorkbenchComponent extends FoundComponent { key: string; css?: string; jsx?: JsxNode }

/** Every component found in the loaded files, sorted. A problem in one file never stops the others. */
export function listComponents(input: Pick<WorkbenchInput, 'paths' | 'effective'>): Array<WorkbenchComponent> {
  const out: WorkbenchComponent[] = [];
  for (const path of [...input.paths].sort()) {
    if (out.length >= L.maxComponents) break;
    const text = input.effective(path);
    if (text === undefined) continue;
    const ext = extOf(path);
    if (ext === 'jsx' || ext === 'tsx') {
      for (const c of findComponents(path, text)) out.push({ ...c, key: `${path}#${c.name}` });
    } else if (ext === 'vue' || ext === 'svelte') {
      const r = ext === 'vue' ? extractVue(text) : extractSvelte(text);
      const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
      out.push(r ? { name, path, exported: true, key: `${path}#${name}`, markup: r.markup, css: r.css } : { name, path, exported: true, key: `${path}#${name}`, error: 'could not be read' });
    }
  }
  return out.slice(0, L.maxComponents);
}

export function defaultComponent(list: ReadonlyArray<WorkbenchComponent>): WorkbenchComponent | undefined {
  const ok = list.filter((c) => !c.error);
  return ok.find((c) => c.name === 'App') ?? ok.find((c) => c.exported) ?? ok[0];
}

function cssFor(input: WorkbenchInput, from: string): string {
  const edges = input.analysis?.edges ?? [];
  const seen = new Set<string>();
  const css: string[] = [];
  const walk = (path: string, level: number) => {
    if (level > L.inlineLevels || seen.has(path)) return;
    seen.add(path);
    for (const e of edges) {
      if (e.from !== path || e.kind !== 'imports' || !e.targetPath) continue;
      if (e.targetPath.endsWith('.css')) { const t = input.effective(e.targetPath); if (t !== undefined && !seen.has(e.targetPath)) { seen.add(e.targetPath); css.push(t); } }
      else walk(e.targetPath, level + 1);
    }
  };
  walk(from, 0);
  for (const p of input.paths) if (/(?:^|\/)(?:main|index|App)\.(?:tsx|jsx|ts|js)$/.test(p)) walk(p, 1);
  return css.join('\n');
}

export function buildWorkbench(input: WorkbenchInput): PreviewBuild & { components: WorkbenchComponent[]; chosen?: string } {
  try {
    const list = listComponents(input);
    const comp = (input.componentKey ? list.find((c) => c.key === input.componentKey && !c.error) : undefined) ?? defaultComponent(list);
    if (!comp) return { ok: false, reason: 'No component could be read.', components: list };
    const byName = new Map(list.filter((c) => !c.error).map((c) => [c.name, c]));
    const lookup = (n: string) => byName.get(n) as (FoundComponent & { jsx?: JsxNode }) | undefined;
    const body = comp.markup ?? (comp.jsx ? jsxToHtml(comp.jsx, { lookup }) : '');
    const css = `${comp.css ?? ''}\n${cssFor(input, comp.path)}`;
    const source = `<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`;
    const built = buildStaticPreview({
      entryPath: comp.path, effective: () => source, loaded: new Set([comp.path]), scripts: false, nonce: input.nonce, origin: input.origin, annotate: true, approximate: true, entrySource: source, previewStyles: input.previewStyles,
    });
    return { ...built, components: list, chosen: comp.key };
  } catch {
    return { ok: false, reason: 'The workbench could not be built.', components: [] };
  }
}
