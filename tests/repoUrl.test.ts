// @node: F1.2
import { describe, expect, it } from 'vitest';
import {
  MAX_PATH_LENGTH,
  MAX_REF_LENGTH,
  isSafeRepoPath,
  isValidOwner,
  isValidRef,
  isValidRepo,
  parseRepoInput,
} from '../src/engine/repoUrl';

function ok(input: string) {
  const r = parseRepoInput(input);
  if (!r.ok) throw new Error(`expected ok for "${input}", got: ${r.message}`);
  return r.value;
}

function bad(input: string) {
  const r = parseRepoInput(input);
  expect(r.ok, `expected failure for "${input}"`).toBe(false);
  return r.ok ? '' : r.message;
}

describe('parseRepoInput: accepted forms', () => {
  it('parses a plain https URL', () => {
    expect(ok('https://github.com/octocat/Hello-World')).toEqual({ owner: 'octocat', repo: 'Hello-World' });
  });

  it('handles trailing slash, .git suffix, and surrounding whitespace', () => {
    expect(ok('https://github.com/octocat/hello/')).toEqual({ owner: 'octocat', repo: 'hello' });
    expect(ok('https://github.com/octocat/hello.git')).toEqual({ owner: 'octocat', repo: 'hello' });
    expect(ok('  https://github.com/octocat/hello  ')).toEqual({ owner: 'octocat', repo: 'hello' });
  });

  it('parses /tree/<ref>, including refs with slashes and encoded slashes', () => {
    expect(ok('https://github.com/o/r/tree/dev')).toEqual({ owner: 'o', repo: 'r', ref: 'dev' });
    expect(ok('https://github.com/o/r/tree/feature/login-form')).toEqual({ owner: 'o', repo: 'r', ref: 'feature/login-form' });
    expect(ok('https://github.com/o/r/tree/feature%2Flogin')).toEqual({ owner: 'o', repo: 'r', ref: 'feature/login' });
    expect(ok('https://github.com/o/r/tree/v1.2.3/')).toEqual({ owner: 'o', repo: 'r', ref: 'v1.2.3' });
  });

  it('ignores query string and fragment', () => {
    expect(ok('https://github.com/o/r?tab=readme#top')).toEqual({ owner: 'o', repo: 'r' });
  });

  it('accepts http, www, and a missing scheme', () => {
    expect(ok('http://github.com/o/r')).toEqual({ owner: 'o', repo: 'r' });
    expect(ok('https://www.github.com/o/r')).toEqual({ owner: 'o', repo: 'r' });
    expect(ok('github.com/o/r')).toEqual({ owner: 'o', repo: 'r' });
    expect(ok('HTTPS://GitHub.com/o/r')).toEqual({ owner: 'o', repo: 'r' });
  });

  it('accepts owner/repo shorthand, with or without .git', () => {
    expect(ok('octocat/hello')).toEqual({ owner: 'octocat', repo: 'hello' });
    expect(ok('octocat/hello.git')).toEqual({ owner: 'octocat', repo: 'hello' });
    expect(ok('o/.github')).toEqual({ owner: 'o', repo: '.github' });
  });

  it('preserves the case of owner and repo', () => {
    expect(ok('MyOrg/My_Repo.js')).toEqual({ owner: 'MyOrg', repo: 'My_Repo.js' });
  });
});

