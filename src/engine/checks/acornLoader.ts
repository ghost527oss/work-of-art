// @node: F12.2
// Loads the `acorn` parser lazily (its own chunk) and keeps it for synchronous use afterwards.
// A failed load is remembered as null: the checks then say "could not check", never "fine".
export type AcornModule = typeof import('acorn');

let loaded: AcornModule | null | undefined;
let pending: Promise<AcornModule | null> | undefined;

export function loadAcorn(): Promise<AcornModule | null> {
  if (loaded !== undefined) return Promise.resolve(loaded);
  pending ??= import('acorn').then(
    (m) => { loaded = m; return m; },
    () => { loaded = null; return null; },
  );
  return pending;
}

/** The parser if it is already loaded, else null. */
export function getAcorn(): AcornModule | null {
  return loaded ?? null;
}

/** Tests only: set the parser (or null for "could not load"), or undefined to forget. */
export function setAcornForTest(value: AcornModule | null | undefined): void {
  loaded = value;
  pending = undefined;
}
