// @node: F7.3
// @node: F12.6 (host lists in the policy)
import { FONT_HOSTS, SCRIPT_HOSTS, STYLE_HOSTS } from '../config/previewHosts';
// The only two iframe configurations. No code path can build another combination.
const hosts = (list: readonly string[]): string => list.map((h) => `https://${h}`).join(' ');
// Look-only: styles and fonts from the fixed lists, nothing that can run.
export const POLICY_LOOK =
  `default-src 'none'; img-src data:; font-src data: ${hosts(FONT_HOSTS)}; media-src data:; style-src 'unsafe-inline' ${hosts(STYLE_HOSTS)}; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'`;
// Run-scripts: the same, plus scripts from the fixed list.
export const POLICY_SCRIPTS = POLICY_LOOK.replace(/; connect-src /, `; script-src 'unsafe-inline' ${hosts(SCRIPT_HOSTS)}; connect-src `);

/** `scripts === true` is the only way to get allow-scripts; anything else is look-only. */
export function sandboxFlags(scripts: unknown): 'allow-same-origin' | 'allow-scripts' {
  return scripts === true ? 'allow-scripts' : 'allow-same-origin';
}

export function cspFor(scripts: unknown): string {
  return scripts === true ? POLICY_SCRIPTS : POLICY_LOOK;
}

export const IFRAME_ATTRS = { referrerPolicy: 'no-referrer', allow: '', title: 'Project preview' } as const;
