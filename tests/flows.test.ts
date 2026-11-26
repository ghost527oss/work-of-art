// @node: F9.4
import { describe, expect, it } from 'vitest';
import { JOURNAL_LIMITS as L } from '../src/config/journalLimits';
import type { Edge } from '../src/engine/understandTypes';
import { buildFlows, describeStep, STOPS } from '../src/journal/flows';
import { checkLessonText } from '../src/journal/lessonRules';

let id = 0;
const e = (kind: Edge['kind'], from: string, target: string, extra: Partial<Edge> = {}): Edge => ({ id: `e${++id}`, kind, from, target, certainty: 'confirmed', line: 1, ...extra });
const flows = (edges: Edge[], loaded: string[] = [], alias = 0, inv: Array<{ path: string; reason: string }> = []) => buildFlows(edges, new Set(loaded), inv as never, undefined, alias);

describe('honest stops', () => {
  it('the fixed sentences are exactly the R4.4 text', () => {
    expect(STOPS.broken).toBe('Stopped: no route matches this address (Broken).');
    expect(STOPS.outside('api.x.test')).toBe('Stopped: this goes to an outside service (api.x.test), which PatchBay does not follow.');
    expect(STOPS.notLoaded('a.js', 'too large')).toBe('Stopped: a.js was not loaded (too large).');
    expect(STOPS.deep).toBe('Stopped: this goes more than 3 files deep, so PatchBay did not follow further.');
    expect(STOPS.noRoutes).toBe('Stopped: no backend routes were found in this repository; the route may live elsewhere.');
    expect(STOPS.noCaller).toBe('Nothing in the loaded files calls this route.');
  });
  it('broken call, outside service, no routes, not loaded, deep, no caller, alias note', () => {
    expect(flows([e('calls_api', 'a.js', 'GET /x', { certainty: 'broken' })]).flows[0]!.stop).toBe(STOPS.broken);
    expect(flows([e('calls_external', 'a.js', 'api.stripe.com')]).flows[0]!.stop).toBe(STOPS.outside('api.stripe.com'));
    expect(flows([e('calls_api', 'a.js', 'POST /s', { certainty: 'inferred', note: 'No backend routes were found.' })]).flows[0]!.stop).toBe(STOPS.noRoutes);
    const nl = flows([e('calls_api', 'a.js', 'GET /x', { targetPath: 'r.js' }), e('defines_route', 'r.js', 'GET /x'), e('imports', 'r.js', 'big.js', { targetPath: 'big.js' })], ['a.js', 'r.js'], 0, [{ path: 'big.js', reason: 'too large' }]);
    expect(nl.flows[0]!.stop).toBe(STOPS.notLoaded('big.js', 'too large'));
    const chain = ['r.js', 'l1.js', 'l2.js', 'l3.js', 'l4.js'];
    const deep = flows([e('calls_api', 'a.js', 'GET /x', { targetPath: 'r.js' }), e('defines_route', 'r.js', 'GET /x'), ...chain.slice(0, -1).map((p, i) => e('imports', p, chain[i + 1]!, { targetPath: chain[i + 1] }))], ['a.js', ...chain]);
    expect(deep.flows[0]!.stop).toBe(STOPS.deep);
    const lone = flows([e('defines_route', 'r.js', 'GET /lonely')], ['r.js']);
    expect(lone.flows[0]).toMatchObject({ kind: 'route', stop: STOPS.noCaller });
    expect(flows([e('calls_api', 'a.js', 'GET /x', { certainty: 'broken' })], [], 3).flows[0]!.notes).toEqual(['3 imports that use shortcuts such as @/ were not followed.']);
  });
  it('a setting flow says the value is never shown', () => {
    const f = flows([e('reads_config', 'server.js', 'PORT', { line: 7 })]).flows[0]!;
    expect(f).toMatchObject({ kind: 'setting', title: 'Setting: PORT', notes: ['The value is never shown.'] });
    expect(f.steps[0]).toMatchObject({ path: 'server.js', line: 7 });
  });
});

