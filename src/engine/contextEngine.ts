// @node: F11.6
// The Context Engine (browser side): decides what the live AI is allowed to see.
// The smallest useful piece: file names, one-line connection facts, a skill id, and (only when "Include the contents" is ticked)
// a few redacted lines around the point of interest. Cards are chosen on the server, never here. Pure.
import { AI_LIMITS } from '../config/aiLimits';
import { AI_LIVE } from '../config/aiLive';
import type { RepoSnapshot } from '../types/contracts';
import type { Edge } from './understandTypes';
import { redact } from './redact';

export interface FocusFinding {
  path: string;
  skillId: string;
  firstLine: number;
}

export interface ContextInput {
  snapshot: RepoSnapshot;
  paths: readonly string[];
  /** The finding chosen in "About a finding". It adds its file, sets the skill id, and centres the snippet on its first line. */
  finding?: FocusFinding | undefined;
  includeContent: boolean;
  /** Edges from the connection map (`understanding.result.edges`). */
  edges?: readonly Edge[] | undefined;
  /** The text the user is working on now: the practice copy (the loaded file plus approved changes). Defaults to the loaded text. */
  contentOf?: ((path: string) => string | undefined) | undefined;
}

export interface SnippetItem { filePath: string; content: string; startLine?: number }

export interface BuiltContext {
  selectedPaths: string[];
  sourceContext?: SnippetItem[];
  skillId?: string;
  connections?: string[];
  /** Plain notes about anything left out or cut. Shown to the user; never silent. */
  notes: string[];
}
export type ContextResult = { ok: true; context: BuiltContext } | { ok: false; message: string };

const encoder = new TextEncoder();
const bytes = (s: string): number => encoder.encode(s).length;

/** Removes the trailing carriage return from every line, so CRLF and LF files give the same text. */
export function normalizeEol(text: string): string {
  return text.includes('\r') ? text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l)).join('\n') : text;
}

function windowFor(lines: string[], focus: number | undefined): { start: number; text: string; startOfFile: boolean } {
  const total = lines.length;
  let start: number; // 1-based, inclusive
  let end: number; // 1-based, inclusive
  if (focus !== undefined) {
    const f = Math.min(Math.max(1, focus), Math.max(1, total));
    start = Math.max(1, f - AI_LIVE.windowLinesBefore);
    end = Math.min(total, f + AI_LIVE.windowLinesAfter);
    // Keep the byte limit by dropping the line farthest from the focus.
    const sizeOf = (a: number, b: number): number => bytes(lines.slice(a - 1, b).join('\n'));
    while (end - start + 1 > AI_LIVE.windowMaxLines || (sizeOf(start, end) > AI_LIVE.windowMaxBytes && end > start)) {
      if (f - start > end - f) start++;
      else end--;
    }
  } else {
    start = 1;
    end = Math.min(total, AI_LIVE.headLines, AI_LIVE.windowMaxLines);
    while (end > start && bytes(lines.slice(0, end).join('\n')) > AI_LIVE.windowMaxBytes) end--;
  }
  return { start, text: lines.slice(start - 1, end).join('\n'), startOfFile: focus === undefined && start === 1 };
}

function phrase(e: Edge): string {
  const to = e.targetPath ?? e.target;
  switch (e.kind) {
    case 'imports': return `${e.from} imports ${to}`;
    case 'loads': return `${e.from} loads ${to}`;
    case 'defines_route': return `${e.from} defines the route ${e.target}`;
    case 'calls_api': return `${e.from} calls ${e.target}`;
    case 'calls_external': return `${e.from} calls the outside address ${e.target}`;
    case 'reads_config': return `${e.from} reads the setting ${e.target}`;
  }
}

const CERTAINTY_ORDER: Record<Edge['certainty'], number> = { confirmed: 0, inferred: 1, broken: 2 };

/** Up to 3 one-line facts about the selected files. Paths, addresses, kind, certainty, and line only; never source text. */
export function connectionFacts(edges: readonly Edge[], selected: ReadonlySet<string>): string[] {
  const touching = edges.filter((e) => selected.has(e.from) || (e.targetPath !== undefined && selected.has(e.targetPath)));
  touching.sort((a, b) => CERTAINTY_ORDER[a.certainty] - CERTAINTY_ORDER[b.certainty] || a.line - b.line || (a.id < b.id ? -1 : 1));
  const out: string[] = [];
  for (const e of touching) {
    if (out.length >= AI_LIVE.maxConnections) break;
    const line = redact(`${phrase(e)} (${e.certainty}, line ${e.line})`).text.replace(/\s+/g, ' ');
    out.push(line.length > 200 ? line.slice(0, 200) : line);
  }
  return out;
}

export function buildContext(input: ContextInput): ContextResult {
  const { snapshot, finding, includeContent } = input;
  const notes: string[] = [];
  const paths: string[] = [];
  const add = (p: string): void => { if (!paths.includes(p)) paths.push(p); };
  if (finding) add(finding.path);
  for (const p of input.paths) add(p);
  if (paths.length > AI_LIMITS.maxSelectedPaths) return { ok: false, message: `Select at most ${AI_LIMITS.maxSelectedPaths} files.` };

  const byPath = new Map(snapshot.files.map((f) => [f.path, f]));
  for (const p of paths) {
    const f = byPath.get(p);
    if (!f) return { ok: false, message: `"${p}" is not in the loaded snapshot.` };
    if (f.loadStatus !== 'loaded' || f.truncated) return { ok: false, message: `"${p}" is ${f.truncated ? 'only partly loaded' : f.loadStatus} and cannot be selected.` };
  }

  const context: BuiltContext = { selectedPaths: paths, notes };
  if (finding) context.skillId = finding.skillId;

  if (includeContent && paths.length > 0) {
    const items: SnippetItem[] = [];
    let redactions = 0;
    for (const p of paths) {
      if (items.length >= AI_LIMITS.maxContextFiles) {
        notes.push(`Snippets were sent for the first ${AI_LIMITS.maxContextFiles} files only.`);
        break;
      }
      const raw = input.contentOf ? input.contentOf(p) : byPath.get(p)!.content;
      if (typeof raw !== 'string') { notes.push(`No contents were available for "${p}".`); continue; }
      const text = normalizeEol(raw);
      let item: SnippetItem;
      if (bytes(text) <= AI_LIVE.wholeFileMaxBytes) {
        item = { filePath: p, content: text };
      } else {
        const lines = text.split('\n');
        if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
        const focus = finding && finding.path === p ? finding.firstLine : undefined;
        const w = windowFor(lines, focus);
        item = { filePath: p, content: w.text, startLine: w.start };
        notes.push(focus === undefined
          ? `Only the first ${w.text.split('\n').length} lines of "${p}" were included (the start of the file).`
          : `Only lines ${w.start} to ${w.start + w.text.split('\n').length - 1} of "${p}" were included.`);
      }
      const r = redact(item.content);
      redactions += r.count;
      item.content = r.text;
      items.push(item);
    }
    if (redactions > 0) notes.push(`${redactions} likely secret${redactions === 1 ? ' was' : 's were'} redacted from the snippets.`);
    if (items.length > 0) context.sourceContext = items;
  }

  if (input.edges && paths.length > 0) {
    const facts = connectionFacts(input.edges, new Set(paths));
    if (facts.length > 0) context.connections = facts;
  }
  return { ok: true, context };
}
