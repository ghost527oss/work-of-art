// @node: F12.8
// Checks the first bytes of a file against the picture types PatchBay shows. The type comes from the bytes, never from
// the file name, and the bytes must agree with the extension. Pure.
import type { RepoMedia } from '../types/contracts';

export type ImageMime = RepoMedia['mime'];
export type ImageFamily = 'png' | 'jpeg' | 'gif' | 'webp' | 'ico';

const FAMILY_BY_EXT: Record<string, ImageFamily> = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif', webp: 'webp', ico: 'ico' };
const MIME_BY_FAMILY: Record<ImageFamily, ImageMime> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon' };

export function extOfPath(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1);
}

/** The family a file name claims (png, jpg, jpeg, webp, gif, ico), or null for any other name. */
export function imageFamilyOfPath(path: string): ImageFamily | null {
  return FAMILY_BY_EXT[extOfPath(path)] ?? null;
}

export function isImagePath(path: string): boolean {
  return imageFamilyOfPath(path) !== null;
}

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0): boolean => b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, at: number, text: string): boolean => b.length >= at + text.length && [...text].every((c, i) => b[at + i] === c.charCodeAt(0));

/** The family the bytes really are, or null when they are not one of the supported pictures. */
export function sniffImageFamily(b: Uint8Array): ImageFamily | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a')) return 'gif';
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return 'webp';
  if (startsWith(b, [0x00, 0x00, 0x01, 0x00]) && b.length >= 6) {
    const count = b[4]! | (b[5]! << 8);
    if (count >= 1 && count <= 256 && b.length >= 6 + 16 * count) return 'ico';
  }
  return null;
}

/** The mime type when the bytes are a supported picture AND match what the file name says; otherwise null. */
export function imageMimeFor(path: string, bytes: Uint8Array): ImageMime | null {
  const claimed = imageFamilyOfPath(path);
  const real = sniffImageFamily(bytes);
  return claimed !== null && real !== null && claimed === real ? MIME_BY_FAMILY[real] : null;
}

/** Re-check used by the preview before a stored picture is written (defence in depth). */
export function mimeMatchesBytes(mime: string, bytes: Uint8Array): boolean {
  const real = sniffImageFamily(bytes);
  return real !== null && MIME_BY_FAMILY[real] === mime;
}

export function base64Of(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x2000) out += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
  return btoa(out);
}

export function bytesOfBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
