// @node: F9.9
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExportButton } from '../src/components/ExportButton';
import { ExportChanges } from '../src/components/ExportChanges';
import { FindingDetail } from '../src/components/FindingDetail';
import { HistoryPanel } from '../src/components/HistoryPanel';
import { JournalPanel } from '../src/components/JournalPanel';
import { LogExportButtons } from '../src/components/LogExportButtons';
import { LogPanel } from '../src/components/LogPanel';
import { buildSampleSnapshot, type SampleId } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { scanProject } from '../src/engine/scanProject';
import { EXCLUDE, type PatchPlan } from '../src/export/patchExport';
import { buildJournal, type JournalModel } from '../src/journal/journalModel';
import { detectPreviewMode } from '../src/preview/previewMode';
import { PLAYBOOK, type Level } from '../src/skillbook';

async function model(id: SampleId, level: Level): Promise<JournalModel> {
  const snapshot = buildSampleSnapshot(id, 1);
  const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
  const content = new Map(snapshot.files.map((f) => [f.path, f.content]));
  const scan = await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => content.get(p) }, { yieldToMain: async () => undefined });
  const d = detectPreviewMode(snapshot);
  return buildJournal({ snapshot, analysis, analysisStatus: 'done', corrections: {}, scan, measured: [], mode: d.mode, modeReason: d.reason, entryPath: d.entryPath }, level);
}
const noop = () => undefined;
const panel = (m: JournalModel, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(JournalPanel, { model: m, onLevel: noop, onFocus: noop, onFocusDone: noop, onOpenViewer: noop, onDownload: () => false as const, ...extra }));
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1]!);

describe('JournalPanel', () => {
  it('normal state: title, intro, picker with aria-pressed, the five blocks with their defaults', async () => {
    const html = panel(await model('static-site', 'practical'));
    expect(html).toContain('<h2 id="journal-heading">Journal</h2>');
    expect(html).toContain('The Journal explains how your project works and what PatchBay found. The Log shows what PatchBay did.');
    expect(html).toContain('aria-pressed="false">Simple</button>');
    expect(html).toContain('aria-pressed="true">Practical</button>');
    const blocks = [...html.matchAll(/<details( open="")?[^>]*><summary><h3 class="fold-title">([^<]+)<\/h3>/g)].map((m) => [m[2], !!m[1]]);
    expect(blocks).toEqual([['Application overview', true], ['How things flow', false], ['Lessons from your project', true], ['Concepts', false], ['Download', false]]);
    expect(html).toContain('Download journal (.md)');
    expect(html).toContain('Open in viewer');
  });

  it('the static sample overview text appears, at each level the text changes but the blocks stay', async () => {
    const s = panel(await model('static-site', 'simple'));
    expect(s).toContain('PatchBay describes only the files it read.');
    const d = panel(await model('static-site', 'deeper'));
    expect(d).not.toBe(s);
    const count = (h: string) => (h.match(/<details/g) ?? []).length;
    expect(count(d)).toBe(count(s));
  });

  it('lessons: instance lines and Open in viewer; concepts with Related buttons', async () => {
    const html = panel(await model('static-site', 'simple'));
    expect(html).toContain('Images need a text description');
    expect(html).toMatch(/<code>index\.html<\/code>, line 11: /);
    expect(html).toContain('Related:');
  });

  it('building, failed, and no-snapshot states', () => {
    const base = { level: 'simple' as const, overview: [], flows: [], flowsHidden: 0, lessons: [], concepts: [], hidden: 0, notes: [], scan: 'done' as const };
    expect(panel({ ...base, status: 'analysing' })).toContain('Building the Journal...');
    const f = panel({ ...base, status: 'failed' }, { analysisError: 'Timed out', onRetry: noop });
    expect(f).toContain('The project analysis is not ready, so the Journal cannot be built. Reason: Timed out');
    expect(buttons(f)).toContain('Try again');
    expect(panel({ ...base, status: 'ready' })).toContain('PatchBay found nothing from the checks that ran.');
    // never an all-clear when no scan ran or the scan is out of date
    expect(panel({ ...base, status: 'ready', scan: 'none' })).toContain('PatchBay has not run its checks yet.');
    expect(panel({ ...base, status: 'ready', scan: 'none' })).not.toContain('found nothing');
    expect(panel({ ...base, status: 'ready', scan: 'stale' })).toContain('The scan is out of date');
  });

  it('the only buttons are levels, Open in viewer, Related cards, Download, Try again', async () => {
    const html = panel(await model('fullstack-api', 'simple'));
    const allowed = new Set(['Simple', 'Practical', 'Deeper', 'Open in viewer', 'Download journal (.md)']);
    for (const c of PLAYBOOK.cards) allowed.add(c.title); // Related buttons name a card
    for (const b of buttons(html)) expect(allowed.has(b), b).toBe(true);
    for (const no of ['Apply', 'Approve', 'Reject', 'Pause', 'Resume', 'Step']) expect(buttons(html)).not.toContain(no);
  });
});

