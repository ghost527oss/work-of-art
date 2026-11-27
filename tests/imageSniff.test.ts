// @node: F12.8
import { describe, expect, it } from 'vitest';
import { base64Of, bytesOfBase64, imageFamilyOfPath, imageMimeFor, isImagePath, mimeMatchesBytes, sniffImageFamily } from '../src/engine/imageSniff';
import { image, REAL_1X1_PNG, type Kind } from './helpers/tinyImages';

describe('picture signatures', () => {
  const cases: Array<[Kind, string, string]> = [['png', 'a.png', 'image/png'], ['jpeg', 'a.jpg', 'image/jpeg'], ['jpeg', 'a.jpeg', 'image/jpeg'], ['gif', 'a.gif', 'image/gif'], ['webp', 'a.webp', 'image/webp'], ['ico', 'favicon.ico', 'image/x-icon']];
  for (const [kind, path, mime] of cases) it(`${path} is ${mime} when its bytes agree`, () => {
    expect(sniffImageFamily(image(kind))).toBe(kind);
    expect(imageMimeFor(path, image(kind))).toBe(mime);
    expect(mimeMatchesBytes(mime, image(kind))).toBe(true);
  });
  it('a real 1x1 PNG is recognised', () => {
    expect(imageMimeFor('dot.png', REAL_1X1_PNG)).toBe('image/png');
  });
  it('a text file named .png, an empty file, and short or odd bytes are not pictures', () => {
    expect(imageMimeFor('a.png', new TextEncoder().encode('<html>not a picture</html>'))).toBeNull();
    expect(imageMimeFor('a.png', new Uint8Array(0))).toBeNull();
    expect(imageMimeFor('a.png', new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImageFamily(new Uint8Array([0, 0, 1, 0, 0, 0, ...new Array(40).fill(0)]))).toBeNull(); // ico with zero images
    expect(sniffImageFamily(new Uint8Array([0, 0, 1, 0, 5, 0]))).toBeNull(); // ico too short for 5 entries
    const riffNotWebp = new Uint8Array(20).fill(1); riffNotWebp.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0); riffNotWebp.set([...'WAVE'].map((c) => c.charCodeAt(0)), 8);
    expect(sniffImageFamily(riffNotWebp)).toBeNull();
  });
  it('the bytes must agree with the extension (a JPEG named .png is refused)', () => {
    expect(imageMimeFor('a.png', image('jpeg'))).toBeNull();
    expect(imageMimeFor('a.jpg', image('png'))).toBeNull();
    expect(imageMimeFor('a.gif', image('webp'))).toBeNull();
    expect(mimeMatchesBytes('image/png', image('gif'))).toBe(false);
  });
  it('only the six extensions are pictures', () => {
    for (const p of ['a.png', 'a.JPG', 'a.jpeg', 'a.webp', 'a.gif', 'dir/a.ICO']) expect(isImagePath(p), p).toBe(true);
    for (const p of ['a.svg', 'a.avif', 'a.bmp', 'a.tiff', 'a.psd', 'a', 'png', '.png', 'a.png.txt']) expect(isImagePath(p), p).toBe(false);
    expect(imageFamilyOfPath('x.jpg')).toBe('jpeg');
  });
  it('base64 round-trips, including large inputs', () => {
    const b = image('png', 100_000, 200);
    expect(bytesOfBase64(base64Of(b))).toEqual(b);
    expect(base64Of(new Uint8Array(0))).toBe('');
  });
});
