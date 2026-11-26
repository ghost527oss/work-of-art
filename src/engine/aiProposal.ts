// @node: F11.9
// Browser side. One pure function: may this live AI patch become a waiting proposal? Every refusal has a plain reason.
// Nothing is applied here. A queued proposal still needs Approve, and Approve re-checks everything against the file again.
import { AI_LIVE } from '../config/aiLive';
import { WORK_LIMITS } from '../config/workLimits';
import type { AIRequest, AIResult } from '../types/contracts';
import { PROVIDERS } from '../config/aiProviders';
import { applyUnifiedDiff, hashText, reverseUnifiedDiff } from './diffApply';
import { practiceContent } from './practiceScript';
import { containsSecret } from './redact';
import { isActive, type Proposal } from '../store/workSlice';
import type { StudioState } from '../store/useStudioStore';

export const ATTEMPTS_USED = `This finding has had ${AI_LIVE.maxAttemptsPerFinding} AI fix attempts. Fix it by hand, or ask about a different one.`;
export const MIXED_ENDINGS = 'This file mixes line endings or ends without a newline here, so the change could not be undone exactly.';

export type ProposalCheck = { ok: true; proposal: Proposal } | { ok: false; reason: string };

/** "Answered by Groq (light)." and, when true, the lighter-model warning. Shown on the card, never saved. */
export function bylineOf(result: AIResult): string {
  const m = result.meta;
  if (!m) return 'Answered by an AI model.';
  const base = `Answered by ${PROVIDERS[m.provider].name} (${m.tier}).`;
  return m.lighter ? `${base} Answered by a lighter model; review carefully.` : base;
}

export function checkAIProposal(
  state: StudioState,
  request: AIRequest,
  result: AIResult,
  info: { findingId?: string; newId(): string },
): ProposalCheck {
  const r = result.response;
  if (result.mode !== 'live') return { ok: false, reason: 'This is a mock answer, so it is shown only.' };
  if (r.type !== 'patch_proposal') return { ok: false, reason: 'That answer was not a change.' };
  if (r.affectedPaths.length !== 1 || request.selectedPaths.length !== 1 || r.affectedPaths[0] !== request.selectedPaths[0]) {
    return { ok: false, reason: 'A change must be for exactly the one file you selected.' };
  }
  const path = r.affectedPaths[0]!;
  const w = state.work;
  if (isActive(w.run)) return { ok: false, reason: 'A run is active. Type stop first, then ask again.' };
  if (w.proposal !== null) return { ok: false, reason: 'Another change is already waiting. Approve or reject it first.' };
  if (w.applied.length + w.undone.length >= WORK_LIMITS.maxHistoryEntries) {
    return { ok: false, reason: `History is full (${WORK_LIMITS.maxHistoryEntries} changes). Reject this one or type reset.` };
  }
  if (info.findingId !== undefined && (state.ai.attempts?.[info.findingId] ?? 0) >= AI_LIVE.maxAttemptsPerFinding) {
    return { ok: false, reason: ATTEMPTS_USED };
  }
  const snap = state.snapshot;
  const file = snap?.files.find((f) => f.path === path);
  if (!snap || !file || file.loadStatus !== 'loaded' || file.truncated) {
    return { ok: false, reason: 'That file is not fully loaded, so the change cannot be checked against it.' };
  }
  const current = practiceContent(snap, w.applied, path);
  if (current === undefined) return { ok: false, reason: 'The practice copy of that file is not available.' };
  if (r.unifiedDiff.length > AI_LIVE.maxProposalDiffChars) return { ok: false, reason: 'The change is too large for one reviewable diff.' };
  if (containsSecret(r.unifiedDiff) || containsSecret(r.summary)) return { ok: false, reason: 'The change contains a likely secret, so it was not queued.' };
  const applied = applyUnifiedDiff(current, r.unifiedDiff);
  if (!applied.ok) return { ok: false, reason: `The change does not fit the file as it is now (${applied.reason.replace(/\.$/, '')}).` };
  if (containsSecret(applied.text.slice(0, 200_000)) && !containsSecret(current.slice(0, 200_000))) {
    return { ok: false, reason: 'The change would add a likely secret to the file, so it was not queued.' };
  }
  const back = reverseUnifiedDiff(r.unifiedDiff);
  const undone = back === null ? undefined : applyUnifiedDiff(applied.text, back);
  if (!undone || !undone.ok || hashText(undone.text) !== hashText(current)) return { ok: false, reason: MIXED_ENDINGS };
  const proposal: Proposal = {
    id: info.newId(),
    path,
    title: `AI-proposed change to ${path}`,
    diff: r.unifiedDiff,
    source: 'ai',
    byline: bylineOf(result),
    ...(info.findingId !== undefined ? { findingId: info.findingId } : {}),
  };
  return { ok: true, proposal };
}
