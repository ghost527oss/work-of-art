// @node: F2.7
// @node: F4.9 (optional harness prop: commands, proposal card, replies)
// Wireframe AI Assistant panel. Lives in the Studio stub.
// All text rendered as React text, never as HTML.
// No Apply, Approve, or Reject controls on AI patch cards (display only). The practice proposal card (2B) is separate.
// Black and white only, no animation, keyboard and touch accessible.
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { AI_LIMITS } from '../config/budgets-proxy';
import { parseCommand } from '../engine/commands';
import type { AssistantActions } from '../hooks/useAssistant';
import type { HarnessActions } from '../hooks/useHarness';
import { useStudioStore } from '../store/useStudioStore';
import type { AITaskType, RepoSnapshot } from '../types/contracts';
import { AIResponseView } from './AIResponseView';
import { ProposalCard } from './ProposalCard';

const TASK_TYPES: Array<{ value: AITaskType; label: string }> = [
  { value: 'explain', label: 'Explain' },
  { value: 'suggest_change', label: 'Suggest a change' },
  { value: 'review_finding', label: 'Review a finding' },
];

interface Props {
  snapshot: RepoSnapshot;
  assistant: AssistantActions;
  /** Sub-phase 2B. When absent the panel behaves exactly as in sub-phase 2A. */
  harness?: HarnessActions;
}

export function AIAssistantPanel({ snapshot, assistant, harness }: Props) {
  const ai = useStudioStore((s) => s.ai);
  const proposal = useStudioStore((s) => s.work.proposal);
  const chat = useStudioStore((s) => s.work.chat);
  const [instruction, setInstruction] = useState('');
  const [taskType, setTaskType] = useState<AITaskType>('explain');
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [includeContent, setIncludeContent] = useState(false);
  const [filter, setFilter] = useState('');
  const [inlineError, setInlineError] = useState('');

  const loadedFiles = snapshot.files.filter((f) => f.loadStatus === 'loaded');
  const filteredFiles = loadedFiles.filter((f) =>
    filter === '' || f.path.toLowerCase().includes(filter.toLowerCase()),
  ).slice(0, AI_LIMITS.maxPickerRows);

  const atLimit = selectedPaths.length >= AI_LIMITS.maxSelectedPaths;
  const instructionLen = instruction.length;
  const overInstruction = instructionLen > AI_LIMITS.maxInstructionChars;

  function togglePath(path: string) {
    setSelectedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Commands first: typed command words never reach the AI.
    if (harness && harness.submitText(instruction)) {
      // A refused command word keeps its text so it can be corrected; a command clears the box.
      if (parseCommand(instruction).kind === 'command') setInstruction('');
      setInlineError('');
      return;
    }
    if (ai.status === 'pending') return;
    const msg = assistant.send({ snapshot, instruction, taskType, selectedPaths, includeContent });
    setInlineError(msg ?? '');
  }

  return (
    <section className="assistant" aria-labelledby="ai-heading">
      <h2 id="ai-heading">AI Assistant</h2>
      <p className="mock-label">
        Mock mode: responses are canned examples. No AI model is used and nothing is sent to an AI
        provider.
      </p>

      {harness && proposal && (
        <ProposalCard proposal={proposal} onApprove={() => harness.run('approve')} onReject={() => harness.run('reject')} />
      )}
      {harness && (
        <>
          <p className="note">Type help for commands.</p>
          {chat.length > 0 && (
            <ol className="chat-replies" aria-live="polite" aria-label="Command replies">
              {chat.map((line) => (
                <li key={line.id} className={line.ok ? undefined : 'refused'}>
                  <strong>{line.command}</strong>: {line.reply}
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      <form onSubmit={handleSubmit} noValidate aria-label="AI assistant request">
        <label htmlFor="ai-instruction">
          Instruction{' '}
          <span className="note">({instructionLen} / {AI_LIMITS.maxInstructionChars} characters)</span>
        </label>
        <textarea
          id="ai-instruction"
          value={instruction}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInstruction(e.target.value)}
          rows={4}
          disabled={ai.status === 'pending'}
          aria-invalid={overInstruction}
        />
        {overInstruction && (
          <p className="error" role="alert">
            Instruction must be at most {AI_LIMITS.maxInstructionChars} characters.
          </p>
        )}

        <label htmlFor="ai-task-type">Task type</label>
        <select
          id="ai-task-type"
          value={taskType}
          onChange={(e) => setTaskType(e.target.value as AITaskType)}
          disabled={ai.status === 'pending'}
        >
          {TASK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <p className="note">
          Select no file to get a clarifying question, one file for a patch proposal, or several
          files for a plan.
        </p>

        <label htmlFor="ai-filter">Filter files</label>
        <input
          id="ai-filter"
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Type to filter…"
          disabled={ai.status === 'pending'}
        />

        <fieldset>
          <legend>Files ({selectedPaths.length} / {AI_LIMITS.maxSelectedPaths})</legend>
          {filteredFiles.length === 0 && <p className="note">No loaded files match.</p>}
          {filteredFiles.map((f) => (
            <label key={f.path} className="check">
              <input
                type="checkbox"
                checked={selectedPaths.includes(f.path)}
                disabled={ai.status === 'pending' || (!selectedPaths.includes(f.path) && atLimit)}
                onChange={() => togglePath(f.path)}
              />{' '}
              {f.path}
            </label>
          ))}
          {atLimit && (
            <p className="note">Maximum {AI_LIMITS.maxSelectedPaths} files selected.</p>
          )}
        </fieldset>

        <label className="check">
          <input
            type="checkbox"
            checked={includeContent}
            onChange={(e) => setIncludeContent(e.target.checked)}
            disabled={ai.status === 'pending'}
          />{' '}
          Include the contents of the selected files in the request
        </label>

        {inlineError && (
          <p className="error" role="alert">{inlineError}</p>
        )}

        <p>
          <button type="submit" disabled={ai.status === 'pending' || overInstruction}>
            Send
          </button>{' '}
          {ai.status === 'pending' && (
            <button type="button" onClick={assistant.cancel}>
              Cancel
            </button>
          )}
        </p>
      </form>

      {/* Result area */}
      {ai.status === 'idle' && (
        <p className="ai-empty note">No response yet. Enter an instruction and press Send.</p>
      )}
      {ai.status === 'pending' && (
        <p role="status" className="ai-pending">Waiting for the response …</p>
      )}
      {ai.status === 'done' && ai.result && (
        <AIResponseView response={ai.result.response} mode={ai.result.mode} />
      )}
      {ai.status === 'failed' && ai.error && (
        <div className="error-panel" role="alert">
          <p>
            <strong>{ai.error.code}</strong>: {ai.error.message}
          </p>
          <button type="button" onClick={assistant.clear}>Retry</button>
        </div>
      )}
    </section>
  );
}
