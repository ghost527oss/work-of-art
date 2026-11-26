// @node: F3.5
// @node: F4.9 (Stop bar, History and Edit panels, optional harness prop)
// @node: F9.10 (Journal panel, Export changes, log downloads, Learn more)
// @node: F10.7 (Reset session and Saved in this browser in Project info)
// The Studio shell (sub-phase 2A). Screen 3 has a left area (Sandbox placeholder and Project
// info), one right-hand panel, and the vertical toolbar on the far right edge. Screens 4 and 5
// are empty pages without the toolbar. The screen comes from the screen store and the layout
// from the layout store; this component owns no screen state of its own. The AI panel is
// always rendered (hidden when another panel is open) so its form and request survive switching.
import { layoutStore, useLayout } from '../hooks/useLayout';
import { shellActions, useShellView } from '../hooks/useShell';
import type { AssistantActions } from '../hooks/useAssistant';
import type { HarnessActions } from '../hooks/useHarness';
import type { UnderstandingActions } from '../hooks/useUnderstanding';
import type { ScanActions } from '../hooks/useScan';
import type { PreviewActions } from '../hooks/usePreview';
import type { EditActions } from '../hooks/useEditPad';
import { SandboxPanel } from './SandboxPanel';
import { closePanel, setCollapsed, toggleWidth, togglePanel, type PanelId } from '../store/layoutSlice';
import { useStudioStore } from '../store/useStudioStore';
import { AIAssistantPanel } from './AIAssistantPanel';
import { DomainScreen } from './DomainScreen';
import { EditPanel } from './EditPanel';
import { HistoryPanel } from './HistoryPanel';
import { StopBar } from './StopBar';
import { LogPanel } from './LogPanel';
import { PanelFrame } from './PanelFrame';
import { JournalPanel } from './JournalPanel';
import { useJournalModel, useJournalState, type ExportActions, type JournalActions } from '../hooks/useJournal';
import { requestViewer } from '../edit/previewHandle';
import { useMemo } from 'react';
import { ProjectInfo } from './ProjectInfo';
import { SandboxPlaceholder } from './SandboxPlaceholder';
import { SkeletonCrewScreen } from './SkeletonCrewScreen';
import { StudioToolbar } from './StudioToolbar';

export interface StudioLayoutProps {
  onLoadFolders(folders: string[]): void;
  onCancel(): void;
  onRetry(): void;
  onDismissError(): void;
  onBack(): void;
  assistant: AssistantActions;
  /** Sub-phase 2B. When absent the Studio looks as it did in 2A (no Stop bar). */
  harness?: HarnessActions;
  /** Sub-phase 2C. When absent the Project understanding section is not shown. */
  understanding?: UnderstandingActions;
  /** Sub-phase 2D. With `harness` it makes Screens 4 and 5 live. */
  scan?: ScanActions;
  /** Sub-phase 2E-1. When given, the Sandbox panel replaces the placeholder. */
  preview?: PreviewActions;
  /** Sub-phase 2E-2. With `preview` and `harness`, the Edit panel becomes the Edit pad. */
  editPad?: EditActions;
  /** Sub-phase 2F. When absent the Journal panel shows only a short note. */
  journal?: { actions: JournalActions; exports: ExportActions };
  /** Sub-phase 2G. */
  session?: { onReset(): void; savedRows(): readonly import('../store/sessionRecord').SavedRow[] };
}

const PANEL_TITLES: Record<PanelId, string> = {
  edit: 'Edit',
  ai: 'AI Chat',
  log: 'Log',
  history: 'History',
  journal: 'Journal',
};

function HarnessBar({ harness }: { harness: HarnessActions }) {
  const run = useStudioStore((s) => s.work.run);
  const waiting = useStudioStore((s) => s.work.proposal !== null);
  const aiPending = useStudioStore((s) => s.ai.status === 'pending');
  const selfEditing = useLayout((l) => l.openPanel === 'edit');
  return (
    <StopBar
      mode={selfEditing ? 'self_editing' : 'automation'}
      run={run ? { kind: run.kind, status: run.status, position: run.position, total: run.steps.length, autoAdvance: run.autoAdvance } : null}
      waiting={waiting}
      aiPending={aiPending}
      onStop={harness.stop}
    />
  );
}

export function StudioLayout({ onLoadFolders, onCancel, onRetry, onDismissError, onBack, assistant, harness, understanding, scan, preview, editPad, journal, session }: StudioLayoutProps) {
  const hasSnapshot = useStudioStore((s) => s.snapshot !== undefined);
  if (!hasSnapshot) return null;
  return (
    <div className="studio-root">
      {harness && <HarnessBar harness={harness} />}
      <StudioScreens
        onLoadFolders={onLoadFolders}
        onCancel={onCancel}
        onRetry={onRetry}
        onDismissError={onDismissError}
        onBack={onBack}
        assistant={assistant}
        harness={harness}
        understanding={understanding}
        scan={scan}
        preview={preview}
        editPad={editPad}
        journal={journal}
        session={session}
      />
    </div>
  );
}

