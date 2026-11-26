// @node: F11.3
// Turns a model's text into a checked `AIResponse`. Runs on the server only. Pure.
// The model returns a small JSON object ("kind" plus fields); this file validates it strictly, maps it to the AIResponse
// contract, and, for a patch, builds the unified diff itself from the snippet that was shown (the model never writes diff text).
import { z } from 'zod';
import { AI_LIVE } from '../../config/aiLive';
import { PROVIDERS, type AIProviderId } from '../../config/aiProviders';
import { AI_ACTION_ARGS, AI_ACTION_NAMES, type AIRequest, type AIResponse } from '../../types/contracts';
import { containsSecret } from '../redact';

export type ParseOutcome = { ok: true; response: AIResponse } | { ok: false; reason: string };

const MAX_STR = 2000;
const bad = (reason: string): ParseOutcome => ({ ok: false, reason });
const clip = (s: string): string => (s.length > MAX_STR ? s.slice(0, MAX_STR) : s);
const str = z.string().min(1);

const ExplanationSchema = z.strictObject({
  kind: z.literal('explanation'),
  summary: str,
  evidence_paths: z.array(z.string().min(1).max(250)).max(10).default([]),
  limitations: z.array(str).max(12).default([]),
  cards_covered: z.boolean().default(true),
});
const ClarificationSchema = z.strictObject({ kind: z.literal('clarification'), questions: z.array(str).min(1).max(12) });
const EditSchema = z.strictObject({
  start_line: z.number().int().min(1),
  end_line: z.number().int().min(1),
  new_text: z.string().max(4000),
});
const PatchSchema = z.strictObject({
  kind: z.literal('patch'),
  summary: str,
  path: z.string().min(1).max(250),
  edits: z.array(EditSchema).min(1).max(AI_LIVE.maxEdits),
  tests: z.array(str).max(12).default([]),
  risks: z.array(str).max(12).default([]),
});
const PlanSchema = z.strictObject({
  kind: z.literal('plan'),
  summary: str,
  affected_paths: z.array(z.string().min(1).max(250)).max(10),
  steps: z.array(str).min(1).max(24),
  risks: z.array(str).max(12).default([]),
});
const ActionSchema = z.strictObject({
  kind: z.literal('action'),
  action: z.enum(AI_ACTION_NAMES),
  arg: z.enum(AI_ACTION_ARGS).optional(),
  summary: str,
});
const AnswerSchema = z.discriminatedUnion('kind', [ExplanationSchema, ClarificationSchema, PatchSchema, PlanSchema, ActionSchema]);
type Answer = z.infer<typeof AnswerSchema>;

const ALLOWED_KINDS: Record<AIRequest['taskType'], ReadonlyArray<Answer['kind']>> = {
  explain: ['explanation', 'clarification'],
  review_finding: ['explanation', 'clarification'],
  suggest_change: ['patch', 'plan', 'clarification'],
  act: ['action', 'explanation', 'clarification'],
};

/** Finds one JSON object in the text: inside a code fence, or from the first "{" to the last "}". Returns undefined when none parses. */
export function extractJson(text: string): unknown {
  if (typeof text !== 'string' || text.length === 0 || text.length > 200_000) return undefined;
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) candidates.push(fence[1]!);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const v: unknown = JSON.parse(c.trim());
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch { /* try the next candidate */ }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Edits to a unified diff
// ---------------------------------------------------------------------------

export interface Edit { start_line: number; end_line: number; new_text: string }
export type DiffOutcome = { ok: true; diff: string } | { ok: false; reason: string };

/**
 * Builds ONE hunk, with up to 3 lines of context, from edits to the snippet `content` (whose first line is file line `firstLine`).
 * The diff is written without any carriage return and uses only the snippet's own text.
 */