describe('parseRepoInput: rejected input', () => {
  it('rejects empty and whitespace-only input with a helpful message', () => {
    expect(bad('')).toMatch(/github\.com\/owner\/repo/);
    expect(bad('   ')).toMatch(/github\.com\/owner\/repo/);
  });

  it('rejects other hosts, including look-alikes', () => {
    bad('https://gitlab.com/o/r');
    bad('https://bitbucket.org/o/r');
    bad('https://github.com.evil.com/o/r');
    bad('https://evilgithub.com/o/r');
    bad('https://example.com/github.com/o/r');
    bad('ftp://github.com/o/r');
    bad('git@github.com:o/r.git');
  });

  it('rejects embedded credentials and ports', () => {
    bad('https://user:pass@github.com/o/r');
    bad('https://token@github.com/o/r');
    bad('https://github.com:8080/o/r');
  });

  it('rejects incomplete URLs and unsupported sub-paths', () => {
    bad('https://github.com/');
    bad('https://github.com/octocat');
    bad('https://github.com/o/r/issues');
    bad('https://github.com/o/r/blob/main/README.md');
    bad('https://github.com/o/r/tree/');
    bad('octocat');
  });

  it('rejects shorthand with extra segments or spaces', () => {
    bad('o/r/extra');
    bad('o / r');
    bad('o/r name');
  });

  it('rejects invalid owner and repo characters', () => {
    bad('bad_owner/repo');
    bad('-lead/repo');
    bad('trail-/repo');
    bad('dou--ble/repo');
    bad('o/re$po');
    bad('o/re po');
    bad('o/..');
    bad('o/.');
    bad('evil.com/repo');
  });

  it('rejects unsafe refs', () => {
    bad('https://github.com/o/r/tree/..');
    bad('https://github.com/o/r/tree/a..b');
    bad('https://github.com/o/r/tree/-flag');
    bad('https://github.com/o/r/tree/a%00b');
    bad('https://github.com/o/r/tree/a%20b');
    bad('https://github.com/o/r/tree/%E0%A4%A');
  });

  it('rejects control characters and over-length input', () => {
    bad('o/r\u0000');
    bad('https://github.com/o/r\nextra');
    bad('a'.repeat(501));
  });

  it('never throws on arbitrary strings', () => {
    const samples = ['%', '///', 'https://', 'github.com/', '\\\\', '🙂/🙂', 'o/r?x', '#', '\u202e/o/r'];
    for (const s of samples) expect(() => parseRepoInput(s)).not.toThrow();
  });
});

describe('isValidOwner', () => {
  it('enforces character set and the 39 character limit', () => {
    expect(isValidOwner('a')).toBe(true);
    expect(isValidOwner('a-b')).toBe(true);
    expect(isValidOwner('a'.repeat(39))).toBe(true);
    expect(isValidOwner('a'.repeat(40))).toBe(false);
    expect(isValidOwner('')).toBe(false);
    expect(isValidOwner('a.b')).toBe(false);
    expect(isValidOwner('a_b')).toBe(false);
    expect(isValidOwner('-a')).toBe(false);
    expect(isValidOwner('a-')).toBe(false);
  });
});

describe('isValidRepo', () => {
  it('enforces character set and the 100 character limit', () => {
    expect(isValidRepo('r')).toBe(true);
    expect(isValidRepo('my.repo_name-1')).toBe(true);
    expect(isValidRepo('a'.repeat(100))).toBe(true);
    expect(isValidRepo('a'.repeat(101))).toBe(false);
    expect(isValidRepo('')).toBe(false);
    expect(isValidRepo('.')).toBe(false);
    expect(isValidRepo('..')).toBe(false);
    expect(isValidRepo('a/b')).toBe(false);
    expect(isValidRepo('a b')).toBe(false);
  });
});

describe('isValidRef', () => {
  it('accepts normal refs', () => {
    for (const ref of ['main', 'v1.2.3', 'feature/login', 'release-2024', '0123456789abcdef0123456789abcdef01234567']) {
      expect(isValidRef(ref), ref).toBe(true);
    }
  });

  it('rejects unsafe refs', () => {
    const refs = [
      '',
      '..',
      'a..b',
      '-x',
      '/x',
      'x/',
      'x.',
      'a//b',
      'a b',
      'a~b',
      'a^b',
      'a:b',
      'a?b',
      'a*b',
      'a[b',
      'a\\b',
      'a@{b',
      'x.lock',
      'a/.hidden',
      'a\u0000b',
      'a\u007fb',
      'a\nb',
    ];
    for (const ref of refs) expect(isValidRef(ref), JSON.stringify(ref)).toBe(false);
  });

  it('enforces the length limit', () => {
    expect(isValidRef('a'.repeat(MAX_REF_LENGTH))).toBe(true);
    expect(isValidRef('a'.repeat(MAX_REF_LENGTH + 1))).toBe(false);
  });
});

describe('isSafeRepoPath', () => {
  it('accepts normal relative paths', () => {
    for (const p of ['src', 'src/engine', 'a/b/c.ts', 'dir with space', '.github/workflows']) {
      expect(isSafeRepoPath(p), p).toBe(true);
    }
  });

  it('rejects traversal, absolute paths, empty segments, and control characters', () => {
    for (const p of ['', '/', '/abs', 'a/', 'a//b', '.', '..', 'a/../b', './a', 'a\\b', 'a\u0000b', 'a\nb']) {
      expect(isSafeRepoPath(p), JSON.stringify(p)).toBe(false);
    }
  });

  it('enforces the length limit', () => {
    expect(isSafeRepoPath('a'.repeat(MAX_PATH_LENGTH))).toBe(true);
    expect(isSafeRepoPath('a'.repeat(MAX_PATH_LENGTH + 1))).toBe(false);
  });
});
