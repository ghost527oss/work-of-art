// @node: F6.10
// @node: F9.10 (Learn more)
// @node: F12.11 (confidence and the static-render label)
// One finding with its proof: lines, snippet, explanation, why it matters, plan, certainty in words. Props only.
import { cardsForSkill, scanSkillById } from '../skillbook';
import type { Finding } from '../engine/scanFindingTypes';

const FIX_MEANING = {
  auto: 'Auto-supported: the crew can make this change after you approve it.',
  guided: 'Guided: steps are shown, but the crew will not change the file.',
  explanation: 'Explanation only: no fix is offered.',
} as const;

export function FindingDetail({ finding, onLearnMore }: { finding: Finding; onLearnMore?(lessonId: string): void }) {
  const lesson = cardsForSkill(finding.skillId)[0];
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
      <p>{skill.kind === 'measured' ? 'Measured in the preview (static render, scripts off: pages built by JavaScript are not measured), not read from the code.' : finding.certainty === 'found' ? 'Found by the check.' : 'Possible: only the loaded files were read, so protection or handling may exist elsewhere.'}</p>
      {finding.confidence && <p>Confidence: {finding.confidence}. {finding.confidence === 'high' ? 'The measurement is clear.' : finding.confidence === 'medium' ? 'The measurement is likely right, but the design may be on purpose.' : 'This is a hint: PatchBay cannot be sure.'}</p>}
      <p>{FIX_MEANING[finding.fix]}{finding.fixNote ? ` ${finding.fixNote}` : ''}</p>
      <p className="note">Check: {skill.id}</p>
      {onLearnMore && lesson && <p><button type="button" onClick={() => onLearnMore(lesson.id)}>Learn more</button></p>}
    </section>
  );
}
