// @node: F12.8
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoveragePanel } from '../src/components/CoveragePanel';
import { BUDGETS } from '../src/config/budgets';
import { runIngestion } from '../src/engine/ingestPipeline';
import { fakeGithub, image } from './helpers/tinyImages';

describe('Coverage panel and pictures', () => {
  it('shows pictures loaded, too large, and over budget in plain words, and no picture bytes', async () => {
    const page = '<img src="a.png"><img src="big.png"><img src="c.png">';
    const gh = fakeGithub({ files: { 'index.html': page, 'a.png': image('png', 2048), 'big.png': image('png', 200 * 1024), 'c.png': image('png', 1024) } });
    const snapshot = await runIngestion({ owner: 'o', repo: 'r' }, { fetch: gh.fetch, budgets: { ...BUDGETS, maxImages: 1 }, now: () => 1 });
    const m = renderToStaticMarkup(createElement(CoveragePanel, { snapshot, busy: false, onLoadFolders: () => undefined }));
    expect(m).toContain('Pictures loaded (preview only)');
    expect(m).toContain('1 (2 KB)');
    expect(m).toContain('Pictures too large (placeholder)');
    expect(m).toContain('Pictures over the picture budget (placeholder)');
    expect(m).not.toContain(snapshot.media![0]!.base64);
  });
  it('shows no picture rows for a repository with no pictures', async () => {
    const gh = fakeGithub({ files: { 'index.html': '<p>x</p>' } });
    const snapshot = await runIngestion({ owner: 'o', repo: 'r' }, { fetch: gh.fetch, budgets: BUDGETS, now: () => 1 });
    expect(renderToStaticMarkup(createElement(CoveragePanel, { snapshot, busy: false, onLoadFolders: () => undefined }))).not.toContain('Pictures');
  });
});
