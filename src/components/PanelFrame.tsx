// @node: F3.3
// The frame around the open panel: title bar with Collapse / Expand, Narrow / Wide, and
// Close. Props only. The body stays in the page (with the `hidden` attribute) when the panel
// is collapsed or closed, so nothing inside it (such as the AI form) is unmounted.
import type { ReactNode } from 'react';
import type { PanelWidth } from '../store/layoutSlice';

export interface PanelFrameProps {
  title: string;
  /** False when no panel is open: the whole frame is hidden but still rendered. */
  open: boolean;
  collapsed: boolean;
  width: PanelWidth;
  onToggleCollapsed(): void;
  onToggleWidth(): void;
  onClose(): void;
  children?: ReactNode;
}

export function PanelFrame({ title, open, collapsed, width, onToggleCollapsed, onToggleWidth, onClose, children }: PanelFrameProps) {
  const classes = ['shell-panel', width === 'wide' ? 'panel-wide' : 'panel-narrow'];
  if (collapsed) classes.push('panel-collapsed');
  return (
    <aside className={classes.join(' ')} aria-label={title} hidden={!open}>
      <div className="panel-header">
        {!collapsed && <h2>{title}</h2>}
        {/* One toggle button that keeps its place in the tree, so keyboard focus stays on it when the panel collapses or expands. */}
        <button type="button" aria-label={collapsed ? `Expand ${title}` : undefined} onClick={onToggleCollapsed}>
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
        {!collapsed && (
          <>
            {' '}
            <button type="button" onClick={onToggleWidth}>
              {width === 'narrow' ? 'Wide' : 'Narrow'}
            </button>{' '}
            <button type="button" onClick={onClose}>
              Close
            </button>
          </>
        )}
      </div>
      <div className="panel-body" hidden={collapsed}>
        {children}
      </div>
    </aside>
  );
}
