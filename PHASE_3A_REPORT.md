# Phase 3A report: live AI in AI Chat

**Status:** all twelve tasks (L1 to L12) of spec 11 are built, tested, reviewed, and pushed on branch `feat/live-ai-chat`. No pull request is open yet.

`Current Active Phase` is still **Phase 3 (Sub-phase 3A)**. I did not change it. **3B (Journal and Skeleton Crew) is not started.** Moving on is your decision.

All numbers are real command output from this workspace. **Unverified** means it was not run here, with the reason.

## 1. In simple words

- AI Chat can now use a real, free AI when the server is set to `AI_MODE=live`. In `mock` mode (the default) nothing changed.
- The **Context Engine** picks the smallest useful piece to send: your question, file names, up to three one-line connection facts, and (only if you tick the box) a few redacted lines. It also remembers answers for the session, so asking the same thing again costs nothing.
- The **Model Router** picks the model. Explanations and "Do something" use the fast models. Code changes try the stronger models first. If a provider is busy, the next one answers (Gemini, then Groq, then OpenRouter). The screen says who answered.
- The AI can propose a code change. It becomes an "AI-proposed change" card. Nothing changes until you press **Approve**, and only PatchBay's practice copy changes, never your repository.
- The first live question of a session waits for a short notice and your **OK**.

