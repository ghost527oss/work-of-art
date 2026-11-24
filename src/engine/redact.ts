// @node: F2.2
// Secret redaction. Replaces known secret patterns with [REDACTED:<kind>].
// Fixed list of named patterns; no generic entropy detector.
// All operations are pure and never throw.
export type SecretKind =
  | 'private_key'
  | 'github_token'
  | 'aws_access_key_id'
  | 'google_api_key'
  | 'slack_token'
  | 'jwt'
  | 'bearer_token'
  | 'assignment';

export interface RedactResult {
  text: string;
  count: number;
  kinds: SecretKind[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function markerFor(kind: SecretKind): string {
  return `[REDACTED:${kind}]`;
}

/** Symbols (not `.` or `_`) that indicate an unquoted value is a real secret. */
function hasSecretSymbol(value: string): boolean {
  // Explicit check to avoid regex escaping ambiguity in test environments.
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (
      (c >= 48 && c <= 57) || // 0-9
      c === 33 || // !
      c === 35 || // #
      c === 36 || // $
      c === 37 || // %
      c === 38 || // &
      c === 42 || // *
      c === 43 || // +
      c === 45 || // -
      c === 47 || // /
      c === 61 || // =
      c === 64 || // @
      c === 94 || // ^
      c === 126   // ~
    ) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// Each entry: [kind, regex factory (called fresh each time to reset lastIndex)]
// ---------------------------------------------------------------------------

type PatternDef = [SecretKind, () => RegExp];

const PATTERNS: PatternDef[] = [
  // 1. PEM private key block (terminated or unterminated)
  ['private_key', () =>
    /-----BEGIN [\w ]*PRIVATE KEY-----[\s\S]*?(?:-----END [\w ]*PRIVATE KEY-----|$)/g,
  ],

  // 2. GitHub tokens: ghu_/ghp_/ghs_/ghr_/gho_ + 36-255 word chars,
  //    or github_pat_ + 22-255 chars from [A-Za-z0-9_]
  ['github_token', () =>
    /(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})/g,
  ],

  // 3. AWS access key IDs: known prefix + exactly 16 uppercase letters/digits
  ['aws_access_key_id', () =>
    /(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|AIPA)[A-Z0-9]{16}/g,
  ],

  // 4. Google API keys: AIza + 35 chars
  ['google_api_key', () =>
    /AIza[A-Za-z0-9_-]{35}/g,
  ],

  // 5. Slack tokens: xox{a,b,p,r,s}-... with 10+ chars
  ['slack_token', () =>
    /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  ],

  // 6. JWTs: three base64url segments, first starts eyJ, each >= 8 chars
  ['jwt', () =>
    /eyJ[A-Za-z0-9_-]{7,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  ],

  // 7. Bearer token: keep the word "Bearer", redact the value (16+ token chars).
  //    Run BEFORE github_token-style values can be pre-redacted by pattern 2.
  //    Character class for the value: letters, digits, _, -, ., ~, +, /, =
  ['bearer_token', () =>
    /(Bearer\s+)([A-Za-z0-9_.~+/=-]{16,})/g,
  ],

  // 8. Key=value / key: value assignments whose names suggest a secret.
  ['assignment', () => {
    const names =
      'password|passwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|token';
    // Quoted value: single or double quote, 4+ chars inside.
    // Unquoted value: 8+ non-whitespace, non-quote chars (checked for digit/symbol in callback).
    return new RegExp(
      `(?:${names})\\s*[:=]\\s*(?:(['""])((?:(?!\\1)[^\\r\\n]){4,})\\1|(?!\\[REDACTED:)([^\\s\\r\\n'"]{8,}))`,
      'gi',
    );
  }],
];

// ---------------------------------------------------------------------------
// Apply a single pattern
// ---------------------------------------------------------------------------

function applyPattern(text: string, kind: SecretKind, re: RegExp): string {
  if (kind === 'bearer_token') {
    // Keep the "Bearer " prefix, redact only the value portion.
    return text.replace(re, (_match: string, prefix: string, _val: string) => `${prefix}${markerFor(kind)}`);
  }

  if (kind === 'assignment') {
    return text.replace(re, (match: string, q: string | undefined, quotedVal: string | undefined, unquotedVal: string | undefined) => {
      if (q !== undefined && quotedVal !== undefined) {
        // Quoted match: replace the value part only, keeping the quotes.
        const afterSep = match.lastIndexOf(q);
        const beforeQuote = match.slice(0, afterSep - quotedVal.length - 1);
        return `${beforeQuote}${q}${markerFor(kind)}${q}`;
      }
      if (unquotedVal !== undefined) {
        // Unquoted match: only redact if it has a digit or a symbol from the secret set.
        if (hasSecretSymbol(unquotedVal)) {
          return match.slice(0, match.length - unquotedVal.length) + markerFor(kind);
        }
        return match; // e.g. `token: string` — leave alone.
      }
      return match;
    });
  }

  return text.replace(re, markerFor(kind));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Replaces likely secrets in `text` with `[REDACTED:<kind>]` markers.
 * Idempotent: markers are never re-redacted. Never throws.
 */
export function redact(text: string): RedactResult {
  try {
    let result = text;
    let count = 0;
    const kindsFound: SecretKind[] = [];

    for (const [kind, makeRe] of PATTERNS) {
      const re = makeRe();
      const before = result;
      result = applyPattern(result, kind, re);
      if (result !== before) {
        const markerRe = new RegExp(`\\[REDACTED:${kind}\\]`, 'g');
        const nowCount = (result.match(markerRe) ?? []).length;
        const wasCount = (before.match(markerRe) ?? []).length;
        const added = nowCount - wasCount;
        if (added > 0) {
          count += added;
          if (!kindsFound.includes(kind)) kindsFound.push(kind);
        }
      }
    }

    return { text: result, count, kinds: kindsFound };
  } catch {
    return { text, count: 0, kinds: [] };
  }
}

/**
 * Walks every string in a JSON value (string, array, or object, recursively)
 * and returns true if any string would be changed by redact().
 */
export function containsSecret(value: unknown): boolean {
  if (typeof value === 'string') return redact(value).count > 0;
  if (Array.isArray(value)) return value.some(containsSecret);
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(containsSecret);
  }
  return false;
}
