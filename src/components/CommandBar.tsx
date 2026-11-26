// @node: F6.10
// The one-line command box for Screens 4 and 5. Only commands work here; nothing goes to the AI. Props only.
import { useState } from 'react';
import { parseCommand } from '../engine/commands';
import type { ChatLine } from '../store/workSlice';

export interface CommandBarProps {
  /** Same function as AI Chat's `harness.submitText`: true when the text was a command or a refused command word. */
  onSubmit(text: string): boolean;
  replies: readonly ChatLine[];
  /** Called after `open <panel>` so the app returns to Screen 3 where the panel is visible. */
  onOpened(): void;
}

export function CommandBar({ onSubmit, replies, onOpened }: CommandBarProps) {
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="command-bar">
      <form
        aria-label="Command box"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = parseCommand(text);
          if (onSubmit(text)) {
            setNote(null);
            if (parsed.kind === 'command' && parsed.name === 'open') onOpened();
            if (parsed.kind === 'command') setText('');
          } else if (text.trim() !== '') {
            setNote('Only commands work here. Use AI Chat on the Studio screen to ask questions.');
          }
        }}
      >
        <label htmlFor="command-input">Command</label>{' '}
        <input id="command-input" type="text" value={text} onChange={(e) => setText(e.target.value)} />{' '}
        <button type="submit">Run</button>
      </form>
      <p className="note">Type a command, for example help, start crew, pause, resume, step, stop, approve, reject, undo.</p>
      {note && <p role="status">{note}</p>}
      {replies.length > 0 && (
        <ol className="chat-replies" aria-live="polite" aria-label="Command replies">
          {replies.slice(-3).map((l) => (
            <li key={l.id} className={l.ok ? undefined : 'refused'}><strong>{l.command}</strong>: {l.reply}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
