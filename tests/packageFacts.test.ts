// @node: F9.3
import { describe, expect, it } from 'vitest';
import { readPackageFacts } from '../src/journal/packageFacts';

const pkg = (content: string, path = 'package.json') => readPackageFacts([{ path, content }]);
const SECRET = 'ghp_' + 'Q'.repeat(36);

describe('readPackageFacts', () => {
  it('reads the name, script names, and dependency names only', () => {
    const f = pkg(JSON.stringify({ name: 'shop', version: '9.9.9', scripts: { dev: `vite --token ${SECRET}`, build: 'vite build' }, dependencies: { react: '^18' }, devDependencies: { vite: '^5', react: '^18' } }));
    expect(f).toEqual({ name: 'shop', scripts: ['build', 'dev'], dependencies: ['react', 'vite'] });
    expect(JSON.stringify(f)).not.toContain(SECRET);
    expect(JSON.stringify(f)).not.toContain('^18');
  });
  it('survives bad JSON, a non-object, missing sections, and a huge file', () => {
    expect(pkg('{ not json')).toEqual({ scripts: [], dependencies: [] });
    expect(pkg('[1,2]')).toEqual({ scripts: [], dependencies: [] });
    expect(pkg('"text"')).toEqual({ scripts: [], dependencies: [] });
    expect(pkg('{}')).toEqual({ scripts: [], dependencies: [] });
    const big = JSON.stringify({ name: 'x', description: 'y'.repeat(200 * 1024) });
    const t = performance.now();
    expect(pkg(big).name).toBe('x');
    expect(performance.now() - t).toBeLessThan(1000);
  });
  it('caps the lists at 50 names and uses the shallowest package.json', () => {
    const deps = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`dep${String(i).padStart(2, '0')}`, '1']));
    expect(pkg(JSON.stringify({ dependencies: deps, scripts: deps })).dependencies).toHaveLength(50);
    expect(readPackageFacts([{ path: 'a/package.json', content: '{"name":"inner"}' }, { path: 'package.json', content: '{"name":"root"}' }]).name).toBe('root');
    expect(readPackageFacts([]).scripts).toEqual([]);
  });
});
