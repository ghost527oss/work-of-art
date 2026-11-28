// @node: F12.9
import { describe, expect, it } from 'vitest';
import { matchImageUrl } from '../src/preview/hostMatch';

describe('outside picture addresses', () => {
  it('accepts a public https address and returns it normalised', () => {
    expect(matchImageUrl('https://images.example.com/a/b.png?w=200&h=100')).toBe('https://images.example.com/a/b.png?w=200&h=100');
    expect(matchImageUrl('HTTPS://Images.Example.COM/a.jpg')).toBe('https://images.example.com/a.jpg');
    expect(matchImageUrl('https://upload.wikimedia.org/wikipedia/commons/a.webp')).toBe('https://upload.wikimedia.org/wikipedia/commons/a.webp');
    expect(matchImageUrl('https://example.co.uk/x.gif')).toBe('https://example.co.uk/x.gif');
  });
  const bad: Array<[string, string]> = [
    ['http', 'http://example.com/a.png'],
    ['protocol-relative', '//example.com/a.png'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:image/png;base64,AAAA'],
    ['user name', 'https://user@example.com/a.png'],
    ['user and password', 'https://u:p@example.com/a.png'],
    ['port', 'https://example.com:8443/a.png'],
    ['fragment', 'https://example.com/a.png#x'],
    ['IPv4', 'https://203.0.113.9/a.png'],
    ['private IPv4', 'https://192.168.1.1/a.png'],
    ['loopback', 'https://127.0.0.1/a.png'],
    ['decimal IPv4', 'https://2130706433/a.png'],
    ['hex IPv4', 'https://0x7f.1/a.png'],
    ['IPv6', 'https://[::1]/a.png'],
    ['localhost', 'https://localhost/a.png'],
    ['sub localhost', 'https://app.localhost/a.png'],
    ['no dot', 'https://intranet/a.png'],
    ['.local', 'https://printer.local/a.png'],
    ['.internal', 'https://api.internal/a.png'],
    ['.lan', 'https://nas.lan/a.png'],
    ['.home.arpa', 'https://x.home.arpa/a.png'],
    ['.localdomain', 'https://x.localdomain/a.png'],
    ['numeric tld', 'https://example.123/a.png'],
    ['trailing dot', 'https://example.com./a.png'],
    ['double dot', 'https://exa..mple.com/a.png'],
    ['backslash', 'https://example.com\\@evil.com/a.png'],
    ['space', 'https://example.com/a b.png'],
    ['quote', 'https://example.com/a".png'],
    ['angle bracket', 'https://example.com/a<b.png'],
    ['encoded newline', 'https://example.com/a%0Ab.png'],
    ['non-ascii', 'https://example.com/\u0430.png'],
    ['over 500 characters', 'https://example.com/' + 'a'.repeat(500)],
    ['empty', ''],
  ];
  for (const [name, url] of bad) it(`rejects ${name}`, () => expect(matchImageUrl(url), url).toBeNull());
  it('never throws on odd input', () => {
    for (const v of [null, undefined, 5, {}, 'https://', 'https://[', '%%%', 'https://' + 'a.'.repeat(300) + 'com']) expect(() => matchImageUrl(v)).not.toThrow();
  });
});
