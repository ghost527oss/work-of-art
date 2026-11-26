// @node: F10.6
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingScene } from '../src/components/LoadingScene';
import { ResetSessionButton, ResetSessionView, RESET_CONFIRM } from '../src/components/ResetSessionButton';
import { KEPT_LINE, RestoreNotice } from '../src/components/RestoreNotice';
import { ResumeBanner } from '../src/components/ResumeBanner';
import { PRIVACY_LINE, SavedDataPanel } from '../src/components/SavedDataPanel';
import { StartScreen } from '../src/components/StartScreen';
import { StudioLayout } from '../src/components/StudioLayout';
import { buildSampleSnapshot } from '../src/data/sampleRepos';
import type { SessionRecord, SavedRow } from '../src/store/sessionRecord';
import { beginIngestion, completeIngestion, failIngestion, initialState, studioStore } from '../src/store/useStudioStore';

const noop = () => undefined;
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const buttons = (h: string) => [...h.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1]!);
const rec: SessionRecord = { version: 1, savedAt: 0, target: { source: 'github', owner: 'octo', repo: 'shop', ref: 'main' }, screen: { screen: 'studio' }, preview: { width: 768, mode: 'auto' }, notes: { crewWasActive: false, previewOnlyCount: 0 } };
const rows = (filled: boolean): SavedRow[] => ['patchbay.session.v1', 'patchbay.work.v1', 'patchbay.corrections.v1', 'patchbay.studio-layout.v1', 'patchbay.journal.v1'].map((key, i) => ({ key, label: `L${i}`, bytes: filled ? 100 + i : null }));
afterEach(() => studioStore.setState(initialState()));

