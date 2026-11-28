// @node: F12.2
import { afterEach, describe, expect, it } from 'vitest';
import { getAcorn, loadAcorn, setAcornForTest } from '../src/engine/checks/acornLoader';
import { checkJsFile } from '../src/engine/checks/jsSyntax';

afterEach(() => setAcornForTest(undefined));

describe('acorn loader', () => {
  it('loads acorn once and then serves it synchronously', async () => {
    expect(getAcorn()).toBeNull();
    const a = await loadAcorn();
    expect(a).not.toBeNull();
    expect(typeof a!.parse).toBe('function');
    expect(getAcorn()).toBe(a);
    expect(await loadAcorn()).toBe(a);
  });
  it('a failed load is remembered as null and the check says it could not check', async () => {
    setAcornForTest(null);
    expect(await loadAcorn()).toBeNull();
    expect(getAcorn()).toBeNull();
    const r = checkJsFile('a.js', 'const = ;', getAcorn());
    expect(r.issues).toEqual([]);
    expect(r.notChecked).toEqual(['no_checker']);
  });
});
