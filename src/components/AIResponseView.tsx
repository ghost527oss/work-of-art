// @node: F2.7
// Renders each AIResponse type as plain React text. Never uses innerHTML.
// No Apply, Approve, or Reject controls exist.
import type { AIResponse } from '../types/contracts';

interface Props {
  response: AIResponse;
  mode: 'mock' | 'live';
}

export function AIResponseView({ response, mode }: Props) {
  return (
    <div className="ai-response" aria-label={`AI response: ${response.type}`}>
      <p className="mock-label">Mode: {mode}</p>

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
          <p className="note">This proposal cannot be applied in this build.</p>
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
