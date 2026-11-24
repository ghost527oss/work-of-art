// @node: F2.1
// Cross-field and byte-size validation for AIRequest and AIResult.
// Messages name the field, never the value, so user-supplied text cannot
// appear in an error response.
import { AI_LIMITS } from '../config/aiLimits';
import {
  AIRequestSchema,
  AIResultSchema,
  type AIRequest,
  type AIResult,
  type ApiErrorCode,
} from '../types/contracts';
import { containsSecret } from './redact';
import { isSafeRepoPath } from './repoUrl';

const encoder = new TextEncoder();
function byteLen(s: string): number {
  return encoder.encode(s).length;
}

type ValidateRequestOk = { ok: true; request: AIRequest };
type ValidateRequestFail = { ok: false; code: ApiErrorCode; message: string };
export type ValidateRequestResult = ValidateRequestOk | ValidateRequestFail;

function fail(code: ApiErrorCode, message: string): ValidateRequestFail {
  return { ok: false, code, message };
}

/**
 * Validates an AI request beyond what the schema can express:
 * - Trims the instruction and rejects whitespace-only.
 * - Checks each selectedPath with isSafeRepoPath, uniqueness, and that it
 *   does not look like a secret (containsSecret).
 * - Checks sourceContext paths for uniqueness and presence in selectedPaths.
 * - Checks sourceContext content byte sizes.
 *
 * Returns `invalid_request` for shape/semantic problems and `oversized` for
 * size-only problems. A request with any non-size issue returns `invalid_request`
 * even if it is also too large.
 */
export function validateAIRequest(input: unknown): ValidateRequestResult {
  const limits = AI_LIMITS;

  // Phase 1: schema parse
  const parsed = AIRequestSchema.safeParse(input);
  if (!parsed.success) {
    const hasNonSize = parsed.error.issues.some((i) => i.code !== 'too_big');
    if (hasNonSize) {
      return fail('invalid_request', 'The request is not valid. Check the field types, required fields, and that no extra fields are present.');
    }
    return fail('oversized', 'One or more fields in the request exceed the allowed size limit.');
  }

  const req = parsed.data;

  // Phase 2: semantic checks (always invalid_request)
  const trimmedInstruction = req.instruction.trim();
  if (trimmedInstruction.length === 0) {
    return fail('invalid_request', 'instruction must not be blank after trimming.');
  }

  const seenPaths = new Set<string>();
  for (const path of req.selectedPaths) {
    if (!isSafeRepoPath(path)) {
      return fail('invalid_request', 'selectedPaths contains an unsafe path.');
    }
    if (seenPaths.has(path)) {
      return fail('invalid_request', 'selectedPaths contains a duplicate path.');
    }
    if (containsSecret(path)) {
      return fail('invalid_request', 'selectedPaths contains a path that matched a secret pattern.');
    }
    seenPaths.add(path);
  }

  if (req.sourceContext !== undefined) {
    const seenContextPaths = new Set<string>();
    let totalBytes = 0;
    for (const item of req.sourceContext) {
      if (!seenPaths.has(item.filePath)) {
        return fail('invalid_request', 'sourceContext contains a filePath that is not in selectedPaths.');
      }
      if (seenContextPaths.has(item.filePath)) {
        return fail('invalid_request', 'sourceContext contains a duplicate filePath.');
      }
      seenContextPaths.add(item.filePath);

      // Phase 3: size checks (oversized)
      const fileBytes = byteLen(item.content);
      if (fileBytes > limits.maxContextFileBytes) {
        return fail('oversized', `sourceContext content for a file exceeds ${limits.maxContextFileBytes} bytes.`);
      }
      totalBytes += fileBytes;
      if (totalBytes > limits.maxContextTotalBytes) {
        return fail('oversized', `Total sourceContext content exceeds ${limits.maxContextTotalBytes} bytes.`);
      }
    }
  }

  return { ok: true, request: { ...req, instruction: trimmedInstruction } };
}

export type ValidateResultOk = { ok: true };
export type ValidateResultFail = { ok: false; problems: string[] };
export type ValidateResultResult = ValidateResultOk | ValidateResultFail;

const DIFF_MAX_BYTES = 20 * 1024;

/**
 * Validates an AIResult against its originating request:
 * - requestId must echo the request.
 * - evidencePaths and affectedPaths must all be in selectedPaths.
 * - plan and patch_proposal must have at least one affectedPath.
 * - unifiedDiff must be <= 20 KB (UTF-8 bytes).
 * - Re-parses with AIResultSchema so every per-field bound is enforced.
 */
export function validateAIResult(request: AIRequest, result: unknown): ValidateResultResult {
  const problems: string[] = [];

  // Schema re-parse
  const parsed = AIResultSchema.safeParse(result);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((i) => i.message) };
  }

  const r = parsed.data as AIResult;

  if (r.requestId !== request.requestId) {
    problems.push(`requestId mismatch: expected "${request.requestId}", got "${r.requestId}".`);
  }

  const selectedSet = new Set(request.selectedPaths);
  const { response } = r;

  if (response.type === 'explanation') {
    for (const ep of response.evidencePaths) {
      if (!selectedSet.has(ep)) problems.push(`evidencePaths contains "${ep}" which is not in selectedPaths.`);
    }
  }

  if (response.type === 'plan') {
    for (const ap of response.affectedPaths) {
      if (!selectedSet.has(ap)) problems.push(`affectedPaths contains "${ap}" which is not in selectedPaths.`);
    }
    if (response.affectedPaths.length === 0) {
      problems.push('plan response must have at least one affectedPath.');
    }
  }

  if (response.type === 'patch_proposal') {
    for (const ap of response.affectedPaths) {
      if (!selectedSet.has(ap)) problems.push(`affectedPaths contains "${ap}" which is not in selectedPaths.`);
    }
    if (response.affectedPaths.length === 0) {
      problems.push('patch_proposal response must have at least one affectedPath.');
    }
    const diffBytes = byteLen(response.unifiedDiff);
    if (diffBytes > DIFF_MAX_BYTES) {
      problems.push(`unifiedDiff is ${diffBytes} bytes, exceeding the ${DIFF_MAX_BYTES}-byte limit.`);
    }
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