## 2. Evidence

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npx vitest run` | **113 files, 2,105 tests, all passed** (baseline: 92 files, 1,666 tests; +21 files, +439 tests) |
| `npm run build` | `dist/assets/index-CyYt-s28.js` **708.33 kB, 219.59 kB gzip** (baseline 684.48 / 211.65, so +23.85 kB, +7.94 kB gzip). The live engine (router, adapters, prompts) is not in the browser bundle; a test and a search of the built file both confirm it. |
| `npm audit` | 0 vulnerabilities |
| Runtime dependencies | `react`, `react-dom`, `zod` (unchanged) |
| Code changed | 41 non-test files (+2,306, -95 lines) and 32 test files (+4,193, -9) |
| Commits | 12 (one per task, plus the review fixes) |

### Phase 3 exit gate (with fake providers, no network, no real key)

| Gate item | How it was shown | Result |
|---|---|---|
| A deliberate bug is found, a valid patch is proposed, and the fix is checked | `tests/phase3aGate.test.ts` and browser G1 to G8: the scan finds an image with no description; the AI proposes an edit; PatchBay builds the diff from the real lines; Approve applies it to the practice copy; the re-scan says "no longer found"; Undo restores the exact original | passed |
| The attempts halt at 3 and nothing loops | A fake AI whose patches never fix the finding: attempts 1 to 3 are queued (each needs your decision); the 4th is refused with "This finding has had 3 AI fix attempts. Fix it by hand, or ask about a different one."; no extra call is made by itself | passed |
| A 429 on the primary falls back to the backup | Gemini 429 gives Groq's answer with "Gemini was busy, so Groq answered."; all 429 gives the plain rate-limit message; no key gives "Live AI is not set up" and never a mock answer | passed |

### Browser run (headless Chromium, the built app, a small server that runs the real `api/assistant` handler with fake providers)

**43 of 43 checks passed, zero unexpected console errors.** The browser itself logs 3 lines for answers my fake server deliberately sent as 429, 503, or a forced 500 on the status check. Those are expected and are counted separately.

It covered: mock mode unchanged (exact banner, canned answer, a mock patch stays display-only, no provider call); not set up; could-not-check; live ready with the provider order; the notice and OK; the provider line; a repeat shows "Saved answer" with no second request; Ask again; 429 fallback; all providers busy; a lighter model answering a code-change request; "Do something" starting the practice run; an AI "approve" refused; typed `stop` never reaching the AI; the finding list; a patch queued, Approve, the Log re-check line, `undo`; the 3-attempt refusal; Stop in the middle of a request; no sideways scrolling at 375 px; buttons at least 44 px; a refresh forgetting the notice and saved answers; nothing saved in browser storage; blocked storage; switching panels dropping a waiting question.

The script and server are in `/projects/sandbox/p3a-run/` (outside the repository, as in Phase 2). They are throw-away test tools.

### Mutation checks (deliberate breakages, each must make a test fail)

29 breakages were tried. **28 were caught by the test suite.** One (switching panels keeps a waiting question) is a React effect that server-render tests cannot run; it was caught by the browser check P1 (the build with the break failed 42 of 43, the restored build passed 43 of 43).

Caught: removing the 429 skip; allowing `approve`, `reset`, or an action with file text or connection facts as AI actions; dropping the secret check on model output; dropping the undo round trip (at queue time and at Approve); a cache that ignores the snippet text; caching an action or a mock answer; a cap of 4 attempts; sending snippets with the box off; the heavy tier for an explanation; accepting a path you did not select; a held question surviving Cancel; skipping the notice; putting the key in the URL; Stop not rejecting a waiting AI change; the re-check always saying "gone"; skipping redaction of the question; ignoring the output cap; an AI stop rejecting your waiting change; snippets from the original file; an approved change not ending saved answers; mock answers handed on; Send while the mode is being checked; file names outside a data block.

### Independent review

One reviewer read the whole diff and found 5 issues (none was a secret leak). **All 5 are fixed**, each with tests:

1. An AI-requested `stop` would have rejected your waiting change. Now refused.
2. Snippets and saved answers used the original file, not the practice copy after an approved change. Now they follow the practice copy, and Approve, Undo, Redo, and any practice change end the saved answers.
3. File names and connection facts (text that comes from the repository) could act like instructions. File names now sit in a data block; "Do something" carries no connection facts and refuses an action if they were sent.
4. A waiting question survived switching to another panel. Now dropped.
5. Mock mode behaved differently before the mode check finished. Send now waits for the check, and mock answers are never handed on.

The custom `verification-agent` could not be run here, so that exact step is **Unverified**.

## 3. What changed (files)

New: `src/config/{aiLive,aiProviders}.ts`; `src/engine/live/{cardPicker,promptBuilder,answerParser,providers,modelRouter,liveAssistant}.ts` (server only); `src/engine/{contextEngine,aiCache,aiStatus,aiActionPolicy,aiProposal,aiNotes}.ts`; `src/store/aiProposalActions.ts`; `src/hooks/useAIHandoff.ts`; `src/components/{AIStatusBanner,AINotice,FindingFocus}.tsx`.

Changed (small, as listed in design 4.2): `api/assistant.ts`, `contracts.ts`, `aiValidate.ts`, `mockAssistant.ts`, `aiAssistant.ts`, `useAssistant.ts`, `aiSlice.ts`, `aiActions.ts`, `workSlice.ts`, `workActions.ts`, `useHarness.ts`, `AIAssistantPanel`, `AIResponseView`, `ProposalCard`, `StudioLayout`, `App`, `styles.css`, `.env.example`, `README.md`, `traceability/PLAN.md`, `.kiro/steering/build-phases.md` (the Phase 3 sub-phase block).

Existing tests changed on purpose (design 4.3): `assistantApi` (GET now returns the status, live is built, the unknown-mode message), and appended blocks in `aiContracts`, `aiValidate`, `mockAssistant`, `aiAssistant`, `aiState`, `useAssistant`, `aiResponseView`, `harnessUi`. All other Phase 2 tests pass unchanged.

## 4. Deviations from the spec as written

1. A "plan" answer with no selected file becomes a question; with a file it is accepted.
2. The static test checks provider **host names** only in `aiProviders.ts`, and key variable names in three files (the table, the "not set up" message, and the setup hint text).
3. Stop rejects a waiting AI change even with no run (as the spec says), but an AI-requested stop is refused while a change waits (review fix).
4. The review fixes in section 2 go beyond the spec text.
5. No change was needed in `vite.config.ts` (its dev route already passes any method through).
6. Timeouts: 15 s per attempt, 25 s total, and a 28 s browser limit (first 7 s / 14 s / 15 s, raised after your real Gemini run timed out; see the follow-up notes).

## 5. Known limits

- Free quotas are small and change. Search results say Gemini's free Flash models allow only about 20 requests a day, and Groq's free gpt-oss models allow 8,000 tokens a minute (a large request uses about 3,000 to 4,000). The cache and the small prompts help, but you can still hit a limit.
- `openrouter/free` picks a random free model each time, so answer quality varies, and its "heavy" request is not stronger than its "light" one unless you set `OPENROUTER_MODEL_*`.
- A busy provider is retried on the next request, because the server remembers nothing (no shared cool-down).
- AI patches are limited to one file, one block of lines, at most 2,000 characters, and files whose line endings can be undone exactly. Bigger changes become a plan.
- The model's JSON answer is checked strictly for the kind, the required fields, the files, and the edit lines. After the first real-key run (a Gemini answer was refused), unknown extra fields are now ignored and the output caps were raised (see the follow-up note below).
- `undo` and `redo` were removed from the AI's action list after review (your decision): only you can change History.
- `GET /api/assistant` tells anyone who can reach it whether each provider has a key (never the key or the model). Fine for a personal deployment; revisit before a public one.
- The Edit pad's changes also end the saved answers (they change the practice copy).

## 6. Unverified (not run here)

- **Everything about real providers:** whether your keys work, whether the default free models are on your free plan (Gemini's official page lists the model ids but not which are free), real answer quality, real speed against the 15 s and 25 s limits, real 429 shapes, and whether the output caps (700 and 1,200 tokens) are enough for the reasoning models (they count thinking tokens too).
- The custom `verification-agent` step (the independent review was done by a different reviewer).
- Touch use on a real phone.

### Your real-key check (about 10 minutes)

1. Copy `.env.example` to `.env`. Fill in at least `GEMINI_API_KEY`. Add `GROQ_API_KEY` and `OPENROUTER_API_KEY` to test the fallback. Set `AI_MODE=live`.
2. Start the app and load a sample. The banner should say "Live AI" and list your providers. Open AI Chat, ask a question, and press **OK** on the notice.
3. Check the line "Answered by ... (light)". Ask the same thing again: you should see "Saved answer" and no new request.
4. Remove `GEMINI_API_KEY`, restart: the next answer should come from Groq with no error.
5. Remove all keys: you should see "Live AI is not set up", and no mock answer.
6. Open Skeleton Crew, come back, pick "About a finding", tick the contents box, choose "Suggest a change". A card should appear. Reject once, ask again, Approve once, then type `undo`.
7. Tell me what happened, including any model name that was rejected (set it with the `*_MODEL_*` variables).

## 7. For your review and decisions

1. Done: `undo` and `redo` removed from the AI's action list.
2. Loosen the strict answer check if free models produce too many fallbacks?
3. Open a pull request for `feat/live-ai-chat` into `main`? (The spec said to open one after L12. I have not, because you did not ask for it yet.)
4. After your real-key check, decide whether 3A is accepted and whether to start 3B. I recommend nothing beyond: **3A built, 3B not started.**

## 8. Follow-up after your first real-key run

Step 10 gave "Gemini gave an answer PatchBay could not use." That means Gemini answered, but PatchBay could not read the answer. I could not see why (by design the server never logs answer text), so I made the reason visible and fixed the likely causes:

- The error now says why in plain words, for example "(the answer was cut off)", "(it had the wrong fields)", or "(its edit did not fit the lines it was shown)". The terminal running `npm run dev` also prints `trace=gemini:bad_answer(<code word>)`. These are fixed words only, never text from the answer.
- Most likely cause: the Gemini 3 models "think" before they answer and the thinking counts against the output cap, so the JSON was cut off. Caps raised from 700 / 1,200 to 1,500 / 3,000 tokens, and a cut-off answer is now reported as cut off.
- Models often add extra fields or write the file as `./index.html`. Extra fields are now ignored (never copied) and `./x`, `/x`, `a/x` are accepted for the one selected file. A missing or null `new_text` deletes the lines.
- Still refused: a wrong kind of answer, a file you did not select, edits outside the lines shown, anything that looks like a secret, and any action not on the list.

## 9. Follow-up: timeouts raised after a real Gemini run

Your real heavy Gemini request ("Suggest a change") failed with "Gemini took too long." The 7 s per-attempt limit was too short for a reasoning model on the free tier. New limits: **15 s per attempt, 25 s for the whole request, 28 s browser wait** (about 3 s to spare). `vercel.json` also sets `maxDuration: 30` for the functions so a deployed copy is not cut off first. A 14 s answer, which failed before, now succeeds in the fake-provider tests. **Unverified:** how long your real Gemini answers actually take, and whether your Vercel plan allows a 30 s function (some plans cap lower).
