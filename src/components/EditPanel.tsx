// @node: F4.8
// @node: F8.7 (the full Edit pad when `pad` is given; otherwise the 2B text)
// The Edit panel. Opening it pauses the practice run (2B). With the Edit pad (2E-2) it edits the preview's page.
import { useEffect, useSyncExternalStore } from 'react';
import { EDIT_LIMITS } from '../config/editLimits';
import { mapElement } from '../edit/elementMap';
import { previewInfoStore } from '../edit/previewHandle';
import { parseInlineStyle } from '../edit/inlineStyle';
import { practiceContent } from '../engine/practiceScript';
import { tokenizeHtml } from '../preview/htmlTokens';
import type { HarnessActions } from '../hooks/useHarness';
import type { EditActions } from '../hooks/useEditPad';
import type { PreviewActions } from '../hooks/usePreview';
import { useRecipe, offerFor, NEED_FULL_CHECK, FULL_WIDTHS } from '../hooks/useRecipe';
import { studioStore, useStudioStore } from '../store/useStudioStore';
import { EditTools, LayoutFixList, PreviewOnlyList, PropertyForm, SelectionInfo } from './EditPads';

export interface EditPanelProps {
  mode: 'automation' | 'self_editing';
  pad?: EditActions;
  preview?: PreviewActions;
  harness?: HarnessActions;
}

function useInfo() {
  return useSyncExternalStore(previewInfoStore.subscribe, previewInfoStore.getState, previewInfoStore.getState);
}

function Pad({ pad, preview, harness }: Required<Omit<EditPanelProps, 'mode'>>) {
  const info = useInfo();
  const pv = useStudioStore((s) => s.preview);
  const edit = useStudioStore((s) => s.edit);
  const snapshot = useStudioStore((s) => s.snapshot);
  const applied = useStudioStore((s) => s.work.applied);
  const undone = useStudioStore((s) => s.work.undone);
  const chat = useStudioStore((s) => s.work.chat);
  const recipe = useRecipe();
  const narrow = typeof window !== 'undefined' && window.innerWidth < EDIT_LIMITS.minWindow;

  useEffect(() => { if (pv.scripts) { preview.setScripts(false); pad.setReply('Scripts were turned off because editing needs look-only mode.'); } }, [pv.scripts, preview, pad]);

  const availability =
    pv.mode === 'source' ? 'Editing needs a page preview. This project has no page to show.'
    : pv.status !== 'ready' || !info.editable ? 'Editing starts when the preview is ready.'
    : narrow ? 'Editing needs a wider window.' : null;
  const disabled = availability !== null;
  const selected = edit.selection.map((k) => info.elements.find((e) => e.key === k)).filter((e): e is NonNullable<typeof e> => !!e);
  const describe = (e: (typeof selected)[number]) => {
    const content = snapshot ? practiceContent(snapshot, applied, e.path) : undefined;
    const m = info.mode === 'static' ? mapElement(e, content, info.tableHash) : { ok: false as const, reason: e.reason ?? 'This element comes from a component picture, which is approximate.' };
    const tok = content ? tokenizeHtml(content.slice(e.startOffset, e.endOffset))[0] : undefined;
    const id = tok?.attrs?.find((a) => a.name === 'id')?.value;
    const cls = tok?.attrs?.find((a) => a.name === 'class')?.value;
    void parseInlineStyle;
    return { mapped: m.ok, reason: m.ok ? undefined : m.reason, attrs: [id ? `#${id}` : '', cls ? `.${cls.split(/\s+/).join('.')}` : ''].join(' ').trim() };
  };
  const mappedCount = selected.filter((e) => describe(e).mapped).length;
  const layoutFindings = pv.layout.status === 'done' ? pv.layout.findings : [];
  const lastReply = chat.at(-1);
  const existing = new Set(info.elements.map((e) => e.key!).filter(Boolean));
  return (
    <>
      {availability && <p role="status">{availability}</p>}
      {edit.reply && <p className="note">{edit.reply}</p>}
      <p>Changes here edit PatchBay&apos;s practice copy only. Your repository is never changed.</p>
      <p>
        <button type="button" onClick={() => harness.run('undo')}>Undo</button>{' '}
        <button type="button" onClick={() => harness.run('redo')}>Redo</button>{' '}
        {lastReply && (lastReply.command === 'undo' || lastReply.command === 'redo') && <span className="note">{lastReply.reply}</span>}
      </p>
      <p className="note">History: {applied.length + undone.length} changes. Type undo or redo in AI Chat, or use the buttons above.</p>
      <EditTools tool={edit.tool} disabled={disabled} onTool={pad.setTool} elements={info.elements} onPick={(k) => pad.select([k])} />
      {edit.notice && <p className="note">{edit.notice}</p>}
      <SelectionInfo selected={selected} mappedCount={mappedCount} describe={describe} />
      <PropertyForm
        disabled={disabled || selected.length === 0}
        onCommit={(decls) => { pad.commit(decls); }}
        onResetGroup={(props) => { const keys = new Set(edit.selection); pad.removePreviewOnly((c) => keys.has(c.elementKey) && props.includes(c.property)); }}
      />
      <PreviewOnlyList
        items={edit.previewOnly} suggestions={edit.suggestions} existing={existing}
        onRemove={(c) => pad.removePreviewOnly((x) => x === c)} onRemoveAll={() => pad.removePreviewOnly(() => true)}
        onKeep={(c) => pad.keepSuggestion(c.elementKey, c.property)} onDiscard={(c) => pad.discardSuggestion(c.elementKey, c.property)}
        stillThere={(c) => {
          if (pv.layout.status !== 'done') return undefined;
          const el = info.elements.find((e) => e.key === c.elementKey);
          return !!el && pv.layout.findings.some((f) => f.path === el.path && f.firstLine === el.line);
        }}
      />
      <LayoutFixList
        findings={layoutFindings} isWorkbench={pv.mode === 'workbench'} canCheck={!disabled && pv.mode === 'static'}
        status={pv.layout.status === 'done' ? `Checked at ${pv.layout.widths.join(', ')} px.` : pv.layout.message ?? ''}
        onCheck={() => { void previewInfoStore; document.querySelector<HTMLButtonElement>('.sandbox .preview-toolbar button[data-check="one"]')?.click(); }}
        onCheckAll={() => document.querySelector<HTMLButtonElement>('.sandbox .preview-toolbar button[data-check="all"]')?.click()}
        onTry={pad.tryFix}
        recipe={{
          busy: pv.recipe?.status === 'applying' || pv.recipe?.status === 'measuring',
          state: pv.recipe,
          reasonFor: (f) => {
            if (!FULL_WIDTHS.every((w) => pv.layout.widths.includes(w))) return NEED_FULL_CHECK;
            const o = offerFor(studioStore.getState(), info, f);
            return o.ok ? null : o.reason;
          },
          onRecipe: (f) => recipe.start(f.id),
        }}
      />
    </>
  );
}

export function EditPanel({ mode, pad, preview, harness }: EditPanelProps) {
  return (
    <section aria-labelledby="edit-heading">
      <h2 id="edit-heading">Edit</h2>
      <p>Mode: {mode === 'self_editing' ? 'Self-editing' : 'Automation'}.</p>
      <p>Opening this panel pauses the practice run. Type resume in AI Chat to continue.</p>
      {pad && preview && harness ? <Pad pad={pad} preview={preview} harness={harness} /> : <p className="note">Editing tools arrive in sub-phase 2E.</p>}
    </section>
  );
}
