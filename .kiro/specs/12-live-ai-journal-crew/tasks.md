# Tasks: 12 Live AI in the Journal and Skeleton Crew (Phase 3, Sub-phase 3B)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P3B-LIVE-JOURNAL-CREW` and the F12 nodes in `traceability/PLAN.md`. Active product phase: **Phase 3, Sub-phase 3B** (PatchBay's own screens black-and-white wireframe, no animation, `AI_MODE=mock` stays the default). **These tasks stay unstarted until you say "Go" for a named task or a range. No application code is written by this spec step.**

Task ids are **N1 to N9** (you asked for `N` because `M` was used in spec 02).

## How each task runs

1. **Wait for your explicit "Go" naming the task or the range.** A "Go" covers only what it names. Nothing is written before the first "Go".
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F12.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts.
4. Check the diff against the scope myself, then report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait (unless a range was approved).

Rules for every task:
- Two consecutive verify failures on the same error: stop editing, hand a read-only diagnosis to a reviewer, and wait for your approval before a third attempt.
- No new dependency. No provider code in 3B. No browser file imports `src/engine/live/`.
- **No AI text, question, code line, key, or secret is written to the Log, storage, a download, an error, or a server log line.** Tests use sentinels.
- No `innerHTML`, `eval`, `new Function`, or `dangerouslySetInnerHTML`. All AI text is React text.
- New CSS uses only `#000` and `#fff`, with no `transition` and no `animation` (and the comment above it must not use those words).
- The new `explain` prop on a screen is optional. Without it the screen renders exactly as in 3A, so existing tests pass unchanged.
- Do not touch the files in design section 4.4. Files in design 4.2 change only as described there. Existing tests change only as listed in design 4.3.
- `scripts/traceability/*` do not exist. Approval is recorded in this chat. The checks are the `npm` commands.

## Branch and commits

