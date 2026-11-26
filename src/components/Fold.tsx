// @node: F9.9
// A collapsible block (details) that starts open or closed and can be forced open (for Learn more and Related).
import { useEffect, useState, type ReactNode } from 'react';

export function Fold({ title, initialOpen, force, id, children, heading = 'h3' }: { title: string; initialOpen: boolean; force?: boolean; id?: string; children: ReactNode; heading?: 'h3' | 'h4' }) {
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => { if (force) setOpen(true); }, [force]);
  const H = heading;
  return (
    <details id={id} open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary><H className="fold-title">{title}</H></summary>
      {children}
    </details>
  );
}
