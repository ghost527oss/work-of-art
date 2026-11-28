// @node: F12.7
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { STORAGE_SHIM_SOURCE } from '../src/preview/storageShim';

/** A fake frame window where touching localStorage throws, like a sealed frame with an opaque origin. */
function frame(opts: { failDefine?: string } = {}) {
  const win: Record<string, unknown> = {};
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(win, name, { get() { throw new Error('SecurityError'); }, configurable: name !== opts.failDefine });
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(STORAGE_SHIM_SOURCE, ctx);
  return { win, run: (code: string) => vm.runInContext(code, ctx) as unknown };
}

describe('storage stand-in', () => {
  it('replaces localStorage and sessionStorage so page scripts no longer crash', () => {
    const f = frame();
    expect(f.run("localStorage.setItem('a', 1); localStorage.getItem('a')")).toBe('1');
    expect(f.run("sessionStorage.getItem('a')")).toBeNull();
    expect(f.run("sessionStorage.setItem('b', 'x'); sessionStorage.length")).toBe(1);
  });
  it('supports get, set, remove, clear, key, and length with strings only', () => {
    const f = frame();
    f.run("localStorage.setItem('k1', 'v1'); localStorage.setItem('k2', 2); localStorage.setItem('k3', null);");
    expect(f.run('localStorage.length')).toBe(3);
    expect(f.run("localStorage.getItem('k2')")).toBe('2');
    expect(f.run("localStorage.getItem('k3')")).toBe('null');
    expect(f.run('localStorage.key(0)')).toBe('k1');
    expect(f.run('localStorage.key(5)')).toBeNull();
    expect(f.run('localStorage.key(-1)')).toBeNull();
    f.run("localStorage.removeItem('k1')");
    expect(f.run("localStorage.getItem('k1')")).toBeNull();
    expect(f.run('localStorage.length')).toBe(2);
    f.run('localStorage.clear()');
    expect(f.run('localStorage.length')).toBe(0);
    expect(f.run("localStorage.getItem('toString')")).toBeNull();
  });
  it('the two stores are separate and replacing a key does not add a key', () => {
    const f = frame();
    f.run("localStorage.setItem('a','1'); localStorage.setItem('a','2'); sessionStorage.setItem('z','9');");
    expect(f.run('localStorage.length')).toBe(1);
    expect(f.run("localStorage.getItem('a')")).toBe('2');
    expect(f.run('sessionStorage.length')).toBe(1);
  });
  it('stops at 200 keys', () => {
    const f = frame();
    expect(f.run("for (var i = 0; i < 200; i++) localStorage.setItem('k' + i, 'v'); localStorage.length")).toBe(200);
    expect(() => f.run("localStorage.setItem('one-more', 'v')")).toThrow('QuotaExceededError');
    expect(f.run("localStorage.setItem('k0', 'changed'); localStorage.getItem('k0')")).toBe('changed');
  });
  it('stops at 100 KB', () => {
    const f = frame();
    f.run("localStorage.setItem('big', 'x'.repeat(100000))");
    expect(() => f.run("localStorage.setItem('more', 'x'.repeat(3000))")).toThrow('QuotaExceededError');
    f.run("localStorage.removeItem('big')");
    f.run("localStorage.setItem('more', 'x'.repeat(3000))");
    expect(f.run("localStorage.getItem('more').length")).toBe(3000);
  });
  it('a failing defineProperty does not stop the other store or later scripts', () => {
    const f = frame({ failDefine: 'localStorage' });
    expect(typeof Object.getOwnPropertyDescriptor(f.win, 'localStorage')?.get).toBe('function'); // left as it was
    expect(f.run("sessionStorage.setItem('a', 'b'); sessionStorage.getItem('a')")).toBe('b');
    expect(f.run('1 + 1')).toBe(2);
  });
  it('is a fixed constant with no interpolation, no network, no eval', () => {
    expect(STORAGE_SHIM_SOURCE).not.toMatch(/\$\{|fetch|XMLHttpRequest|eval|Function\(|import\(|document\.cookie/);
    expect(STORAGE_SHIM_SOURCE.length).toBeLessThan(2000);
  });
});
