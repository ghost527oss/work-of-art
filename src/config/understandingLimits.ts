// @node: F5.1
// Every 2C limit in one place. All values are provisional placeholders.
export const UNDERSTANDING_LIMITS = {
  provisional: true,
  maxScannedFiles: 2000,
  maxEdgesPerFile: 200,
  maxEdgesTotal: 5000,
  maxFileResults: 20000,
  batchSize: 40,
  maxMs: 8000,
  maxCorrections: 500,
  maxSavedBytes: 64 * 1024,
  maxDetailChars: 120,
  maxLineChars: 10000,
  maxScanChars: 200 * 1024,
} as const;