function StudioScreens({ onLoadFolders, onCancel, onRetry, onDismissError, onBack, assistant, harness, understanding, scan, preview, editPad, journal, session }: StudioLayoutProps) {
  const snapshot = useStudioStore((s) => s.snapshot);
  const log = useStudioStore((s) => s.log);
  const work = useStudioStore((s) => s.work);
  const view = useShellView();
  const layout = useLayout((l) => l);

  if (!snapshot) return null;

  if (view.screen === 'skeleton') {
    return (
      <main className="shell">
        <div className="shell-left">
          {preview ? <SandboxPanel preview={preview} /> : <SandboxPlaceholder />}
        </div>
        <SkeletonCrewScreen onOpenArea={shellActions.openDomain} onBack={shellActions.backToStudio} live={harness && scan ? { harness, scan, onOpened: shellActions.backToStudio } : undefined} />
      </main>
    );
  }

  if (view.screen === 'domain') {
    return (
      <main className="shell">
        <div className="shell-left">
          {preview ? <SandboxPanel preview={preview} /> : <SandboxPlaceholder />}
        </div>
        <DomainScreen area={view.area} onBackToSkeleton={shellActions.backToSkeleton} onBackToStudio={shellActions.backToStudio} live={harness ? { harness, onOpened: shellActions.backToStudio, onLearnMore: journal?.actions.openLesson, scan } : undefined} />
      </main>
    );
  }

  const open = layout.openPanel;
  const covered = open !== null && !layout.collapsed;
  return (
    <main className="shell">
      <div className={covered ? 'shell-left covered' : 'shell-left'}>
        {preview ? <SandboxPanel preview={preview} pad={editPad} /> : <SandboxPlaceholder />}
        <ProjectInfo onLoadFolders={onLoadFolders} onCancel={onCancel} onRetry={onRetry} onDismissError={onDismissError} onBack={onBack} understanding={understanding} session={session} />
      </div>
      <PanelFrame
        title={PANEL_TITLES[open ?? 'ai']}
        open={open !== null}
        collapsed={layout.collapsed}
        width={layout.width}
        onToggleCollapsed={() => layoutStore.update((s) => setCollapsed(s, !s.collapsed))}
        onToggleWidth={() => layoutStore.update(toggleWidth)}
        onClose={() => {
          const id = open;
          layoutStore.update(closePanel);
          // Keep keyboard focus: move it to the toolbar button of the panel that was just closed.
          if (id && typeof document !== 'undefined') {
            requestAnimationFrame(() => document.querySelector<HTMLElement>(`nav.toolbar [data-panel="${id}"]`)?.focus());
          }
        }}
      >
        <div hidden={open !== 'ai'}>
          <AIAssistantPanel key={snapshot.id} snapshot={snapshot} assistant={assistant} harness={harness} />
        </div>
        {open === 'log' && <LogPanel entries={log} onDownload={journal?.exports.exportLog} />}
        {open === 'edit' && <EditPanel mode="self_editing" pad={editPad} preview={preview} harness={harness} />}
        {open === 'history' && <HistoryWithExport work={work} exports={journal?.exports} />}
        {open === 'journal' && (journal ? <JournalContainer journal={journal} understanding={understanding} /> : <section aria-label="Journal"><h3>Journal</h3><p>The Journal is not connected.</p></section>)}
      </PanelFrame>
      <StudioToolbar
        openPanel={open}
        onTogglePanel={(id) => layoutStore.update((s) => togglePanel(s, id))}
        onSkeleton={shellActions.openSkeleton}
      />
    </main>
  );
}

function HistoryWithExport({ work, exports }: { work: { applied: import('../store/workSlice').HistoryEntry[]; undone: import('../store/workSlice').HistoryEntry[] }; exports?: ExportActions }) {
  const snapshot = useStudioStore((s) => s.snapshot);
  const previewOnly = useStudioStore((s) => s.edit.previewOnly.length);
  // Rebuilt only when the History, the snapshot, or the Preview Only count changes.
  const plan = useMemo(() => (exports ? exports.patchPlan() : null), [exports, work.applied, snapshot, previewOnly]);
  return (
    <HistoryPanel
      applied={work.applied}
      undone={work.undone}
      exporter={exports && plan ? { plan, fileName: exports.patchName(), onDownload: exports.exportPatch } : undefined}
    />
  );
}

function JournalContainer({ journal, understanding }: { journal: { actions: JournalActions; exports: ExportActions }; understanding?: UnderstandingActions }) {
  const { level, focusLesson } = useJournalState();
  const model = useJournalModel(level);
  const error = useStudioStore((s) => (s.understanding.status === 'failed' ? s.understanding.error : undefined));
  return (
    <JournalPanel
      model={model}
      onLevel={journal.actions.setLevel}
      focus={focusLesson}
      onFocus={(id) => journal.actions.openLesson(id)}
      onFocusDone={journal.actions.clearFocus}
      onOpenViewer={(path, line) => requestViewer(path, line)}
      onDownload={() => journal.exports.exportJournal(model)}
      analysisError={error}
      onRetry={understanding?.run}
    />
  );
}
