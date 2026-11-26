// @node: F5.10
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConnectionsTable } from '../src/components/ConnectionsTable';
import { FileLabelsTable } from '../src/components/FileLabelsTable';
import { LabelEditor } from '../src/components/LabelEditor';
import { LoadingScene } from '../src/components/LoadingScene';
import { StudioLayout } from '../src/components/StudioLayout';
import { UnderstandingSection } from '../src/components/UnderstandingSection';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { applyCorrections } from '../src/engine/understandingView';
import { layoutStore } from '../src/hooks/useLayout';
import { DEFAULT_LAYOUT } from '../src/store/layoutSlice';
import { idleUnderstanding, understandingDone, understandingFailed } from '../src/store/understandingSlice';
import { beginIngestion, completeIngestion, initialState, studioStore } from '../src/store/useStudioStore';

const noop = () => undefined;
const snapshot = buildSampleSnapshot('fullstack-api', 1);
const result = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const section = (state = understandingDone(result)) =>
  html(createElement(UnderstandingSection, { state, onRun: noop, onCancel: noop, onSetLabels: () => null, onRemove: noop, onClear: noop }));
const buttons = (m: string) => [...m.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((x) => x[1]);

describe('UnderstandingSection', () => {
  it('shows the heading, up-to-date state, and a summary with Security pending, never a number', () => {
    const m = section();
    expect(m).toContain('Project understanding');
    expect(m).toContain('Analysis is up to date.');
    expect(m).toMatch(/<th scope="row">Security<\/th><td>pending scan \(2D\)<\/td>/);
    expect(m).toContain('Needs Review');
    expect(m).toContain('No files need review.');
  });
  it('running shows progress and Cancel; failed shows the message and Try again; idle shows Run again', () => {
    expect(section({ ...idleUnderstanding(), status: 'running', progress: { done: 3, total: 9 } })).toContain('Analysing 3 of 9 files.');
    expect(buttons(section({ ...idleUnderstanding(), status: 'running' }))).toContain('Cancel');
    const failed = section(understandingFailed('The analysis could not finish.'));
    expect(failed).toContain('Analysis failed: The analysis could not finish.');
    expect(buttons(failed)).toContain('Try again');
    expect(buttons(section(idleUnderstanding()))).toContain('Run again');
  });
  it('a partial result shows the partial line at the top and every reason', () => {
    const partial = { ...result, coverage: { ...result.coverage, partial: true, partialReasons: ['Time limit (8 seconds) reached: 5 files were not analysed.'] } };
    const m = section(understandingDone(partial));
    expect(m).toContain('Partial result: Time limit (8 seconds) reached: 5 files were not analysed.');
    expect(m.indexOf('Partial result')).toBeLessThan(m.indexOf('Summary'));
  });
  it('the blocks are collapsible details; Needs Review is open only when it has entries', () => {
    const m = section();
    expect(m).toMatch(/<details><summary>Files \(/);
    expect(m).toMatch(/<details><summary>Connections \(/);
    expect(m).toMatch(/<details><summary>What was and was not scanned/);
    expect(m).toMatch(/<details><summary>Needs Review \(0\)/);
    const unknown = { ...result, files: result.files.map((f) => (f.path === 'README.md' ? { ...f, labels: ['unknown' as const], confidence: 'low' as const, needsReview: true, evidence: [{ source: 'path' as const, description: 'No clue found.' }] } : f)) };
    expect(section(understandingDone(unknown))).toMatch(/<details open=""><summary>Needs Review \(1\)/);
  });
  it('coverage note lists externals, alias imports, and Django when seen', () => {
    const m = section(understandingDone({ ...result, externals: ['express'], coverage: { ...result.coverage, djangoUrlFilesSeen: true, notScanned: { go: 2 }, aliasImportsNotFollowed: 3 } }));
    expect(m).toContain('External packages (1): express');
    expect(m).toContain('Alias imports not followed: 3.');
    expect(m).toContain('Django URL files are not followed.');
    expect(m).toContain('.go: 2 files, connections not scanned for this language.');
  });
  it('Clear my label corrections shows only when corrections exist', () => {
    expect(buttons(section())).not.toContain('Clear my label corrections');
    expect(buttons(section(understandingDone(result, { 'README.md': ['backend'] })))).toContain('Clear my label corrections');
  });
  it('does not render anything for text that looks like markup', () => {
    const evil = { ...result, files: result.files.map((f, i) => (i === 0 ? { ...f, path: '<img src=x onerror=1>' } : f)), externals: ['<script>x</script>'] };
    const m = section(understandingDone(evil));
    expect(m).not.toContain('<img');
    expect(m).not.toContain('<script>x');
    expect(m).toContain('&lt;img');
  });
});

describe('tables and editor', () => {
  const files = applyCorrections(result, { 'README.md': ['backend'] });
  it('Files table: headers, Why?, Set labels, corrected row shows Before your change, not-scanned note', () => {
    const m = html(createElement(FileLabelsTable, { files, notScannedExt: new Set(['md']), onEdit: noop }));
    expect(m).toContain('<th scope="col">Path</th>');
    expect(m).toContain('<summary>Why?</summary>');
    expect(m).toContain('(set by you)');
    expect(m).toContain('Before your change:');
    expect(m).toContain('Connections not scanned for this language.');
    expect(buttons(m)).toContain('Set labels');
  });
  it('Files table shows at most 200 rows and Show more', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ ...files[0]!, path: `f${i}.txt` }));
    const m = html(createElement(FileLabelsTable, { files: many, notScannedExt: new Set<string>(), onEdit: noop }));
    expect((m.match(/<tr>/g) ?? []).length).toBe(201);
    expect(buttons(m)).toContain('Show more');
    expect(m).toContain('Showing 200 of 250.');
  });
  it('Connections table: words for certainty, line, note, empty state', () => {
    const m = html(createElement(ConnectionsTable, { edges: result.edges }));
    expect(m).toContain('Confirmed');
    expect(m).toContain('<th scope="col">Certainty</th>');
    expect(html(createElement(ConnectionsTable, { edges: [] }))).toContain('No connections were found.');
    const inferred = { ...result.edges[0]!, certainty: 'inferred' as const, note: 'maybe' };
    expect(html(createElement(ConnectionsTable, { edges: [inferred] }))).toContain('Inferred');
  });
  it('Label editor: one checkbox per selectable label, Save, Cancel, Remove only when corrected, error shown', () => {
    const m = html(createElement(LabelEditor, { path: 'a.js', current: ['backend'], corrected: true, error: 'Correction limit reached (500). Remove one to add another.', onSave: noop, onCancel: noop, onRemove: noop }));
    expect((m.match(/type="checkbox"/g) ?? []).length).toBe(9);
    expect(m).toContain('Images and fonts');
    expect(m).toContain('Remove my change');
    expect(m).toContain('Correction limit reached (500).');
    expect(m).toContain('checked=""');
    expect(html(createElement(LabelEditor, { path: 'a.js', current: [], corrected: false, onSave: noop, onCancel: noop, onRemove: noop }))).not.toContain('Remove my change');
  });
});

