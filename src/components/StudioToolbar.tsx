// @node: F3.3
// The vertical toolbar on the far right edge of the Studio screen. Props only: no store access.
// Five panel buttons (aria-pressed) and the Skeleton Crew button, which goes to Screen 4.
import type { PanelId } from '../store/layoutSlice';

export const TOOLBAR_PANELS: ReadonlyArray<{ id: PanelId; label: string }> = [
  { id: 'edit', label: 'Edit' },
  { id: 'ai', label: 'AI Chat' },
  { id: 'log', label: 'Log' },
  { id: 'history', label: 'History' },
  { id: 'journal', label: 'Journal' },
];

export const SKELETON_LABEL = 'Skeleton Crew';

export interface StudioToolbarProps {
  openPanel: PanelId | null;
  onTogglePanel(id: PanelId): void;
  onSkeleton(): void;
}

export function StudioToolbar({ openPanel, onTogglePanel, onSkeleton }: StudioToolbarProps) {
  return (
    <nav className="toolbar" aria-label="Studio tools">
      {TOOLBAR_PANELS.map(({ id, label }) => (
        <button key={id} type="button" aria-pressed={openPanel === id} onClick={() => onTogglePanel(id)}>
          {label}
        </button>
      ))}
      <button type="button" onClick={onSkeleton}>
        {SKELETON_LABEL}
      </button>
    </nav>
  );
}
