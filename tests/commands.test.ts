// @node: F4.2
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORK_LIMITS } from '../src/config/workLimits';
import { ACTIONS, HELP_LINES, PANEL_WORDS, parseCommand } from '../src/engine/commands';

const NAMES = ['help', 'status', 'start', 'pause', 'resume', 'step', 'stop', 'approve', 'reject', 'undo', 'redo', 'open', 'reset'];

describe('ACTIONS', () => {
  it('has exactly the 13 names', () => expect(ACTIONS.map((a) => a.name)).toEqual(NAMES));
  it('has a help line for each and only open takes an argument', () => {
    for (const a of ACTIONS) {
      expect(a.help.length).toBeGreaterThan(0);
      expect(a.takesArg).toBe(a.name === 'open');
    }
    expect(HELP_LINES).toHaveLength(13);
  });
  it('maps panel words to layout ids', () => {
    expect(PANEL_WORDS).toEqual({ edit: 'edit', chat: 'ai', log: 'log', history: 'history', journal: 'journal' });
  });
  it('defines no Pause, Resume, or Step button label', () => {
    const src = readFileSync('src/engine/commands.ts', 'utf8');
    expect(src).not.toMatch(/label/i);
    expect(src).not.toMatch(/button/i);
  });
});

describe('parseCommand: accepted', () => {
  for (const n of NAMES.filter((x) => x !== 'open')) {
    for (const v of [n, n.toUpperCase(), n[0]!.toUpperCase() + n.slice(1), `  ${n}  `, `/${n}`, ` /${n} `, `\t${n}\n`]) {
      it(`${JSON.stringify(v)}`, () => expect(parseCommand(v)).toEqual({ kind: 'command', name: n }));
    }
  }
  for (const [w, id] of Object.entries(PANEL_WORDS)) {
    it(`open ${w}`, () => {
      expect(parseCommand(`open ${w}`)).toEqual({ kind: 'command', name: 'open', arg: w });
      expect(PANEL_WORDS[w as keyof typeof PANEL_WORDS]).toBe(id);
    });
  }
  it('open with case, slash, and spacing', () => expect(parseCommand(' /OPEN   Chat ')).toEqual({ kind: 'command', name: 'open', arg: 'chat' }));
});

describe('parseCommand: refused', () => {
  it('stop now', () => {
    const r = parseCommand('stop now');
    expect(r.kind).toBe('refused');
    if (r.kind === 'refused') expect(r.reply).toContain('stop');
  });
  it('pause please', () => expect(parseCommand('pause please').kind).toBe('refused'));
  it('/approve it', () => expect(parseCommand('/approve it').kind).toBe('refused'));
  for (const t of ['open', 'open banana', '/open']) {
    it(t, () => expect(parseCommand(t)).toEqual({ kind: 'refused', reply: 'Use: open edit, chat, log, history, or journal.' }));
  }
});

describe('parseCommand: none', () => {
  for (const t of ['', '   ', '/', 'stop everything right now', 'explain the login file', 'open edit now', 'stopping', 'starter']) {
    it(JSON.stringify(t), () => expect(parseCommand(t)).toEqual({ kind: 'none' }));
  }
  it('non-string input', () => expect(parseCommand(undefined as unknown as string)).toEqual({ kind: 'none' }));
});

describe('parseCommand: fuzz', () => {
  it('1000 random strings never throw and only commands starting with an action name', () => {
    let s = 7;
    const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const bits = ['stop', 'open', 'chat', ' ', '/', 'x', 'APPROVE', '\n', 'help', 'zz', '\u00e9', '  '];
    for (let i = 0; i < 1000; i++) {
      let t = '';
      const n = Math.floor(r() * 6);
      for (let j = 0; j < n; j++) t += bits[Math.floor(r() * bits.length)];
      const res = parseCommand(t);
      if (res.kind === 'command') {
        const first = t.trim().replace(/^\//, '').trim().toLowerCase().split(/\s+/)[0]!;
        expect(NAMES).toContain(first);
      }
    }
  });
});

describe('workLimits', () => {
  it('holds the design values', () => {
    expect(WORK_LIMITS).toEqual({
      provisional: true, tickMs: 1200, maxSteps: 8, maxPracticeFiles: 2, maxPracticeFileBytes: 20480,
      maxHistoryEntries: 50, maxChatReplies: 20, maxSavedLogEntries: 200, maxSavedBytes: 262144, maxDiffChars: 2000,
    });
  });
  it('both files import nothing', () => {
    for (const f of ['src/config/workLimits.ts', 'src/engine/commands.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/^\s*import\s/m);
      expect(src).not.toMatch(/fetch\(/);
    }
  });
});
