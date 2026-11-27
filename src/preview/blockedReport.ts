// @node: F12.6
// The blocked-resources list: what the preview did not load, and why, in plain words. Never page text.
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import { redact } from '../engine/redact';

export type BlockedReason =
  | 'not_on_list' | 'not_https' | 'scripts_off' | 'module_script' | 'too_many_outside' | 'image_not_loaded'
  | 'event_handler' | 'removed_tag' | 'too_long' | 'local_missing'
  | 'picture_too_large' | 'picture_budget' | 'picture_failed' | 'picture_outside_rejected' | 'picture_embed_limit';

export interface BlockedEntry { what: string; reason: BlockedReason }

export const BLOCKED_TEXT: Record<BlockedReason, string> = {
  not_on_list: 'its address is not on the list of allowed hosts',
  not_https: 'it does not use https',
  scripts_off: 'scripts are off in this mode',
  module_script: 'module scripts with import or export are not supported in the preview',
  too_many_outside: 'too many outside styles (the limit is 10)',
  image_not_loaded: 'the picture was not loaded',
  event_handler: 'event handlers only run when scripts are on',
  removed_tag: 'this kind of tag is removed for safety',
  too_long: 'its address is too long',
  local_missing: 'the file was not loaded from the repository',
  picture_too_large: 'the picture is larger than the picture limit, so a placeholder is shown',
  picture_budget: 'the picture budget was used up, so a placeholder is shown',
  picture_failed: 'the picture could not be loaded or is not a real picture, so a placeholder is shown',
  picture_outside_rejected: 'its address is not an allowed picture address (https only, no IP address, port, or local name)',
  picture_embed_limit: 'too many pictures for one preview, so a placeholder is shown',
};

/** Control characters out, the query part dropped (it can hold tokens), secrets redacted, at most 80 characters. */
const clean = (s: string): string => redact(s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\?.*$/s, '?...')).text.slice(0, 80);

/** Adds an entry (at most 200 are kept). `what` is cut to 80 characters and stripped of control characters. */
export function addBlocked(report: { blocked: BlockedEntry[] }, what: string, reason: BlockedReason): void {
  if (report.blocked.length >= L.maxBlocked) return;
  report.blocked.push({ what: clean(what) || '(empty)', reason });
}

export function describeBlocked(blocked: readonly BlockedEntry[]): { lines: string[]; more: number; total: number } {
  const lines = blocked.slice(0, L.blockedShown).map((b) => `${b.what}: ${BLOCKED_TEXT[b.reason]}.`);
  return { lines, more: Math.max(0, blocked.length - L.blockedShown), total: blocked.length };
}
