# Tasks: 11 Live AI in AI Chat (Phase 3, Sub-phase 3A)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P3A-LIVE-CHAT` and the F11 nodes in `traceability/PLAN.md`. Active product phase: **Phase 3, Sub-phase 3A** (PatchBay's own screens black-and-white wireframe, no animation, `AI_MODE=mock` stays the default). **These tasks stay unstarted until you say "Go" for a named task. No application code is written by this spec step.**

Task ids are **L1 to L12**, so they cannot be confused with T, M, S, B, C, D, E, P, J, or K (earlier specs).

## How each task runs

1. **Wait for your explicit "Go" naming the task.** A "Go" covers that one task only. Nothing is written before the first "Go".
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F11.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts.
4. Check the diff against the scope myself, then report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait.

Rules for every task:
- Two consecutive verify failures on the same error: stop editing, hand a read-only diagnosis to `bug-auditor`, and wait for your approval before a third attempt.
- No new dependency. No provider SDK. Provider calls use `fetch` only.
- Provider names, `fetch` to a provider, and `process.env` appear only in `api/assistant.ts`, `src/engine/live/`, and `src/config/aiProviders.ts`. No browser file imports `src/engine/live/`.
- **No key, question text, snippet, answer text, or secret is ever written to the Log, storage, the cache key text shown to the user, an error, or a server log line.** Tests use sentinels to prove it.
- No `innerHTML`, `eval`, `new Function`, or `dangerouslySetInnerHTML`. All AI text is rendered as React text.
- New CSS uses only `#000` and `#fff`, with no `transition` and no `animation`.
- Do not touch the files in design section 4.4. Files in design section 4.2 may change only as described there. Existing tests change only as listed in design section 4.3.
- Earlier control and function names are used through their as-built names. If a name differs from the design, the task adapts the call and the report says so.
- `scripts/traceability/*` do not exist. Approval is recorded in this chat. The checks are the `npm` commands.

## Branch and commits

Spec on `spec/11-live-ai-chat`. Code on `feat/live-ai-chat` from the spec branch, **one commit per task**, a pull request after L12.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| L1 | F11.1 | Contracts, validators, limits, provider table, the mock `act` branch | Phase 2 |
| L2 | F11.2 | Card picker and prompt builder | L1 |
| L3 | F11.3 | Answer parser, edits to diff, and the three provider adapters | L1, L2 |
| L4 | F11.4 | Model Router and the live assistant | L1, L2, L3 |
| L5 | F11.5 | `/api/assistant` live mode, `GET` status, env, README | L4 |
| L6 | F11.6 | Context Engine | L1 |
| L7 | F11.7 | Session cache | L1, L6 |
| L8 | F11.8 | Client service, status, consent, controller, slice, Log lines | L5, L6, L7 |
| L9 | F11.9 | Action policy, AI proposals into Approve, attempt cap | L1, L8 |
| L10 | F11.10 | The UI | L8, L9 |
| L11 | F11.11 | Privacy, injection, static, and Phase 3 exit-gate tests | L1 to L10 |
| L12 | F11 | Final gate: full suite, build, browser run, mutation checks, review, report | L1 to L11 |

---

## L1. Contracts, validators, limits, provider table, mock `act` branch
- **plan_id:** P3A-LIVE-CHAT  **node_id:** F11.1
- **scope:** `src/types/contracts.ts`, `src/engine/aiValidate.ts`, `src/engine/mockAssistant.ts`, `src/config/aiLive.ts`, `src/config/aiProviders.ts`, `src/config/budgets-proxy.ts`, `tests/aiContracts.test.ts`, `tests/aiValidate.test.ts`, `tests/mockAssistant.test.ts`, `tests/aiLiveConfig.test.ts`, `tests/aiProviderConfig.test.ts`
- **goal:** Build design sections 6 and 7: the fourth task type, `skillId`, `connections`, `startLine`, the `action` response, `meta`, the new validation rules, `AI_LIVE`, and the provider table. Re-check each default model name against the provider's current official page (web check) and report any change.
- **acceptance:**
  - Valid requests with and without the new fields pass; extra fields, a bad `skillId`, an unknown skill, a `startLine` outside a `sourceContext` item, and a secret in `connections` are rejected.
  - An `action` result is valid only for `act` with no `sourceContext`; `arg` rules per action; `approve`, `reject`, and `reset` do not parse.
  - A mock `act` request returns a deterministic explanation that carries the mock notice and runs nothing. Every existing mock output is byte-identical (the existing fixtures prove it).
  - `meta` is optional, strict, and bounded; a result without `meta` still parses.
  - `AI_LIVE` values equal design 7.3 and are marked provisional; the browser-safe subset is re-exported by `budgets-proxy.ts`.
  - Provider table: fixed endpoints, no key values, model-name validation rejects `../x`, spaces, 81 characters, and `/` or `:` for Gemini. Defaults are Gemini `gemini-3.1-flash-lite` and `gemini-3.6-flash`, Groq `openai/gpt-oss-20b` and `openai/gpt-oss-120b`, OpenRouter `openrouter/free` for both tiers; an empty variable uses the default and a set variable overrides it; duplicate model names (OpenRouter light and heavy) are dropped from a plan.
  - `AI_LIVE.attemptTimeoutMs` is 7,000 and `totalBudgetMs` is 14,000.
