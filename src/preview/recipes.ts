// @node: F12.12
// Recipes: fixed, zero-AI CSS fixes for objective measured problems. A recipe builds validated declarations and a
// practice-copy change for one exactly mapped plain-HTML element. Nothing is applied here (the controller does that).
import { isSafeDeclaration, type StyleDeclaration } from '../edit/styleModel';
import { mapElement, REASONS, rewriteStartTag } from '../edit/elementMap';
import { suggestFix } from '../edit/suggestions';
import { hashText } from '../engine/diffApply';
import type { Finding } from '../engine/scanFindingTypes';
import { PREVIEW_LIMITS as L } from '../config/previewLimits';
import { parseCssColor, stepToward, toHex } from './colors';
import type { ElementEntry } from './previewDocument';
import type { UserEdit } from '../store/workActions';

export type RecipeOffer = { ok: true; edit: UserEdit; decls: StyleDeclaration[]; words: string } | { ok: false; reason: string };

export const NO_OVERLAP_RECIPE = 'Boxes that overlap need a design choice, so no automatic recipe is offered.';
const NO_COLOUR = 'No safe text colour was found for this background.';

/** The kind of a measured finding: the linter kind, or the overflow kind read from its fixed words. */
export function findingKind(f: Pick<Finding, 'measure' | 'extra' | 'skillId'>): string {
  if (f.measure) return f.measure.kind.replace(/^overflow-(text-wider|text-cut-bottom|page-wider)$/, (_m, k: string) => `overflow-${k === 'text-cut-bottom' ? 'text-cut' : k}`);
  const t = f.extra ?? '';
  if (t.startsWith('Text is wider than its box')) return 'overflow-text-wider';
  if (t.startsWith('Text is cut off at the bottom')) return 'overflow-text-cut';
  if (t.startsWith('The page is wider than the screen')) return 'overflow-page-wider';
  return 'unknown';
}

const WORDS: Record<string, string> = {
  'tap-target': 'make this tap target 44 px', 'text-small': 'raise this text to 14 px', contrast: 'raise this text contrast',
  'media-wide': 'limit this picture to its box', nolimit: 'limit this picture to its box',
  'overflow-text-wider': 'let this text wrap', 'overflow-text-cut': 'let this box grow', 'overflow-page-wider': 'limit this box to the screen',
};

/** The fixed declarations for a finding, or a plain reason why there are none. */
export function recipeDeclarations(f: Finding): StyleDeclaration[] | { reason: string } {
  const kind = findingKind(f);
  switch (kind) {
    case 'tap-target': {
      const d: StyleDeclaration[] = [{ prop: 'min-height', value: '44px' }, { prop: 'min-width', value: '44px' }];
      if (f.measure?.info?.display === 'inline') d.push({ prop: 'display', value: 'inline-block' });
      return d;
    }
    case 'text-small': return [{ prop: 'font-size', value: '14px' }];
    case 'contrast': {
      const fg = parseCssColor(`rgb(${hexToRgb(f.measure?.info?.fg)})`);
      const bg = parseCssColor(`rgb(${hexToRgb(f.measure?.info?.bg)})`);
      if (!fg || !bg || !f.measure) return { reason: NO_COLOUR };
      const next = stepToward(fg.rgb, bg.rgb, f.measure.limit);
      return next ? [{ prop: 'color', value: toHex(next) }] : { reason: NO_COLOUR };
    }
    case 'media-wide':
    case 'nolimit': return [{ prop: 'max-width', value: '100%' }, { prop: 'height', value: 'auto' }];
    case 'overflow-text-wider':
    case 'overflow-text-cut':
    case 'overflow-page-wider': { const d = suggestFix(f.extra); return d ? [d] : { reason: 'No recipe is available for this finding.' }; }
    case 'overlap': return { reason: NO_OVERLAP_RECIPE };
    default: return { reason: 'No recipe is available for this finding.' };
  }
}

function hexToRgb(hex: string | undefined): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  return m ? `${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}` : 'x';
}

/** The element a finding is about: same file, same first line. */
export function entryForFinding(elements: readonly ElementEntry[], f: Pick<Finding, 'path' | 'firstLine' | 'lastLine' | 'measure'>): ElementEntry | undefined {
  const onLine = elements.filter((e) => e.path === f.path && e.line === f.firstLine);
  const tag = f.measure?.info?.tag;
  const col = f.measure?.info?.col;
  // Several elements can start on one line: the finding remembers which one by tag and column.
  if (tag !== undefined && col !== undefined) return onLine.find((e) => e.tag === tag && String(e.col) === col);
  return onLine.find((e) => e.endLine === f.lastLine) ?? onLine[0];
}

/**
 * Builds the practice-copy change for a finding, or the plain reason there is none. `content` is the current practice
 * copy of the file and `tableHash` the hash the preview's element table was built from. `uniqueKey` keeps a recipe from
 * ever merging into an Edit pad change in History.
 */
export function recipeFor(f: Finding, elements: readonly ElementEntry[], content: string | undefined, tableHash: string, uniqueKey: string): RecipeOffer {
  const decls = recipeDeclarations(f);
  if (!Array.isArray(decls)) return { ok: false, reason: decls.reason };
  if (!decls.every(isSafeDeclaration)) return { ok: false, reason: 'No recipe is available for this finding.' };
  const entry = entryForFinding(elements, f);
  if (!entry) return { ok: false, reason: REASONS.changed };
  const m = mapElement(entry, content, tableHash);
  if (!m.ok) return { ok: false, reason: m.reason };
  const next = rewriteStartTag(content!, entry, decls);
  if (next === null) return { ok: false, reason: REASONS.changed };
  if (next === content) return { ok: false, reason: 'This element already has these styles.' };
  const words = WORDS[findingKind(f)] ?? 'fix this';
  return {
    ok: true, decls, words,
    edit: { path: entry.path, baseHash: hashText(content!), newContent: next, editKey: `recipe:${uniqueKey}`.slice(0, L.maxOutsideUrlChars), title: `Recipe: ${words} (${entry.tag}, line ${entry.line})` },
  };
}

/** The key used to compare findings before and after a recipe: the same problem on the same element. */
export function problemKey(f: Pick<Finding, 'skillId' | 'path' | 'firstLine' | 'measure' | 'extra'>): string {
  return `${f.skillId}|${f.path}|${f.firstLine}|${findingKind(f as Finding)}`;
}