export function buildEditDiff(path: string, firstLine: number, content: string, edits: readonly Edit[]): DiffOutcome {
  if (content.includes('\r')) return { ok: false, reason: 'The snippet contains a carriage return.' };
  if (content.includes('[REDACTED:')) return { ok: false, reason: 'The snippet was redacted.' };
  const lines = content.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const lastLine = firstLine + lines.length - 1;
  if (edits.length < 1 || edits.length > AI_LIVE.maxEdits) return { ok: false, reason: 'Wrong number of edits.' };
  const sorted = [...edits].sort((a, b) => a.start_line - b.start_line);
  let prevEnd = firstLine - 1;
  for (const e of sorted) {
    if (!Number.isInteger(e.start_line) || !Number.isInteger(e.end_line) || e.start_line > e.end_line) return { ok: false, reason: 'An edit has a bad line range.' };
    if (e.start_line < firstLine || e.end_line > lastLine) return { ok: false, reason: 'An edit is outside the lines shown.' };
    if (e.start_line <= prevEnd) return { ok: false, reason: 'Edits overlap.' };
    if (e.new_text.includes('\r')) return { ok: false, reason: 'An edit contains a carriage return.' };
    if (e.new_text.split('\n').length > AI_LIVE.maxEditNewLines) return { ok: false, reason: 'An edit is too long.' };
    prevEnd = e.end_line;
  }
  const first = sorted[0]!.start_line;
  const last = sorted[sorted.length - 1]!.end_line;
  const ctxStart = Math.max(firstLine, first - 3);
  const ctxEnd = Math.min(lastLine, last + 3);
  const at = (n: number): string => lines[n - firstLine]!;
  const body: string[] = [];
  let removed = 0;
  let added = 0;
  let changed = false;
  let n = ctxStart;
  let k = 0;
  while (n <= ctxEnd) {
    const e = sorted[k];
    if (e && n === e.start_line) {
      const oldLines: string[] = [];
      for (let m = e.start_line; m <= e.end_line; m++) oldLines.push(at(m));
      const newLines = e.new_text === '' ? [] : e.new_text.split('\n');
      if (oldLines.length !== newLines.length || oldLines.some((l, i) => l !== newLines[i])) changed = true;
      for (const l of oldLines) body.push('-' + l);
      for (const l of newLines) body.push('+' + l);
      removed += oldLines.length;
      added += newLines.length;
      n = e.end_line + 1;
      k++;
    } else {
      body.push(' ' + at(n));
      n++;
    }
  }
  if (!changed) return { ok: false, reason: 'The edits change nothing.' };
  const oldCount = ctxEnd - ctxStart + 1;
  const newCount = oldCount - removed + added;
  const diff = `--- a/${path}\n+++ b/${path}\n@@ -${ctxStart},${oldCount} +${ctxStart},${newCount} @@\n${body.join('\n')}\n`;
  if (diff.length > AI_LIVE.maxProposalDiffChars) return { ok: false, reason: 'The change is too large for one reviewable diff.' };
  return { ok: true, diff };
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

const AI_NOTE = (provider: AIProviderId): string => `This answer was written by an AI model (${PROVIDERS[provider].name}). Check it before you rely on it.`;
const CARDS_NOTE = 'The reference cards did not cover this question.';
const DEFAULT_TEST = 'Run the project\'s tests after applying the change.';
const DEFAULT_RISK = 'This change was written by an AI model. Read the diff carefully before you approve it.';

/** Parses and maps a model answer. `request` must be the request as the model saw it (the prompt builder's effective request). */
export function parseAnswer(text: string, request: AIRequest, provider: AIProviderId): ParseOutcome {
  const json = extractJson(text);
  if (json === undefined) return bad('not_json');
  if (containsSecret(json)) return bad('secret_in_answer');
  const parsed = AnswerSchema.safeParse(json);
  if (!parsed.success) return bad('wrong_shape');
  const a = parsed.data;
  if (!ALLOWED_KINDS[request.taskType].includes(a.kind)) return bad('kind_not_allowed');
  const selected = new Set(request.selectedPaths);
  const inSel = (p: string): boolean => selected.has(p);

  switch (a.kind) {
    case 'clarification':
      return { ok: true, response: { type: 'clarification', questions: a.questions.slice(0, 5).map(clip) } };

    case 'explanation': {
      if (!a.evidence_paths.every(inSel)) return bad('path_not_selected');
      const limitations = a.limitations.slice(0, 6).map(clip);
      limitations.push(AI_NOTE(provider));
      if (!a.cards_covered) limitations.push(CARDS_NOTE);
      return { ok: true, response: { type: 'explanation', summary: clip(a.summary), evidencePaths: a.evidence_paths, limitations } };
    }

    case 'plan': {
      if (request.selectedPaths.length === 0) {
        return { ok: true, response: { type: 'clarification', questions: ['Which file should this change apply to? Select a file in the panel and ask again.'] } };
      }
      if (a.affected_paths.length === 0 || !a.affected_paths.every(inSel)) return bad('path_not_selected');
      const risks = a.risks.slice(0, 7).map(clip);
      risks.push(DEFAULT_RISK);
      return { ok: true, response: { type: 'plan', summary: clip(a.summary), affectedPaths: a.affected_paths, steps: a.steps.slice(0, 12).map(clip), risks } };
    }

    case 'patch': {
      if (request.selectedPaths.length !== 1 || a.path !== request.selectedPaths[0]) return bad('patch_not_allowed');
      const ctx = request.sourceContext?.find((c) => c.filePath === a.path);
      if (!ctx) return bad('patch_not_allowed');
      const built = buildEditDiff(a.path, ctx.startLine ?? 1, ctx.content, a.edits);
      if (!built.ok) return bad(`bad_edits: ${built.reason}`);
      const tests = a.tests.slice(0, 8).map(clip);
      if (tests.length === 0) tests.push(DEFAULT_TEST);
      const risks = a.risks.slice(0, 7).map(clip);
      risks.push(DEFAULT_RISK);
      return { ok: true, response: { type: 'patch_proposal', summary: clip(a.summary), affectedPaths: [a.path], unifiedDiff: built.diff, tests, risks } };
    }

    case 'action': {
      if (request.taskType !== 'act' || request.sourceContext !== undefined) return bad('action_not_allowed');
      const response: AIResponse = a.arg !== undefined
        ? { type: 'action', action: a.action, arg: a.arg, summary: clip(a.summary) }
        : { type: 'action', action: a.action, summary: clip(a.summary) };
      return { ok: true, response };
    }
  }
}
