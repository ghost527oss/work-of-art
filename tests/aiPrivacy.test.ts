// @node: F11.11
// Sentinels: secrets in the question, a snippet, a connection fact, a key, a provider error body, and a model answer
// never reach a provider, the Log, a saved record, the cache, an error, a response, or a server log line.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRecord } from '../src/store/workStorage';
import { IMG_FIXTURE, makeSystem } from './helpers/aiHarness';
import { okBody } from './helpers/fakeProviders';

const AWS = 'AKIAQWERTYUIOPASDFGH';
const GH = `ghp_${'Z'.repeat(36)}`;
const KEYS = { AI_MODE: 'live', GEMINI_API_KEY: 'KEY_G_sentinel_91', GROQ_API_KEY: 'KEY_Q_sentinel_92', OPENROUTER_API_KEY: 'KEY_O_sentinel_93' };
const FILES = {
  ...IMG_FIXTURE,
  'config.js': `const apiKey = "${GH}";\nfetch("https://api.test/v1/data?k=${AWS}");\nexport const x = 1;\n`,
};
const BODY_SENTINEL = 'PROVIDER_ERROR_BODY_SENTINEL_77';
const ANSWER_SENTINEL = 'MODEL_ANSWER_SENTINEL_88';

afterEach(() => vi.restoreAllMocks());

describe('secrets and keys stay out of every surface', () => {
  it('end to end: question, snippet, connection fact, key, provider error body, and a leaky model answer', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const leaky = JSON.stringify({ kind: 'plan', summary: `use ${AWS} ${ANSWER_SENTINEL}`, affected_paths: ['config.js', 'index.html'], steps: ['one'], risks: [] });
    const honest = JSON.stringify({ kind: 'plan', summary: `A plan ${ANSWER_SENTINEL}`, affected_paths: ['config.js', 'index.html'], steps: ['Read the file'], risks: [] });
    const sys = await makeSystem({
      env: KEYS,
      files: FILES,
      script: (c) => {
        if (c.provider === 'gemini') return { status: 500, text: `${BODY_SENTINEL} KEY_G_sentinel_91 ${AWS}` };
        if (c.provider === 'groq') return { json: okBody('groq', leaky) };
        return { json: okBody('openrouter', honest) };
      },
    });
    const question = `Why does ${AWS} and ${GH} appear? Be careful.`;
    sys.send({ instruction: question, selectedPaths: ['config.js', 'index.html'], finding: undefined, findingId: undefined, includeContent: true });
    sys.actions.acceptNotice!();
    await sys.settle();

    const s = sys.store.getState();
    expect(s.ai.status).toBe('done');
    expect(s.ai.result!.meta).toMatchObject({ provider: 'openrouter' });

    // 1. Nothing sent to a provider holds a secret or an app key; keys are only in headers.
    expect(sys.calls).toHaveLength(3);
    for (const c of sys.calls) {
      const body = JSON.stringify(c.body);
      for (const secret of [AWS, GH]) expect(body).not.toContain(secret);
      expect(body).not.toContain('KEY_');
      expect(c.url).not.toContain('KEY_');
      expect(body).toContain('[REDACTED:');
    }
    // 2. The client request, the Log, the AI slice, the saved record, the answer, and the cache path hold none of them.
    const surfaces: Record<string, string> = {
      log: JSON.stringify(s.log),
      ai: JSON.stringify(s.ai),
      record: JSON.stringify(buildRecord(s, 1)),
      work: JSON.stringify(s.work),
      chat: JSON.stringify(s.work.chat),
      console: spies.flatMap((x) => x.mock.calls.map((c) => c.join(' '))).join('\n'),
    };
    for (const [name, text] of Object.entries(surfaces)) {
      for (const bad of [AWS, GH, 'KEY_G_sentinel_91', 'KEY_Q_sentinel_92', 'KEY_O_sentinel_93', BODY_SENTINEL, 'x-goog-api-key']) {
        expect(text, `${name} contains ${bad}`).not.toContain(bad);
      }
    }
    // 3. The leaky answer was not shown: the answering model's text is the honest one.
    expect(JSON.stringify(s.ai.result)).not.toContain(AWS);
    expect(JSON.stringify(s.ai.result)).toContain(ANSWER_SENTINEL);
    // 4. The AI's text and the question are not in the Log or the saved record either.
    for (const name of ['log', 'record', 'work']) {
      expect(surfaces[name]).not.toContain(ANSWER_SENTINEL);
      expect(surfaces[name]).not.toContain('Be careful');
    }
    // 5. The server log holds only codes and outcome words.
    expect(surfaces.console).toContain('[api/assistant] live task=suggest_change tier=heavy via=openrouter');
    expect(surfaces.console).toContain('failed=gemini:error,groq:bad_answer');
  });

  it('the connection facts built from a file with a secret in an address are redacted', async () => {
    const sys = await makeSystem({ env: KEYS, files: FILES, script: (c) => ({ json: okBody(c.provider, JSON.stringify({ kind: 'explanation', summary: 's', evidence_paths: ['config.js'] })) }) });
    sys.send({ taskType: 'explain', selectedPaths: ['config.js'], includeContent: false, finding: undefined, findingId: undefined });
    sys.actions.acceptNotice!();
    await sys.settle();
    const body = JSON.stringify(sys.calls[0]!.body);
    expect(body).toContain('CONNECTIONS');
    expect(body).not.toContain(AWS);
  });

  it('all-failed errors name providers and outcome words only', async () => {
    const sys = await makeSystem({ env: KEYS, files: FILES, script: () => ({ status: 401, text: `${BODY_SENTINEL} KEY_G_sentinel_91` }) });
    sys.send({ includeContent: false });
    sys.actions.acceptNotice!();
    await sys.settle();
    const err = JSON.stringify(sys.store.getState().ai.error);
    expect(err).toContain('did not accept its key');
    for (const bad of [BODY_SENTINEL, 'KEY_']) expect(err).not.toContain(bad);
  });

  it('a saved answer shown again carries no secret and costs no request', async () => {
    const sys = await makeSystem({ env: KEYS, files: FILES, script: (c) => ({ json: okBody(c.provider, JSON.stringify({ kind: 'explanation', summary: `A ${ANSWER_SENTINEL}`, evidence_paths: [] })) }) });
    const ask = { taskType: 'explain', selectedPaths: ['config.js'], includeContent: true, finding: undefined, findingId: undefined, instruction: `What is ${AWS}?` };
    sys.send(ask); sys.actions.acceptNotice!(); await sys.settle();
    const before = sys.calls.length;
    sys.send(ask);
    expect(sys.calls.length).toBe(before);
    const s = sys.store.getState();
    expect(s.ai.fromCache).toBe(true);
    for (const bad of [AWS, GH, 'KEY_']) expect(JSON.stringify(s.ai) + JSON.stringify(s.log)).not.toContain(bad);
  });
});
