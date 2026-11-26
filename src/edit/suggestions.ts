// @node: F8.4
// The three layout suggestions (Try a fix), built from fixed validated declarations.
import { SUGGESTION_DECLS, type StyleDeclaration } from './styleModel';

export function suggestFix(extra: string | undefined): StyleDeclaration | null {
  const t = extra ?? '';
  if (t.startsWith('Text is wider than its box')) return { ...SUGGESTION_DECLS['text-wider'] };
  if (t.startsWith('Text is cut off at the bottom')) return { ...SUGGESTION_DECLS['text-cut-bottom'] };
  if (t.startsWith('The page is wider than the screen')) return { ...SUGGESTION_DECLS['page-wider'] };
  return null;
}
