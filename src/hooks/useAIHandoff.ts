// @node: F11.9
// Connects the assistant controller to the harness: an AI `action` runs through the same path as a typed command, and a live
// AI patch is checked and queued as the one waiting proposal. Nothing here applies a change; only Approve does.
import { useEffect } from 'react';
import { checkAIAction } from '../engine/aiActionPolicy';
import { checkAIProposal } from '../engine/aiProposal';
import type { AIRequest, AIResult } from '../types/contracts';
import { logAIAction, noteAIProposalRefused, queueAIProposal } from '../store/aiProposalActions';
import { addChatReply } from '../store/workActions';
import { studioStore, type Store, type StudioState } from '../store/useStudioStore';
import type { AssistantActions, ResultInfo } from './useAssistant';
import type { HarnessActions } from './useHarness';

export interface HandoffServices {
  now(): number;
  newId(): string;
}

const defaults: HandoffServices = {
  now: () => Date.now(),
  newId: () => `aip-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`,
};

/** The hand-off as a plain function, so it can be tested without React. */
export function createAIHandoff(
  store: Store<StudioState>,
  harness: Pick<HarnessActions, 'run'>,
  services: HandoffServices = defaults,
): (result: AIResult, request: AIRequest, info: ResultInfo) => void {
  return (result, request, info) => {
    const response = result.response;
    if (response.type === 'action') {
      const check = checkAIAction(request, response);
      if (!check.ok) {
        store.update((s) => addChatReply(s, 'AI action', check.reason, false));
        return;
      }
      store.update((s) => logAIAction(s, check.line, services.now()));
      harness.run(check.command.name, check.command.arg);
      return;
    }
    if (response.type === 'patch_proposal') {
      const check = checkAIProposal(store.getState(), request, result, {
        ...(info.findingId !== undefined ? { findingId: info.findingId } : {}),
        newId: services.newId,
      });
      store.update((s) => (check.ok ? queueAIProposal(s, check.proposal, services.now()) : noteAIProposalRefused(s, check.reason)));
    }
  };
}

export function useAIHandoff(assistant: AssistantActions, harness: HarnessActions): void {
  useEffect(() => {
    const handler = createAIHandoff(studioStore, harness);
    return assistant.setResultHandler?.(handler);
  }, [assistant, harness]);
}
