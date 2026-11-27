// @node: F12.8
import { describe, expect, it } from 'vitest';
import { referencedImages, resolveLocalRef } from '../src/engine/mediaRefs';

const f = (path: string, content: string) => ({ path, content });

describe('local references', () => {
  it('resolves relative, root, and dot paths and cuts query and fragment parts', () => {
    expect(resolveLocalRef('index.html', 'img/a.png')).toBe('img/a.png');
    expect(resolveLocalRef('pages/p.html', '../img/a.png?v=2#x')).toBe('img/a.png');
    expect(resolveLocalRef('pages/p.html', '/img/a.png')).toBe('img/a.png');
    expect(resolveLocalRef('a/b/c.css', './x/../y.png')).toBe('a/b/y.png');
    expect(resolveLocalRef('a.html', 'my%20pic.png')).toBe('my pic.png');
  });
  it('never leaves the repository and ignores outside, data, and odd references', () => {
    for (const r of ['../a.png', '../../a.png', 'http://x.test/a.png', 'https://x.test/a.png', '//x.test/a.png', 'data:image/png;base64,AAAA', '#frag', '', '  ', 'a\\b.png', 'javascript:x', '%E0%A4%A.png']) expect(resolveLocalRef('index.html', r), r).toBeUndefined();
    expect(resolveLocalRef('pages/p.html', '../../a.png')).toBeUndefined();
  });
});

describe('referenced pictures', () => {
  it('finds img tags, style blocks, inline styles, linked stylesheets, and css files, entry page first, without duplicates', () => {
    const files = [
      f('about.html', '<img src="img/about.png"><img src="img/logo.png">'),
      f('index.html', '<link rel="stylesheet" href="css/site.css"><style>.a{background:url(img/bg.jpg)}</style><div style="background: url(\'img/inline.gif\')"></div><img src="img/logo.png"><img src="img/hero.webp">'),
      f('css/site.css', '.x{background:url("../img/site.ico")} .y{background:url(../img/logo.png)}'),
      f('css/unused.css', '.z{background:url(../img/unused.png)}'),
    ];
    expect(referencedImages(files)).toEqual(['img/bg.jpg', 'img/inline.gif', 'img/logo.png', 'img/hero.webp', 'img/site.ico', 'img/about.png', 'img/unused.png']);
  });
  it('only the six picture types, and never svg, avif, or outside addresses', () => {
    const html = '<img src="a.svg"><img src="a.avif"><img src="https://x.test/a.png"><img src="//x.test/a.png"><img src="data:image/png;base64,AAAA"><img src="ok.png"><img src="noext"><img alt="no src">';
    expect(referencedImages([f('index.html', html)])).toEqual(['ok.png']);
  });
  it('a path with .. cannot leave the repository', () => {
    expect(referencedImages([f('index.html', '<img src="../../etc/a.png"><img src="../b.png"><img src="x/../c.png">')])).toEqual(['c.png']);
  });
  it('files without loaded content are ignored, and non-page files are not read', () => {
    expect(referencedImages([{ path: 'index.html' }, f('app.js', 'const a = "x.png"; url(y.png)'), f('README.md', '![x](z.png)')])).toEqual([]);
  });
  it('hostile text stays within the caps and finishes', () => {
    const long = '<img src="' + 'a'.repeat(1_000_000) + '.png">';
    expect(referencedImages([f('index.html', long)])).toEqual([]);
    const many = Array.from({ length: 10_000 }, (_, i) => `url(p${i}.png)`).join(' ');
    const r = referencedImages([f('a.css', many)]);
    expect(r.length).toBeLessThanOrEqual(200);
    expect(r[0]).toBe('p0.png');
    const manyImgs = Array.from({ length: 5_000 }, (_, i) => `<img src="q${i}.png">`).join('');
    expect(referencedImages([f('index.html', manyImgs)]).length).toBeLessThanOrEqual(200);
  });
  it('is the same every time', () => {
    const files = [f('index.html', '<img src="b.png"><img src="a.png">'), f('x.html', '<img src="c.png">')];
    expect(referencedImages(files)).toEqual(referencedImages([...files].reverse()));
  });
});
