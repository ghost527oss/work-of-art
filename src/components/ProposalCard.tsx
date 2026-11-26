// @node: F4.8
// @node: F11.10 (Phase 3A: AI-proposed change label, byline, and lighter-model warning)
// The waiting proposal with Approve and Reject. Props only. All text is React text.
export interface ProposalCardProps {
  proposal: { title: string; path: string; diff: string; source?: 'practice' | 'crew' | 'ai'; byline?: string };
  onApprove(): void;
  onReject(): void;
}

export function ProposalCard({ proposal, onApprove, onReject }: ProposalCardProps) {
  const ai = proposal.source === 'ai';
  return (
    <section className="proposal-card" aria-label="Waiting proposal">
      <h3>{ai ? 'AI-proposed change' : proposal.title}</h3>
      <p>
        File: <code>{proposal.path}</code>
      </p>
      <pre className="diff-block">{proposal.diff}</pre>
      {ai && proposal.byline && <p className="note">{proposal.byline}</p>}
      <p className="note">
        {proposal.source === 'crew' ? 'Skeleton Crew fix' : ai ? 'AI-proposed change' : 'Practice proposal'}: it changes only the in-memory practice copy, never your repository.
      </p>
      <div className="button-row">
        <button type="button" onClick={onApprove}>
          Approve
        </button>{' '}
        <button type="button" onClick={onReject}>
          Reject
        </button>
      </div>
    </section>
  );
}
