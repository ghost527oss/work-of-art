// @node: F8.7
// Parts of the Edit pad: tools, selection details, the property form, the Preview Only list, and the layout block.
import { useState } from 'react';
import * as S from '../edit/styleModel';
import type { FieldResult, StyleDeclaration } from '../edit/styleModel';
import type { ElementEntry } from '../preview/previewDocument';
import type { EditTool, PreviewOnlyChange } from '../store/editSlice';
import type { Finding } from '../engine/scanFindingTypes';

export function EditTools({ tool, disabled, onTool, elements, onPick }: { tool: EditTool; disabled: boolean; onTool(t: EditTool): void; elements: readonly ElementEntry[]; onPick(key: string): void }) {
  return (
    <div className="edit-tools">
      <span role="group" aria-label="Edit tools">
        {(['select', 'lasso', 'background'] as EditTool[]).map((t) => (
          <button key={t} type="button" disabled={disabled} aria-pressed={tool === t} onClick={() => onTool(t)}>{t === 'select' ? 'Select' : t === 'lasso' ? 'Lasso' : 'Background'}</button>
        ))}
      </span>{' '}
      <label>Pick from list <select disabled={disabled} value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
        <option value="">Choose an element</option>
        {elements.slice(0, 200).map((e) => <option key={e.key} value={e.key}>{`${e.tag}, line ${e.line}`}</option>)}
      </select></label>
    </div>
  );
}

export function SelectionInfo({ selected, mappedCount, describe }: { selected: readonly ElementEntry[]; mappedCount: number; describe(e: ElementEntry): { mapped: boolean; reason?: string; attrs: string } }) {
  if (selected.length === 0) return <p>Select something in the preview to edit it.</p>;
  if (selected.length > 1) return <p>{selected.length} elements selected, {mappedCount} can be written to the practice copy.</p>;
  const e = selected[0]!;
  const d = describe(e);
  return <p><strong>{e.tag}</strong>{d.attrs ? ` ${d.attrs}` : ''}. {d.mapped ? `Writes to ${e.path}, line ${e.line}.` : `Preview Only: ${d.reason}`}</p>;
}

type Commit = (decls: StyleDeclaration[]) => void;

function NumField({ label, unit, range, value, build, onCommit }: { label: string; unit: string; range: string; value?: string; build(v: string): FieldResult; onCommit: Commit }) {
  const [text, setText] = useState(value ?? '');
  const [error, setError] = useState<string | null>(null);
  const commit = () => { if (text.trim() === '') return; const r = build(text); if (r.ok) { setError(null); onCommit([r.decl]); } else setError(r.error); };
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <p>
      <label htmlFor={id}>{label} ({unit}, {range})</label>{' '}
      <input id={id} type="number" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
      {error && <span className="error" role="alert"> {error}</span>}
    </p>
  );
}

