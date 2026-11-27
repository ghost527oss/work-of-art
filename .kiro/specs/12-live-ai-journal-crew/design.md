# Design: 12 Live AI in the Journal and Skeleton Crew (Phase 3, Sub-phase 3B)

Implements `requirements.md` in this folder. Active product phase: **Phase 3, Sub-phase 3B**. Wireframe only (`#000` and `#fff`, no transition, no animation). `AI_MODE=mock` stays the default. No new runtime dependency. All paths are relative to `work-of-art/`.

## 1. Decisions already made

| Source | Decision |
|---|---|
| 3B Alignment Brief, answer 1 | "Explain in my project" on lessons and flows. |
| Answer 2 | A hand-off button from Screen 5 to AI Chat ("Ask the AI to fix it"). |
| Answers 3, 4 | Fixed narration stays by default. One batch of AI narration for up to 8 findings, only when you press a button. Nothing automatic. |
| Answer 5 | Up to 6 connection facts for flow requests (chat stays at 3). |
| Answer 6 | A soft note when the AI breaks the level's writing rules. No retry. |
| Answer 7 | Journal downloads stay fixed text only. |
| Answers 8, 9, 10 | One shared first-request notice; provider, lighter-model, and saved-answer labels; buttons disabled with "Live AI is not set up." |
| Answers 11, 12 | Fake providers in tests, you run the real-key check; spec `12`, tasks `N1` to `N9`. |
| 3A (accepted) | Model Router, Context Engine, saved answers, notice, redaction, mock mode, the cap of 3 AI proposals per finding. All reused unchanged. |

## 2. Phase 3 compliance

| Rule (build-phases.md) | How this design complies |
|---|---|
| Server-side free-tier fallback chain, keys never in the browser | No change: requests go through `/api/assistant` and the 3A router. 3B adds no provider code. |
| Forbidden: visual redesign, unapproved features | New CSS uses `#000`, `#fff`, and borders only. Every feature is one you approved. |
| Mock-first rule | Mock mode answers the new request kinds with labelled canned text (section 7.5). |
| 3A gates hold again, the same privacy rules hold | Section 14 maps each one to a test, plus new privacy and export checks. |
| 3-attempt cap | Unchanged. The hand-off passes the finding id, so the 3A cap applies (section 10.4). 3B adds no way to change a file. |

## 3. Lightweight-architecture audit

| Gate | Status | Finding |
|---|---|---|
| 1. Dependency vetting | PASS | None added. |
| 2. Memory and bundle | PASS | At most 12 explanations in memory (each at most a few KB), the 3A cache, one request in flight. New browser code is small (request builders, one store, five small components). Nothing from `src/engine/live/` goes to the browser. The build size is reported at the gate. |
| 3. Free-tier resilience | PASS WITH LIMITS | Every 3B request is light tier (the highest free quota). All are on demand. The narration batch is one request for up to 8 findings, not 8. Saved answers make repeats free. Still, a Gemini free Flash model allows only about 20 requests a day (3A research), so many presses can reach a limit. The router falls back as in 3A. |
| 4. Teardown | PASS | The explain store and the held request live in the assistant controller and end with it. Each surface calls `discardHeld` when it unmounts. |

## 4. Files

### 4.1 New

| File | Responsibility |
|---|---|
| `src/engine/explainRequests.ts` | Pure request builders: `buildLessonRequest`, `buildFlowRequest`, `buildFindingRequest`, `buildNarrationRequest`, `pickNarrationFindings`, `fixPrefill`, and the fixed instruction texts. Uses the Context Engine. |
| `src/engine/levelNote.ts` | `levelNote(level, text)`: the soft note from `checkLessonText`, or `undefined`. |
| `src/store/explainStore.ts` | `ExplainState` and its pure transitions (begin, done, failed, remove, clear, set the shared switch). At most 12 entries. |
| `src/store/chatPrefill.ts` | The one-shot prefill for AI Chat: `chatPrefillStore` with `set`, `take`. |
| `src/hooks/useExplainer.ts` | `createExplainer(assistant, deps)` and `useExplainer(assistant)`: the actions the buttons call, and the availability rule. |
| `src/components/AIExplainBlock.tsx` | One button plus its states and the answer (empty, pending with Cancel, error with Retry, answered). |
| `src/components/ExplainSwitch.tsx` | The shared "Include a few redacted code lines" switch. |
| `src/components/ExplainNotice.tsx` | The shared notice (`AINotice`) shown where its request is held. |
| `src/components/AINarrationBar.tsx` | The narration button, its availability line, and the "AI narration" block. |
| Tests | Section 14. |

