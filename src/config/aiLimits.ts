// @node: F2.1
// All AI endpoint limits in one place, all provisional until benchmarked.
export interface AILimits {
  provisional: boolean;
  /** Max bytes for the whole request body. */
  maxRequestBodyBytes: number;
  /** Max characters in the instruction field (after trimming). */
  maxInstructionChars: number;
  /** Max entries in selectedPaths. */
  maxSelectedPaths: number;
  /** Max entries in sourceContext. */
  maxContextFiles: number;
  /** Max UTF-8 bytes for a single sourceContext.content. */
  maxContextFileBytes: number;
  /** Max UTF-8 bytes for all sourceContext.content combined. */
  maxContextTotalBytes: number;
  /** Max bytes for the full response body (checked on the client). */
  maxResponseBytes: number;
  /** Client-side request timeout. */
  clientTimeoutMs: number;
  /** Max file rows shown in the picker. */
  maxPickerRows: number;
}

export const AI_LIMITS: AILimits = {
  provisional: true,
  maxRequestBodyBytes: 128 * 1024,
  maxInstructionChars: 2000,
  maxSelectedPaths: 10,
  maxContextFiles: 5,
  maxContextFileBytes: 20 * 1024,
  maxContextTotalBytes: 60 * 1024,
  maxResponseBytes: 256 * 1024,
  clientTimeoutMs: 28_000,
  maxPickerRows: 200,
};
