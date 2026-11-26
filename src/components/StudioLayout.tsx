// @node: F3.5
// The Studio shell (sub-phase 2A). Screen 3 has a left area (Sandbox placeholder and Project
// info), one right-hand panel, and the vertical toolbar on the far right edge. Screens 4 and 5
// are empty pages without the toolbar. The screen comes from the screen store and the layout
// from the layout store; this component owns no screen state of its own. The AI panel is
// always rendered (hidden when another panel is open) so its form and request survive switching.
import { layoutStore, useLayout } from '../hooks/useLayout';
import { shellActions, useShellView } from '../hooks/useShell';
import type { AssistantActions } from '../hooks/useAssistant';
import { closePanel, setCollapsed, toggleWidth, togglePanel, type PanelId } from '../store/layoutSlice';
import { useStudioStore } from '../store/useStudioStore';
import { AIAssistantPanel } from './AIAssistantPanel';
import { DomainScreen } from './DomainScreen';
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
}

const PANEL_TITLES: Record<PanelId, string> = {
  edit: 'Edit',
  ai: 'AI Chat',
  log: 'Log',
  history: 'History',
  journal: 'Journal',
};

export function StudioLayout({ onLoadFolders, onCancel, onRetry, onDismissError, onBack, assistant }: StudioLayoutProps) {
  const snapshot = useStudioStore((s) => s.snapshot);
  const log = useStudioStore((s) => s.log);
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
        <ProjectInfo onLoadFolders={onLoadFolders} onCancel={onCancel} onRetry={onRetry} onDismissError={onDismissError} onBack={onBack} />
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
          <AIAssistantPanel key={snapshot.id} snapshot={snapshot} assistant={assistant} />
        </div>
        {open === 'log' && <LogPanel entries={log} />}
        {open === 'edit' && <PlaceholderPanel title="Edit" phaseLabel="2E" />}
        {open === 'history' && <PlaceholderPanel title="History" phaseLabel="2B" />}
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
