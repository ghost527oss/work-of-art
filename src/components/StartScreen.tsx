// @node: F1.7
// @node: F10.7 (Resume banner, reset notice, Saved in this browser)
// Start screen (Phase 1 wireframe): one repository field, one primary action, and a
// visually secondary sample picker. No logo, no color, no animation.
import { useState, type FormEvent } from 'react';
import { SAMPLES } from '../data/sampleRepos';
import { useStudioStore } from '../store/useStudioStore';
import type { SavedRow, SessionRecord } from '../store/sessionRecord';
import { ResumeBanner } from './ResumeBanner';
import { SavedDataPanel } from './SavedDataPanel';

export interface StartSessionProps {
  record?: SessionRecord;
  restoring: boolean;
  notice?: string;
  savedRows: readonly SavedRow[];
  onResume(): void;
  onReset(): void;
}

export interface StartScreenProps {
  /** Returns an error message, or null when a run started. */
  onSubmit(text: string): string | null;
  onSample(id: string): void;
  /** Sub-phase 2G. When absent the Start screen looks as before. */
  session?: StartSessionProps;
}

export function StartScreen({ onSubmit, onSample, session }: StartScreenProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sampleId, setSampleId] = useState<string>(SAMPLES[0]?.id ?? '');
  const busy = useStudioStore((s) => s.ingestion.status === 'running');
  const lastEntry = useStudioStore((s) => s.log[s.log.length - 1]);
  const note = lastEntry?.action === 'ingest_cancelled' ? lastEntry.message : '';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(onSubmit(text) ?? '');
  }

  return (
    <main className="screen start">
      {session?.notice && <p role="status">{session.notice}</p>}
      {session && <ResumeBanner record={session.record} restoring={session.restoring} onResume={session.onResume} onReset={session.onReset} />}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="repo-input">GitHub repository URL</label>
        <input
          id="repo-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://github.com/owner/repo"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="repo-help repo-error"
          aria-invalid={error !== ''}
        />
        <button type="submit" disabled={busy}>
          Enter Repository
        </button>
        <p id="repo-help" className="note">
          Paste a public GitHub repository URL.
        </p>
        <p id="repo-error" className="error" role="alert">
          {error}
        </p>
      </form>

      {note && <p role="status">{note}</p>}

      <section className="secondary" aria-label="Sample repositories">
        <label htmlFor="sample-select">Or use a sample repository</label>
        <select id="sample-select" value={sampleId} onChange={(e) => setSampleId(e.target.value)} disabled={busy}>
          {SAMPLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy} onClick={() => onSample(sampleId)}>
          Use sample
        </button>
      </section>
      {session && <SavedDataPanel rows={session.savedRows} onReset={session.savedRows.some((r) => r.bytes !== null) ? session.onReset : undefined} />}
    </main>
  );
}