describe('limits, order, determinism, cycles', () => {
  it('20 requests, 20 settings, 3 pages, 30 flows, 12 steps, 8 files', () => {
    const edges: Edge[] = [];
    for (let i = 0; i < 25; i++) edges.push(e('calls_api', `c${String(i).padStart(2, '0')}.js`, `GET /x${i}`, { certainty: 'broken' }));
    for (let i = 0; i < 25; i++) edges.push(e('reads_config', 's.js', `VAR_${String(i).padStart(2, '0')}`));
    for (let i = 0; i < 5; i++) edges.push(e('loads', `p${i}.html`, `x${i}.css`, { targetPath: `x${i}.css` }));
    const r = flows(edges);
    const kinds = r.flows.map((f) => f.kind);
    expect(kinds.filter((k) => k === 'page')).toHaveLength(L.pageFlows);
    expect(r.flows).toHaveLength(L.maxFlows);
    expect(r.hidden).toBe(3 + 20 + 20 - 30);
    expect(kinds.indexOf('request')).toBeGreaterThan(kinds.lastIndexOf('page'));
    const many = Array.from({ length: 20 }, (_, i) => e('reads_config', `f${String(i).padStart(2, '0')}.js`, 'ONE'));
    expect(flows(many).flows[0]!.steps).toHaveLength(L.stepsPerFlow);
    const wide = [e('calls_api', 'a.js', 'GET /x', { targetPath: 'r.js' }), e('defines_route', 'r.js', 'GET /x'), ...Array.from({ length: 12 }, (_, i) => e('imports', 'r.js', `m${i}.js`, { targetPath: `m${i}.js` }))];
    const w = flows(wide, ['a.js', 'r.js', ...Array.from({ length: 12 }, (_, i) => `m${i}.js`)]).flows[0]!;
    expect(w.steps.filter((s) => s.kind === 'uses')).toHaveLength(L.requestFlowFiles);
    expect(w.stop).toBe(STOPS.deep);
  });
  it('same input twice and reversed gives equal output; import cycles do not loop', () => {
    const edges = [e('calls_api', 'a.js', 'GET /x', { targetPath: 'r.js' }), e('defines_route', 'r.js', 'GET /x'), e('imports', 'r.js', 'm.js', { targetPath: 'm.js' }), e('imports', 'm.js', 'r.js', { targetPath: 'r.js' }), e('reads_config', 'z.js', 'A'), e('reads_config', 'b.js', 'A')];
    const loaded = ['a.js', 'r.js', 'm.js'];
    expect(flows(edges, loaded)).toEqual(flows([...edges].reverse(), loaded));
    expect(flows(edges, loaded).flows[0]!.stop).toBe(STOPS.end);
  });
  it('a hostile graph (5,000 edges, a 1,000-file chain) finishes in under 1 second', () => {
    const edges: Edge[] = [e('calls_api', 'a.js', 'GET /x', { targetPath: 'f0.js' }), e('defines_route', 'f0.js', 'GET /x')];
    for (let i = 0; i < 1000; i++) edges.push(e('imports', `f${i}.js`, `f${i + 1}.js`, { targetPath: `f${i + 1}.js` }));
    for (let i = 0; i < 4000; i++) edges.push(e('calls_api', `c${i % 50}.js`, `GET /y${i}`, { certainty: 'broken' }));
    const t = performance.now();
    flows(edges, Array.from({ length: 1001 }, (_, i) => `f${i}.js`));
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe('describeStep', () => {
  it('one sentence per step; Simple stays within the Simple limits (path and address shown separately)', () => {
    const steps = [
      { path: 'client/app.js', line: 3, certainty: 'confirmed' as const, kind: 'request', label: 'request', target: 'PUT /api/profile/1' },
      { path: 'server/routes/profile.js', line: 7, certainty: 'inferred' as const, kind: 'route', label: 'route', target: 'PUT /api/profile/:id' },
      { path: 'index.html', line: 4, certainty: 'confirmed' as const, kind: 'loads', label: 'loads', target: 'css/site.css' },
      { path: 'server.js', line: 7, certainty: 'confirmed' as const, kind: 'setting', label: 'reads', target: 'PORT' },
    ];
    for (const s of steps) {
      for (const lvl of ['simple', 'practical', 'deeper'] as const) {
        const t = describeStep(s, lvl);
        expect(t).toMatch(/Confirmed|Inferred|Broken/);
      }
      const simple = describeStep(s, 'simple').replaceAll(s.path, 'the file').replaceAll(s.target, 'it').replace(/ \((Confirmed|Inferred|Broken)\)/, '');
      expect(checkLessonText('simple', simple), simple).toEqual([]);
    }
  });
});
