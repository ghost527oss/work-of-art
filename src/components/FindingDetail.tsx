// @node: F6.10
// One finding with its proof: lines, snippet, explanation, why it matters, plan, certainty in words. Props only.
import { scanSkillById } from '../skillbook';
import type { Finding } from '../engine/scanFindingTypes';

const FIX_MEANING = {
  auto: 'Auto-supported: the crew can make this change after you approve it.',
  guided: 'Guided: steps are shown, but the crew will not change the file.',
  explanation: 'Explanation only: no fix is offered.',
} as const;

export function FindingDetail({ finding }: { finding: Finding }) {
  const skill = scanSkillById(finding.skillId);
  if (!skill) return null;
  return (
    <section className="finding-detail" aria-label="Finding detail">
      <h3>{skill.title}</h3>
      <p>{finding.path}, {finding.firstLine === finding.lastLine ? `line ${finding.firstLine}` : `lines ${finding.firstLine} to ${finding.lastLine}`}</p>
      {finding.extra && <p>Detail: {finding.extra}</p>}
      {finding.snippet.length > 0 && <pre className="diff-block">{finding.snippet.join('\n')}</pre>}
      <p><strong>Problem:</strong> {skill.explain}</p>
      <p><strong>Why it matters:</strong> {skill.why}</p>
      <p><strong>Plan:</strong></p>
      <ol>{skill.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
      <p>{finding.certainty === 'found' ? 'Found by the check.' : 'Possible: only the loaded files were read, so protection or handling may exist elsewhere.'}</p>
      <p>{FIX_MEANING[finding.fix]}{finding.fixNote ? ` ${finding.fixNote}` : ''}</p>
      <p className="note">Check: {skill.id}</p>
    </section>
  );
}
