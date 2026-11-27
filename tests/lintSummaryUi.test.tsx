// @node: F12.11
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FindingDetail } from '../src/components/FindingDetail';
import { LayoutFixList } from '../src/components/EditPads';
import { LintSummary, STATIC_RENDER_NOTE } from '../src/components/LintSummary';
import type { Finding } from '../src/engine/scanFindingTypes';
import { idlePreview } from '../src/store/previewSlice';

const html = (e: React.ReactElement) => renderToStaticMarkup(e);
const f = (over: Partial<Finding>): Finding => ({
  id: 'x', skillId: 'scan.frontend.tap-target', primary: 'frontend', areas: ['frontend'], severity: 'medium', certainty: 'found', fix: 'guided', path: 'index.html', firstLine: 3, lastLine: 3,
  snippet: ['<button>x</button>'], extra: 'Tap target is 30 px high and 30 px wide (needs at least 44 px each way), measured at 375 px wide preview (static render, scripts off)', confidence: 'high', measure: { kind: 'tap-target', value: 30, limit: 44 }, ...over,
});
const layout = (over: Partial<ReturnType<typeof idlePreview>['layout']>) => ({ ...idlePreview().layout, ...over });

describe('LintSummary', () => {
  it('always says what the measuring is: a static render with scripts off', () => {
    for (const status of ['idle', 'running', 'stopped'] as const) expect(html(createElement(LintSummary, { layout: layout({ status }) }))).toContain(STATIC_RENDER_NOTE);
    expect(STATIC_RENDER_NOTE).toBe('Static render (scripts off): pages built by JavaScript are not measured.');
  });
  it('done: counts per check, what could not be measured and why, and an outside-style note', () => {
    const m = html(createElement(LintSummary, {
      layout: layout({ status: 'done', widths: [375, 768, 1024], findings: [f({}), f({ id: 'y' }), f({ id: 'z', measure: { kind: 'contrast', value: 2, limit: 4.5 } })], cantMeasure: { picture: 4, picture_loading: 1 }, outsideStyleFailed: 2 }),
    }));
    expect(m).toContain('Buttons or links too small to tap: 2');
    expect(m).toContain('Text with low contrast: 1');
    expect(m).toContain('Could not measure: 5 (colour over a gradient or picture: 4; pictures still loading: 1).');
    expect(m).toContain('An outside style could not be loaded, so measurements may differ.');
  });
  it('done with nothing: no list and no can\'t-measure line (never a "no problems" claim)', () => {
    const m = html(createElement(LintSummary, { layout: layout({ status: 'done', findings: [], cantMeasure: {} }) }));
    expect(m).not.toContain('<ul>');
    expect(m).not.toContain('Could not measure');
    expect(m.toLowerCase()).not.toContain('no problems');
  });
  it('a stopped check shows no results', () => {
    expect(html(createElement(LintSummary, { layout: layout({ status: 'stopped', message: 'stopped' }) }))).not.toContain('Could not measure');
  });
});

describe('finding views', () => {
  it('the finding detail shows confidence in words and the static-render label for measured checks', () => {
    const m = html(createElement(FindingDetail, { finding: f({}) }));
    expect(m).toContain('Confidence: high.');
    expect(m).toContain('Measured in the preview (static render, scripts off: pages built by JavaScript are not measured), not read from the code.');
    expect(html(createElement(FindingDetail, { finding: f({ confidence: 'low' }) }))).toContain('This is a hint: PatchBay cannot be sure.');
  });
  it('a text finding shows no confidence line', () => {
    const m = html(createElement(FindingDetail, { finding: { ...f({}), skillId: 'scan.frontend.img-alt', confidence: undefined, measure: undefined } }));
    expect(m).not.toContain('Confidence:');
  });
  it('the Edit panel list shows confidence and offers "Try a fix" only for the overflow check', () => {
    const m = html(createElement(LayoutFixList, { findings: [f({}), f({ id: 'o', skillId: 'scan.frontend.layout-overflow', confidence: 'high', measure: undefined, extra: 'Text is wider than its box: content 500 px in a box 300 px wide, measured at 375 px wide preview' })], isWorkbench: false, status: '', canCheck: true, onCheck: () => undefined, onCheckAll: () => undefined, onTry: () => undefined }));
    expect(m).toContain('Confidence: high.');
    expect((m.match(/Try a fix/g) ?? []).length).toBe(1);
  });
});
