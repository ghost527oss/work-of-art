// @node: F6.7
// The Skeleton Crew script and its plain-English narration. Pure. Narration holds no code lines.
import { SCAN_LIMITS as L } from '../config/scanLimits';
import { scanSkillById } from '../skillbook';
import { AREAS, type AreaId } from '../store/shellView';
import { CHECK_COUNT } from './scanProject';
import type { Finding, ScanResult } from './scanFindingTypes';
import type { RunStep } from './practiceScript';

export const CREW_FIX_PLAN = 'add rel="noopener noreferrer" to the link.';

const areaName = (id: AreaId) => AREAS.find((a) => a.id === id)?.label ?? id;

/** At most 12 findings per area (by primary area), at most 150 steps in all. */
export const NOT_MEASURED = 'Layout was not measured. Use Check layout in the Sandbox to include layout findings.';

export function buildCrewScript(result: ScanResult, filesScanned = result.coverage.filesScanned, checks = CHECK_COUNT, layoutMeasured = true): RunStep[] {
  const steps: RunStep[] = [{ kind: 'info', title: `Skeleton Crew starts: ${result.findings.length} findings from ${checks} checks over ${filesScanned} files.` }];
  let leftOut = 0;
  for (const area of AREAS.map((a) => a.id)) {
    const mine = result.findings.filter((f) => f.primary === area);
    const shown = mine.slice(0, L.crewPerArea);
    const more = mine.length - shown.length;
    leftOut += more;
    steps.push({ kind: 'area', area, title: `${areaName(area)} crew${more > 0 ? `: ${more} more findings are listed on the area screen but not narrated.` : ''}${area === 'frontend' && !layoutMeasured ? ` ${NOT_MEASURED}` : ''}` });
    for (const f of shown) {
      const skill = scanSkillById(f.skillId)!;
      steps.push({ kind: 'finding', area, findingId: f.id, path: f.path, line: f.firstLine, title: `${skill.title} in ${f.path}`, skill: skill.id });
      if (f.fix === 'auto') {
        steps.push({ kind: 'propose', area, findingId: f.id, path: f.path, line: f.firstLine, title: `Propose a fix for ${skill.title} in ${f.path}`, skill: skill.id });
        steps.push({ kind: 'verify', area, findingId: f.id, path: f.path, line: f.firstLine, title: `Verify the fix in ${f.path}`, skill: skill.id });
      }
    }
  }
  const finishTitle = result.findings.length === 0 ? 'Finish the Skeleton Crew run. No findings to go through.' : 'Finish the Skeleton Crew run';
  // Cap: drop finding groups from the end and say so.
  const total = steps.length + 1;
  if (total > L.crewSteps) {
    let dropped = 0;
    while (steps.length + 1 > L.crewSteps) {
      const last = steps[steps.length - 1]!;
      if (last.kind === 'area' || last.kind === 'info') break;
      steps.pop();
      if (last.kind === 'finding') dropped++;
    }
    leftOut += dropped;
  }
  steps.push({ kind: 'finish', title: leftOut > 0 ? `${finishTitle}. ${leftOut} findings were not narrated because of the step limit.` : finishTitle });
  return steps;
}

/** Three plain sentences: what is checked, what is wrong, what comes next. */
export function narrate(finding: Finding): string {
  const skill = scanSkillById(finding.skillId)!;
  const lines = finding.firstLine === finding.lastLine ? `line ${finding.firstLine}` : `lines ${finding.firstLine} to ${finding.lastLine}`;
  const plan = finding.fix === 'auto' ? `Plan: ${CREW_FIX_PLAN}` : finding.fix === 'guided' ? `Plan: ${skill.how[0]}` : `No fix is offered; ${skill.why}`;
  return `Checking ${skill.title} in ${finding.path}, ${lines}. Problem: ${skill.explain} ${plan}`;
}