describe('components', () => {
  it('ResumeBanner: with a record, without, and while restoring', () => {
    const h = html(createElement(ResumeBanner, { record: rec, restoring: false, onResume: noop, onReset: noop, formatTime: () => 'T' }));
    expect(h).toContain('Last session: octo/shop at main, saved T.');
    expect(buttons(h)).toEqual(['Resume last session', 'Reset session']);
    expect(html(createElement(ResumeBanner, { restoring: false, onResume: noop, onReset: noop }))).toBe('');
    expect(html(createElement(ResumeBanner, { record: rec, restoring: true, onResume: noop, onReset: noop }))).toBe('');
  });
  it('an owner that looks like markup is escaped', () => {
    const h = html(createElement(ResumeBanner, { record: { ...rec, target: { ...rec.target, owner: '<img src=x>' } }, restoring: false, onResume: noop, onReset: noop, formatTime: () => 'T' }));
    expect(h).toContain('&lt;img src=x&gt;');
    expect(h).not.toContain('<img');
  });
  it('SavedDataPanel: five rows with sizes or "nothing saved", the privacy sentence, the Reset button; closed by default', () => {
    const h = html(createElement(SavedDataPanel, { rows: rows(true), onReset: noop }));
    expect(h).toMatch(/^<details class="saved-data"><summary>Saved in this browser<\/summary>/);
    expect(h).toContain(PRIVACY_LINE);
    expect((h.match(/<li>/g) ?? []).length).toBe(5);
    expect(h).toContain('100 bytes');
    expect(buttons(h)).toEqual(['Reset session']);
    const e = html(createElement(SavedDataPanel, { rows: rows(false) }));
    expect((e.match(/nothing saved/g) ?? []).length).toBe(5);
    expect(buttons(e)).toEqual([]);
  });
  it('ResetSessionButton: the button, then the exact confirmation with Yes, reset and Cancel', () => {
    expect(buttons(html(createElement(ResetSessionButton, { onReset: noop })))).toEqual(['Reset session']);
    const c = html(createElement(ResetSessionButton, { onReset: noop, initialConfirming: true }));
    expect(c).toContain(RESET_CONFIRM);
    expect(RESET_CONFIRM).toBe('This clears your saved History, Log, label corrections, and session in this browser. Your repository is not changed.');
    expect(buttons(c)).toEqual(['Yes, reset', 'Cancel']);
  });
  it('only "Yes, reset" acts (handlers on the element tree)', () => {
    const calls: string[] = [];
    const v = ResetSessionView({ confirming: true, onAsk: () => calls.push('ask'), onYes: () => calls.push('yes'), onCancel: () => calls.push('cancel') }) as unknown as { props: { children: Array<{ props?: { onClick?: () => void; children?: unknown } }> } };
    const btns = v.props.children.filter((c) => c && typeof c === 'object' && c.props?.onClick);
    expect(btns.map((b) => b.props!.children)).toEqual(['Yes, reset', 'Cancel']);
    btns[1]!.props!.onClick!();
    expect(calls).toEqual(['cancel']);
    btns[0]!.props!.onClick!();
    expect(calls).toEqual(['cancel', 'yes']);
    const ask = ResetSessionView({ confirming: false, onAsk: () => calls.push('ask'), onYes: noop, onCancel: noop }) as unknown as { props: { onClick(): void } };
    ask.props.onClick();
    expect(calls.at(-1)).toBe('ask');
    // the stateful button only asks first; onReset runs only from "Yes, reset"
    const src = readFileSync('src/components/ResetSessionButton.tsx', 'utf8');
    expect(src).toContain('onAsk={() => setConfirming(true)} onYes={() => { setConfirming(false); onReset(); }} onCancel={() => setConfirming(false)}');
  });
  it('RestoreNotice: heading, line, and the kept sentence on failure', () => {
    const h = html(createElement(RestoreNotice, { record: rec, failedLoad: true }));
    expect(h).toContain('<h1>Restoring your session</h1>');
    expect(h).toContain('octo/shop at main. Your saved changes come back when the repository has loaded.');
    expect(h).toContain(KEPT_LINE);
    expect(KEPT_LINE).toBe('Your saved session is kept until you press Reset session or Back to Start.');
  });
  it('static checks: tagged, no raw HTML, black and white, no motion, no run-control buttons', () => {
    for (const f of ['ResumeBanner', 'SavedDataPanel', 'ResetSessionButton', 'RestoreNotice'].map((n) => `src/components/${n}.tsx`)) {
      const t = readFileSync(f, 'utf8');
      expect(t).toContain('@node: F10.6');
      for (const bad of ['dangerouslySetInnerHTML', 'innerHTML', 'eval(', 'fetch(', 'mockAssistant']) expect(t).not.toContain(bad);
      for (const b of ['>Apply<', '>Approve<', '>Reject<', '>Pause<', '>Resume<', '>Step<']) expect(t).not.toContain(b);
    }
    const css = readFileSync('src/styles.css', 'utf8');
    const block = css.slice(css.indexOf('/* @node: F10.6'));
    expect(block.length).toBeGreaterThan(50);
    expect(block).not.toMatch(/transition|animation/);
    for (const c of block.match(/#[0-9a-f]{3,6}\b|rgb|hsl/gi) ?? []) expect(['#000', '#fff']).toContain(c.toLowerCase());
  });
});

describe('wiring (seeded store, server render)', () => {
  it('Start screen: Resume banner and saved-data block only when expected; the notice', () => {
    const base = { onSubmit: () => null, onSample: noop };
    expect(html(createElement(StartScreen, base))).not.toContain('Saved in this browser');
    const s = { record: rec, restoring: false, notice: 'Session reset. Nothing from it is saved.', savedRows: rows(true), onResume: noop, onReset: noop };
    const h = html(createElement(StartScreen, { ...base, session: s }));
    expect(h).toContain('Last session: octo/shop at main');
    expect(h).toContain('Saved in this browser');
    expect(h).toContain('Session reset. Nothing from it is saved.');
    const none = html(createElement(StartScreen, { ...base, session: { ...s, record: undefined, notice: undefined, savedRows: rows(false) } }));
    expect(none).not.toContain('Last session');
    expect(buttons(none)).not.toContain('Reset session');
  });
  it('Loading screen: restore heading and Reset while pending; the kept sentence and four actions on failure; rate-limit time', () => {
    const target = { owner: 'octo', repo: 'shop', ref: 'main', source: 'github' as const };
    studioStore.setState(beginIngestion(initialState(), target, 1));
    const run = html(createElement(LoadingScene, { onCancel: noop, onRetry: noop, onSample: noop, onBack: noop, restore: { record: rec, onReset: noop } }));
    expect(run).toContain('<h1>Restoring your session</h1>');
    expect(run).not.toContain('Loading repository');
    expect(buttons(run)).toEqual(['Cancel', 'Reset session']);
    const runId = studioStore.getState().ingestion.runId;
    studioStore.setState(failIngestion(studioStore.getState(), runId, { code: 'rate_limited', message: 'Rate limited.', resetAt: '2026-11-24T12:00:00Z' }, 2));
    const f = html(createElement(LoadingScene, { onCancel: noop, onRetry: noop, onSample: noop, onBack: noop, restore: { record: rec, onReset: noop } }));
    expect(f).toContain('Your saved session is kept until you press Reset session or Back to Start.');
    expect(f).toContain('The rate limit resets at');
    expect(buttons(f)).toEqual(['Retry', 'Reset session', 'Back to Start', 'Use sample']);
    const plain = html(createElement(LoadingScene, { onCancel: noop, onRetry: noop, onSample: noop, onBack: noop }));
    expect(plain).toContain('Loading repository');
    expect(buttons(plain)).toEqual(['Retry', 'Back to Start', 'Use sample']);
  });
  it('Studio header: Back to Start then Reset session; Project info shows the saved-data block', () => {
    const snap = buildSampleSnapshot('static-site', 1);
    const t = { owner: 'sample', repo: 'static-site', source: 'sample' as const, sampleId: 'static-site' };
    const s1 = beginIngestion(initialState(), t, 1);
    studioStore.setState(completeIngestion(s1, s1.ingestion.runId, snap, 2));
    const h = html(createElement(StudioLayout, { onLoadFolders: noop, onCancel: noop, onRetry: noop, onDismissError: noop, onBack: noop, assistant: { send: () => null, cancel: noop, clear: noop } as never, session: { onReset: noop, savedRows: () => rows(true) } }));
    const b = buttons(h);
    expect(b.indexOf('Reset session')).toBe(b.indexOf('Back to Start') + 1);
    expect(h).toContain('Saved in this browser');
    const without = html(createElement(StudioLayout, { onLoadFolders: noop, onCancel: noop, onRetry: noop, onDismissError: noop, onBack: noop, assistant: { send: () => null, cancel: noop, clear: noop } as never }));
    expect(without).not.toContain('Reset session');
  });
});
