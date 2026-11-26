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
      {collapsed ? (
        <div className="panel-header">
          <button type="button" aria-label={`Expand ${title}`} onClick={onToggleCollapsed}>
            Expand
          </button>
        </div>
      ) : (
        <div className="panel-header">
          <h2>{title}</h2>
          <button type="button" onClick={onToggleCollapsed}>
            Collapse
          </button>{' '}
          <button type="button" onClick={onToggleWidth}>
            {width === 'narrow' ? 'Wide' : 'Narrow'}
          </button>{' '}
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      )}
      <div className="panel-body" hidden={collapsed}>
        {children}
      </div>
    </aside>
  );
}