describe('wiring and static checks', () => {
  beforeEach(() => {
    layoutStore.setState(DEFAULT_LAYOUT);
    const target = { owner: 'sample', repo: 'x', source: 'sample' as const, sampleId: 'x' };
    let s = beginIngestion(initialState(), target, 1);
    s = completeIngestion(s, s.ingestion.runId, snapshot, 2, understandingDone(result));
    studioStore.setState(s);
  });
  afterEach(() => studioStore.setState(initialState()));
  it('the section sits below the Sandbox and the coverage panel and above the inventory', () => {
    const actions = { run: noop, cancel: noop, setLabels: () => null, removeCorrection: noop, clearCorrections: noop };
    const m = html(createElement(StudioLayout, { onLoadFolders: noop, onCancel: noop, onRetry: noop, onDismissError: noop, onBack: noop, assistant: { send: () => null, cancel: noop, clear: noop }, understanding: actions }));
    const i = (t: string) => m.indexOf(t);
    expect(i('Sandbox')).toBeGreaterThan(-1);
    expect(i('Sandbox')).toBeLessThan(i('Project understanding'));
    expect(i('Project understanding')).toBeLessThan(i('Inventory ('));
    const none = html(createElement(StudioLayout, { onLoadFolders: noop, onCancel: noop, onRetry: noop, onDismissError: noop, onBack: noop, assistant: { send: () => null, cancel: noop, clear: noop } }));
    expect(none).not.toContain('Project understanding');
  });
  it('Loading screen lists Classify files after Load source files with progress', () => {
    const target = { owner: 'sample', repo: 'x', source: 'sample' as const, sampleId: 'x' };
    let s = beginIngestion(initialState(), target, 1);
    s = { ...s, ingestion: { ...s.ingestion, stages: { ...s.ingestion.stages, classifying: 'active' }, classifyProgress: { done: 4, total: 9 } } };
    studioStore.setState(s);
    const m = html(createElement(LoadingScene, { onCancel: noop, onRetry: noop, onSample: noop, onBack: noop }));
    expect(m.indexOf('Load source files')).toBeLessThan(m.indexOf('Classify files'));
    expect(m.indexOf('Classify files')).toBeLessThan(m.indexOf('Prepare preview'));
    expect(m).toContain('(4 of 9 files)');
    expect(m).toContain('Prepare preview</strong>: not available yet');
  });
  it('new files carry the node tag; no dangerous HTML; the CSS block is black and white without motion', () => {
    for (const f of ['UnderstandingSection', 'FileLabelsTable', 'ConnectionsTable', 'LabelEditor']) {
      const src = readFileSync(`src/components/${f}.tsx`, 'utf8');
      expect(src).toContain('@node: F5.10');
      expect(src).not.toContain('dangerouslySetInnerHTML');
    }
    const css = readFileSync('src/styles.css', 'utf8');
    const block = css.slice(css.indexOf('/* @node: F5.10'));
    expect(block).not.toMatch(/transition|animation|rgb|hsl/);
    for (const c of block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) expect(['#000', '#fff']).toContain(c.toLowerCase());
  });
});
