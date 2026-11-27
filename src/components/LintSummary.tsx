// @node: F12.11
// What the Visual Linter measured and what it could not. Props only; all text is React text; no page text.
import type { PreviewState } from '../store/previewSlice';

export const STATIC_RENDER_NOTE = 'Static render (scripts off): pages built by JavaScript are not measured.';

const CANT_TEXT: Record<string, string> = {
  picture: 'colour over a gradient or picture', see_through: 'colour under a see-through layer', unparsed: 'a colour the reader cannot read',
  picture_placeholder: 'pictures that are placeholders', picture_loading: 'pictures still loading', picture_broken: 'pictures that did not load',
};

const KIND_TITLE: Record<string, string> = {
  'tap-target': 'Buttons or links too small to tap', 'text-small': 'Text too small', contrast: 'Text with low contrast', overlap: 'Boxes that overlap',
  'media-wide': 'Pictures wider than their box', nolimit: 'Pictures with no size limit written down', overflow: 'Text or page too wide',
};

function kindOf(f: PreviewState['layout']['findings'][number]): string {
  const k = f.measure?.kind ?? 'overflow';
  return k.startsWith('overflow') ? 'overflow' : k;
}

export function LintSummary({ layout }: { layout: PreviewState['layout'] }) {
  const counts = new Map<string, number>();
  for (const f of layout.findings) counts.set(kindOf(f), (counts.get(kindOf(f)) ?? 0) + 1);
  const cant = Object.entries(layout.cantMeasure ?? {}).filter(([, n]) => n > 0).sort();
  const cantTotal = cant.reduce((n, [, c]) => n + c, 0);
  return (
    <div className="lint-summary">
      <p className="note">{STATIC_RENDER_NOTE}</p>
      {layout.status === 'done' && (
        <>
          {counts.size > 0 && <ul>{[...counts].map(([k, n]) => <li key={k}>{KIND_TITLE[k] ?? k}: {n}</li>)}</ul>}
          {cantTotal > 0 && <p>Could not measure: {cantTotal} ({cant.map(([r, n]) => `${CANT_TEXT[r] ?? r}: ${n}`).join('; ')}).</p>}
          {(layout.outsideStyleFailed ?? 0) > 0 && <p role="status">An outside style could not be loaded, so measurements may differ.</p>}
        </>
      )}
    </div>
  );
}