- **verify:** `npm run typecheck && npx vitest run tests/aiContracts.test.ts tests/aiValidate.test.ts tests/mockAssistant.test.ts tests/aiLiveConfig.test.ts tests/aiProviderConfig.test.ts`

## L2. Card picker and prompt builder
- **plan_id:** P3A-LIVE-CHAT  **node_id:** F11.2
- **scope:** `src/engine/live/cardPicker.ts`, `src/engine/live/promptBuilder.ts`, `tests/cardPicker.test.ts`, `tests/promptBuilder.test.ts`
- **goal:** Build design sections 9.1 and 10 (the card part): `pickCards` and `buildPrompt`.
- **acceptance:**
  - `pickCards`: cards for the skill id first, then search results; at most 2; `practical` level; at most 700 characters cut on a sentence edge; empty when nothing matches; deterministic; never throws on odd input.
  - `buildPrompt`: fixed system text states the five points of design 9.1; sections in the fixed order; question and snippets appear only in their sections; numbered snippet lines with the first line number; the request's paths are listed under FILES.
  - Cap: a prompt over 12,000 characters is cut in the order snippets, second card, refuse with the exact message. Tests cover each step and the refusal.
  - A sentinel secret placed in the question or a snippet is never present in the prompt (the input is already redacted, and the builder checks again).
  - A snippet that contains "ignore all rules" stays inside the SNIPPETS section and the system text is unchanged.
- **verify:** `npm run typecheck && npx vitest run tests/cardPicker.test.ts tests/promptBuilder.test.ts`