### 4.2 Modified (small, listed so nothing is a surprise)

| File | Change |
|---|---|
| `src/types/contracts.ts` | `level`, `findings`, task `narrate`, answer `narration`, 6 facts (section 6). |
| `src/config/aiLive.ts` | New limits (section 6.2). |
| `src/engine/aiValidate.ts` | Rules for the new fields and answer (section 6.3). |
| `src/engine/mockAssistant.ts` | A `narrate` branch. |
| `src/engine/live/promptBuilder.ts` | LEVEL and FINDINGS sections, new answer kinds. |
| `src/engine/live/answerParser.ts` | The `narration` answer. |
| `src/engine/live/liveAssistant.ts` | No cards for `narrate`. |
| `src/engine/aiCache.ts` | Level and findings in the key. |
| `src/engine/contextEngine.ts` | `focusByPath`, `facts`, and `maxFacts` inputs. |
| `src/store/aiSlice.ts`, `aiActions.ts` | `origin` in the summary and the state; origin word in Log lines. |
| `src/hooks/useAssistant.ts` | `sendBuilt`, `explain` store, `heldOrigin`, one `forgetAnswers`. |
| `src/components/AIAssistantPanel.tsx` | Hides results whose origin is not chat; consumes the prefill. |
| `src/components/LessonsSection.tsx`, `FlowsSection.tsx`, `JournalPanel.tsx` | Optional `explain` binding: buttons and blocks. |
| `src/components/FindingDetail.tsx`, `DomainScreen.tsx`, `SkeletonCrewScreen.tsx`, `CrewNarration.tsx` | Optional `explain` binding: review, hand-off, narration. |
| `src/components/StudioLayout.tsx`, `src/App.tsx` | Create and pass the explainer. |
| `src/styles.css` | A short wireframe block. |
| `README.md`, `traceability/PLAN.md` | Notes and F12 nodes. |

### 4.3 Existing tests that change on purpose

| Test | Change and reason |
|---|---|
| `tests/aiContracts.test.ts`, `tests/aiValidate.test.ts`, `tests/mockAssistant.test.ts` | The list of task types now has `narrate`; connections allow 6. Existing cases stay. |
| `tests/aiPanelLive.test.tsx` | One case added: an answer with another origin is not shown in AI Chat. |
| `tests/useAssistant.test.ts`, `tests/aiState.test.ts` | Extended for `sendBuilt`, `origin`, `heldOrigin`. |

All other tests pass unchanged. The Journal and Screen 5 tests pass unchanged because the new binding is optional.

### 4.4 Not touched
The fixed Journal text, the playbook, the scanner, the crew script and its Log lines, the harness, the export modules (`journalExport`, `logExport`, `patchExport`), session restore, and `api/repo.ts`.

## 5. Data flow

```
Journal lesson/flow button            Screen 5 finding buttons          Narration button
        |                                   |                                |
        v                                   v                                v
 explainer.explainLesson / explainFlow   reviewFinding / askForFix     narrate(findings)
        |                                   |    \                           |
        |   explainRequests.build*()  (Context Engine: redacted, small)     |
        v                                   v     \__ askForFix:             v
 assistant.sendBuilt(request, {origin})  ...        chatPrefill.set + open AI Chat (sends nothing)
        |
        |-- saved answer? --> explain entry done (fromCache), Log "reused", no request
        |-- first live request? --> hold it, ui.heldOrigin = origin, notice shown where the button is
        |-- else POST /api/assistant  (3A router, light tier, level + findings in the request)
        v
 result -> explain store entry (done/failed) + Log (counts and origin word only)
        -> Journal / Screen 5 block shows it with the provider line and labels
        -> levelNote(level, summary) adds the soft note when needed
```

