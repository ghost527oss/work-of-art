// @node: F9.1
// The writing rules for each reading level, used by tests (and available to authors).
import type { Level } from '../skillbook/playbookSchema';

export const JARGON = ['regex', 'AST', 'parse', 'token', 'payload', 'sanitize', 'middleware', 'endpoint', 'schema', 'async', 'callback', 'DOM', 'XSS', 'CSRF', 'CORS', 'SQL injection', 'namespace', 'boilerplate'];
export const BANNED = [/\bsecure\b/i, /\bis safe\b/i, /\bno problems\b/i, /\ball good\b/i, /\bscore\b/i, /\bgrade\b/i, /\d+\s?%/];

/** Splits on . ! ? followed by a space or the end; dots inside numbers and inside words such as .env are not ends. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=\S)/).map((s) => s.trim()).filter(Boolean);
}

export function countSentences(text: string): number {
  return sentences(text).length;
}

export function longestSentence(text: string): number {
  return Math.max(0, ...sentences(text).map((s) => s.split(/\s+/).filter(Boolean).length));
}

const LIMITS: Record<Level, { sentences: number; words: number }> = { simple: { sentences: 3, words: 20 }, practical: { sentences: 6, words: 28 }, deeper: { sentences: 10, words: 35 } };

/** Problems with one text at one level (empty when it follows the rules). */
export function checkLessonText(level: Level, text: string): string[] {
  const out: string[] = [];
  const l = LIMITS[level];
  if (countSentences(text) > l.sentences) out.push(`more than ${l.sentences} sentences`);
  if (longestSentence(text) > l.words) out.push(`a sentence longer than ${l.words} words`);
  for (const b of BANNED) if (b.test(text)) out.push(`banned wording ${b}`);
  if (level === 'simple') {
    for (const j of JARGON) if (new RegExp(`\\b${j}\\b`, 'i').test(text)) out.push(`jargon "${j}"`);
    if (/[`(){}<>]/.test(text)) out.push('code characters');
  }
  return out;
}