describe('flows and Learn more targets', () => {
  it('a "uses" step names and opens the importing file at the import line', async () => {
    const { FlowsSection } = await import('../src/components/FlowsSection');
    const flow = { id: 'r', kind: 'request' as const, title: 'Request: PUT /x', notes: [], steps: [{ path: 'server/middleware/validate.js', line: 2, certainty: 'confirmed' as const, kind: 'uses', label: 'uses', target: 'server/routes/profile.js' }] };
    const html = renderToStaticMarkup(createElement(FlowsSection, { flows: [flow], hidden: 0, level: 'practical', onOpenViewer: noop }));
    expect(html).toContain('<code>server/routes/profile.js</code>, line 2');
  });
  it('Learn more on a measured finding asks for the layout-overflow lesson', () => {
    const asked: string[] = [];
    const f = { id: 'm', skillId: 'scan.frontend.layout-overflow', path: 'index.html', firstLine: 3, lastLine: 3, snippet: [], severity: 'low', certainty: 'found', fix: 'explanation', areas: ['frontend'], primary: 'frontend', extra: 'Measured at 375 px wide.' } as never;
    const el = FindingDetail({ finding: f, onLearnMore: (id) => asked.push(id) });
    const find = (n: unknown): { props: { onClick?: () => void; children?: unknown } } | undefined => {
      if (!n || typeof n !== 'object') return undefined;
      const node = n as { props?: { children?: unknown; onClick?: () => void } };
      if (node.props?.children === 'Learn more' && node.props.onClick) return node as never;
      const kids = node.props?.children;
      for (const k of Array.isArray(kids) ? kids : [kids]) { const r = find(k); if (r) return r; }
      return undefined;
    };
    find(el)!.props.onClick!();
    expect(asked).toEqual(['lesson.scan.frontend.layout-overflow']);
  });
});

