// @node: F3.4
// @node: F6.11 (live Screen 5 when `live` is given; otherwise the 2A empty page)
// Screen 5 (Domain Debugging): one area. No toolbar here.
import { useState } from 'react';
import { findingsForArea } from '../engine/scanView';
import { areaCounts } from '../engine/scanView';
import type { HarnessActions } from '../hooks/useHarness';
import { areaLabel, type AreaId } from '../store/shellView';
import { useStudioStore } from '../store/useStudioStore';
import { ChangesMade } from './ChangesMade';
import { CommandBar } from './CommandBar';
import { CrewNarration } from './CrewNarration';
import { FindingDetail } from './FindingDetail';
import { FindingsTable } from './FindingsTable';
import { ProposalCard } from './ProposalCard';
import { RequestTrace } from './RequestTrace';

export interface LiveDomain {
  harness: HarnessActions;
  onOpened(): void;
}

export interface DomainScreenProps {
  area: AreaId;
  onBackToSkeleton(): void;
  onBackToStudio(): void;
  live?: LiveDomain;
}

function LiveScreen5({ area, live }: { area: AreaId; live: LiveDomain }) {
  const state = useStudioStore((s) => s);
  const [selected, setSelected] = useState<string | undefined>();
  const result = state.scan.result;
  const findings = findingsForArea(result?.findings ?? [], area);
  const counts = areaCounts(result?.findings ?? []).byArea[area];
  const selectedFinding = findings.find((f) => f.id === selected);
  const lines = state.log.filter((e) => e.action === `crew_${area}`);
  const proposal = state.work.proposal;
  const proposalArea = proposal?.findingId ? result?.findings.find((f) => f.id === proposal.findingId)?.primary : undefined;
  return (
    <>
      <CommandBar onSubmit={live.harness.submitText} replies={state.work.chat} onOpened={live.onOpened} />
      <p>{state.scan.status === 'done' ? `High ${counts.high}, Medium ${counts.medium}, Low ${counts.low}.` : 'No scan result yet.'}</p>
      {result?.partial && <p className="partial">Partial result: {result.partialReasons.join(' ')}</p>}
      <FindingsTable area={area} findings={findings} selectedId={selected} onDetails={setSelected} />
      {selectedFinding && <FindingDetail finding={selectedFinding} />}
      <CrewNarration entries={lines} limit={30} />
      {proposal && proposalArea === area && (
        <ProposalCard proposal={proposal} onApprove={() => live.harness.run('approve')} onReject={() => live.harness.run('reject')} />
      )}
      <ChangesMade entries={state.work.applied.filter((e) => e.area === area)} />
      {area === 'api_data' && state.understanding.result && <RequestTrace edges={state.understanding.result.edges} />}
    </>
  );
}

export function DomainScreen({ area, onBackToSkeleton, onBackToStudio, live }: DomainScreenProps) {
  return (
    <section className="screen-right" aria-labelledby="domain-heading">
      <h1 id="domain-heading">{areaLabel(area)}</h1>
      {!live && <p>Findings and live debugging arrive in sub-phase 2D.</p>}
      <p>
        <button type="button" onClick={onBackToSkeleton}>
          Back to Skeleton Crew
        </button>{' '}
        <button type="button" onClick={onBackToStudio}>
          Back to Studio
        </button>
      </p>
      {live && <LiveScreen5 area={area} live={live} />}
    </section>
  );
}
