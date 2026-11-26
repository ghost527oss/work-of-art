// @node: F4.8
// The Edit panel in sub-phase 2B: the mode and the resume line. Editing tools arrive in 2E. Props only.
export interface EditPanelProps {
  mode: 'automation' | 'self_editing';
}

export function EditPanel({ mode }: EditPanelProps) {
  return (
    <section aria-labelledby="edit-heading">
      <h2 id="edit-heading">Edit</h2>
      <p>Mode: {mode === 'self_editing' ? 'Self-editing' : 'Automation'}.</p>
      <p>Opening this panel pauses the practice run. Type resume in AI Chat to continue.</p>
      <p className="note">Editing tools arrive in sub-phase 2E.</p>
    </section>
  );
}
