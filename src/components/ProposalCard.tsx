// @node: F4.8
// The waiting practice proposal with Approve and Reject. Props only. All text is React text.
export interface ProposalCardProps {
  proposal: { title: string; path: string; diff: string; source?: 'practice' | 'crew' };
  onApprove(): void;
  onReject(): void;
}

export function ProposalCard({ proposal, onApprove, onReject }: ProposalCardProps) {
  return (
    <section className="proposal-card" aria-label="Waiting proposal">
      <h3>{proposal.title}</h3>
      <p>
        File: <code>{proposal.path}</code>
      </p>
      <pre className="diff-block">{proposal.diff}</pre>
      <p className="note">
        {proposal.source === 'crew' ? 'Skeleton Crew fix' : 'Practice proposal'}: it changes only the in-memory practice copy, never your repository.
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
