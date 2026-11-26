// @node: F11.10
// "About a finding": pick one scan finding so the AI is asked about that file and line. Props only.
import { AI_LIVE } from '../config/aiLive';
import { scanSkillById } from '../skillbook';

export interface FocusOption { id: string; skillId: string; path: string; firstLine: number }

export interface FindingFocusProps {
  findings: readonly FocusOption[] | undefined;
  value: string;
  onChange(id: string): void;
  disabled?: boolean;
}

export function FindingFocus({ findings, value, onChange, disabled }: FindingFocusProps) {
  if (!findings || findings.length === 0) {
    return <p className="note" id="ai-finding-empty">{findings ? 'The scan found nothing to ask about.' : 'No scan results yet, so findings are not listed.'}</p>;
  }
  const shown = findings.slice(0, AI_LIVE.maxFindingsListed);
  return (
    <>
      <label htmlFor="ai-finding">About a finding</label>
      <select id="ai-finding" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">(none)</option>
        {shown.map((f) => (
          <option key={f.id} value={f.id}>
            {(scanSkillById(f.skillId)?.title ?? f.skillId)} - {f.path}:{f.firstLine}
          </option>
        ))}
      </select>
      {findings.length > shown.length && <p className="note">Showing the first {shown.length} of {findings.length} findings.</p>}
    </>
  );
}
