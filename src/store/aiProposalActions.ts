// @node: F11.9
// Pure whole-state actions for AI proposals and AI-requested actions. Log lines hold paths and fixed phrases only.
import { aiCountAttempt, aiSetProposalNote } from './aiSlice';
import { withLog, type StudioState } from './useStudioStore';
import type { Proposal } from './workSlice';

/** Makes the checked AI proposal the one waiting proposal, counts the attempt, and notes it in the Log and the answer. */
export function queueAIProposal(state: StudioState, proposal: Proposal, now: number): StudioState {
  if (state.work.proposal !== null) return state;
  const counted = proposal.findingId !== undefined ? aiCountAttempt(state.ai, proposal.findingId) : state.ai;
  const ai = aiSetProposalNote(counted, 'Queued for your approval. Use Approve or Reject on the card above.');
  const next: StudioState = { ...state, work: { ...state.work, proposal: { ...proposal } }, ai };
  return {
    ...next,
    ...withLog(next, now, {
      action: 'ai_proposal_queued',
      status: 'proposed',
      message: `AI proposal queued for ${proposal.path}. Nothing changes until you press Approve.`,
      affectedPaths: [proposal.path],
    }),
  };
}

/** Shows why a patch was not queued. */
export function noteAIProposalRefused(state: StudioState, reason: string): StudioState {
  return { ...state, ai: aiSetProposalNote(state.ai, `Not queued: ${reason}`) };
}

/** One Log line for an action the AI asked for (it then runs through the same path as a typed command). */
export function logAIAction(state: StudioState, line: string, now: number): StudioState {
  return { ...state, ...withLog(state, now, { action: 'ai_action', status: 'info', message: `AI asked for: ${line}`, affectedPaths: [] }) };
}
