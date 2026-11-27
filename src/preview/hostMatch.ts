// @node: F12.6
// Exact host matching for outside styles, fonts, and scripts. Pure: no network, no clock.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';

// Anything that is not printable ASCII (control characters, space, non-ASCII), and a backslash, quotes, angle brackets, or a backtick, is never part of an accepted address.
const BAD_CHARS = /[^\u0021-\u007e]|[\\"'<>`]/;
const SAFE_PATH = /^[A-Za-z0-9._~!$&()*+,;=:@/%?-]*$/;
const ENCODED_CONTROL = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i;

/**
 * Returns the normalised address when `raw` is an `https:` address whose host **equals** one of `hosts`
 * (never `endsWith`), with no user name, password, port, or fragment and only safe characters. Otherwise null.
 */
export function matchOutsideUrl(raw: unknown, hosts: readonly string[]): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > L.maxOutsideUrlChars) return null;
  if (BAD_CHARS.test(raw) || ENCODED_CONTROL.test(raw)) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.port !== '' || u.hash !== '') return null;
  if (!hosts.includes(u.hostname)) return null;
  if (!SAFE_PATH.test(u.pathname + u.search)) return null;
  return u.href;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const LOCAL_SUFFIX = ['.local', '.localhost', '.internal', '.home.arpa', '.lan', '.localdomain'];

/**
 * An outside picture address that may be written into the preview. `https:` only; no user name, password, port, or
 * fragment; at most 500 characters; safe characters only; the host has a dot and ends in a letters-only name; it is not
 * an IP address, `localhost`, or a local-looking name. Returns the normalised address or null. (A public name that points
 * at a private address, "DNS rebinding", cannot be detected here.)
 */
export function matchImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > L.maxPictureUrlChars) return null;
  if (BAD_CHARS.test(raw) || ENCODED_CONTROL.test(raw)) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.port !== '' || u.hash !== '') return null;
  const host = u.hostname;
  if (host === '' || host.startsWith('[') || host.includes(':') || IPV4.test(host)) return null;
  if (!host.includes('.') || host.endsWith('.') || host.startsWith('.') || host.includes('..')) return null;
  if (host === 'localhost' || LOCAL_SUFFIX.some((s) => host.endsWith(s))) return null;
  if (!/^[a-z0-9.-]+$/.test(host) || !/\.(?:[a-z]{2,}|xn--[a-z0-9-]+)$/.test(host)) return null;
  if (!SAFE_PATH.test(u.pathname + u.search)) return null;
  return u.href;
}
