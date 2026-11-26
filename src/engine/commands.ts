// @node: F4.2
// Parses the fixed command words typed in the AI instruction box. Pure text work.

export type ActionName =
  | 'help' | 'status' | 'start' | 'pause' | 'resume' | 'step' | 'stop'
  | 'approve' | 'reject' | 'undo' | 'redo' | 'open' | 'reset';

export interface ActionInfo {
  name: ActionName;
  help: string;
  takesArg: boolean;
}

export const ACTIONS: readonly ActionInfo[] = [
  { name: 'help', help: 'List every command.', takesArg: false },
  { name: 'status', help: 'Show the mode, the run, and the change counts.', takesArg: false },
  { name: 'start', help: 'Start the practice run (no AI).', takesArg: false },
  { name: 'pause', help: 'Keep the run from moving on by itself.', takesArg: false },
  { name: 'resume', help: 'Let the run move on by itself again.', takesArg: false },
  { name: 'step', help: 'Run one step while paused.', takesArg: false },
  { name: 'stop', help: 'End the run and cancel any pending AI request.', takesArg: false },
  { name: 'approve', help: 'Apply the waiting proposal to the practice copy.', takesArg: false },
  { name: 'reject', help: 'Discard the waiting proposal.', takesArg: false },
  { name: 'undo', help: 'Take back the last applied change.', takesArg: false },
  { name: 'redo', help: 'Re-apply the last undone change.', takesArg: false },
  { name: 'open', help: 'Open a panel: open edit, chat, log, history, or journal.', takesArg: true },
  { name: 'reset', help: 'Clear the run, the history, and the saved work.', takesArg: false },
];

/** Panel words accepted by `open`, mapped to layout panel ids (`chat` is the AI Chat panel). */
export const PANEL_WORDS = {
  edit: 'edit',
  chat: 'ai',
  log: 'log',
  history: 'history',
  journal: 'journal',
} as const;

export type PanelWord = keyof typeof PANEL_WORDS;

export const HELP_LINES: readonly string[] = ACTIONS.map((a) => `${a.name}: ${a.help}`);

export type ParsedCommand =
  | { kind: 'command'; name: ActionName; arg?: PanelWord }
  | { kind: 'refused'; reply: string }
  | { kind: 'none' };

const OPEN_FORM = 'Use: open edit, chat, log, history, or journal.';

function findAction(word: string): ActionInfo | undefined {
  return ACTIONS.find((a) => a.name === word);
}

function isPanelWord(word: string): word is PanelWord {
  return Object.prototype.hasOwnProperty.call(PANEL_WORDS, word);
}

export function parseCommand(text: string): ParsedCommand {
  if (typeof text !== 'string') return { kind: 'none' };
  let t = text.trim();
  if (t.startsWith('/')) t = t.slice(1).trim();
  if (t === '') return { kind: 'none' };
  const words = t.toLowerCase().split(/\s+/);
  const action = findAction(words[0]!);
  if (!action || words.length > 2) return { kind: 'none' };
  if (action.name === 'open') {
    const arg = words[1];
    if (arg !== undefined && isPanelWord(arg)) return { kind: 'command', name: 'open', arg };
    return { kind: 'refused', reply: OPEN_FORM };
  }
  if (words.length === 2) {
    return { kind: 'refused', reply: `That command takes no argument. Type just: ${action.name}` };
  }
  return { kind: 'command', name: action.name };
}
