// @node: F2.2
import { describe, expect, it } from 'vitest';
import { containsSecret, redact } from '../src/engine/redact';

function r(text: string) { return redact(text).text; }
function count(text: string) { return redact(text).count; }
function kinds(text: string) { return redact(text).kinds; }
function changed(text: string) { return redact(text).text !== text; }

// ---------------------------------------------------------------------------
// 1. private_key
// ---------------------------------------------------------------------------

describe('private_key', () => {
  const terminated = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOg==\n-----END RSA PRIVATE KEY-----';
  const unterminated = '-----BEGIN EC PRIVATE KEY-----\nMIIBOg==';

  it('redacts a terminated block', () => {
    expect(r(terminated)).not.toContain('MIIBOg');
    expect(r(terminated)).toContain('[REDACTED:private_key]');
  });

  it('redacts an unterminated block to the end of the string', () => {
    expect(r(unterminated)).toContain('[REDACTED:private_key]');
    expect(r(unterminated)).not.toContain('MIIBOg');
  });

  it('leaves a string with no PEM header alone', () => {
    expect(changed('BEGIN PRIVATE KEY without dashes')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. github_token
// ---------------------------------------------------------------------------

describe('github_token', () => {
  const PAT = `ghp_${'A'.repeat(36)}`;
  const fine = `github_pat_${'B'.repeat(22)}`;

  it('redacts a 36-char ghp_ token', () => {
    expect(r(PAT)).toBe('[REDACTED:github_token]');
  });

  it('redacts a fine-grained PAT with 22 chars', () => {
    expect(r(fine)).toBe('[REDACTED:github_token]');
  });

  it('does NOT redact ghp_ + 35 chars (too short)', () => {
    expect(changed(`ghp_${'A'.repeat(35)}`)).toBe(false);
  });

  it('does NOT redact github_pat_ + 21 chars (too short)', () => {
    expect(changed(`github_pat_${'B'.repeat(21)}`)).toBe(false);
  });

  it('redacts ghs_, ghr_, gho_, ghu_ prefixes', () => {
    for (const prefix of ['ghs_', 'ghr_', 'gho_', 'ghu_']) {
      expect(r(`${prefix}${'X'.repeat(36)}`)).toContain('[REDACTED:github_token]');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. aws_access_key_id
// ---------------------------------------------------------------------------

describe('aws_access_key_id', () => {
  for (const prefix of ['AKIA', 'ASIA', 'AGPA', 'AIDA', 'AROA', 'ANPA', 'ANVA', 'AIPA']) {
    // Exactly 16 uppercase chars after the prefix = 20 chars total
    it(`redacts ${prefix} + 16 uppercase chars`, () => {
      expect(r(`${prefix}ABCDEFGHIJKLMNOP`)).toContain('[REDACTED:aws_access_key_id]');
    });
  }

  it('does NOT redact AKIA + 15 chars (19 total)', () => {
    // AKIA + 15 suffix = 19 total chars — one short of the 16-suffix requirement
    expect(changed('AKIAABCDEFGHIJKLMNO')).toBe(false);
  });

  it('DOES redact AKIA + 16 chars (20 total)', () => {
    // AKIA + 16 suffix = 20 total chars — exactly matches
    expect(changed('AKIAABCDEFGHIJKLMNOP')).toBe(true);
  });

  it('does NOT redact a random 20-char uppercase string', () => {
    expect(changed('ZZZZZZZZZZZZZZZZZZZZ')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. google_api_key
// ---------------------------------------------------------------------------

describe('google_api_key', () => {
  const key = `AIza${'A'.repeat(35)}`;

  it('redacts AIza + 35 chars', () => {
    expect(r(key)).toBe('[REDACTED:google_api_key]');
  });

  it('does NOT redact AIza + 34 chars', () => {
    expect(changed(`AIza${'A'.repeat(34)}`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. slack_token
// ---------------------------------------------------------------------------

describe('slack_token', () => {
  for (const prefix of ['xoxa', 'xoxb', 'xoxp', 'xoxr', 'xoxs']) {
    it(`redacts ${prefix}-... with 10+ chars`, () => {
      expect(r(`${prefix}-ABCDEFGHIJ`)).toContain('[REDACTED:slack_token]');
    });
  }

  it('does NOT redact xoxy- (unknown prefix)', () => {
    expect(changed('xoxy-ABCDEFGHIJ')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. jwt
// ---------------------------------------------------------------------------

describe('jwt', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  it('redacts a real-shaped JWT', () => {
    expect(r(jwt)).toContain('[REDACTED:jwt]');
  });

  it('does NOT redact two-segment base64url strings', () => {
    expect(changed('eyJhbGc.eyJzdWI.short')).toBe(false); // last segment < 8
  });
});

// ---------------------------------------------------------------------------
// 7. bearer_token
// ---------------------------------------------------------------------------

describe('bearer_token', () => {
  it('keeps the word Bearer and redacts the value', () => {
    // Use a plain alphanumeric value (not a github_token) so pattern 2 doesn't match first
    const result = r('Authorization: Bearer SomePlainOAuthToken123456');
    expect(result).toContain('Bearer');
    expect(result).toContain('[REDACTED:bearer_token]');
    expect(result).not.toContain('SomePlainOAuthToken');
  });

  it('does NOT redact Bearer + a short value (< 16 chars)', () => {
    expect(changed('Authorization: Bearer shortval')).toBe(false);
  });

  it('redacts Bearer with a 16-char value', () => {
    expect(changed('Authorization: Bearer 1234567890123456')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. assignment
// ---------------------------------------------------------------------------

describe('assignment: quoted values', () => {
  it('redacts a quoted value of 4 chars', () => {
    expect(r('password="1234"')).toContain('[REDACTED:assignment]');
    expect(r("password='1234'")).toContain('[REDACTED:assignment]');
  });

  it('does NOT redact a quoted value of 3 chars', () => {
    expect(changed('password="123"')).toBe(false);
    expect(changed("password='123'")).toBe(false);
  });

  it('handles all naming variants', () => {
    for (const name of ['password', 'passwd', 'secret', 'api_key', 'api-key', 'access_key',
                        'private_key', 'client_secret', 'token', 'TOKEN', 'API_KEY']) {
      const line = `${name}="longsecretvalue"`;
      expect(changed(line), line).toBe(true);
    }
  });

  it('handles = and : separators', () => {
    expect(r('token = "longsecretvalue"')).toContain('[REDACTED:assignment]');
    expect(r('token: "longsecretvalue"')).toContain('[REDACTED:assignment]');
  });
});

describe('assignment: unquoted values', () => {
  it('redacts an unquoted value of 8+ chars that contains a digit', () => {
    expect(r('token=abc12345')).toContain('[REDACTED:assignment]');
  });

  it('redacts an unquoted value of 8+ chars that contains a symbol', () => {
    expect(r('password=abc!defg')).toContain('[REDACTED:assignment]');
  });

  it('does NOT redact an unquoted value of 7 chars (too short)', () => {
    expect(changed('token=abc1234')).toBe(false);
  });

  it('does NOT redact type annotations like `token: string`', () => {
    expect(changed('token: string')).toBe(false);
    expect(changed('password: string')).toBe(false);
    expect(changed('apiKey: Promise<string>')).toBe(false);
  });

  it('does NOT redact `process.env.API_KEY` (unquoted, no digit/symbol in value)', () => {
    // The value "process.env.API_KEY" contains . and _ but NOT listed symbols
    expect(changed('token=process.env.API_KEY')).toBe(false);
  });

  it('leaves a value that is already a [REDACTED: placeholder alone', () => {
    const already = 'password=[REDACTED:assignment]';
    expect(r(already)).toBe(already);
  });
});

// ---------------------------------------------------------------------------
// Idempotence
// ---------------------------------------------------------------------------

describe('idempotence', () => {
  const fixtures = [
    `ghp_${'A'.repeat(36)}`,
    '-----BEGIN RSA PRIVATE KEY-----\ndata\n-----END RSA PRIVATE KEY-----',
    `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk`,
    'password="supersecret"',
    'token: string',
    'hello world no secrets here',
    '',
    `AKIA${'Z'.repeat(16)}`,
    `AIza${'X'.repeat(35)}`,
    'xoxb-ABCDEFGHIJ',
    'Bearer SomeTokenValueThatIsAtLeast16Chars',
  ];

  for (const text of fixtures) {
    it(`idempotent: ${text.slice(0, 40)}`, () => {
      const once = redact(text).text;
      const twice = redact(once).text;
      expect(twice).toBe(once);
    });
  }
});

// ---------------------------------------------------------------------------
// Counts and kinds
// ---------------------------------------------------------------------------

describe('counts and kinds', () => {
  it('counts multiple distinct secrets', () => {
    const text = `ghp_${'A'.repeat(36)} password="secret1234" AKIA${'Z'.repeat(16)}`;
    const result = redact(text);
    expect(result.count).toBe(3);
    expect(result.kinds).toContain('github_token');
    expect(result.kinds).toContain('assignment');
    expect(result.kinds).toContain('aws_access_key_id');
  });

  it('counts two of the same kind as 2', () => {
    const text = `ghp_${'A'.repeat(36)} ghp_${'B'.repeat(36)}`;
    expect(count(text)).toBe(2);
    expect(kinds(text)).toEqual(['github_token']);
  });

  it('returns count 0 and empty kinds for clean text', () => {
    expect(count('hello world')).toBe(0);
    expect(kinds('hello world')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------

describe('robustness', () => {
  it('never throws on empty string', () => {
    expect(() => redact('')).not.toThrow();
    expect(r('')).toBe('');
  });

  it('never throws on binary-looking input (NUL bytes, high code points)', () => {
    const bin = '\x00\x01\x02\x03\xff\xfe' + 'a'.repeat(100);
    expect(() => redact(bin)).not.toThrow();
  });

  it('handles Unicode and emoji without throwing', () => {
    expect(() => redact('🔑 password="secr3t!!" héllo wörld 🌍')).not.toThrow();
  });

  it('a 1 MB string of repeated BEGIN headers finishes quickly (no catastrophic backtracking)', () => {
    const big = '-----BEGIN '.repeat(50_000);
    const start = performance.now();
    redact(big);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it('a 1 MB string of one repeating character finishes quickly', () => {
    const big = 'a'.repeat(1_000_000);
    const start = performance.now();
    redact(big);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// containsSecret
// ---------------------------------------------------------------------------

describe('containsSecret', () => {
  const tokenLine = `ghp_${'A'.repeat(36)}`;

  it('returns true for a string with a secret', () => {
    expect(containsSecret(tokenLine)).toBe(true);
  });

  it('returns false for a clean string', () => {
    expect(containsSecret('hello world')).toBe(false);
  });

  it('finds a secret nested in an array', () => {
    expect(containsSecret([{ content: tokenLine }])).toBe(true);
  });

  it('finds a secret nested inside an object', () => {
    expect(containsSecret({ outer: { inner: tokenLine } })).toBe(true);
  });

  it('returns false for a clean nested object', () => {
    expect(containsSecret({ a: 'clean', b: ['also clean'] })).toBe(false);
  });

  it('returns false for null, number, and boolean', () => {
    expect(containsSecret(null)).toBe(false);
    expect(containsSecret(42)).toBe(false);
    expect(containsSecret(true)).toBe(false);
  });
});
