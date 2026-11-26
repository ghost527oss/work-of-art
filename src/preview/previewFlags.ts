// @node: F7.3
// The only two iframe configurations. No code path can build another combination.
export const POLICY_LOOK =
  "default-src 'none'; img-src data:; font-src data:; media-src data:; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'";
export const POLICY_SCRIPTS = POLICY_LOOK.replace("style-src 'unsafe-inline';", "style-src 'unsafe-inline'; script-src 'unsafe-inline';");

/** `scripts === true` is the only way to get allow-scripts; anything else is look-only. */
export function sandboxFlags(scripts: unknown): 'allow-same-origin' | 'allow-scripts' {
  return scripts === true ? 'allow-scripts' : 'allow-same-origin';
}

export function cspFor(scripts: unknown): string {
  return scripts === true ? POLICY_SCRIPTS : POLICY_LOOK;
}

export const IFRAME_ATTRS = { referrerPolicy: 'no-referrer', allow: '', title: 'Project preview' } as const;
