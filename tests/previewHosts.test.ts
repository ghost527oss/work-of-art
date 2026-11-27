// @node: F12.6
import { describe, expect, it } from 'vitest';
import { FONT_HOSTS, SCRIPT_HOSTS, STYLE_HOSTS } from '../src/config/previewHosts';
import { cspFor, IFRAME_ATTRS, POLICY_LOOK, POLICY_SCRIPTS, sandboxFlags } from '../src/preview/previewFlags';

const directives = (p: string) => Object.fromEntries(p.split('; ').map((d) => { const i = d.indexOf(' '); return [d.slice(0, i), d.slice(i + 1)]; }));

describe('the preview policies are built from the host lists', () => {
  it('Look-only: only font-src and style-src carry hosts; every other directive is as before', () => {
    const d = directives(POLICY_LOOK);
    expect(d['font-src']).toBe(`data: ${FONT_HOSTS.map((h) => `https://${h}`).join(' ')}`);
    expect(d['style-src']).toBe(`'unsafe-inline' ${STYLE_HOSTS.map((h) => `https://${h}`).join(' ')}`);
    expect(d['img-src']).toBe('data:');
    for (const k of ['default-src', 'connect-src', 'frame-src', 'object-src', 'worker-src', 'form-action', 'base-uri']) expect(d[k], k).toBe("'none'");
    expect(d['media-src']).toBe('data:');
    expect(POLICY_LOOK).not.toContain('script-src');
  });
  it('Run-scripts: the same plus script-src with exactly the script hosts', () => {
    const d = directives(POLICY_SCRIPTS);
    expect(d['script-src']).toBe(`'unsafe-inline' ${SCRIPT_HOSTS.map((h) => `https://${h}`).join(' ')}`);
    expect(d['connect-src']).toBe("'none'");
    const rest = { ...d }; delete rest['script-src'];
    expect(rest).toEqual(directives(POLICY_LOOK));
  });
  it('sandbox flags and referrer policy are unchanged', () => {
    expect(sandboxFlags(false)).toBe('allow-same-origin');
    expect(sandboxFlags(true)).toBe('allow-scripts');
    expect(sandboxFlags(undefined)).toBe('allow-same-origin');
    expect(sandboxFlags('yes')).toBe('allow-same-origin');
    expect(cspFor(true)).toBe(POLICY_SCRIPTS);
    expect(cspFor(false)).toBe(POLICY_LOOK);
    expect(IFRAME_ATTRS).toEqual({ referrerPolicy: 'no-referrer', allow: '', title: 'Project preview' });
    expect(sandboxFlags(true)).not.toContain('same-origin');
  });
});
