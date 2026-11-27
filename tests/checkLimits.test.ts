// @node: F12.1
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECK_LIMITS } from '../src/config/checkLimits';
import { FONT_HOSTS, SCRIPT_HOSTS, STYLE_HOSTS } from '../src/config/previewHosts';
import { PREVIEW_LIMITS } from '../src/config/previewLimits';
import { SKILLBOOK } from '../src/skillbook';

describe('3B-1 limits and host lists', () => {
  it('limits are provisional and match the design', () => {
    expect(CHECK_LIMITS).toMatchObject({ provisional: true, maxInlineScripts: 20, maxCssRules: 500, maxCssFindings: 20, maxHtmlFindings: 10, maxBalanceFindings: 3, maxFixChars: 8, maxFixDiffChars: 2000, maxSelectorChars: 40 });
    expect(PREVIEW_LIMITS).toMatchObject({ provisional: true, layoutMs: 6000, maxDocBytes: 3 * 1024 * 1024, maxEmbeddedMediaBytes: 2 * 1024 * 1024, assetsWaitMs: 3000, fontsWaitMs: 1500, tapMinPx: 44, smallTextPx: 12, contrastNormal: 4.5, contrastLarge: 3, overlapMinArea: 16, overlapMinShare: 0.15, maxChildrenPerParent: 60, maxPairs: 20000, mobileMaxWidth: 768, maxPerKind: 25 });
  });
  it('the three host lists are exactly the approved ones', () => {
    expect([...STYLE_HOSTS]).toEqual(['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com']);
    expect([...FONT_HOSTS]).toEqual(['fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com']);
    expect([...SCRIPT_HOSTS]).toEqual(['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'code.jquery.com', 'cdn.tailwindcss.com']);
    for (const h of [...STYLE_HOSTS, ...FONT_HOSTS, ...SCRIPT_HOSTS]) expect(h).toMatch(/^[a-z0-9.-]+$/);
  });
  it('acorn is a runtime dependency with a caret range', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.acorn).toMatch(/^\^8\./);
  });
  it('the 12 new skills have the planned severity, certainty, fix, and kind', () => {
    const want: Record<string, [string, string, string, boolean]> = {
      'scan.frontend.js-syntax': ['high', 'found', 'auto', false], 'scan.frontend.balance': ['medium', 'possible', 'guided', false],
      'scan.frontend.html-structure': ['medium', 'found', 'auto', false], 'scan.frontend.html-id-duplicate': ['medium', 'found', 'guided', false],
      'scan.frontend.html-attr-missing': ['low', 'found', 'guided', false], 'scan.frontend.css-possible-invalid': ['low', 'possible', 'guided', false],
      'scan.frontend.css-braces': ['medium', 'found', 'guided', false], 'scan.frontend.layout-overlap': ['low', 'possible', 'guided', true],
      'scan.frontend.tap-target': ['medium', 'found', 'guided', true], 'scan.frontend.text-small': ['low', 'found', 'guided', true],
      'scan.frontend.contrast': ['medium', 'found', 'guided', true], 'scan.frontend.media-unsized': ['low', 'possible', 'guided', true],
    };
    for (const [id, [sev, cert, fix, measured]] of Object.entries(want)) {
      const s = SKILLBOOK.scan.find((x) => x.id === id)!;
      expect(s, id).toBeDefined();
      expect([s.severity, s.certainty, s.fix, s.kind === 'measured']).toEqual([sev, cert, fix, measured]);
      expect(s.primary).toBe('frontend');
      expect(s.also).toEqual(measured || id.includes('overlap') ? [] : ['backend']);
    }
  });
});
