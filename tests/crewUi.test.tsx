// @node: F6.10
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandBar } from '../src/components/CommandBar';
import { FindingDetail } from '../src/components/FindingDetail';
import { StudioLayout } from '../src/components/StudioLayout';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import { analyzeProject } from '../src/engine/analyzeProject';
import { practiceContent } from '../src/engine/practiceScript';
import { scanProject } from '../src/engine/scanProject';
import { areaCounts, filterFindings, linksBetweenAreas, whatWasChecked } from '../src/engine/scanView';
import { applyCorrections } from '../src/engine/understandingView';
import { layoutStore } from '../src/hooks/useLayout';
import { shellStore } from '../src/hooks/useShell';
import { DEFAULT_LAYOUT } from '../src/store/layoutSlice';
import { idleScan } from '../src/store/scanSlice';
import { INITIAL_VIEW } from '../src/store/shellView';
import { understandingDone } from '../src/store/understandingSlice';
import { initialState, studioStore } from '../src/store/useStudioStore';
import { SKILLBOOK } from '../src/skillbook';
import { snapshotOf } from './helpers/analyzeFixture';

const noop = () => undefined;
const harness = { submitText: () => false, run: noop, stop: noop };
const scan = { ensure: noop, run: noop, cancel: noop };
const assistant = { send: () => null, cancel: noop, clear: noop };
const html = (e: React.ReactElement) => renderToStaticMarkup(e);
const buttons = (m: string) => [...m.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((x) => x[1]);

async function seed(files: Record<string, string>) {
  const snapshot = files ? snapshotOf(files) : buildSampleSnapshot('fullstack-api', 1);
  const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
  const result = await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => practiceContent(snapshot, [], p) }, { yieldToMain: async () => undefined });
  studioStore.setState({ ...initialState(), experience: 'studio', snapshot, understanding: understandingDone(analysis, {}), scan: { ...idleScan(), status: 'done', runId: 1, snapshotId: snapshot.id, result } });
  return { snapshot, analysis, result };
}
const render = () => html(createElement(StudioLayout, { onLoadFolders: noop, onCancel: noop, onRetry: noop, onDismissError: noop, onBack: noop, assistant, harness, scan }));

beforeEach(() => { layoutStore.setState(DEFAULT_LAYOUT); shellStore.setState(INITIAL_VIEW); });
afterEach(() => { studioStore.setState(initialState()); shellStore.setState(INITIAL_VIEW); });

describe('Screen 4', () => {
  it('shows the map, links, worker slots, Start Crew, the command box, and what was checked', async () => {
    await seed({ 'a.html': '<img src="a">\n<a href="x" target="_blank">x</a>\n' });
    shellStore.setState({ screen: 'skeleton' });
    const m = render();
    expect(m).toContain('Skeleton Crew');
    expect(m).toContain('stop-bar');
    expect(m).toContain('Scan is up to date: 2 findings from 16 checks over 1 files.');
    for (const a of ['Frontend', 'Backend', 'Security', 'APIs &amp; Data']) expect(m).toContain(`${a} crew`);
    expect(m).toContain('Workers take turns in this version.');
    expect(m).toContain('No findings from the checks that ran.');
    expect(m).toContain('High 0, Medium 1, Low 1');
    expect(m).toContain('All code files');
    expect(buttons(m)).toContain('Start Crew');
    expect(m).toContain('Type a command, for example help, start crew, pause, resume, step, stop, approve, reject, undo.');
    expect(m).toContain('What was and was not checked');
    expect(m).not.toContain('toolbar');
  });
  it('Start Crew is disabled with the reason while there is no scan', async () => {
    await seed({ 'a.html': '<p>x</p>\n' });
    studioStore.update((s) => ({ ...s, scan: idleScan() }));
    shellStore.setState({ screen: 'skeleton' });
    const m = render();
    expect(m).toMatch(/<button[^>]*disabled[^>]*>Start Crew<\/button>/);
    expect(m).toContain('Open Skeleton Crew and wait for the scan first.');
  });
  it('shows the stale, running, and failed scan lines', async () => {
    await seed({ 'a.html': '<p>x</p>\n' });
    shellStore.setState({ screen: 'skeleton' });
    studioStore.update((s) => ({ ...s, understanding: { ...s.understanding, corrections: { 'a.html': ['backend'] } } }));
    expect(render()).toContain('Out of date: labels changed.');
    studioStore.update((s) => ({ ...s, scan: { ...s.scan, status: 'running', progress: { done: 2, total: 5 } } }));
    expect(render()).toContain('Scanning 2 of 5 files.');
    studioStore.update((s) => ({ ...s, scan: { ...s.scan, status: 'failed', error: 'The scan could not finish.' } }));
    expect(render()).toContain('Scan failed: The scan could not finish.');
  });
});

