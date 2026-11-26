// @node: F6.1
// Every 2D limit in one place. All values are provisional placeholders.
export const SCAN_LIMITS = {
  provisional: true,
  maxFiles: 2000,
  maxMs: 8000,
  maxFindings: 500,
  maxPerCheck: 50,
  batchSize: 40,
  snippetLines: 12,
  snippetLineChars: 200,
  crewPerArea: 12,
  crewSteps: 150,
  crewTickMs: 1000,
  maxPatternChars: 500,
} as const;
