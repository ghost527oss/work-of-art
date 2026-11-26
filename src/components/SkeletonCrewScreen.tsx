// @node: F3.4
// @node: F6.11 (live Screen 4 when `live` is given; otherwise the 2A empty page)
// Screen 4 (Skeleton Crew). The right-hand content only; the Studio shell supplies the left Sandbox.
import { useEffect } from 'react';
import { areaCounts } from '../engine/scanView';
import { crewStartState, linksBetweenAreas, workerSlots } from '../engine/scanView';
import { applyCorrections, summarize } from '../engine/understandingView';
import type { HarnessActions } from '../hooks/useHarness';
import { isScanStale, type ScanActions } from '../hooks/useScan';
import { useLayout } from '../hooks/useLayout';
import { AREAS, type AreaId } from '../store/shellView';
import { useStudioStore } from '../store/useStudioStore';
import { AreaMap } from './AreaMap';
import { CommandBar } from './CommandBar';
import { CrewNarration } from './CrewNarration';
import { ProposalCard } from './ProposalCard';
import { WhatWasChecked } from './WhatWasChecked';
import { WorkerSlots } from './WorkerSlots';

export interface LiveCrew {
  harness: HarnessActions;
  scan: ScanActions;
  onOpened(): void;
}

export interface SkeletonCrewScreenProps {
  onOpenArea(area: AreaId): void;
  onBack(): void;
  live?: LiveCrew;
}

function LiveScreen4({ live, onOpenArea, onBack }: { live: LiveCrew } & Pick<SkeletonCrewScreenProps, 'onOpenArea' | 'onBack'>) {
  const state = useStudioStore((s) => s);
  const selfEditing = useLayout((l) => l.openPanel === 'edit');
  const understanding = state.understanding;
  useEffect(() => {
    live.scan.ensure();
  }, [live.scan, understanding.status, state.snapshot?.id]);
  const scan = state.scan;
  const result = scan.result;
  const stale = isScanStale(state);
  const files = understanding.result ? applyCorrections(understanding.result, understanding.corrections) : [];
  const sum = summarize(files);
  const counts = areaCounts(result?.findings ?? []);
  const crewLines = state.log.filter((e) => e.action.startsWith('crew_') && e.action !== 'crew_stopped').slice(-5);
  const line =
    scan.status === 'running' ? <p role="status">Scanning {scan.progress?.done ?? 0} of {scan.progress?.total ?? 0} files. <button type="button" onClick={live.scan.cancel}>Cancel</button></p>
    : scan.status === 'failed' ? <p role="alert">Scan failed: {scan.error ?? 'unknown problem'} <button type="button" onClick={live.scan.run}>Scan again</button></p>
    : understanding.status !== 'done' ? <p>Project understanding is not ready, so the scan cannot start.</p>
    : scan.status === 'done' && result ? (
      <p>{stale ? 'Out of date: labels changed. ' : `Scan is up to date: ${result.findings.length} findings from 16 checks over ${result.coverage.filesScanned} files. `}
        {stale && <button type="button" onClick={live.scan.run}>Scan again</button>}</p>)
    : <p>Scan was cancelled. <button type="button" onClick={live.scan.run}>Scan again</button></p>;
  return (
    <>
      <p><button type="button" onClick={onBack}>Back to Studio</button></p>
      <CommandBar onSubmit={live.harness.submitText} replies={state.work.chat} onOpened={live.onOpened} />
      {line}
      {result?.partial && <p className="partial">Partial result: {result.partialReasons.join(' ')}</p>}
      <AreaMap
        counts={counts.byArea}
        files={{ frontend: sum.areas[0]!.count, backend: sum.areas[1]!.count, api_data: sum.areas[2]!.count, security: null }}
        links={understanding.result ? linksBetweenAreas(understanding.result, files) : []}
        helpers={sum.helpers.map((h) => ({ name: h.name, count: h.count }))}
        scanDone={scan.status === 'done'}
        onOpen={onOpenArea}
      />
      <WorkerSlots slots={workerSlots(state)} start={crewStartState(state, selfEditing)} onStart={() => live.harness.run('start', 'crew')} />
      <CrewNarration entries={crewLines} limit={5} />
      {state.work.proposal && (
        <ProposalCard proposal={state.work.proposal} onApprove={() => live.harness.run('approve')} onReject={() => live.harness.run('reject')} />
      )}
      {result && <WhatWasChecked result={result} />}
    </>
  );
}

export function SkeletonCrewScreen({ onOpenArea, onBack, live }: SkeletonCrewScreenProps) {
  return (
    <section className="screen-right" aria-labelledby="skeleton-heading">
      <h1 id="skeleton-heading">Skeleton Crew</h1>
      {live ? (
        <LiveScreen4 live={live} onOpenArea={onOpenArea} onBack={onBack} />
      ) : (
        <>
          <p>The four-area map and the worker slots arrive in sub-phase 2D.</p>
          <p>
            {AREAS.map((a) => (
              <button key={a.id} type="button" onClick={() => onOpenArea(a.id)}>
                {a.label}
              </button>
            ))}
          </p>
          <p>
            <button type="button" onClick={onBack}>
              Back to Studio
            </button>
          </p>
        </>
      )}
    </section>
  );
}