describe('export UI', () => {
  const plan: PatchPlan = {
    previewOnlyCount: 2,
    files: [
      { path: 'a.css', origins: ['practice'], changes: 1, hunks: 1, added: 1, removed: 0, patch: '--- a/a.css\n+++ b/a.css\n@@ -0,0 +1 @@\n+/* PRACTICE: x */\n', defaultSelected: false },
      { path: 'b/<img src=x>.html', origins: ['user', 'crew'], changes: 2, hunks: 1, added: 1, removed: 1, excluded: EXCLUDE.path, defaultSelected: false },
      { path: 'index.html', origins: ['user'], changes: 1, hunks: 1, added: 1, removed: 1, patch: '--- a/index.html\n+++ b/index.html\n@@ -1 +1 @@\n-a\n+b\n', defaultSelected: true },
    ],
  };
  const ec = (p: PatchPlan) => renderToStaticMarkup(createElement(ExportChanges, { plan: p, fileName: 'patchbay-o-r-main-20261124.patch', onDownload: () => false as const }));

  it('file list, defaults, origins, reasons, Preview Only line, preview, apply line, escaped paths', () => {
    const html = ec(plan);
    expect(html).toMatch(/aria-label="Export a\.css"[^>]*\/>/);
    expect(html).not.toMatch(/aria-label="Export a\.css" checked/);
    expect(html).toMatch(/aria-label="Export index\.html" checked=""/);
    expect(html).toContain('Practice run changes<br/><span class="note">This file contains practice-run changes.</span>');
    expect(html).toContain('Your edits, Skeleton Crew fixes');
    expect(html).toContain(EXCLUDE.path);
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('2 Preview Only changes are not exported.');
    expect(html).toContain('<summary>Preview patch</summary><pre class="diff-block">diff --git a/index.html b/index.html');
    expect(html).toContain('To use it: open your project folder and run  <code>git apply patchbay-o-r-main-20261124.patch</code>');
    expect(html).not.toContain('Nothing to export.');
  });

  it('nothing checked: disabled with "Nothing to export."; no files: "No changes to export."', () => {
    const none = ec({ ...plan, files: plan.files.map((f) => ({ ...f, defaultSelected: false })) });
    expect(none).toMatch(/<button type="button" disabled="">Download \.patch<\/button><span class="note"> Nothing to export\.<\/span>/);
    expect(ec({ files: [], previewOnlyCount: 0 })).toContain('No changes to export.');
  });

  it('Log buttons enabled and disabled; status lines', () => {
    expect(renderToStaticMarkup(createElement(LogExportButtons, { count: 0, onDownload: () => false as const }))).toContain('disabled="">Download log (.md)</button><span class="note"> The log is empty.</span>');
    expect(renderToStaticMarkup(createElement(LogExportButtons, { count: 3, onDownload: () => false as const }))).not.toContain('disabled');
    expect(renderToStaticMarkup(createElement(ExportButton, { label: 'X', onExport: () => false as const, initialStatus: 'Downloaded a.patch.' }))).toContain('Downloaded a.patch.');
  });

  it('History shows Export changes only with entries; the Log panel shows the downloads only when wired', () => {
    const exporter = { plan, fileName: 'p.patch', onDownload: () => false as const };
    expect(renderToStaticMarkup(createElement(HistoryPanel, { applied: [], undone: [], exporter }))).not.toContain('Export changes');
    const entry = { id: 'h', path: 'index.html', title: 't', at: 1, diff: '', beforeHash: '', afterHash: '' };
    expect(renderToStaticMarkup(createElement(HistoryPanel, { applied: [entry], undone: [], exporter }))).toContain('Export changes');
    expect(renderToStaticMarkup(createElement(HistoryPanel, { applied: [entry], undone: [] }))).not.toContain('Export changes');
    expect(renderToStaticMarkup(createElement(LogPanel, { entries: [], onDownload: () => false as const }))).toContain('Download log (.json)');
  });

  it('a finding detail has Learn more when wired', () => {
    const f = { id: 'f', skillId: 'scan.security.target-blank', path: 'a.html', firstLine: 1, lastLine: 1, snippet: [], severity: 'low', certainty: 'found', fix: 'auto', areas: ['security'], primary: 'security' } as never;
    expect(buttons(renderToStaticMarkup(createElement(FindingDetail, { finding: f, onLearnMore: noop })))).toContain('Learn more');
    expect(buttons(renderToStaticMarkup(createElement(FindingDetail, { finding: f })))).not.toContain('Learn more');
  });
});

describe('static checks for the 2F files', () => {
  const files = ['JournalPanel', 'LevelPicker', 'OverviewSection', 'FlowsSection', 'LessonsSection', 'ConceptsSection', 'JournalDownload', 'ExportChanges', 'LogExportButtons', 'ExportButton', 'Fold'].map((n) => `src/components/${n}.tsx`);
  const pure = ['src/journal/lessonRules.ts', 'src/journal/packageFacts.ts', 'src/journal/overview.ts', 'src/journal/flows.ts', 'src/journal/journalModel.ts', 'src/export/diffLines.ts', 'src/export/unifiedDiff.ts', 'src/export/patchExport.ts', 'src/export/logExport.ts', 'src/export/journalExport.ts', 'src/export/exportName.ts', 'src/export/download.ts', 'src/store/journalPrefs.ts', 'src/store/exportActions.ts', 'src/hooks/useJournal.ts', 'src/skillbook/playbook.ts', 'src/skillbook/playbookLookup.ts', 'src/skillbook/playbookSchema.ts', 'src/config/journalLimits.ts'];
  it('tagged, no raw HTML, no eval, no network or AI import', () => {
    for (const f of [...files, ...pure]) {
      const t = readFileSync(f, 'utf8');
      expect(t, f).toMatch(/@node: F9\.\d+/);
      if (f.endsWith('playbook.ts')) continue; // lesson data: the dangerous-html lesson names the API in its text
      for (const bad of ['dangerouslySetInnerHTML', 'innerHTML', 'eval(', 'new Function', 'fetch(', 'mockAssistant', 'aiAssistant', 'useAssistant']) expect(t, `${f}: ${bad}`).not.toContain(bad);
    }
    for (const f of files) expect(readFileSync(f, 'utf8')).toContain('@node: F9.9');
  });
  it('the 2F CSS block uses only #000 and #fff, no transition or animation', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const block = css.slice(css.indexOf('/* @node: F9.9'));
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/transition|animation/);
    for (const c of block.match(/#[0-9a-f]{3,6}\b|rgb|hsl/gi) ?? []) expect(['#000', '#fff']).toContain(c.toLowerCase());
  });
});
