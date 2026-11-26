// @node: F3.5
// @node: F4.9 (Stop bar, History and Edit panels, optional harness prop)
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
import { closePanel, setCollapsed, toggleWidth, togglePanel, type PanelId } from '../store/layoutSlice';
import { useStudioStore } from '../store/useStudioStore';
import { AIAssistantPanel } from './AIAssistantPanel';
import { DomainScreen } from './DomainScreen';
import { EditPanel } from './EditPanel';
import { HistoryPanel } from './HistoryPanel';
import { StopBar } from './StopBar';
import { LogPanel } from './LogPanel';
import { PanelFrame } from './PanelFrame';
import { PlaceholderPanel } from './PlaceholderPanel';
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
      run={run ? { status: run.status, position: run.position, total: run.steps.length, autoAdvance: run.autoAdvance } : null}
      waiting={waiting}
      aiPending={aiPending}
      onStop={harness.stop}
    />
  );
}

export function StudioLayout({ onLoadFolders, onCancel, onRetry, onDismissError, onBack, assistant, harness, understanding }: StudioLayoutProps) {
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
      />
    </div>
  );
}

function StudioScreens({ onLoadFolders, onCancel, onRetry, onDismissError, onBack, assistant, harness, understanding }: StudioLayoutProps) {
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
          <SandboxPlaceholder />
        </div>
        <SkeletonCrewScreen onOpenArea={shellActions.openDomain} onBack={shellActions.backToStudio} />
      </main>
    );
  }

  if (view.screen === 'domain') {
    return (
      <main className="shell">
        <div className="shell-left">
          <SandboxPlaceholder />
        </div>
        <DomainScreen area={view.area} onBackToSkeleton={shellActions.backToSkeleton} onBackToStudio={shellActions.backToStudio} />
      </main>
    );
  }

  const open = layout.openPanel;
  const covered = open !== null && !layout.collapsed;
  return (
    <main className="shell">
      <div className={covered ? 'shell-left covered' : 'shell-left'}>
        <SandboxPlaceholder />
        <ProjectInfo onLoadFolders={onLoadFolders} onCancel={onCancel} onRetry={onRetry} onDismissError={onDismissError} onBack={onBack} understanding={understanding} />
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
        {open === 'log' && <LogPanel entries={log} />}
        {open === 'edit' && <EditPanel mode="self_editing" />}
        {open === 'history' && <HistoryPanel applied={work.applied} undone={work.undone} />}
        {open === 'journal' && <PlaceholderPanel title="Journal" phaseLabel="2F" />}
      </PanelFrame>
      <StudioToolbar
        openPanel={open}
        onTogglePanel={(id) => layoutStore.update((s) => togglePanel(s, id))}
        onSkeleton={shellActions.openSkeleton}
      />
    </main>
  );
}
