// @node: F2.3
// Pure, deterministic mock AI responder. Same request → byte-identical output.
// Never echoes the instruction text. Response type is determined solely by
// taskType and the number of selected paths — no content of the instruction
// or files can change the response type or paths.
import type { AIRequest, AIResponse } from '../types/contracts';
import { buildInsertDiff } from './unifiedDiff';

export const MOCK_NOTICE = 'This is a mock response; no AI model was used.';
const NOT_CHECKED = 'This diff was not checked against the file because no content was provided.';
const REDACTED_NOTE = (n: number) => `${n} likely secret${n === 1 ? '' : 's'} ${n === 1 ? 'was' : 'were'} redacted from the input before processing.`;
const CANNED_NOTE = 'The text above is canned and does not describe the real code.';
const NO_FILE_NOTE = 'No files were selected. Select a file for a more specific response.';
const STATIC_NOTE = 'A static analysis result indicates a possible issue; it does not prove one.';
const NO_SCAN_NOTE = 'No real scan was run. This explanation is a canned example.';
const MULTI_FILE_RISK = 'Changes across several files can affect each other. Review each diff before applying anything.';
const MOCK_STEP_A = 'Review each listed file and confirm the intended change.';
const MOCK_STEP_B = (paths: string[]) => `Make the example change in each file (${paths.join(', ')}), one at a time.`;
const MOCK_STEP_C = 'Run the project\'s type check and test suite after each edit.';
const MOCK_STEP_D = 'Review the full diff before applying it to your repository.';
const PATCH_TEST = 'Run the project\'s tests after applying the example change.';
const MOCK_COMMENT = 'MOCK: example change from the PatchBay mock assistant (not a real proposal)';

interface MockContext {
  redactionCount: number;
}

/** Pure: same inputs → same output. Reads no clock, random, or environment. */
export function mockResponse(request: AIRequest, context: MockContext): AIResponse {
  const { taskType, selectedPaths } = request;
  const { redactionCount } = context;

  const redactedNote = redactionCount > 0 ? [REDACTED_NOTE(redactionCount)] : [];

  // Rule table: driven only by taskType and the count of selectedPaths.
  if (taskType === 'explain') {
    return buildExplanation(selectedPaths, redactedNote, false);
  }

  if (taskType === 'review_finding') {
    return buildExplanation(selectedPaths, redactedNote, true);
  }

  // suggest_change
  if (selectedPaths.length === 0) {
    return {
      type: 'clarification',
      questions: [
        'Which file should this change apply to? Select a file in the panel.',
        'Do you want a change to one file, or a plan across several files?',
        NO_FILE_NOTE,
      ],
    };
  }

  if (selectedPaths.length === 1) {
    return buildPatchProposal(selectedPaths[0]!, request, redactedNote);
  }

  // 2 or more paths → plan
  return buildPlan(selectedPaths, redactedNote);
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildExplanation(paths: string[], redactedNote: string[], isAudit: boolean): AIResponse {
  const limitations: string[] = [MOCK_NOTICE];
  if (isAudit) {
    limitations.push(STATIC_NOTE);
    limitations.push(NO_SCAN_NOTE);
  } else {
    limitations.push(CANNED_NOTE);
    if (paths.length === 0) limitations.push(NO_FILE_NOTE);
  }
  limitations.push(...redactedNote);
  return {
    type: 'explanation',
    summary: isAudit
      ? 'Possible missing input validation (example finding — this is a mock response).'
      : 'This is a mock explanation. It does not describe the actual code in the selected files.',
    evidencePaths: paths.slice(), // only paths from the selection
    limitations,
  };
}

function buildPlan(paths: string[], redactedNote: string[]): AIResponse {
  return {
    type: 'plan',
    summary: 'Mock plan: an example of a multi-file change. This is a mock response.',
    affectedPaths: paths.slice(),
    steps: [
      MOCK_STEP_A,
      MOCK_STEP_B(paths),
      MOCK_STEP_C,
      MOCK_STEP_D,
    ],
    risks: [
      MOCK_NOTICE,
      MULTI_FILE_RISK,
      ...redactedNote,
    ],
  };
}

function buildPatchProposal(
  path: string,
  request: AIRequest,
  redactedNote: string[],
): AIResponse {
  const context = request.sourceContext?.find((c) => c.filePath === path);
  const { diff } = buildInsertDiff({
    path,
    content: context?.content,
    comment: MOCK_COMMENT,
  });

  const risks: string[] = [MOCK_NOTICE];
  if (!context) {
    risks.push(NOT_CHECKED);
  }
  if (redactedNote.length > 0) {
    risks.push('Content was redacted, so this diff may not apply to the original file.');
    risks.push(...redactedNote);
  }

  return {
    type: 'patch_proposal',
    summary: 'Mock patch: inserts one example comment line at the top of the file. This is not a real fix.',
    affectedPaths: [path],
    unifiedDiff: diff,
    tests: [PATCH_TEST],
    risks,
  };
}