Three screens, one request at a time: while any request is pending, the buttons are disabled with "Another AI request is running."

## 6. Contracts

### 6.1 Changes to `src/types/contracts.ts`

```ts
AITaskTypeSchema = z.enum(['explain', 'suggest_change', 'review_finding', 'act', 'narrate']);
export const AILevelSchema = z.enum(['simple', 'practical', 'deeper']);

// AIRequestSchema (still strict) gains:
//   level: AILevelSchema.optional()
//   findings: z.array(z.strictObject({
//     skillId: z.string().max(60).regex(/^scan\.[a-z]+\.[a-z-]+$/),
//     path: z.string().min(1).max(250),
//     line: z.number().int().min(1).max(1_000_000),
//   })).max(8).optional()
// and connections now allows up to 6 (it was 3).

// AIResponseSchema gains a sixth member:
{ type: 'narration', lines: z.array(z.string().min(1).max(400)).min(1).max(8) }
```

### 6.2 New limits (`src/config/aiLive.ts`, provisional)

```ts
maxFlowConnections: 6,        // chat keeps maxConnections: 3
maxNarrationFindings: 8,
maxNarrationLineChars: 400,
maxExplanations: 12,          // entries kept in memory
maxLessonFiles: 3,
maxFlowFiles: 5,
```

### 6.3 New rules in `aiValidate.ts`

