// @node: F12.4
// The only place that touches CSSStyleSheet. A constructed sheet is never attached to a document, so it loads nothing
// and changes nothing. Where the browser can't do it, the probe is null and the CSS check says "not checked".
import { setCssProbe, type CssProbe } from './cssProbe';

export function createBrowserCssProbe(): CssProbe | null {
  try {
    if (typeof CSSStyleSheet === 'undefined') return null;
    const test = new CSSStyleSheet();
    if (typeof test.replaceSync !== 'function') return null;
  } catch {
    return null;
  }
  return (ruleText) => {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(ruleText);
      return sheet.cssRules.length > 0;
    } catch {
      return true;
    }
  };
}

export function installBrowserCssProbe(): void {
  setCssProbe(createBrowserCssProbe());
}
