// @node: F12.3
// A fake browser CSS probe for node tests: a rule is "dropped" when it contains a marker word.
import type { CssProbe } from '../../src/engine/checks/cssProbe';

export const dropsRulesWith = (...markers: string[]): CssProbe => (rule) => !markers.some((m) => rule.includes(m));
export const keepsAll: CssProbe = () => true;
