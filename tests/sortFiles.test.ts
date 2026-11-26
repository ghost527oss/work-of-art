// @node: F5.4
import { describe, expect, it } from 'vitest';
import { analyze, labelsOf } from './helpers/analyzeFixture';

describe('sorting rules', () => {
  it('a plain .js or .ts file with no clue goes to Needs Review (no guessing)', async () => {
    const r = await analyze({ 'lib/util.js': 'export const a = 1;\n', 'lib/more.ts': 'export const b = 2;\n' });
    for (const p of ['lib/util.js', 'lib/more.ts']) {
      const f = labelsOf(r, p);
      expect(f.labels).toEqual(['unknown']);
      expect(f.needsReview).toBe(true);
      expect(f.confidence).toBe('low');
      expect(f.evidence[0]!.description).toContain('No clue found');
    }
  });
  it('a test file that imports fs is not also Backend (suppression)', async () => {
    const r = await analyze({ 'src/a.test.ts': "import fs from 'fs';\nimport { it } from 'vitest';\n" });
    expect(labelsOf(r, 'src/a.test.ts').labels).toEqual(['tests']);
  });
  it('a folder or file name never gives shared', async () => {
    const r = await analyze({ 'shared/common.ts': 'export const x = 1;\n' });
    expect(labelsOf(r, 'shared/common.ts').labels).not.toContain('shared');
  });
  it('shared comes only from import proof: imported by a frontend and a backend file', async () => {
    const r = await analyze({
      'package.json': '{"dependencies":{"react":"1","express":"1"}}',
      'web/page.tsx': "import { x } from '../lib/util';\nimport React from 'react';\nexport const P = () => x;\n",
      'server/app.js': "const express = require('express');\nconst { x } = require('../lib/util');\nexpress();\n",
      'lib/util.js': 'exports.x = 1;\n',
      'lib/other.js': 'exports.y = 2;\n',
    });
    const util = labelsOf(r, 'lib/util.js');
    expect(util.labels).toEqual(['shared']);
    expect(util.evidence.some((e) => e.description.includes('sort.ref.shared') && e.description.includes('web/page.tsx'))).toBe(true);
    expect(labelsOf(r, 'lib/other.js').labels).toEqual(['unknown']);
  });
  it('a file imported only by frontend files is not shared', async () => {
    const r = await analyze({
      'package.json': '{"dependencies":{"react":"1"}}',
      'web/a.tsx': "import { x } from '../lib/util';\nimport React from 'react';\n",
      'web/b.tsx': "import { x } from '../lib/util';\nimport React from 'react';\n",
      'lib/util.js': 'exports.x = 1;\n',
    });
    expect(labelsOf(r, 'lib/util.js').labels).toEqual(['unknown']);
  });
  it('a file with no content is sorted by path only with the fixed reason, and a strong path clue can still be High', async () => {
    const r = await analyze({ 'img/a.png': { size: 100 } });
    const f = labelsOf(r, 'img/a.png');
    expect(f.basis).toBe('path_only');
    expect(f.confidence).toBe('high');
    expect(f.evidence.at(-1)!.description).toBe('Not read; sorted by its path and type.');
  });
  it('ignored files are counted, have a reason, and never need review', async () => {
    const r = await analyze({ 'node_modules/x/index.js': 'x', 'package-lock.json': { size: 90000 }, 'a.md': '# a' });
    const ig = r.files.filter((f) => f.ignored);
    expect(ig.map((f) => f.path)).toEqual(['node_modules/x/index.js', 'package-lock.json']);
    for (const f of ig) { expect(f.needsReview).toBe(false); expect(f.ignoredReason).toMatch(/^Not part of the project's own code: /); expect(f.labels).toEqual([]); }
    expect(r.coverage.ignored).toBe(2);
  });
  it('evidence never holds source lines and cuts details to 120 characters', async () => {
    const long = 'a'.repeat(300);
    const r = await analyze({ 'src/x.js': `import z from '${long}';\nconst secretCode = 'PRIVATE LINE';\nfetch('/api/${long}');\n` });
    const text = JSON.stringify(labelsOf(r, 'src/x.js'));
    expect(text).not.toContain('PRIVATE LINE');
    expect(text).not.toContain('a'.repeat(130));
  });
  it('is the same on every run', async () => {
    const files = { 'a/b.js': "document.title='x'", 'c.py': 'import flask\n', 'README.md': '# x' };
    expect(JSON.stringify((await analyze(files)).files)).toBe(JSON.stringify((await analyze(files)).files));
  });
});