- `level` is any of the three words. `findings` is allowed only for `narrate`, and is required there (1 to 8). Each finding's `skillId` is a known scan skill. Each finding's `path` is in `selectedPaths`.
- A `narrate` request has no `sourceContext` and no `connections` (R1.6).
- `connections` has at most 6 for `explain` and `review_finding`, and none for `act` or `narrate`. (Chat's own builder still sends at most 3.)
- A result of type `narration` is valid only for `narrate`, and must have exactly `findings.length` lines. A `narrate` request gets only `narration` or `clarification` back.

### 6.4 Origin words (browser only)

`type Origin = 'chat' | 'journal_lesson' | 'journal_flow' | 'finding_review' | 'crew_narration'`. It never goes to the server. It is used for the Log line, the notice place, and the AI Chat filter.

## 7. Server side

### 7.1 Prompt (`promptBuilder.ts`)

- The system text gains one line: "Write at the reading level named under LEVEL, and follow its rules." The level rules are fixed strings, one per level, from section 1 of the requirements (R1.1).
- The user message gains `LEVEL:` (a plain word) when the request has one, and for `narrate` a `FINDINGS:` section **inside a data block**. Each line is `<n>. <check title> in <path>, line <line>. Known: <the check's fixed explanation>`. The title and the explanation come from the skill book (fixed text); the path is repository text, so it is neutralised like any other data.
- `ANSWER KINDS` for `narrate`: `{"kind":"narration","lines":["one short sentence per finding, in order"]}` or a clarification. For `explain` and `review_finding`: unchanged.
- The prompt cap and cut order of 3A are unchanged. A narration prompt is small (no snippets).

### 7.2 Answer parser (`answerParser.ts`)

`NarrationSchema`: `{ kind: 'narration', lines: string[] (1 to 8) }`. Allowed kinds: `narrate` gives `narration` or `clarification`. The parser checks the line count equals the request's `findings.length` (a different count is `wrong_shape`), clips each line to 400 characters, and applies the same secret check as every answer. The mapped `AIResponse` is `{ type: 'narration', lines }`.

### 7.3 Cards (`liveAssistant.ts`)

For `narrate` no playbook cards are added (the fixed skill text is already in the prompt).

### 7.4 Cache key (`aiCache.ts`)

The key adds `level` and the ordered `findings` list (`skillId@path:line`). Order matters for narration (line `i` belongs to finding `i`), so it is not sorted.

### 7.5 Mock mode (`mockAssistant.ts`)

`narrate` returns `{ type: 'narration', lines }` with one line per finding: `Mock narration for <path>: a canned example. No AI model was used.` (the path is from `selectedPaths`; the instruction is never echoed). `explain` and `review_finding` already return the labelled canned explanation.

## 8. The Context Engine additions (`contextEngine.ts`)

`ContextInput` gains three optional inputs, all pure:
- `focusByPath: Record<path, line>`: a point of interest per file (a lesson's first instance, a flow's step lines). The window rules of 3A apply per file.
- `facts: readonly string[]`: ready-made one-line facts (from a flow's steps) used instead of the connection map. They are redacted and cut at 200 characters.
- `maxFacts`: 3 by default, 6 for a flow.

The builders in `explainRequests.ts`:

| Builder | Task | Files | Facts | Code lines | Skill id | Instruction (fixed text) |
|---|---|---|---|---|---|---|
| `buildLessonRequest(lesson, level, withCode)` | `explain` | up to 3 files of its instances | none | switch only; focus on each file's first instance | the lesson card's `skillId` | `Explain the lesson "<title>" using this project's own files.` |
| `buildFlowRequest(flow, level, withCode)` | `explain` | up to 5 files of its steps | up to 6 step sentences (`describeStep`, practical wording) | switch only; focus on each step's line | none | `Explain this flow in this project: <flow title>` |
| `buildFindingRequest(finding, level, withCode, edges)` | `review_finding` | the finding's file | up to 3 connection facts for it | switch only; focus on its first line | the finding's skill id | `Review this finding: <check title> in <file>, line <n>. Say what is wrong here, why it matters in this file, and what to check first.` |
| `buildNarrationRequest(findings, level)` | `narrate` | the files of up to 8 findings (at most 10 paths) | none | **never** | none | `Write one short sentence for each listed finding, in the order given.` |

`pickNarrationFindings(findings)` sorts by severity (high first), then path and line, takes 8, and reports how many were left out. All builders run `validateAIRequest` and return the same `{ ok, request, notes }` shape as 3A.

## 9. The controller (`useAssistant.ts`)

3A's `send` builds chat requests. 3B adds one sibling, used by the explainer, so the notice, the saved answers, one-at-a-time, cancel, and the Log lines are shared and not copied:

```ts
sendBuilt(request: AIRequest, opts: {
  origin: Exclude<Origin, 'chat'>;
  includeContent: boolean;       // for the Log line only ("contents included")
  subjects?: Array<{ path: string; line: number }>;   // narration: which finding each line belongs to
  bypassCache?: boolean;         // "Ask again"
}): string | null
```

Behaviour (same order as 3A `send`): refuse while checking the mode or while a request is pending (a plain message); look up a saved answer (live mode only); hold the request for the notice if live and not yet accepted (`held` also stores the origin); otherwise start. The result goes to the AI slice (so one-at-a-time, Cancel, Stop, and stale-id rules are the 3A ones) **and** to the explain store.

Other changes:
- `AISummary` and `AIState` gain `origin` (a word, no text). `describe` writes it in the Log line: `AI request: explain (journal_lesson), 2 files selected, contents included.`
- `AssistantUiState` gains `heldOrigin`. `discardHeld` clears it. The notice component for a surface renders only when `heldOrigin` belongs to that surface.
- `forgetAnswers()` replaces the three places that cleared the cache in 3A. It clears the cache **and** the explain store. It runs on a snapshot change, a change of `work.applied` or `work.undone`, `reset`, and a mode change.
- The result handler (`createAIHandoff`) is called as before; it only acts on `action` and `patch_proposal`, which these requests can never return.
- `AIAssistantPanel` shows `ai.result` only when `ai.origin` is `undefined`. For another origin it shows the idle line (and the "waiting" line while pending, because one request runs at a time).

### 9.1 The explain store (`explainStore.ts`)

```ts
interface ExplainEntry {
  origin: Exclude<Origin, 'chat'>;
  status: 'pending' | 'done' | 'failed';
  result?: AIResult;            // memory only, never saved
  error?: ApiError;
  fromCache: boolean;
  level: Level;
  withCode: boolean;
  subjects?: Array<{ path: string; line: number }>;
}
interface ExplainState { includeContents: boolean; entries: Record<string, ExplainEntry>; order: string[] }
```
Keys: `lesson:<cardId>`, `flow:<flowId>`, `finding:<findingId>`, `narrate`. `begin`, `done`, `failed`, `remove`, `clear`, `setIncludeContents` are pure and return the same object when nothing changes. Past 12 entries the oldest finished entry goes. `includeContents` survives `clear` (it is a setting, not an answer) and is never saved.

## 10. The explainer and the screens

### 10.1 `createExplainer(assistant, deps)` (`useExplainer.ts`)

Actions: `explainLesson`, `explainFlow`, `reviewFinding`, `narrate`, `askForFix`, `askAgain(key)`, `cancel`, `setIncludeContents`, plus `availability()`. Each action reads the Journal level from `journalStore` and the snapshot, scan, analysis, and practice text from the studio store at press time, builds the request with `explainRequests`, and calls `assistant.sendBuilt`. It returns a plain message when the request cannot be built (the block shows it).

`availability(status)` (pure, in `aiNotes.ts`):
- `checking`: disabled, "Checking the AI mode..."
- live and not ready: disabled, "Live AI is not set up."
- a request is pending: disabled, "Another AI request is running."
- mock: enabled, with the note "Mock mode: this is a canned example. No AI model was used."
- otherwise enabled.

### 10.2 The soft level note

When an entry for `journal_lesson`, `journal_flow`, or `finding_review` is done, the block calls `levelNote(entry.level, summary)`. It returns, for example, "This wording may not follow the Simple rules: more than 3 sentences, jargon "payload"." It is only displayed. It never triggers a retry, a second model, or a counter.

### 10.3 Components

All are props-only with plain text. Each screen gets the explainer as an optional `explain` prop. Without it the screen renders exactly as in 3A (so every existing test passes).

- **`AIExplainBlock`**: a button, the availability line, and one of four states: not asked yet; pending with **Cancel**; error with the plain message and **Retry**; answered, using `AIResponseView` (provider line, fallback sentence, lighter warning, saved label, **Ask again**) under the heading "AI explanation. This is not part of the lesson text." (For a review: "AI review. This is advice only.") plus the soft level note.
- **`ExplainSwitch`**: the checkbox "Include a few redacted code lines when asking the AI", off by default, with a note that narration never includes code.
- **`ExplainNotice`**: renders `AINotice` when `ui.noticeOpen` and `heldOrigin` is one of that screen's origins.
- **`AINarrationBar`**: the button, a line "Up to 8 findings, one request. N were left out." when needed, and the "AI narration" block: the lines in order, each prefixed with its file and line.

Placement: the Journal's **Lessons** (inside each lesson, after "In your project") and **Flows** (after the steps); Screen 5's finding detail (review and fix buttons, then the block); the narration bar above `CrewNarration` on Screens 4 and 5; the switch once at the top of the Journal and once in the finding detail.

### 10.4 The hand-off ("Ask the AI to fix it")

`askForFix(finding)` writes the prefill `{ findingId, path, skillId, firstLine, instruction: "Propose a fix for: <check title> in <file>, line <n>.", taskType: 'suggest_change', includeContent: true }` to `chatPrefillStore`, opens the AI panel (`openPanelById(layout, 'ai')`), and goes back to the Studio screen. It sends nothing. `AIAssistantPanel` takes the prefill once on mount or change: it selects the finding in "About a finding", selects its file, sets the task, types the instruction, and ticks the box; then clears the prefill. From then on it is the 3A flow, so the cap of 3 applies because the finding id is sent.

## 11. Failure handling

| Failure | Result |
|---|---|
| Live, no keys | Buttons disabled: "Live AI is not set up." |
| Mode check running | Buttons disabled: "Checking the AI mode..." |
| Another request running | Buttons disabled: "Another AI request is running." |
| Provider busy or failing | The 3A router falls back; the block shows the provider line and the calm sentence, or the plain error with **Retry**. |
| A refused answer (wrong shape, wrong kind) | The plain error with the reason words from 3A. |
| Cancel, Stop, `reset`, leaving the screen | A pending entry is removed, no result is kept, a held request is dropped. |
| The finding vanished after a re-scan | The detail is gone, so the buttons are gone. |
| Level rules broken | The answer is shown with the soft note. Nothing else happens. |
| No findings | The narration button is disabled with "No findings to narrate." |

## 12. Privacy

Same rules as 3A. Additionally: the explain store is memory only and holds results that have already passed the 3A secret checks; no 3B module imports a storage API or an export module; the Journal download, Log download, and patch export read from state that does not include the explain store (a test proves the files are byte-identical with and without entries).

## 13. The real-key check for 3B (for you, after the build)

1. Keep your `.env` from 3A (`AI_MODE=live` and your key). Start `npm run dev` and load the Static site sample.
2. **Journal:** open Journal. Press the switch at the top off. Open a lesson. Press **Explain in my project**. The first time, the notice appears in the Journal: press OK. You should see "AI explanation. This is not part of the lesson text." with "Answered by ... (light)." Press it again: "Saved answer". Switch the reading level and press again: it asks again (new level).
3. **Flow:** open "How things flow", pick a flow, press **Explain this flow in my project**.
4. **Code lines:** tick "Include a few redacted code lines", press Ask again. The answer may mention the real lines.
5. **Skeleton Crew:** open Skeleton Crew, wait for the scan, open an area, pick a finding, press **Review this finding with AI**.
6. **Hand-off:** press **Ask the AI to fix it**. AI Chat should open with the finding chosen and the request typed in, and nothing sent yet. Press Send and check the change card as in 3A.
7. **Narration:** press **AI narration for the top 8 findings (1 request)**. Check the block below the fixed narration.
8. **Downloads:** download the Journal. It should contain no AI text.
9. Tell me which provider answered, any red error words, and how long answers took.

## 14. Verification mapping

| Requirement | Tests (all in `tests/`) |
|---|---|
| R1 | `aiContracts`, `aiValidate`, `mockAssistant`, `promptBuilder`, `answerParser`, `aiCache` (extended), `aiLiveConfig` |
| R2, R3, R5 | `explainRequests.test.ts`, `contextEngine.test.ts` (extended), `explainer.test.ts`, `explainUi.test.tsx` |
| R4 | `chatPrefill.test.ts`, `explainer.test.ts`, `aiPanelLive.test.tsx` (extended), `phase3bGate.test.ts` |
| R6 | `explainer.test.ts` (notice, held request, availability), `useAssistant.test.ts` (extended), `explainUi.test.tsx` |
| R7, R9 | `phase3bPrivacy.test.ts` (sentinels, exports byte-identical), `phase3bInjection.test.ts`, `phase3bStatic.test.ts` |
| R8 | `levelNote.test.ts` |
| R10 | `explainUi.test.tsx` |
| Exit gate | `phase3bGate.test.ts` (store level, fake provider) and the browser run |

Fake providers and the whole-system harness from 3A (`tests/helpers/aiHarness.ts`) are reused. The browser run reuses the 3A fake-provider server with new scenarios.

Mutation checks (each must be killed): the narration count rule; narration sending code lines; a held request surviving a screen change; explanations surviving Approve; the level missing from the key; AI text reaching the Log; AI text reaching the Journal download; the notice shown twice; the hand-off sending by itself; the hand-off dropping the finding id; a 7th fact accepted; `act` carrying facts.

## 15. Risks and known limits

1. **Quota.** Many presses can use a day's free requests. Saved answers and the single narration request help; the router falls back.
2. **AI wording varies.** The level note is a hint, not a guarantee. The fixed text stays the source of truth.
3. **A weak model can contradict the scan.** The block says it is advice and the review never changes the finding.
4. **Narration may be off by one line.** The server requires exactly one line per finding, but the model may order them wrongly; each line is shown with its file and line so you can check.
5. **One request at a time** means a slow answer blocks the other buttons until it ends or you Cancel.
6. **Real behaviour is Unverified** until you run section 13.

## 16. PLAN.md nodes

Added to `traceability/PLAN.md` as `plan_id: P3B-LIVE-JOURNAL-CREW`, nodes F12.1 to F12.8 and the F12 gate, one per task.
