// @node: F12.2
// Small source fixtures shared by the 3B-1 tests.
export const VALID_JS = 'const a = 1;\nfunction f(x) { return x + a; }\nexport default f;\n';
export const VALID_SCRIPT = 'var a = 1;\nfunction f(x) { return x + a; }\n';
export const TEMPLATE_HEAVY = 'const re = /[(]\\//g;\nconst s = `a ${ {b: 1}.b } c ${`n${1}`}`;\n// ( unmatched in a comment\nconst t = "{";\n';

// @node: F12.10 (measurement fixtures for the Visual Linter)
import type { Measurement } from '../../src/preview/layoutCheck';

let nextId = 1;
export const resetIds = (): void => { nextId = 1; };
/** A visible, in-flow block box with sensible defaults; override what the test is about. */
export function box(over: Partial<Measurement> = {}): Measurement {
  const id = nextId++;
  return {
    id, tag: 'div', clientWidth: 100, scrollWidth: 100, clientHeight: 50, scrollHeight: 50, overflowX: 'visible', overflowY: 'visible', hasText: false,
    parentKey: 1000 + id, left: 0, top: 0, width: 100, height: 50, display: 'block', position: 'static', visibility: 'visible', opacity: 1,
    hasTransform: false, hasNegativeMargin: false, overlay: false, disabled: false, roleButton: false, hasHref: true, inlineInText: false,
    fontSize: 16, bold: false, color: 'rgb(0, 0, 0)', bg: { color: 'rgb(255, 255, 255)' },
    ...over,
  };
}