function ColorField({ label, build, onCommit }: { label: string; build(v: string): FieldResult; onCommit: Commit }) {
  const id = `c-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return <p><label htmlFor={id}>{label}</label> <input id={id} type="color" onChange={(e) => { const r = build(e.target.value); if (r.ok) onCommit([r.decl]); }} /></p>;
}

export function PropertyForm({ disabled, onCommit, onResetGroup }: { disabled: boolean; onCommit: Commit; onResetGroup(props: string[]): void }) {
  const [unit, setUnit] = useState<'px' | '%'>('px');
  const [same, setSame] = useState(true);
  const [shadowColor, setShadowColor] = useState('#000000');
  const [grad, setGrad] = useState({ a: '#000000', b: '#ffffff', angle: '90' });
  const sides = (kind: 'padding' | 'margin') => (v: string): FieldResult => {
    const r = (kind === 'padding' ? S.padding : S.margin)('top', v);
    return r;
  };
  const commitSides = (kind: 'padding' | 'margin', side?: S.Side) => (decls: StyleDeclaration[]) => {
    const value = decls[0]!.value;
    onCommit((side && !same ? [side] : S.SIDES).map((s) => ({ prop: `${kind}-${s}`, value })));
  };
  const reset = (props: string[]) => <button type="button" className="link-button" onClick={() => onResetGroup(props)}>Reset</button>;
  return (
    <fieldset disabled={disabled} className="property-form">
      <legend>Style</legend>
      <details><summary>Size</summary>
        <p><label>Unit <select value={unit} onChange={(e) => setUnit(e.target.value as 'px' | '%')}><option value="px">px</option><option value="%">%</option></select></label></p>
        <NumField label="Width" unit={unit} range={unit === 'px' ? '0 to 5000' : '0 to 100'} build={(v) => S.size('width', v, unit)} onCommit={onCommit} />
        <NumField label="Height" unit={unit} range={unit === 'px' ? '0 to 5000' : '0 to 100'} build={(v) => S.size('height', v, unit)} onCommit={onCommit} />
        <p><button type="button" onClick={() => onCommit([{ prop: 'width', value: 'auto' }, { prop: 'height', value: 'auto' }])}>Auto size</button> {reset(['width', 'height'])}</p>
      </details>
      <details><summary>Corners</summary>
        <NumField label="Corner radius" unit="px" range="0 to 500" build={(v) => S.radius(v, 'px')} onCommit={onCommit} /> {reset(['border-radius'])}
      </details>
      <details><summary>Spacing</summary>
        <p><label className="check"><input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} /> Same on all sides</label></p>
        {(same ? [undefined] : S.SIDES).map((side) => (
          <div key={side ?? 'all'}>
            <NumField label={`Padding${side ? ` ${side}` : ''}`} unit="px" range="0 to 500" build={sides('padding')} onCommit={commitSides('padding', side)} />
            <NumField label={`Margin${side ? ` ${side}` : ''}`} unit="px" range="-500 to 500" build={sides('margin')} onCommit={commitSides('margin', side)} />
          </div>
        ))}
        {reset(S.SIDES.flatMap((s) => [`padding-${s}`, `margin-${s}`]))}
      </details>
      <details><summary>Border</summary>
        <NumField label="Border width" unit="px" range="0 to 50" build={S.borderWidth} onCommit={onCommit} />
        <p><label>Border style <select defaultValue="" onChange={(e) => { const r = S.borderStyle(e.target.value); if (r.ok) onCommit([r.decl]); }}>
          <option value="" disabled>Choose</option><option value="none">none</option><option value="solid">solid</option><option value="dashed">dashed</option><option value="dotted">dotted</option>
        </select></label></p>
        <ColorField label="Border colour" build={(v) => S.color('border-color', v)} onCommit={onCommit} /> {reset(['border-width', 'border-style', 'border-color'])}
      </details>
      <details><summary>Shadow</summary>
        <p><label>Shadow colour <input type="color" value={shadowColor} onChange={(e) => setShadowColor(e.target.value)} /></label></p>
        <p>{(['none', 'small', 'medium', 'large'] as S.ShadowPreset[]).map((p) => <button key={p} type="button" onClick={() => { const r = S.shadow(p, shadowColor); if (r.ok) onCommit([r.decl]); }}>{p[0]!.toUpperCase() + p.slice(1)}</button>)} {reset(['box-shadow'])}</p>
      </details>
      <details><summary>Text</summary>
        <NumField label="Font size" unit="px" range="6 to 200" build={S.fontSize} onCommit={onCommit} />
        <ColorField label="Text colour" build={(v) => S.color('color', v)} onCommit={onCommit} /> {reset(['font-size', 'color'])}
      </details>
      <details><summary>Background</summary>
        <ColorField label="Background colour" build={S.background} onCommit={onCommit} />
        <p><button type="button" onClick={() => onCommit([{ prop: 'background-color', value: 'transparent' }])}>Transparent</button></p>
        <p>
          <label>Gradient from <input type="color" value={grad.a} onChange={(e) => setGrad({ ...grad, a: e.target.value })} /></label>{' '}
          <label>to <input type="color" value={grad.b} onChange={(e) => setGrad({ ...grad, b: e.target.value })} /></label>{' '}
          <label>angle (0 to 360) <input type="number" value={grad.angle} onChange={(e) => setGrad({ ...grad, angle: e.target.value })} /></label>{' '}
          <button type="button" onClick={() => { const r = S.gradient(grad.a, grad.b, grad.angle); if (r.ok) onCommit([r.decl]); }}>Gradient</button>{' '}
          <button type="button" onClick={() => onCommit([{ prop: 'background-image', value: 'none' }])}>No gradient</button>
        </p>
        {reset(['background-color', 'background-image'])}
      </details>
    </fieldset>
  );
}

export function PreviewOnlyList({ items, suggestions, existing, onRemove, onRemoveAll, onKeep, onDiscard }: {
  items: readonly PreviewOnlyChange[]; suggestions: readonly PreviewOnlyChange[]; existing: ReadonlySet<string>;
  onRemove(c: PreviewOnlyChange): void; onRemoveAll(): void; onKeep(c: PreviewOnlyChange): void; onDiscard(c: PreviewOnlyChange): void;
}) {
  return (
    <section aria-labelledby="po-heading">
      <h3 id="po-heading">Preview Only ({items.length})</h3>
      {items.length === 0 && suggestions.length === 0 ? <p>No Preview Only changes.</p> : (
        <ul>
          {items.map((c) => (
            <li key={`${c.scope}|${c.elementKey}|${c.property}`}>{c.elementKey}: {c.property} {c.value}. {existing.has(c.elementKey) ? c.reason : 'element not found'} <button type="button" onClick={() => onRemove(c)}>Remove</button></li>
          ))}
          {suggestions.map((c) => (
            <li key={`s|${c.elementKey}|${c.property}`}>Suggestion for {c.elementKey}: {c.property} {c.value}. <button type="button" onClick={() => onKeep(c)}>Keep</button> <button type="button" onClick={() => onDiscard(c)}>Discard</button></li>
          ))}
        </ul>
      )}
      {items.length > 0 && <p><button type="button" onClick={onRemoveAll}>Remove all</button></p>}
    </section>
  );
}

export function LayoutFixList({ findings, isWorkbench, status, canCheck, onCheck, onCheckAll, onTry }: {
  findings: readonly Finding[]; isWorkbench: boolean; status: string; canCheck: boolean; onCheck(): void; onCheckAll(): void; onTry(f: Finding): void;
}) {
  if (isWorkbench) return <section><h3>Layout</h3><p>Layout checks run on real pages, not on approximate pictures.</p></section>;
  return (
    <section aria-labelledby="layout-heading">
      <h3 id="layout-heading">Layout ({findings.length} findings)</h3>
      <p><button type="button" disabled={!canCheck} onClick={onCheck}>Check layout</button> <button type="button" disabled={!canCheck} onClick={onCheckAll}>Check at all widths</button> <span className="note">{status}</span></p>
      {findings.length === 0 ? <p>No layout findings.</p> : (
        <ul>{findings.map((f) => <li key={f.id}>{f.path}, line {f.firstLine}: {f.extra} <button type="button" onClick={() => onTry(f)}>Try a fix</button></li>)}</ul>
      )}
    </section>
  );
}
