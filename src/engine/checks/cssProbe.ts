// @node: F12.3
// The CSS probe: given the text of one top-level rule, did the browser keep it? It has no network or document access.
// The browser one lives in cssProbeBrowser.ts; node tests register a fake.
export type CssProbe = (ruleText: string) => boolean;

let probe: CssProbe | null = null;

export function setCssProbe(p: CssProbe | null): void {
  probe = p;
}

export function getCssProbe(): CssProbe | null {
  return probe;
}
