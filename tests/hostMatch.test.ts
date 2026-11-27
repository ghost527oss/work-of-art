// @node: F12.6
import { describe, expect, it } from 'vitest';
import { SCRIPT_HOSTS, STYLE_HOSTS } from '../src/config/previewHosts';
import { matchOutsideUrl } from '../src/preview/hostMatch';

describe('exact host matching', () => {
  it('accepts exact https hosts on the list and returns the normalised address', () => {
    expect(matchOutsideUrl('https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css', STYLE_HOSTS)).toBe('https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css');
    expect(matchOutsideUrl('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap', STYLE_HOSTS)).toBe('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    expect(matchOutsideUrl('HTTPS://CDN.JSDELIVR.NET/a.css', STYLE_HOSTS)).toBe('https://cdn.jsdelivr.net/a.css');
    expect(matchOutsideUrl('https://code.jquery.com/jquery-3.7.1.min.js', SCRIPT_HOSTS)).toBe('https://code.jquery.com/jquery-3.7.1.min.js');
  });
  it('a host on one list is not on another', () => {
    expect(matchOutsideUrl('https://code.jquery.com/x.js', STYLE_HOSTS)).toBeNull();
    expect(matchOutsideUrl('https://fonts.googleapis.com/css', SCRIPT_HOSTS)).toBeNull();
    expect(matchOutsideUrl('https://cdn.tailwindcss.com/', STYLE_HOSTS)).toBeNull();
  });
  const bad: Array<[string, string]> = [
    ['http', 'http://cdn.jsdelivr.net/x.css'],
    ['protocol-relative', '//cdn.jsdelivr.net/x.css'],
    ['suffix lookalike', 'https://cdn.jsdelivr.net.evil.com/x.css'],
    ['prefix lookalike', 'https://evilcdn.jsdelivr.net/x.css'],
    ['sub host', 'https://a.cdn.jsdelivr.net/x.css'],
    ['user name', 'https://user@cdn.jsdelivr.net/x.css'],
    ['user and password', 'https://u:p@cdn.jsdelivr.net/x.css'],
    ['port', 'https://cdn.jsdelivr.net:8443/x.css'],
    ['even the default port written out of range', 'https://cdn.jsdelivr.net:0/x.css'],
    ['trailing dot', 'https://cdn.jsdelivr.net./x.css'],
    ['backslash', 'https://cdn.jsdelivr.net\\@evil.com/x.css'],
    ['space', 'https://cdn.jsdelivr.net/a b.css'],
    ['double quote', 'https://cdn.jsdelivr.net/a".css'],
    ['single quote', "https://cdn.jsdelivr.net/a'.css"],
    ['angle bracket', 'https://cdn.jsdelivr.net/a<b.css'],
    ['encoded newline', 'https://cdn.jsdelivr.net/a%0Ab.css'],
    ['newline', 'https://cdn.jsdelivr.net/a\nb.css'],
    ['tab', 'https://cdn.jsdelivr.net/a\tb.css'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/css,a{}'],
    ['fragment', 'https://cdn.jsdelivr.net/a.css#x'],
    ['unicode lookalike', 'https://cdn.jsdelivr.net/\u0430.css'],
    ['relative', 'style.css'],
    ['empty', ''],
    ['over 300 characters', 'https://cdn.jsdelivr.net/' + 'a'.repeat(300)],
    ['punycode lookalike host', 'https://xn--cdn-jsdelivr-9ib.net/x.css'],
    ['backtick', 'https://cdn.jsdelivr.net/`x`.css'],
  ];
  for (const [name, url] of bad) it(`rejects ${name}`, () => expect(matchOutsideUrl(url, STYLE_HOSTS)).toBeNull());
  it('rejects non-strings and never throws', () => {
    for (const v of [null, undefined, 5, {}, [], 'https://', 'https://[', '%%%']) expect(() => matchOutsideUrl(v, STYLE_HOSTS)).not.toThrow();
    expect(matchOutsideUrl(null, STYLE_HOSTS)).toBeNull();
  });
});