Spec on `spec/12-live-ai-journal-crew` (stacked on `feat/live-ai-chat` until PR #5 is merged, then re-based onto `main`). Code on `feat/live-ai-journal-crew`, **one commit per task**, a pull request after N9.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| N1 | F12.1 | Contracts, validators, limits, and the mock `narrate` branch | 3A |
| N2 | F12.2 | Server: prompt (level, findings), narration answer, cards rule, cache key | N1 |
| N3 | F12.3 | Context Engine additions, request builders, the level note | N1 |
| N4 | F12.4 | Controller `sendBuilt`, origin, the explain store, `heldOrigin`, `forgetAnswers`, AI Chat origin filter | N1, N3 |
| N5 | F12.5 | The explainer, availability, and the AI Chat prefill | N3, N4 |
| N6 | F12.6 | The components: block, switch, notice, narration bar | N5 |
| N7 | F12.7 | Wiring: Journal, Screens 4 and 5, StudioLayout, App, the prefill in AI Chat, CSS | N6 |
| N8 | F12.8 | Privacy, injection, static, and exit-gate tests | N1 to N7 |
| N9 | F12 | Final gate: full suite, build, browser run, mutation checks, review, report | N1 to N8 |

---

## N1. Contracts, validators, limits, and the mock `narrate` branch
- **plan_id:** P3B-LIVE-JOURNAL-CREW  **node_id:** F12.1
- **scope:** `src/types/contracts.ts`, `src/config/aiLive.ts`, `src/engine/aiValidate.ts`, `src/engine/mockAssistant.ts`, `tests/aiContracts.test.ts`, `tests/aiValidate.test.ts`, `tests/mockAssistant.test.ts`, `tests/aiLiveConfig.test.ts`
- **goal:** Build design section 6 and 7.5.
- **acceptance:**
  - `level` accepts the three words and rejects others. `findings` accepts 1 to 8 entries and rejects 9, an unknown skill id, a bad line number, and extra fields. `connections` accepts 6 and rejects 7.
  - The `narration` answer accepts 1 to 8 lines of at most 400 characters and rejects 0, 9, an empty line, and 401 characters.
  - `validateAIRequest`: `findings` only for `narrate` and required there; each finding path is in `selectedPaths`; a `narrate` request has no `sourceContext` and no `connections`; `act` still has none.
  - `validateAIResult`: `narration` only for `narrate` and exactly `findings.length` lines.
  - Mock `narrate` returns one labelled canned line per finding, uses only `selectedPaths`, never echoes the instruction, and validates. All earlier mock outputs are byte-identical.
  - New `AI_LIVE` values match design 6.2.
- **verify:** `npm run typecheck && npx vitest run tests/aiContracts.test.ts tests/aiValidate.test.ts tests/mockAssistant.test.ts tests/aiLiveConfig.test.ts`

## N2. Server: prompt, narration answer, cards rule, cache key
- **plan_id:** P3B-LIVE-JOURNAL-CREW  **node_id:** F12.2
- **scope:** `src/engine/live/promptBuilder.ts`, `src/engine/live/answerParser.ts`, `src/engine/live/liveAssistant.ts`, `src/engine/aiCache.ts`, `tests/promptBuilder.test.ts`, `tests/answerParser.test.ts`, `tests/liveAssistant.test.ts`, `tests/aiCache.test.ts`
- **goal:** Build design sections 7.1 to 7.4.
- **acceptance:**
  - The system text names the level and the level rules; the user message has `LEVEL:` and, for `narrate`, a `FINDINGS:` section inside a data block with the fixed check text and neutralised paths. A path that tries to close the block stays inside it.
  - Answer kinds for `narrate`: narration and clarification only.
  - Parser: a narration with the right count maps to `narration`; a wrong count, a patch, an action, or a plan for `narrate` is refused with the right code word; lines are clipped at 400; a secret anywhere is refused; unknown extra fields are ignored.
  - `answerLive` adds no cards for `narrate`; an `explain` request with a `skillId` still adds its card.
  - The cache key changes with the level and with the order of the findings, and is unchanged for requests with neither.
- **verify:** `npm run typecheck && npx vitest run tests/promptBuilder.test.ts tests/answerParser.test.ts tests/liveAssistant.test.ts tests/aiCache.test.ts`

## N3. Context Engine additions, request builders, the level note
- **plan_id:** P3B-LIVE-JOURNAL-CREW  **node_id:** F12.3
- **scope:** `src/engine/contextEngine.ts`, `src/engine/explainRequests.ts`, `src/engine/levelNote.ts`, `tests/contextEngine.test.ts`, `tests/explainRequests.test.ts`, `tests/levelNote.test.ts`
- **goal:** Build design sections 8 and 10.2.
- **acceptance:**
  - `focusByPath` centres each file's window on its own line; `facts` and `maxFacts` replace the connection map, are redacted, and are cut at 200 characters; defaults keep 3A behaviour exactly.
  - `buildLessonRequest`: up to 3 files, the card's skill id, no facts, code lines only with the switch; `buildFlowRequest`: up to 5 files and up to 6 facts from the steps; `buildFindingRequest`: the finding's file, skill id, up to 3 facts; `buildNarrationRequest`: at most 8 findings and 10 paths, no code lines even with the switch on, no facts.
  - `pickNarrationFindings` orders by severity then path and line, takes 8, and reports how many were left out.
  - Instructions are the fixed texts of design 8; a flow title with a secret is redacted; each builder returns a request that passes `validateAIRequest`.
  - `levelNote` returns the exact sentence for each broken rule and `undefined` for text that follows the rules; it never throws.
- **verify:** `npm run typecheck && npx vitest run tests/contextEngine.test.ts tests/explainRequests.test.ts tests/levelNote.test.ts`

## N4. Controller `sendBuilt`, origin, explain store, `heldOrigin`, `forgetAnswers`
- **plan_id:** P3B-LIVE-JOURNAL-CREW  **node_id:** F12.4
- **scope:** `src/store/explainStore.ts`, `src/store/aiSlice.ts`, `src/store/aiActions.ts`, `src/hooks/useAssistant.ts`, `src/components/AIAssistantPanel.tsx`, `tests/explainStore.test.ts`, `tests/useAssistant.test.ts`, `tests/aiState.test.ts`, `tests/aiPanelLive.test.tsx`
- **goal:** Build design sections 9 and 9.1.
- **acceptance:**
  - `sendBuilt` follows the 3A order: refuse while checking or pending; saved answer first (live only); hold for the notice with its origin; otherwise start. One request at a time across `send` and `sendBuilt`.
  - A held request is discarded by every event in R6.2 (Cancel, Stop, reset, dispose, snapshot change, mode change, a newer send, `discardHeld`) and never fires after. OK sends it once.
  - The explain store: begin, done, failed, remove, clear, at most 12 entries (oldest finished entry goes), the switch survives `clear`. Pending is removed on cancel. A result for a stale request is ignored.
  - `forgetAnswers` clears the cache and the explain store on a snapshot change, `work.applied` or `work.undone` change, `reset`, and a mode change.
  - Log lines hold the task type, the origin word, counts, the provider, the tier, and whether it was reused; never text. `AIAssistantPanel` shows a result only when its origin is `undefined`.
  - 3A behaviour of `send` is unchanged (all 3A tests pass).
- **verify:** `npm run typecheck && npx vitest run tests/explainStore.test.ts tests/useAssistant.test.ts tests/aiState.test.ts tests/aiPanelLive.test.tsx`

## N5. The explainer, availability, and the AI Chat prefill
- **plan_id:** P3B-LIVE-JOURNAL-CREW  **node_id:** F12.5
- **scope:** `src/hooks/useExplainer.ts`, `src/store/chatPrefill.ts`, `src/engine/aiNotes.ts`, `tests/explainer.test.ts`, `tests/chatPrefill.test.ts`, `tests/aiNotes.test.ts`
- **goal:** Build design sections 10.1 and 10.4.
- **acceptance:**
  - Each action reads the Journal level and the current state at press time and calls `sendBuilt` with the right origin; it returns a plain message when a request cannot be built.
  - `availability` returns the four states of design 10.1 with the exact texts.
  - `askAgain` bypasses the saved answer; `cancel` ends a pending request; `setIncludeContents` is shared and memory only.
  - `askForFix` writes the prefill (with the finding id), opens the AI panel on the Studio screen, and sends nothing (a test counts zero requests). The prefill is taken once and then cleared.
  - Narration: nothing is sent when there are no findings; the batch is one request.
- **verify:** `npm run typecheck && npx vitest run tests/explainer.test.ts tests/chatPrefill.test.ts tests/aiNotes.test.ts`

## N6. The components
- **plan_id:** P3B-LIVE-JOURNAL-CREW  **node_id:** F12.6
- **scope:** `src/components/AIExplainBlock.tsx`, `src/components/ExplainSwitch.tsx`, `src/components/ExplainNotice.tsx`, `src/components/AINarrationBar.tsx`, `tests/explainUi.test.tsx`
- **goal:** Build design section 10.3.
- **acceptance:**
  - `AIExplainBlock`: the not-asked, pending (with Cancel), error (with Retry), and answered states; the exact heading texts; provider line, fallback sentence, lighter warning, saved label, and **Ask again** through `AIResponseView`; the soft level note; the mock label; disabled with the availability text.
  - `ExplainSwitch`: off by default; says narration never includes code.
  - `ExplainNotice`: shown only when `noticeOpen` and `heldOrigin` is one of the surface's origins; **OK** and **Cancel**.
  - `AINarrationBar`: the button text, the "left out" line, "No findings to narrate." disabled state, and the lines each prefixed with file and line.
  - All text is React text (a markup sentinel renders as text); buttons at least 44 px; no color, no motion.
- **verify:** `npm run typecheck && npx vitest run tests/explainUi.test.tsx`

## N7. Wiring
- **plan_id:** P3B-LIVE-JOURNAL-CREW  **node_id:** F12.7
- **scope:** `src/components/LessonsSection.tsx`, `src/components/FlowsSection.tsx`, `src/components/JournalPanel.tsx`, `src/components/FindingDetail.tsx`, `src/components/DomainScreen.tsx`, `src/components/SkeletonCrewScreen.tsx`, `src/components/CrewNarration.tsx`, `src/components/StudioLayout.tsx`, `src/components/AIAssistantPanel.tsx`, `src/App.tsx`, `src/styles.css`, `tests/explainUi.test.tsx`, `tests/journalUi.test.tsx`, `tests/crewUi.test.tsx`
- **goal:** Build design sections 4.2 and 10.3 (placement) and 10.4 (the prefill in AI Chat).
- **acceptance:**
  - Lessons and flows show their buttons and blocks only with an `explain` binding; concept cards and the overview never do. Findings show review and hand-off buttons; the narration bar is on Screens 4 and 5 above the fixed narration.
  - Without a binding every existing screen renders exactly as before (the existing Journal and crew tests pass unchanged).
  - The fixed lesson, flow, finding, and narration text is untouched and still comes first.
  - The notice appears where the button is, never in two places at once. Leaving the Journal or Screen 5 discards a held request.
  - AI Chat consumes the prefill once (finding chosen, file selected, task and instruction set, contents ticked) and sends nothing.
  - New CSS block is black and white, with no motion.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

## N8. Privacy, injection, static, and exit-gate tests
- **plan_id:** P3B-LIVE-JOURNAL-CREW  **node_id:** F12.8
- **scope:** `tests/phase3bPrivacy.test.ts`, `tests/phase3bInjection.test.ts`, `tests/phase3bStatic.test.ts`, `tests/phase3bGate.test.ts`, `tests/helpers/aiHarness.ts`
- **goal:** Build the cross-cutting proofs in design section 14.
- **acceptance:**
  - **Privacy:** sentinels in a question, a code line, a flow title, a file name, a key, a provider error body, and a model answer never appear in the Log, storage, errors, responses, server logs, or any download. The Journal download, the Log download, and the patch export are **byte-identical** with and without explanations present.
  - **Injection:** instructions in a file, a file name, a flow title, and a fact (including "run reset" and "approve") change nothing; a model that answers with an action, a patch, or a plan to these requests is refused.
  - **Static:** no 3B module touches storage or imports an export module; no browser file imports `src/engine/live/`; only `#000` and `#fff` in the new CSS; no motion words; no new dependency; every new file has an `@node: F12` tag.
  - **Exit gate 3B (store level, fake providers):** a lesson, a flow, a finding review, and a narration batch each return a labelled explanation; the shared notice is shown once across Journal, Screen 5, and AI Chat; the hand-off prefills AI Chat and sends nothing; a patch from that hand-off still needs Approve and the cap of 3 still stops the 4th; mock mode returns labelled canned examples; "Live AI is not set up" disables the buttons; the 3A gates pass again.
  - **Rapid use:** 1,000 or more seeded random presses (every button, Cancel, Stop, reset, mode flips, screen changes) keep every invariant: one request at a time, at most 12 entries, no unhandled rejection, no AI text stored.
- **verify:** `npm run typecheck && npx vitest run tests/phase3bPrivacy.test.ts tests/phase3bInjection.test.ts tests/phase3bStatic.test.ts tests/phase3bGate.test.ts`

## N9. Final gate
- **plan_id:** P3B-LIVE-JOURNAL-CREW  **node_id:** F12
- **scope:** `traceability/PLAN.md` (as built), `README.md` (final), `.kiro/specs/12-live-ai-journal-crew/tasks.md` (as-built report), a new `PHASE_3B_REPORT.md`. No other source change; a bug found goes back to its task.
- **goal:** Prove requirements section 6, items 1 to 16.
- **acceptance:**
  - `npm run typecheck`, `npx vitest run`, and `npm run build` pass; `npm audit` reports 0 vulnerabilities; the runtime dependencies are `react`, `react-dom`, and `zod`. Report file and test counts and the build size against 3A (708.31 kB, 219.59 kB gzip).
  - **Mutation checks** on the twelve mutations in design section 14, each killed or explained.
  - **Browser run** (headless Chromium, built app, fake provider server): Journal lesson and flow explanations, the shared notice once, saved answers, Ask again, the switch, Screen 5 review, the hand-off (AI Chat opens prefilled, nothing sent, then a change card and Approve), batch narration with its own block, disabled and mock states, the level note, 375 px, blocked storage, zero unexpected console errors; the Journal download has no AI text.
  - **Independent review** of the diff by a reviewer; findings fixed or recorded.
  - The **real-key checklist** (design 13) is written into the report. Real-provider behaviour stays **Unverified** until you run it.
  - `PHASE_3B_REPORT.md` lists every number from real command output. It recommends nothing beyond "3B built"; it does **not** change `Current Active Phase`.
- **verify:** `npm run typecheck && npx vitest run && npm run build`