describe('Screen 5', () => {
  it('lists findings with Details, "also in", and the request trace for APIs & Data', async () => {
    await seed({ 'a.html': '<img src="a">\n<a href="x" target="_blank">x</a>\n', 's.js': "const app = require('express')();\napp.get('/x', h);\n", 'c.js': "fetch('/x');\n" });
    shellStore.setState({ screen: 'domain', area: 'security' });
    const sec = render();
    expect(sec).toContain('Link opening a new tab without protection');
    expect(sec).toContain('Auto-supported');
    expect(sec).toContain('<th scope="col">Details</th>');
    expect(buttons(sec)).toContain('Details');
    expect(sec).toContain('Type undo to reverse the latest change.');
    shellStore.setState({ screen: 'domain', area: 'api_data' });
    expect(render()).toContain('Request trace');
    expect(render()).toContain('GET /x');
  });
  it('the finding detail shows proof and the certainty in words', async () => {
    const { result } = await seed({ 'a.html': '<img src="a">\n' });
    const m = html(createElement(FindingDetail, { finding: result.findings[0]! }));
    expect(m).toMatch(/<pre[^>]*>/);
    expect(m).toContain('Problem:');
    expect(m).toContain('Why it matters:');
    expect(m).toContain('Found by the check.');
    expect(m).toContain('scan.frontend.img-alt');
    const possible = html(createElement(FindingDetail, { finding: { ...result.findings[0]!, certainty: 'possible' } }));
    expect(possible).toContain('Possible: only the loaded files were read');
  });
  it('escapes markup-looking text in a snippet', async () => {
    const { result } = await seed({ 'a.html': '<img src="<script>alert(1)</script>">\n' });
    const m = html(createElement(FindingDetail, { finding: result.findings[0]! }));
    expect(m).not.toContain('<script>');
    expect(m).toContain('&lt;script&gt;');
  });
});

describe('command box and helpers', () => {
  it('shows the hint, replies, and Run', () => {
    const m = html(createElement(CommandBar, { onSubmit: () => false, replies: [{ id: 1, command: 'help', reply: 'ok', ok: true }], onOpened: noop }));
    expect(buttons(m)).toEqual(['Run']);
    expect(m).toContain('<strong>help</strong>: ok');
  });
  it('counts, filters, links, and the check list', async () => {
    const { result, analysis } = await seed({ 'a.html': '<img src="a">\n<a href="x" target="_blank">x</a>\n' });
    const c = areaCounts(result.findings);
    expect(c.unique).toBe(2);
    expect(c.byArea.frontend.medium).toBe(1);
    expect(c.byArea.security.low).toBe(1);
    expect(c.byArea.frontend.low).toBe(1);
    expect(filterFindings(result.findings, { severity: 'low' })).toHaveLength(1);
    expect(filterFindings(result.findings, { text: 'nope' })).toHaveLength(0);
    expect(linksBetweenAreas(analysis, applyCorrections(analysis, {}))).toEqual([]);
    const w = whatWasChecked(result);
    expect(w.checks).toHaveLength(16);
    expect(w.notCheckedLines).toHaveLength(3);
    expect(SKILLBOOK.scan).toHaveLength(16);
  });
  it('new files carry node tags; no dangerous HTML; the CSS block is black and white without motion', () => {
    for (const f of ['CommandBar', 'AreaMap', 'WorkerSlots', 'FindingsTable', 'FindingDetail', 'CrewNarration', 'RequestTrace', 'ChangesMade', 'WhatWasChecked']) {
      const src = readFileSync(`src/components/${f}.tsx`, 'utf8');
      expect(src).toMatch(/@node: F6\.\d+/);
      expect(src).not.toContain('dangerouslySetInnerHTML');
    }
    const css = readFileSync('src/styles.css', 'utf8');
    const block = css.slice(css.indexOf('/* @node: F6.10'));
    expect(block).not.toMatch(/transition|animation|rgb|hsl/);
    for (const c of block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) expect(['#000', '#fff']).toContain(c.toLowerCase());
  });
});
