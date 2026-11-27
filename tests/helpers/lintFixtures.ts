// @node: F12.2
// Small source fixtures shared by the 3B-1 tests.
export const VALID_JS = 'const a = 1;\nfunction f(x) { return x + a; }\nexport default f;\n';
export const VALID_SCRIPT = 'var a = 1;\nfunction f(x) { return x + a; }\n';
export const TEMPLATE_HEAVY = 'const re = /[(]\\//g;\nconst s = `a ${ {b: 1}.b } c ${`n${1}`}`;\n// ( unmatched in a comment\nconst t = "{";\n';