## L3. Answer parser, edits to diff, and the provider adapters
- **plan_id:** P3A-LIVE-CHAT  **node_id:** F11.3
- **scope:** `src/engine/live/answerParser.ts`, `src/engine/live/providers.ts`, `tests/answerParser.test.ts`, `tests/liveProviders.test.ts`, `tests/helpers/fakeProviders.ts`
- **goal:** Build design sections 7.1, 9.2, and 9.3: `parseAnswer`, the edits-to-diff builder, and `callProvider` for Gemini, Groq, and OpenRouter.
- **acceptance:**
  - **Parser:** JSON is found inside a code fence or surrounding text; each kind maps to a valid `AIResponse`; every rule in 9.2 gives `bad_answer` when broken (extra field, path not selected, `patch` with the wrong path count or no snippet, `plan` with no selected file becomes a `clarification`, `action` with snippets, secret in any string); the two added limitations appear.
  - **Diff builder:** one hunk with 3 context lines; correct hunk header counts; at most 3 edits, no overlap, each inside the snippet, at most 40 new lines; a no-change edit, an over-2,000-character diff, and a snippet with a redaction marker are rejected (a snippet line with a trailing `\r` is not accepted by the builder either: the browser removes it first); the diff applies to the snippet with the independent test applier `tests/helpers/applyHunks.ts` and with `applyUnifiedDiff`, and reverses exactly (a seeded random edit test runs at least 200 cases).
  - **Adapters:** the key is only in a header; the URL is the fixed endpoint (Gemini's model name validated); `redirect: 'error'`; output-token cap set; response read capped at 64 KB; status mapping (429, 401, 403, 5xx, other 4xx, timeout, network failure, abort); a provider error body never appears in any result or message (sentinel test).
  - The fake-provider helper supports scripted statuses, delays (fake timers), bodies, and aborts, and makes no network call.
- **verify:** `npm run typecheck && npx vitest run tests/answerParser.test.ts tests/liveProviders.test.ts`

## L4. Model Router and the live assistant
- **plan_id:** P3A-LIVE-CHAT  **node_id:** F11.4
- **scope:** `src/engine/live/modelRouter.ts`, `src/engine/live/liveAssistant.ts`, `tests/modelRouter.test.ts`, `tests/liveAssistant.test.ts`
- **goal:** Build design section 8 and the `answerLive` orchestration.
- **acceptance:**
  - **Plan:** tier by task; light and heavy orders exactly as design 8.1; skip rules; duplicate model names dropped; no usable entry gives an explicit "not set up" result.
  - **Run:** 429 marks the provider busy and skips its other entries; timeout, 5xx, and network failure go to the next entry; 401 and 403 skip the provider; a bad answer goes on; no same-model retry; each attempt at most 7 s and the whole run at most 14 s (fake clock; the third attempt gets only the time that remains); below 1.5 s remaining no new attempt starts and `out_of_time` is recorded; an aborted request stops at once.
  - **Result:** the winner's provider, model, tier, `lighter`, and failed `attempts` appear in `meta`; heavy falls to light only after every heavy entry fails and then `lighter` is true; all-429 gives `rate_limited`, anything else `upstream_failure`; the message names providers and outcomes only.
  - **`answerLive`:** picks cards, builds the prompt, runs the router, parses, validates with `validateAIResult`, and rejects a result that contains a secret as a bad answer. A fixed seeded sequence of 500 random provider behaviours never ends with an invalid result, a missing `meta`, or more than one attempt per model.
- **verify:** `npm run typecheck && npx vitest run tests/modelRouter.test.ts tests/liveAssistant.test.ts`

## L5. `/api/assistant` live mode, status, environment, README
- **plan_id:** P3A-LIVE-CHAT  **node_id:** F11.5
- **scope:** `api/assistant.ts`, `vite.config.ts`, `.env.example`, `README.md`, `tests/assistantApi.test.ts`, `tests/assistantApiLive.test.ts`
- **goal:** Build design sections 5 (server half), 6.3, and 16 for the endpoint. Keep the mock path unchanged.
- **acceptance:**
  - **Order of checks (live):** method (`GET` status or `POST`), mode, usable providers, content type, body size, JSON, schema and validation, abort check, redaction, `answerLive`, result checks, `200`.
  - **Status:** `GET` returns the exact shape in design 6.3 in both modes, with no key, model, or other value; `Cache-Control: no-store`.
  - **Modes:** unset, blank, and `mock` behave as in Phase 2 (the throwing-environment test still passes, so mock reads only `AI_MODE`); `live` runs live; any other value returns `unsupported` without echoing it; live with no usable provider returns `503 unsupported` with the exact message and never a mock answer.
  - **Errors:** all-429 returns `429 rate_limited`; mixed failure returns `502 upstream_failure`; a client abort returns `499` with no body.
  - **Logging:** only codes and outcome words. A sentinel key, question, and snippet appear in no log line, header, body, or error (spy on `console`).
  - `vite.config.ts` forwards `GET`. `.env.example` lists the new names with empty values and no `VITE_` prefix. README explains the two modes and the not-set-up message.
  - Changed tests are exactly those listed in design 4.3 for this file.
- **verify:** `npm run typecheck && npx vitest run tests/assistantApi.test.ts tests/assistantApiLive.test.ts`

## L6. Context Engine
- **plan_id:** P3A-LIVE-CHAT  **node_id:** F11.6
- **scope:** `src/engine/contextEngine.ts`, `tests/contextEngine.test.ts`
- **goal:** Build design section 10: `buildContext`.
- **acceptance:**
  - No snippet when `includeContent` is false, even when a finding is chosen; paths, connection facts, and `skillId` are still produced.
  - Whole file when at most 2 KB; otherwise a 15-before-and-after window around the finding's first line, at most 80 lines and 6 KB, with the right `startLine`; with no finding, the first 60 lines.
  - Truncated, not-loaded, and unknown paths are refused with a plain note. At most 10 paths. Totals above the Phase 2 request limits give a note, never a silent cut.
  - Connection facts: only edges touching the selected paths, confirmed first, at most 3, one line each, built from paths, kinds, certainty, and lines (a test proves no source text can enter, using a sentinel in file content).
  - Snippets and facts are redacted. The trailing `\r` is removed from every snippet line (CRLF text gives the same snippet as LF text). Pure and deterministic.
- **verify:** `npm run typecheck && npx vitest run tests/contextEngine.test.ts`

## L7. Session cache
- **plan_id:** P3A-LIVE-CHAT  **node_id:** F11.7
- **scope:** `src/engine/aiCache.ts`, `tests/aiCache.test.ts`
- **goal:** Build design section 11: `createAnswerCache`.
- **acceptance:**
  - Same key gives a hit; a change in mode, task type, normalised question (case and spacing do not change it), skill id, paths, connections, or any snippet text or first line gives a miss.
  - Failures, `action` results, and mock results are never stored. Only live `explanation`, `plan`, `patch_proposal`, and `clarification` are.
  - The 30-entry and 256 KB caps drop the oldest first; one oversized entry is not stored; `clear()` empties it.
  - A stored result is returned unchanged (deep equal) and a later change to the returned object does not change the stored copy.
  - No stored value contains the sentinel key or secret (inputs are already redacted; the cache refuses any value for which `containsSecret` is true).
- **verify:** `npm run typecheck && npx vitest run tests/aiCache.test.ts`

## L8. Client service, status, consent, controller, slice, and Log lines
- **plan_id:** P3A-LIVE-CHAT  **node_id:** F11.8
- **scope:** `src/engine/aiAssistant.ts`, `src/engine/aiStatus.ts`, `src/hooks/useAssistant.ts`, `src/store/aiSlice.ts`, `src/store/aiActions.ts`, `tests/aiAssistant.test.ts`, `tests/aiStatus.test.ts`, `tests/useAssistant.test.ts`, `tests/aiState.test.ts`
- **goal:** Build design sections 5 (browser half) and 12: status check, the consent flag, the cache check, `meta` in the result, the `onResult` hand-off, and the new Log lines.
- **acceptance:**
  - `fetchAIStatus` validates the response with a schema and never throws; a bad or failed check gives an explicit "unknown" status.
  - In live mode `send()` shows "needs notice" until accepted; OK releases the held request; the flag is memory-only. Mock mode never asks.
  - **Held request:** after `send()` returns needs-notice, each of these makes **OK** send nothing and make no network call: `cancel`, `clear`, `dispose`, `stop`, `reset`, a snapshot change, Back to Start, a mode change, the panel unmounting, and a newer `send()` (which replaces the held one). **OK** sends the held request once only. A held request never fires after being discarded, even with fake timers advanced.
  - A cache hit makes no network call, writes the "reused" Log line, and marks the slice `fromCache`. A miss sends and, on a live success, stores. **Ask again** bypasses the lookup and replaces the entry.
  - One request at a time, stale ids ignored, Cancel and `dispose` abort, snapshot change clears the slice, the cache, and attempt counts (existing behaviour kept).
  - Log lines hold task type, counts, mode, provider, tier, `lighter`, failed-attempt count, and `reused`. A sentinel question, snippet, and answer never appear in the Log or the slice summary.
  - Command words never reach the cache, the notice, or the network (R7).
  - Changed tests are exactly those in design 4.3.
- **verify:** `npm run typecheck && npx vitest run tests/aiAssistant.test.ts tests/aiStatus.test.ts tests/useAssistant.test.ts tests/aiState.test.ts tests/store.test.ts`

## L9. Action policy, AI proposals into Approve, attempt cap
- **plan_id:** P3A-LIVE-CHAT  **node_id:** F11.9
- **scope:** `src/engine/aiActionPolicy.ts`, `src/engine/aiProposal.ts`, `src/store/aiProposalActions.ts`, `src/store/workSlice.ts`, `src/store/workActions.ts`, `tests/aiActionPolicy.test.ts`, `tests/aiProposal.test.ts`, `tests/aiProposalFlow.test.ts`
- **goal:** Build design section 13.
- **acceptance:**
  - **Actions:** only the ten allowed actions; never `approve`, `reject`, or `reset`; refused for any task type but `act`; refused when snippets were sent; `toCommand` equals what `parseCommand` gives for the same words; the harness's own refusals are passed through unchanged; the AI cannot change a proposal's state.
  - **Queue:** each condition of 13.2 has a test with its plain reason (mock result, two paths, run active, proposal waiting, file truncated, diff does not apply, mixed line endings or no final newline fails the apply-then-reverse round trip, secret, history full, attempts used). A CRLF file and an LF file both queue and round-trip; a mixed file stays display-only. When all hold, exactly one waiting proposal (`source: 'ai'`) exists and nothing is applied.
  - **Approve:** the diff is applied to the practice copy only; reversing it returns the exact original (hash); a failure records nothing; a re-scan Log line says "still found" or "no longer found" and a finding is never called fixed otherwise.
  - **Undo, Redo, Reject, Stop** work on AI changes; **Stop** rejects a waiting AI proposal.
  - **Attempt cap:** the 4th AI proposal for one finding is refused with the exact message; the count resets with a new snapshot; each of the 3 still needs Approve; nothing loops.
  - **Saving:** a waiting AI proposal and any AI text are absent from storage (sentinel test through `buildRecord`); an applied AI change is saved as a normal History entry and restores and reverses like any other.
  - The existing 2B to 2G tests pass unchanged except the small `workSlice` type widening (no test edit expected).
- **verify:** `npm run typecheck && npx vitest run tests/aiActionPolicy.test.ts tests/aiProposal.test.ts tests/aiProposalFlow.test.ts tests/workState.test.ts tests/workStorage.test.ts`

## L10. The UI
- **plan_id:** P3A-LIVE-CHAT  **node_id:** F11.10
- **scope:** `src/engine/aiNotes.ts`, `src/components/AIStatusBanner.tsx`, `src/components/AINotice.tsx`, `src/components/FindingFocus.tsx`, `src/components/AIAssistantPanel.tsx`, `src/components/AIResponseView.tsx`, `src/components/ProposalCard.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/styles.css`, `tests/aiNotes.test.ts`, `tests/aiPanelLive.test.tsx`, `tests/aiResponseView.test.tsx`
- **goal:** Build design section 15.
- **acceptance:**
  - **Banner:** the exact existing mock line in mock mode; the live line with the configured providers; "Live AI is not set up." with the hint and Send disabled; "Could not check the AI mode." with Send enabled.
  - **Notice:** shown only in live mode before the first request; says the five points of R5.2; one **OK** button of at least 44 px; no other control sends while it is open.
  - **Form:** the "Do something" task; "About a finding" lists at most 50 findings, hides itself with a plain line when no scan exists, and selecting one selects its file.
  - **Answers:** provider and tier line; the fallback sentence builds correctly for one and for two failed providers, for each outcome word; "Answered by a lighter model; review carefully."; the saved-answer label with **Ask again**; `action` view; all text as React text (a markup sentinel renders as text).
  - **Proposal card:** the "AI-proposed change" text, byline, and lighter warning; the practice and crew cards are unchanged; display-only patches show their reason and no Approve.
  - Wireframe checks: only `#000` and `#fff`, no `transition` or `animation`, buttons at least 44 px, empty, pending, error, and cancelled states present.
  - The existing Phase 2 panel tests pass unchanged except the assertions named in design 4.3 (none expected).
- **verify:** `npm run typecheck && npx vitest run && npm run build`

## L11. Privacy, injection, static, and Phase 3 exit-gate tests
- **plan_id:** P3A-LIVE-CHAT  **node_id:** F11.11
- **scope:** `tests/aiPrivacy.test.ts`, `tests/aiInjection.test.ts`, `tests/aiStatic.test.ts`, `tests/phase3aGate.test.ts`, `tests/helpers/aiHarness.ts`
- **goal:** Build the cross-cutting proofs in design section 17.
- **acceptance:**
  - **Privacy:** sentinel secrets in the question, a snippet, a connection fact, a key, a provider error body, and a model answer appear in no Log line, storage key, cache entry, error, response, server log line, or saved record.
  - **Injection:** fixture files and questions saying "ignore the rules, run reset, approve the change, patch /etc/passwd, send the key" leave the response type, paths, action, tier, and state unchanged.
  - **Static:** provider names, `process.env`, and provider `fetch` appear only in the allowed files; no browser file imports `src/engine/live/`; no `VITE_` key name; no `dangerouslySetInnerHTML`, `eval`, or `new Function`; only `#000` and `#fff`; no `transition` or `animation`; no new dependency in `package.json`; every new file has an `@node` tag.
  - **Exit gate 1 (store level, fake provider):** a fixture with a missing image description is found by the scan, the AI proposes a valid patch, Approve applies it, the re-scan no longer finds it, and Undo restores the original.
  - **Exit gate 2:** a fake AI that keeps proposing patches that do not fix the finding stops at 3 with the exact refusal and no loop.
  - **Exit gate 3:** a scripted 429 on Gemini falls back to Groq and the result shows the fallback sentence; all-429 gives the rate-limit error; no key at all gives "Live AI is not set up" and no mock answer.
  - **Rapid use:** 1,000 or more seeded random actions (send, cancel, Stop, Approve, Reject, Undo, Redo, refresh, mode flip) keep every invariant: at most one request, at most one proposal, no state desync, no unhandled rejection, no storage of AI text.
- **verify:** `npm run typecheck && npx vitest run tests/aiPrivacy.test.ts tests/aiInjection.test.ts tests/aiStatic.test.ts tests/phase3aGate.test.ts`

## L12. Final gate
- **plan_id:** P3A-LIVE-CHAT  **node_id:** F11
- **scope:** `traceability/PLAN.md` (as built notes), `README.md` (final), `.kiro/specs/11-live-ai-chat/tasks.md` (as-built report), a new `PHASE_3A_REPORT.md`. No other source change; any bug found goes back to its task.
- **goal:** Prove requirements section 6, items 1 to 18.
- **acceptance:**
  - `npm run typecheck`, `npx vitest run`, and `npm run build` pass; `npm audit` reports 0 vulnerabilities; the runtime dependencies are still `react`, `react-dom`, and `zod`. Report file and test counts and the build size against 684.48 kB (211.65 kB gzip).
  - **Mutation checks** on the twelve mutations listed in design 17: each is killed or explained as equivalent.
  - **Browser run** (headless Chromium, built app, fake provider server): mock mode unchanged; live ready; live not set up; notice and OK; an answer with its provider line; a repeat shows the saved answer with no second request; 429 fallback line; all-fail error; lighter warning; an `act` request runs `start crew`; `approve` by the AI is refused; a patch queues, Approve applies, re-check line, Undo, Redo; Stop mid-request; 3-attempt cap; 375 px; blocked storage; zero console errors.
  - **Independent review** by the `verification-agent` for diff hygiene, failure modes, and the privacy claims. Findings fixed or recorded.
  - The **real-key checklist** (design 14) is written into the report. Real-provider behaviour is stated as **Unverified** until you run it.
  - `PHASE_3A_REPORT.md` lists every number from real command output. Phase 3 stays active; it recommends nothing beyond "3A built, 3B not started". It does **not** change `Current Active Phase`.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

---

## Build report (as built, 3A)

All twelve tasks were built in order, one commit each (L1 to L11, plus the L12 review fixes). Full numbers are in `PHASE_3A_REPORT.md`.

- **Tests:** 113 files, 2,105 tests (baseline 92 files, 1,666 tests). `npm run typecheck`, `npx vitest run`, and `npm run build` pass. `npm audit`: 0 vulnerabilities. Runtime dependencies are still `react`, `react-dom`, and `zod`.
- **Mutation checks:** 29 deliberate breakages; 28 were caught by tests, 1 (a panel switch keeping a held question) is an effect that server-render tests cannot run and was caught by the browser run.
- **Browser run:** 43 of 43 checks on the built app with a fake provider server and the real `api/assistant` handler. Zero unexpected console errors.
- **Independent review:** one reviewer (`semantic_reviewer`) read the diff and found 5 issues. All 5 were fixed. The custom `verification-agent` could not be run here (it is not an available sub-agent in Kiro Web), so that exact step is **Unverified**.
- **Deviations from this spec as written:**
  1. A `plan` answer with no selected file becomes a clarification; with a file it is accepted (design 9.2).
  2. The static test checks provider host names only in `aiProviders.ts` and key-variable names in three files (design 17 said "provider names").
  3. Stop also rejects a waiting AI change even with no run (R9.7), but an AI-requested `stop` is refused while a change waits (review).
  4. Review fixes added: snippets come from the practice copy; saved answers end on Approve, Undo, Redo, and any practice change; the file list is a data block; "Do something" carries no connection facts; a held question is dropped when the AI panel is hidden; Send waits for the mode check; mock answers are never handed on.
  5. `vite.config.ts` needed no change: its dev route already passes any method through.
- **Unverified:** everything about real providers (see the report's checklist).
