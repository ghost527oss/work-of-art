// @node: F2.7
// @node: F11.10 (Phase 3A: provider line, fallback sentence, lighter warning, saved-answer label, action view, patch note)
// Renders each AIResponse type as plain React text. Never uses innerHTML.
// No Apply, Approve, or Reject controls exist.
import { LIGHTER_WARNING, SAVED_LABEL, fallbackSentence, providerLine } from '../engine/aiNotes';
import type { AIMeta, AIResponse } from '../types/contracts';

interface Props {
  response: AIResponse;
  mode: 'mock' | 'live';
  /** Live answers only: which provider answered, and which earlier ones failed. */
  meta?: AIMeta | undefined;
  /** True when this is a saved answer from earlier in the session (no request was sent). */
  fromCache?: boolean | undefined;
  onAskAgain?: (() => void) | undefined;
  /** What happened to a patch the AI proposed (queued, or why not). */
  proposalNote?: string | undefined;
}

export function AIResponseView({ response, mode, meta, fromCache, onAskAgain, proposalNote }: Props) {
  const fallback = meta ? fallbackSentence(meta) : undefined;
  return (
    <div className="ai-response" aria-label={`AI response: ${response.type}`}>
      <p className="mock-label">Mode: {mode}</p>
      {meta && <p className="note ai-provider">{providerLine(meta)}</p>}
      {fallback && <p className="note ai-fallback">{fallback}</p>}
      {meta?.lighter && <p className="note ai-lighter"><strong>{LIGHTER_WARNING}</strong></p>}
      {fromCache && (
        <p className="note ai-saved">
          {SAVED_LABEL}{' '}
          {onAskAgain && <button type="button" onClick={onAskAgain}>Ask again</button>}
        </p>
      )}

      {response.type === 'clarification' && (
        <section aria-labelledby="clarification-heading">
          <h3 id="clarification-heading">Questions</h3>
          <ol>
            {response.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </section>
      )}

      {response.type === 'explanation' && (
        <section aria-labelledby="explanation-heading">
          <h3 id="explanation-heading">Explanation</h3>
          <p>{response.summary}</p>
          {response.evidencePaths.length > 0 && (
            <>
              <h4>Evidence files</h4>
              <ul>
                {response.evidencePaths.map((p) => (
                  <li key={p}><code>{p}</code></li>
                ))}
              </ul>
            </>
          )}
          <h4>Limitations</h4>
          <ul>
            {response.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      {response.type === 'plan' && (
        <section aria-labelledby="plan-heading">
          <h3 id="plan-heading">Plan</h3>
          <p>{response.summary}</p>
          <h4>Affected files</h4>
          <ul>
            {response.affectedPaths.map((p) => <li key={p}><code>{p}</code></li>)}
          </ul>
          <h4>Steps</h4>
          <ol>
            {response.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <h4>Risks</h4>
          <ul>
            {response.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </section>
      )}

      {response.type === 'action' && (
        <section aria-labelledby="action-heading">
          <h3 id="action-heading">Action</h3>
          <p>The AI asked PatchBay to run: <code>{response.arg ? `${response.action} ${response.arg}` : response.action}</code></p>
          <p>{response.summary}</p>
          <p className="note">The result of the action is shown in the command replies above.</p>
        </section>
      )}

      {response.type === 'patch_proposal' && (
        <section aria-labelledby="patch-heading">
          <h3 id="patch-heading">Patch proposal</h3>
          <p>{response.summary}</p>
          <h4>Affected files</h4>
          <ul>
            {response.affectedPaths.map((p) => <li key={p}><code>{p}</code></li>)}
          </ul>
          <h4>Proposed change</h4>
          <div className="diff-wrap">
            <pre className="diff">{response.unifiedDiff}</pre>
          </div>
          {mode === 'live'
            ? <p className="note ai-proposal-note">{proposalNote ?? 'This change is shown only.'}</p>
            : <p className="note">This proposal cannot be applied in this build.</p>}
          <h4>Tests</h4>
          <ul>
            {response.tests.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
          <h4>Risks</h4>
          <ul>
            {response.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
