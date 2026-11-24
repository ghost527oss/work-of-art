// @node: F1.2
// GitHub repository URL parsing and input validators. Pure functions: no network,
// no React. Shared by the browser and the serverless endpoint.

export interface ParsedRepo {
  owner: string;
  repo: string;
  ref?: string;
}

export type ParseResult = { ok: true; value: ParsedRepo } | { ok: false; message: string };

export const MAX_INPUT_LENGTH = 500;
export const MAX_REF_LENGTH = 250;
export const MAX_PATH_LENGTH = 250;

const FORMAT_HELP = 'Enter a public GitHub repository URL such as https://github.com/owner/repo, or owner/repo.';

// Control characters (C0 range and DEL).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** GitHub user or organisation: letters, digits, single hyphens inside, 1 to 39 characters. */
export function isValidOwner(owner: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) && !owner.includes('--');
}

/** Repository name: letters, digits, '.', '_', '-', 1 to 100 characters, not '.' or '..'. */
export function isValidRepo(repo: string): boolean {
  return /^[A-Za-z0-9._-]{1,100}$/.test(repo) && repo !== '.' && repo !== '..';
}

/**
 * Branch, tag, or commit reference. Slashes are allowed (feature/x). Follows the
 * main git ref-name restrictions and rejects '..', control characters, a leading '-'.
 */
export function isValidRef(ref: string): boolean {
  if (ref.length === 0 || ref.length > MAX_REF_LENGTH) return false;
  if (CONTROL_CHARS.test(ref)) return false;
  if (ref.startsWith('-') || ref.startsWith('/') || ref.endsWith('/') || ref.endsWith('.')) return false;
  if (ref.includes('..') || ref.includes('//') || ref.includes('@{') || ref.endsWith('.lock')) return false;
  if (/[\s~^:?*[\\]/.test(ref)) return false;
  return ref.split('/').every((segment) => segment.length > 0 && !segment.startsWith('.'));
}

/** Repository-relative path (for scope entries): no traversal, no absolute paths. */
export function isSafeRepoPath(path: string): boolean {
  if (path.length === 0 || path.length > MAX_PATH_LENGTH) return false;
  if (CONTROL_CHARS.test(path) || path.includes('\\')) return false;
  if (path.startsWith('/') || path.endsWith('/')) return false;
  return path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function fail(message: string = FORMAT_HELP): ParseResult {
  return { ok: false, message };
}

function build(owner: string, rawRepo: string, ref?: string): ParseResult {
  const repo = rawRepo.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;
  if (!isValidOwner(owner)) return fail(`"${owner}" is not a valid GitHub owner name. ${FORMAT_HELP}`);
  if (!isValidRepo(repo)) return fail(`"${rawRepo}" is not a valid repository name. ${FORMAT_HELP}`);
  if (ref !== undefined && !isValidRef(ref)) return fail(`"${ref}" is not a valid branch, tag, or commit reference.`);
  const value: ParsedRepo = ref === undefined ? { owner, repo } : { owner, repo, ref };
  return { ok: true, value };
}

/**
 * Parses what the user typed into owner, repo, and optional ref.
 *
 * Accepted: https://github.com/o/r, trailing slash, `.git` suffix,
 * `/tree/<ref>` (ref may contain slashes), `github.com/o/r` without a scheme,
 * `www.github.com`, and the `o/r` shorthand. Anything else is rejected,
 * including other hosts and URLs with embedded credentials.
 */
export function parseRepoInput(input: string): ParseResult {
  const text = input.trim();
  if (text.length === 0) return fail('Enter a repository URL.  ' + FORMAT_HELP);
  if (text.length > MAX_INPUT_LENGTH) return fail('That input is too long. ' + FORMAT_HELP);
  if (/\s/.test(text) || CONTROL_CHARS.test(text)) return fail();

  const urlMatch = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.*)$/i.exec(text);
  if (urlMatch) {
    const rest = (urlMatch[1] ?? '').replace(/[?#].*$/, '');
    const parts = rest.split('/');
    while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
    const [owner, repo, kind, ...refParts] = parts;
    if (!owner || !repo) return fail();
    if (kind === undefined) return build(owner, repo);
    if (kind !== 'tree' || refParts.length === 0) {
      return fail('Only repository root and /tree/<branch> links are supported.');
    }
    let ref: string;
    try {
      ref = decodeURIComponent(refParts.join('/'));
    } catch {
      return fail('The branch name in that URL is not valid.');
    }
    return build(owner, repo, ref);
  }

  const shorthand = /^([^/]+)\/([^/]+)$/.exec(text);
  if (shorthand) return build(shorthand[1] ?? '', shorthand[2] ?? '');

  return fail();
}
