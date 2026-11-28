// @node: F12.13
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/engine/analyzeProject';
import { setCssProbe } from '../src/engine/checks/cssProbe';
import { redact } from '../src/engine/redact';
import { buildStaticPreview } from '../src/preview/previewDocument';
import { buildRecord } from '../src/store/workStorage';
import { scanProject } from '../src/engine/scanProject';
import { dropsRulesWith } from './helpers/fakeCssProbe';
import { box } from './helpers/lintFixtures';
import { createGate } from './helpers/lintHarness';
import { snapshotOf } from './helpers/analyzeFixture';

const KEY = 'AKIAABCDEFGHIJKLMNOP';
const TEXT = 'PRIVATE_SENTINEL_TEXT';

describe('sentinels never leave the check results', () => {
  it('a secret or private text in JavaScript, HTML, CSS, an identifier, an id, or an address never reaches an extra, a blocked line, or an error', async () => {
    setCssProbe(dropsRulesWith('BADRULE'));
    const files = {
      'a.js': `let ${KEY} = 1;\nlet ${KEY} = 2;\nvar s = "${KEY}";\nvar = ;\n`,
      'b.html': `<p id="${KEY}">${TEXT}</p>\n<p id="${KEY}"></p>\n<div>\n<span>${TEXT}\n</div>\n<img alt="${TEXT}">\n<style>\n.${KEY} { BADRULE: ${TEXT} }\n</style>\n<script>\nvar x = "${TEXT}" +;\n</script>\n<link rel="stylesheet" href="http://x.test/a.css?token=${KEY}"><img src="http://x.test/a.png?token=${KEY}">\n`,
      'c.css': `.${KEY} { color: red\n`,
      'd.tsx': `const a = <p>${TEXT}</p>;\nfunction f() {\n  const k = "${KEY}";\n`,
    };
    const snapshot = snapshotOf(files);
    const analysis = await analyzeProject(snapshot, { yieldToMain: async () => undefined });
    const content = new Map(snapshot.files.map((f) => [f.path, f.content]));
    const r = await scanProject({ snapshot, analysis, corrections: {}, effective: (p) => content.get(p) }, { yieldToMain: async () => undefined });
    setCssProbe(null);
    expect(r.findings.length).toBeGreaterThan(5);
    for (const f of r.findings) {
      expect(f.extra ?? '', f.id).not.toContain(KEY);
      expect(f.extra ?? '', f.id).not.toContain(TEXT);
      expect(JSON.stringify(f), f.id).not.toContain(KEY);
    }
    const preview = buildStaticPreview({ entryPath: 'b.html', effective: (p) => content.get(p), loaded: new Set(content.keys()), scripts: false, nonce: '0123456789abcdef', origin: 'http://a' });
    if (!preview.ok) throw new Error(preview.reason);
    const blocked = JSON.stringify(preview.report.blocked);
    expect(blocked).not.toContain(KEY);
    expect(blocked).not.toContain(TEXT);
    expect(blocked).not.toContain('token=');
    expect(redact(blocked).count).toBe(0);
  });
});

describe('sentinels never reach the Log, the saved record, the recipe message, or an error', () => {
  it('through a Full check and a kept recipe', async () => {
    const html = `<p>${TEXT}</p>\n<button class="b">Go</button>\n<p>c</p>\n\n\n\n\n\n<p id="${KEY}">far away</p>\n`;
    const g = createGate({
      html,
      measure: (content, elements) => elements.map((e) => (e.tag === 'button'
        ? box({ id: e.id, tag: 'button', hasText: true, width: /min-height: 44px/.test(content) ? 44 : 30, height: /min-height: 44px/.test(content) ? 44 : 30 })
        : box({ id: e.id, tag: e.tag, hasText: true, width: 300, height: 20 }))),
    });
    await g.open();
    const f = g.layout().findings.find((x) => x.measure?.kind === 'tap-target')!;
    g.recipe.actions.start(f.id);
    await g.settle();
    const s = g.store.getState();
    expect(s.preview.recipe!.status).toBe('kept');
    const spoken = JSON.stringify([s.log, s.preview.recipe, s.preview.layout.findings.map((x) => [x.extra, x.measure, x.confidence]), s.preview.layout.cantMeasure]);
    expect(spoken).not.toContain(KEY);
    expect(spoken).not.toContain(TEXT);
    const record = JSON.stringify(buildRecord(s, 1));
    expect(record).not.toContain(KEY);
    g.dispose();
  });
  it('a recipe next to a likely secret is refused with a plain reason that does not repeat the secret', async () => {
    const html = `<p>a</p>\n<button class="b">Go</button>\n<p>${KEY}</p>\n`;
    const g = createGate({ html, measure: (_content, els) => els.map((e) => box({ id: e.id, tag: e.tag, hasText: true, width: e.tag === 'button' ? 30 : 300, height: e.tag === 'button' ? 30 : 20 })) });
    await g.open();
    const f = g.layout().findings.find((x) => x.measure?.kind === 'tap-target')!;
    g.recipe.actions.start(f.id);
    const s = g.store.getState();
    expect(s.preview.recipe).toMatchObject({ status: 'refused', message: expect.stringContaining('likely secret') });
    expect(JSON.stringify([s.log, s.preview.recipe])).not.toContain(KEY);
    expect(s.work.applied).toHaveLength(0);
    g.dispose();
  });
});
