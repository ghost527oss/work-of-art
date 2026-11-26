// @node: F11.9
// Browser side. Decides whether an AI `action` answer may run, and turns it into the same command a typed word makes.
// The AI can start safe actions. It can never approve, reject, or reset, and it can never act when file text was sent
// (so text inside a file cannot trigger an action). The server checks the same rules; this is the second check.
import { AI_ACTION_NAMES, type AIRequest, type AIResponse } from '../types/contracts';
import type { ActionName, CommandArg } from './commands';

export interface AIActionCommand { name: ActionName; arg?: CommandArg }
export type ActionCheck = { ok: true; command: AIActionCommand; line: string } | { ok: false; reason: string };

const PANEL_ARGS: ReadonlySet<string> = new Set(['edit', 'chat', 'log', 'history', 'journal']);
const ALLOWED: ReadonlySet<string> = new Set(AI_ACTION_NAMES);

export function checkAIAction(request: AIRequest, response: AIResponse): ActionCheck {
  if (response.type !== 'action') return { ok: false, reason: 'That answer was not an action.' };
  if (request.taskType !== 'act') return { ok: false, reason: 'An action is allowed only for a "Do something" request.' };
  if (request.sourceContext !== undefined) return { ok: false, reason: 'An action is not allowed when file contents were sent, so file text cannot start one.' };
  if (!ALLOWED.has(response.action)) return { ok: false, reason: `The AI cannot run "${response.action}".` };
  const { action, arg } = response;
  if (action === 'start') {
    if (arg !== 'practice' && arg !== 'crew') return { ok: false, reason: 'Start needs practice or crew.' };
    return { ok: true, command: { name: 'start', arg }, line: `start ${arg}` };
  }
  if (action === 'open') {
    if (arg === undefined || !PANEL_ARGS.has(arg)) return { ok: false, reason: 'Open needs a panel name.' };
    return { ok: true, command: { name: 'open', arg: arg as CommandArg }, line: `open ${arg}` };
  }
  if (arg !== undefined) return { ok: false, reason: `${action} takes no argument.` };
  return { ok: true, command: { name: action as ActionName }, line: action };
}
