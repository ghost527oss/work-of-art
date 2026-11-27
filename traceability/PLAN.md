# PLAN

> plan_id: `P1-ING` — Repository Ingestion (spec `.kiro/specs/01-repository-ingestion/`). Active product phase: Phase 1 (Skeleton, black-and-white wireframe).
> Status: draft for approval. No node is approved for modification. `scripts/traceability/*` do not exist yet, so `verify:` commands call npm/vitest directly.
> Note: `Files` and `Depends on` lines are additions to the starter format.

## F1 — Repository Ingestion
Contract: Given a public GitHub URL (or a bundled sample), produce a validated, coverage-accurate `RepoSnapshot` with a full tree inventory, reporting real pipeline stages. No AI calls, no classification beyond a placeholder, no preview.

### F1.0 — Project scaffold
- Inputs: none
- Outputs: Vite + React + TypeScript project that typechecks, builds, and runs vitest
- Invariants: runtime deps limited to `react`, `react-dom`, `zod`; `"type": "module"`; no router/state/HTTP libraries
- Files: `package.json`, `tsconfig.json`, `vite.config.ts`, `vercel.json`, `index.html`, `.gitignore`, `src/main.tsx` (empty placeholder, replaced in F1.7), `README.md`, `.env.example`
- Depends on: none
- verify: `npm run typecheck && npm run build`

### F1.1 — Contracts and budgets
- Inputs: blueprint contracts, design section 6 and 7
- Outputs: zod schemas and inferred types; `BUDGETS`; coverage consistency checker
- Invariants: one source of truth for each type; `RepoRequest` is strict; coverage consistency rejects counts that disagree with entry statuses
- Files: `src/types/contracts.ts`, `src/config/budgets.ts`, `tests/contracts.test.ts`
- Depends on: F1.0
- verify: `npx vitest run tests/contracts.test.ts`

### F1.2 — Repository URL parsing and validation
- Inputs: free text from the user, or owner/repo/ref from a request
- Outputs: `{owner, repo, ref?}` or a typed validation error
- Invariants: only `github.com` accepted; character sets and lengths enforced; no network access
- Files: `src/engine/repoUrl.ts`, `tests/repoUrl.test.ts`
- Depends on: F1.1
- verify: `npx vitest run tests/repoUrl.test.ts`

### F1.3 — Inventory, file selection, coverage
- Inputs: GitHub tree entries, optional `scope`, budgets
- Outputs: `RepoInventory`, per-file load plan, `RepoCoverage`
- Invariants: no tree entry dropped silently; coverage derived from entry statuses in one pass; `sourceAnalysisComplete` false whenever any supported file is not fully loaded (including over-ceiling and binary files) or the tree is incomplete; dropped entries mark the tree incomplete; deterministic ordering
- Files: `src/engine/repoInventory.ts`, `src/engine/fileSelector.ts`, `tests/repoInventory.test.ts`, `tests/fileSelector.test.ts`
- Depends on: F1.1, F1.2
- verify: `npx vitest run tests/repoInventory.test.ts tests/fileSelector.test.ts`

### F1.4 — GitHub source and ingestion pipeline
- Inputs: `RepoRequest`, injected `fetch`, optional token, `AbortSignal`, event sink
- Outputs: `RepoSnapshot` and ordered `IngestEvent`s, or a typed `IngestError`
- Invariants: only `api.github.com` and `raw.githubusercontent.com` are called and redirects must end on them over https; token only to the API host and only server-side; `requirePublic` rejects private or unconfirmed repositories as `not_found`; non-OK bodies are cancelled; per-request timeout; file-level failures and rate limits degrade to a partial snapshot; abort leaves no result
- Files: `src/engine/githubSource.ts`, `src/engine/ingestPipeline.ts`, `tests/githubSource.test.ts`, `tests/ingestPipeline.test.ts`
- Depends on: F1.1, F1.2, F1.3
- verify: `npx vitest run tests/githubSource.test.ts tests/ingestPipeline.test.ts`

### F1.5 — `/api/repo` endpoint and NDJSON stream
- Inputs: HTTP request, environment (`GITHUB_TOKEN` optional)
- Outputs: NDJSON stream of `IngestEvent`s, or JSON `405/400`
- Invariants: strict method/size/JSON/schema checks; no client-supplied URLs; no file content or secrets in logs; client disconnect aborts upstream work; a configured token only loads confirmed-public repositories
- Files: `api/repo.ts`, `src/engine/ndjson.ts`, `vite.config.ts` (dev middleware), `tests/repoApi.test.ts`
- Depends on: F1.4
- verify: `npx vitest run tests/repoApi.test.ts`

### F1.6 — Samples and client fetcher
- Inputs: user target or sample id; `/api/repo`; optional browser fallback
- Outputs: validated `RepoSnapshot` with events; labelled fallback notice
- Invariants: every response validated before use; fallback only on the allowed failure classes and only when enabled; a failure never yields a sample unless the user chose one; samples go through the same pipeline code and satisfy the coverage invariants
- Files: `src/engine/repoFetcher.ts`, `src/data/sampleRepos.ts`, `tests/repoFetcher.test.ts`, `tests/samples.test.ts`
- Depends on: F1.4, F1.5
- verify: `npx vitest run tests/repoFetcher.test.ts tests/samples.test.ts`

### F1.7 — Store and wireframe UI
- Inputs: ingestion events, snapshot, user actions
- Outputs: Start, Loading, and Studio-stub screens; coverage panel with scoped-load picker
- Invariants: store performs no network calls; stage status changes only via events; `done` only after validation; no percentage shown without known totals; black-and-white only, no animation; one `AbortController` per run, aborted on cancel/retry, and unmount also cancels the run in the store; the folder picker is offered only when the tree is complete
- Files: `src/store/useStudioStore.ts`, `src/hooks/useIngestion.ts`, `tests/useIngestion.test.ts`, `src/components/StartScreen.tsx`, `src/components/LoadingScene.tsx`, `src/components/StudioLayout.tsx`, `src/components/CoveragePanel.tsx`, `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `tests/store.test.ts`
- Depends on: F1.1, F1.6
- verify: `npm run typecheck && npx vitest run tests/store.test.ts tests/useIngestion.test.ts && npm run build`
- manual gate (Unverified until run): Start to Loading to Studio for a sample and for one small public repository, zero console errors

### F1 gate
- verify: `npm run typecheck && npx vitest run && npm run build`

---

> plan_id: `P1-AI` — Mock AI Adapter (spec `.kiro/specs/02-mock-ai-adapter/`). Active product phase: Phase 1. Status: draft for approval; no node is approved for modification. `AI_MODE=mock` only: no provider keys, no external AI calls.

## F2 — Mock AI Adapter
Contract: A user-chosen request goes to `POST /api/assistant` and gets back a deterministic, labelled mock `AIResult` in the contract Phase 3 will keep. The panel renders all four response types as plain text. Nothing can be applied, no AI model is called, and no secret reaches a result, a log, or an error.

### F2.1 — AI contracts, limits, and validation
- Inputs: raw request objects, results, and the limits
- Outputs: `AIRequest`, `AIResponse`, `AIResult` schemas; `AI_LIMITS`; `validateAIRequest`; `validateAIResult`
- Invariants: strict request schema; a malformed request is `invalid_request`, never merely `oversized`; messages name fields and never repeat values; every `evidencePaths` and `affectedPaths` entry is within `selectedPaths`; paths that look like secrets are rejected
- Files: `src/types/contracts.ts`, `src/config/aiLimits.ts`, `src/engine/aiValidate.ts`, `tests/aiContracts.test.ts`, `tests/aiValidate.test.ts`
- Depends on: F1.1, F1.2
- verify: `npm run typecheck && npx vitest run tests/aiContracts.test.ts tests/aiValidate.test.ts`

### F2.2 — Secret redaction
- Inputs: any string or JSON value
- Outputs: redacted text with a count and kinds; `containsSecret`
- Invariants: fixed named patterns only; idempotent; never throws; replaces matches with `[REDACTED:<kind>]`; type annotations such as `token: string` survive
- Files: `src/engine/redact.ts`, `tests/redact.test.ts`
- Depends on: none
- verify: `npx vitest run tests/redact.test.ts`

### F2.3 — Unified diff and mock responder
- Inputs: a validated, redacted `AIRequest` and a redaction count
- Outputs: a deterministic `AIResponse`; a one-line-insert unified diff
- Invariants: pure (no clock, randomness, or environment); never echoes the instruction; response type follows the selected-file-count rule; mock notice is the first `limitations` or `risks` entry; the diff is valid, inserts one line, removes none, touches only the selected path, and applies to the redacted content
- Files: `src/engine/unifiedDiff.ts`, `src/engine/mockAssistant.ts`, `tests/helpers/applyDiff.ts`, `tests/unifiedDiff.test.ts`, `tests/mockAssistant.test.ts`
- Depends on: F2.1, F2.2
- verify: `npx vitest run tests/unifiedDiff.test.ts tests/mockAssistant.test.ts`

### F2.4 — `/api/assistant` endpoint and dev routes
- Inputs: HTTP request, environment (`AI_MODE` only)
- Outputs: `200` `AIResult`, or a JSON error with `405/400/413/501/500`
- Invariants: mode is checked before the body; `live` and unknown values return `unsupported`; reads no environment variable except `AI_MODE`; makes no outbound request; stateless; logs no instruction, content, path, or secret; stops on client disconnect
- Files: `api/assistant.ts`, `src/engine/httpBody.ts`, `vite.config.ts` (dev route table), `README.md`, `tests/assistantApi.test.ts`
- Depends on: F2.1, F2.2, F2.3
- verify: `npx vitest run tests/assistantApi.test.ts`

### F2.5 — Client service
- Inputs: a snapshot, form values, an abort signal
- Outputs: a validated `AIRequest`, or a validated `AIResult`, or a typed error
- Invariants: all `/api/assistant` calls are made here; an invalid request makes no network call; contents are sent only on opt-in and only from `loaded` files; a response that fails validation is never shown; no browser-side substitute response exists
- Files: `src/engine/aiAssistant.ts`, `tests/aiAssistant.test.ts`
- Depends on: F2.1, F2.4
- verify: `npx vitest run tests/aiAssistant.test.ts`

### F2.6 — Store slice, actions, and controller
- Inputs: assistant events and snapshot changes
- Outputs: `ai` state, session-log entries, `createAssistantController`
- Invariants: stale request ids are ignored; one request at a time; the slice and log never hold instruction text or file content; the slice clears when the snapshot is replaced or cleared and any pending request is aborted; `dispose` cancels a pending request
- Files: `src/store/aiSlice.ts`, `src/store/aiActions.ts`, `src/store/useStudioStore.ts`, `src/hooks/useAssistant.ts`, `tests/aiState.test.ts`, `tests/useAssistant.test.ts`
- Depends on: F1.7, F2.5
- verify: `npm run typecheck && npx vitest run tests/aiState.test.ts tests/useAssistant.test.ts tests/store.test.ts`

### F2.7 — AI panel
- Inputs: the store, the assistant controller
- Outputs: the wireframe panel and response view in the Studio stub
- Invariants: always labelled mock; all text rendered as text, never HTML; no Apply, Approve, or Reject control; no color or animation; works by keyboard and touch; empty, pending, error, and cancel states; no horizontal page overflow at 375 px
- Files: `src/components/AIAssistantPanel.tsx`, `src/components/AIResponseView.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/styles.css`, `vite.config.ts` (vitest include line), `tests/aiResponseView.test.tsx`
- Depends on: F2.6
- verify: `npm run typecheck && npx vitest run && npm run build`
- manual gate (Unverified until run): headless browser run for all four response types plus error, empty, pending, and cancel; zero console errors

### F2 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- Phase 1 core-loop evidence (with F1): live dev-server run of all four request shapes with no unhandled server error

---

> plan_id: `P2A-SHELL` — Studio Shell (spec `.kiro/specs/03-studio-shell/`). Active product phase: Phase 2, Sub-phase 2A. Status: draft for approval; no node is approved for modification. Black-and-white wireframe, no animation, `AI_MODE=mock` only, no new dependency. `scripts/traceability/*` do not exist, so `verify:` commands call npm/vitest directly.

## F3 — Studio Shell
Contract: The Studio screen has a left area, a vertical 6-button toolbar on the far right edge, and one right-hand panel that opens, closes, collapses, and switches between two widths. Skeleton Crew (Screen 4) and Domain Debugging (Screen 5) exist as empty pages without the toolbar. The panel layout is saved in browser storage and restored. The current screen is kept as plain data in a store so the whole session (repository address, screen, layout, edits, Log, History) can be saved and restored by a later sub-phase; 2A saves only the layout. Existing Studio features and the AI panel keep working. No action list, chat commands, scanner, sandbox, or editor.

### F3.1 — Layout state, saved layout, store and hook
- Inputs: panel and width actions; a storage object
- Outputs: `LayoutState { openPanel, collapsed, width }`, saved record, `layoutStore`, `useLayout`, `useLayoutPersistence`
- Invariants: `collapsed` implies a panel is open; a no-op returns the same object; the saved record has exactly four fields plus a version and is under 200 bytes; bad, missing, oversized, or old data gives the default; blocked or full storage never throws or shows an error; no repository data, text, or secret is stored; slice and storage files import nothing from React, the engine, `api/`, or the AI store
- Files: `src/store/layoutSlice.ts`, `src/store/layoutStorage.ts`, `src/hooks/useLayout.ts`, `tests/layoutState.test.ts`, `tests/layoutStorage.test.ts`
- Depends on: F1.7 (`createStore`)
- verify: `npm run typecheck && npx vitest run tests/layoutState.test.ts tests/layoutStorage.test.ts`

### F3.2 — Screen navigation and screen store
- Inputs: navigation actions; the experience stage
- Outputs: `ShellView` (studio, skeleton, domain with an area) as plain data, `AREAS`, `toolbarVisible`, `viewWhenStudio`, `shellStore`, `useShellView`, `shellActions`, `useShellReset`
- Invariants: the pure file imports nothing from React, the engine, or the stores; a move that is not allowed returns the same object; the toolbar is visible only on the Studio screen; the view is plain data that survives a JSON round trip; the view lives in a store, not a component, so a restore step can set it; it returns to the Studio screen only when the experience leaves `studio`; not saved in 2A and no browser storage use
- Files: `src/store/shellView.ts`, `src/hooks/useShell.ts`, `tests/shellView.test.ts`
- Depends on: none
- verify: `npm run typecheck && npx vitest run tests/shellView.test.ts`

### F3.3 — Toolbar, panel frame, placeholder panel
- Inputs: props only
- Outputs: `StudioToolbar` (Edit, AI Chat, Log, History, Journal, Skeleton Crew), `PanelFrame` (collapse, width, close, closed), `PlaceholderPanel`, shell CSS
- Invariants: six buttons in fixed order; `aria-pressed` on the five panel buttons; the panel body stays mounted when collapsed or closed; text rendered as text; black and white only, no transition or animation; no Apply, Approve, Reject, Pause, Resume, or Stop control
- Files: `src/components/StudioToolbar.tsx`, `src/components/PanelFrame.tsx`, `src/components/PlaceholderPanel.tsx`, `src/styles.css`, `tests/studioShell.test.tsx`
- Depends on: F3.1
- verify: `npm run typecheck && npx vitest run tests/studioShell.test.tsx`

### F3.4 — Screens 4 and 5
- Inputs: props only
- Outputs: `SandboxPlaceholder`, `SkeletonCrewScreen`, `DomainScreen`
- Invariants: plain text and buttons only; no toolbar; area names come from `AREAS`; black and white only
- Files: `src/components/SandboxPlaceholder.tsx`, `src/components/SkeletonCrewScreen.tsx`, `src/components/DomainScreen.tsx`, `src/styles.css`, `tests/screens.test.tsx`
- Depends on: F3.2, F3.3
- verify: `npm run typecheck && npx vitest run tests/screens.test.tsx tests/studioShell.test.tsx`

### F3.5 — Studio rewiring
- Inputs: the existing store, layout store, snapshot, existing callbacks
- Outputs: the new Studio screen with Project info in the left area, the Log panel, and the AI panel kept mounted behind the AI Chat button
- Invariants: every existing Studio behavior and text is kept (scoped reload, cancel, retry, dismiss, Back to Start, coverage, inventory, log); the AI panel never unmounts while the Studio screen is shown; leaving Studio returns to Screen 3 and a remount or background reload keeps the screen; the Studio reads the snapshot, screen, and layout only from stores (session restore later needs no change here); Back to Start does not reset the layout; no existing test is edited
- Files: `src/components/ProjectInfo.tsx`, `src/components/LogPanel.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/styles.css`, `tests/studioLayout.test.tsx`
- Depends on: F3.1, F3.2, F3.3, F3.4, F2.7
- verify: `npm run typecheck && npx vitest run && npm run build`
- manual gate (Unverified until run): headless browser run of every item in `requirements.md` section 6, item 7; zero console errors

### F3 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- Sub-phase 2A gate (build-phases.md): layout survives refresh; rapid clicks cause no desync

---

> plan_id: `P2B-HARNESS` — Action Harness (spec `.kiro/specs/04-action-harness/`). Active product phase: Phase 2, Sub-phase 2B. Status: draft for approval; no node is approved for modification. Depends on 2A (`P2A-SHELL`) being built. Black-and-white wireframe, no animation, `AI_MODE=mock` only, no new dependency, no AI call from any 2B code. `scripts/traceability/*` do not exist, so `verify:` commands call npm/vitest directly.

## F4 — Action Harness
Contract: One short list of safe actions (help, status, start, pause, resume, step, stop, approve, reject, undo, redo, open, reset) that the user runs by typing fixed words in AI Chat. A labelled offline practice run gives the controls something to act on, and its proposals are approved or rejected by typed word or by card button. Approved changes go to an in-memory practice copy with Undo and Redo. One always-visible Stop button. Opening Edit pauses automation. Log and History are real and saved per repository. No scanner, sandbox, editor, or AI call.

### F4.1 — Diff apply, reverse, and fingerprint
- Inputs: file text and a unified diff
- Outputs: `applyUnifiedDiff`, `reverseUnifiedDiff`, `hashText`
- Invariants: pure; exact matching with no fuzz; every failure returns a reason and no partial text; reverse then apply restores the text exactly (including CRLF and no final newline); never throws; no React, store, or network imports; agrees with the independent test-side applier
- Files: `src/engine/diffApply.ts`, `tests/diffApply.test.ts`
- Depends on: F2.3 (`buildInsertDiff` fixtures)
- verify: `npm run typecheck && npx vitest run tests/diffApply.test.ts`

### F4.2 — Limits and command parser
- Inputs: free text typed in AI Chat
- Outputs: `ACTIONS`, `PANEL_WORDS`, `parseCommand` returning `command`, `refused`, or `none`; `WORK_LIMITS`
- Invariants: pure; only an exact action name (with at most one panel word for `open`) is a command; a two-word near miss is refused with the correct form; three or more words are never a command; never throws; no React, store, or network imports; limits provisional
- Files: `src/config/workLimits.ts`, `src/engine/commands.ts`, `tests/commands.test.ts`
- Depends on: none
- verify: `npm run typecheck && npx vitest run tests/commands.test.ts`

### F4.3 — Practice script and practice copy
- Inputs: a snapshot; the applied history
- Outputs: a deterministic script of at most 8 steps or `null`; `practiceContent(snapshot, applied, path)`
- Invariants: same snapshot gives the same script; only fully loaded, safe, small, secret-free files are used; proposals are zero-context diffs holding no repository content; the snapshot is never mutated; no network, no AI, no `mockAssistant` import
- Files: `src/engine/practiceScript.ts`, `tests/practiceScript.test.ts`
- Depends on: F4.1, F4.2, F2.2 (`redact`), F2.3 (`buildInsertDiff`)
- verify: `npm run typecheck && npx vitest run tests/practiceScript.test.ts`

### F4.4 — Work state
- Inputs: run, proposal, and history actions
- Outputs: `WorkState` and pure transitions
- Invariants: at most one proposal; `awaiting_decision` iff a proposal exists; `idle` implies no proposal; at most 50 history entries; every refusal returns the same object; repeated pause, resume, stop, and approve end where the first press ends; plain data that survives a JSON round trip (except chat and run counter); no imports from React, stores, network, or AI
- Files: `src/store/workSlice.ts`, `tests/workState.test.ts`
- Depends on: F4.1, F4.2, F4.3
- verify: `npm run typecheck && npx vitest run tests/workState.test.ts`

### F4.5 — Work actions and store integration
- Inputs: commands, ticks, Edit-open events
- Outputs: whole-state actions with Log entries; effects `cancel_ai`, `clear_slot`, `open_panel`; `openPanelById`; `StudioState.work`
- Invariants: one command is one atomic update of run, history, log, and chat; Log entries hold paths and fixed phrases only, never instruction text, content, secrets, or diffs; stale ticks change nothing; existing tests pass unedited; no import cycle
- Files: `src/store/workActions.ts`, `src/store/useStudioStore.ts`, `src/store/layoutSlice.ts`, `tests/workActions.test.ts`, `tests/workStore.test.ts`
- Depends on: F4.4, F3.1
- verify: `npm run typecheck && npx vitest run tests/workActions.test.ts tests/workStore.test.ts tests/store.test.ts tests/aiState.test.ts tests/layoutState.test.ts`

### F4.6 — Saved work
- Inputs: the work state, the log, a storage object, a loaded snapshot
- Outputs: the saved record under `patchbay.work.v1`; the restore result
- Invariants: one slot keyed by repository; strict schema and size limits; no file content, secrets, AI text, chat lines, or mode saved; a running run is saved paused; the log is restored once per page load; a fingerprint mismatch discards history, run, and proposal but keeps the log; applied changes are never dropped silently; blocked or full storage never throws
- Files: `src/store/workStorage.ts`, `src/store/workActions.ts` (`restoreWork`), `tests/workStorage.test.ts`
- Depends on: F4.1, F4.4, F4.5
- verify: `npm run typecheck && npx vitest run tests/workStorage.test.ts tests/workActions.test.ts`

### F4.7 — Harness controller
- Inputs: text commands, button presses, the studio store, the layout store, services
- Outputs: `createHarnessController`, `useHarness`
- Invariants: at most one timer; ticks are guarded by run id and position; a button press and a typed command share one code path; no save before restore finishes for the current snapshot; opening Edit pauses and closing it does not resume; Stop and reset cancel a pending AI request; `dispose` clears the timer and both subscriptions; no fetch or AI service import
- Files: `src/hooks/useHarness.ts`, `tests/harnessController.test.ts`
- Depends on: F4.5, F4.6, F3.1
- verify: `npm run typecheck && npx vitest run tests/harnessController.test.ts`

### F4.8 — Stop bar, proposal card, History, Edit panel
- Inputs: props only
- Outputs: `StopBar`, `ProposalCard`, `HistoryPanel`, `EditPanel`, styles
- Invariants: text rendered as text; the only buttons are Stop, Approve, and Reject; no Pause, Resume, or Step button; black and white only, no transition or animation; usable by keyboard and touch
- Files: `src/components/StopBar.tsx`, `src/components/ProposalCard.tsx`, `src/components/HistoryPanel.tsx`, `src/components/EditPanel.tsx`, `src/styles.css`, `tests/harnessUi.test.tsx`
- Depends on: F4.4
- verify: `npm run typecheck && npx vitest run tests/harnessUi.test.tsx`

### F4.9 — Wiring into Chat, Log, Studio, and App
- Inputs: the controller, the existing panels
- Outputs: command hand-off in AI Chat, replies and card in the chat panel, Stop bar on Screens 3, 4, and 5, real Log, History, and Edit panels
- Invariants: ordinary text still goes to the AI exactly as before; command text never reaches the AI; AI Chat patch proposals stay display-only; every existing test passes unedited
- Files: `src/components/AIAssistantPanel.tsx`, `src/components/LogPanel.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/styles.css`, `tests/harnessUi.test.tsx`
- Depends on: F4.5, F4.7, F4.8, F3.5, F2.7
- verify: `npm run typecheck && npx vitest run && npm run build`
- manual gate (Unverified until run): headless browser run of every item in `requirements.md` section 6, item 11; zero console errors

### F4 as built (2B)
- F4.1: `reverseUnifiedDiff` swaps the two `@@` range tokens as written, so reversing twice returns the exact original text. It returns `null` for an unreadable diff.
- F4.6: a restored run script and waiting proposal must equal the rebuilt practice script and practice diff, otherwise the saved work is discarded. Saved Log messages pass through `redact`.
- F4.9: `StudioLayout` and `AIAssistantPanel` take an optional `harness` prop (no Stop bar without it). Three assertions in `tests/studioLayout.test.tsx` that checked the 2A placeholders (Log note, History, Edit) were updated because 2B replaces those placeholders.

### F4 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- Sub-phase 2B gate (build-phases.md): every command updates state predictably, survives a refresh (through restore), and handles repeated commands

---

> plan_id: `P2C-UNDERSTAND` — Project Understanding (spec `.kiro/specs/05-project-understanding/`). Active product phase: Phase 2, Sub-phase 2C. Status: draft for approval; no node is approved for modification. Depends on 2A (`P2A-SHELL`) and 2B (`P2B-HARNESS`) being built. Black-and-white wireframe, no animation, `AI_MODE=mock` only, no new dependency, no network and no AI call from any 2C code. `scripts/traceability/*` do not exist, so `verify:` commands call npm/vitest directly.

## F5 — Project Understanding
Contract: For the loaded repository, PatchBay works out offline what role each file plays (labels, confidence, and plain-English reasons from a built-in skill-book), puts unsure files in Needs Review, lets the user correct labels (saved, logged), and maps the real connections between files (imports, page loads, API calls and routes, settings names) for JavaScript, TypeScript, HTML, CSS, and basic Python, with each link marked Confirmed, Inferred, or Broken. The analysis is the real `classifying` stage of the Loading screen, after the sources are loaded. Results appear in a Project understanding section in Project info, below the Sandbox. Every limit reached makes the result Partial with a reason. Security is shown as "pending scan (2D)". No scanner findings, no AI, no network.

### F5.1 — Limits and skill-book v1
- Inputs: none
- Outputs: `UNDERSTANDING_LIMITS`, `SKILLBOOK` (version and 31 sort skills), `skillById`
- Invariants: unique stable ids; every skill has strength, label from the existing label set, clue family, and a plain-English explanation without banned jargon; the book is frozen; data only; no React, store, engine, or network imports
- Files: `src/config/understandingLimits.ts`, `src/skillbook/types.ts`, `src/skillbook/sortSkills.ts`, `src/skillbook/index.ts`, `tests/skillbook.test.ts`
- Depends on: F1.1 (label set)
- verify: `npm run typecheck && npx vitest run tests/skillbook.test.ts`

### F5.2 — Source scanner: JavaScript, TypeScript, HTML, CSS
- Inputs: a file path and its content
- Outputs: imports, loads, routes, mounts, calls, config names, code patterns, alias imports, each with a line number
- Invariants: pure and never throws; comments and decoy strings ignored; returns only specifiers, addresses, names, and markers (never source lines or setting values); bounded patterns; hostile 200 KB input finishes in under 1 second; unsupported file types report `unsupported`; no React, store, or network imports
- Files: `src/engine/sourceScan.ts`, `tests/sourceScan.test.ts`
- Depends on: F5.1
- verify: `npm run typecheck && npx vitest run tests/sourceScan.test.ts`

### F5.3 — Source scanner: basic Python
- Inputs: a `.py` file path and its content
- Outputs: the same shape as F5.2 for imports (absolute and relative), Flask and FastAPI routes with prefixes and mounts, `requests` and `httpx` calls, `os.environ` and `os.getenv` names
- Invariants: `#` comments and triple-quoted bodies ignored; only decorators on names bound to a known app or router count as routes; Django URL files are flagged, not read; same limits and no-source-lines rule as F5.2
- Files: `src/engine/sourceScanPy.ts`, `src/engine/sourceScan.ts`, `tests/sourceScanPy.test.ts`
- Depends on: F5.1, F5.2
- verify: `npm run typecheck && npx vitest run tests/sourceScanPy.test.ts tests/sourceScan.test.ts`

### F5.4 — File sorting
- Inputs: inventory files, scans, manifest facts, optional edges
- Outputs: one `FileUnderstanding` per file entry
- Invariants: no file dropped; a label exists only with at least one skill hit; no guessing (no clue gives `unknown`, Low, Needs Review); fixed confidence rule; strong helper labels suppress weaker area labels; Low label dropped next to Medium or High; `shared` only from Confirmed imports by both sides and never from a folder or file name; path-only files use no content skills; deterministic output; per-file failure isolated; every evidence id exists in the skill-book
- Files: `src/engine/sortFiles.ts`, `tests/sortFiles.test.ts`
- Depends on: F5.1, F5.2, F5.3
- verify: `npm run typecheck && npx vitest run tests/sortFiles.test.ts`

### F5.5 — Connection map
- Inputs: scans, inventory paths, whether the tree is complete, limits
- Outputs: edges, external names, not-scanned counts, partial reasons
- Invariants: real connections only; certainty Confirmed, Inferred, or Broken by the stated rules; a repository with no backend routes is not Broken; route mounts resolved only through literal requires, imports, or same-file bindings; unresolved absolute Python imports become external names; names only for settings; aliases counted not followed; bounded and deterministic; every limit reached adds a plain-words partial reason
- Files: `src/engine/connectionMap.ts`, `tests/connectionMap.test.ts`
- Depends on: F5.2, F5.3
- verify: `npm run typecheck && npx vitest run tests/connectionMap.test.ts`

### F5.6 — Analysis run, view helpers, sample expectations
- Inputs: a snapshot, an abort signal, an injected yield, clock, and progress callback
- Outputs: `AnalysisResult`; `applyCorrections`, `summarize`, filters, area and helper tables
- Invariants: batches of 40 with a yield between; the 8 second limit and every other limit give a partial result with a reason each; abort leaves nothing; one failing file isolated; the snapshot is never mutated; the three sample results equal the hand-written tables exactly; Security is always `pending`, never a number
- Files: `src/engine/analyzeProject.ts`, `src/engine/understandingView.ts`, `tests/analyzeProject.test.ts`, `tests/understandingView.test.ts`, `tests/analyzeSamples.test.ts`
- Depends on: F5.4, F5.5
- verify: `npm run typecheck && npx vitest run tests/analyzeProject.test.ts tests/understandingView.test.ts tests/analyzeSamples.test.ts`

### F5.7 — Understanding state and actions
- Inputs: run events, correction actions
- Outputs: `StudioState.understanding`; whole-state actions with Log entries
- Invariants: stale run ids ignored; corrections never start a run or change the result; the 501st correction is refused and none is dropped; log entries hold paths, counts, and label names only; state cleared with `ai` and `work`; existing tests pass unedited
- Files: `src/store/understandingSlice.ts`, `src/store/understandingActions.ts`, `src/store/useStudioStore.ts`, `tests/understandingState.test.ts`
- Depends on: F5.6, F1.7
- verify: `npm run typecheck && npx vitest run tests/understandingState.test.ts tests/store.test.ts tests/aiState.test.ts tests/workStore.test.ts`

### F5.8 — The `classifying` stage in the loading run
- Inputs: the validated snapshot in the loading run, optional `analyze` and `loadCorrections` services
- Outputs: the stage active with progress, then done, failed, or skipped; one completion update carrying the snapshot, the result, and the corrections; the Loading screen listing "Classify files" after "Load source files"
- Invariants: the server pipeline and `/api/repo` are unchanged; the stage uses the run's `AbortController`; Cancel stops the whole run; an analysis failure never fails loading; a missing `analyze` skips the stage and behaves as before; stale run ids ignored; only the two named `tests/store.test.ts` tests change; `preparing_preview` stays "not available yet"
- Files: `src/types/contracts.ts`, `src/store/useStudioStore.ts`, `src/hooks/useIngestion.ts`, `src/components/LoadingScene.tsx`, `tests/store.test.ts`, `tests/classifyStage.test.ts`
- Depends on: F5.6, F5.7, F1.7
- verify: `npm run typecheck && npx vitest run tests/classifyStage.test.ts tests/store.test.ts tests/useIngestion.test.ts tests/understandingState.test.ts && npm run build`

### F5.9 — Saved corrections and controller
- Inputs: the studio store, a storage object, services
- Outputs: record `patchbay.corrections.v1`; `createUnderstandingController`, `useUnderstanding`
- Invariants: one slot keyed by repository; only paths and label names saved; strict schema and bounds; loading a snapshot never writes the slot; restore only for a matching repository and existing paths; re-analysis aborted on replace, clear, cancel, and dispose; Back to Start keeps the slot; no fetch or AI import
- Files: `src/store/correctionsStorage.ts`, `src/hooks/useUnderstanding.ts`, `tests/correctionsStorage.test.ts`, `tests/understandingController.test.ts`
- Depends on: F5.7, F4.6 (`repoKeyOf`)
- verify: `npm run typecheck && npx vitest run tests/correctionsStorage.test.ts tests/understandingController.test.ts`

### F5.10 — Section components
- Inputs: props only
- Outputs: `UnderstandingSection`, `FileLabelsTable`, `LabelEditor`, `ConnectionsTable`, styles
- Invariants: text rendered as text; certainty shown in words; the Security row reads "pending scan (2D)"; Files, Connections, and the scanned note are collapsed by default and tables scroll inside themselves; a Partial line lists every reason; label editor offers the nine selectable labels with plain names; black and white only, no transition or animation; keyboard and touch usable
- Files: `src/components/UnderstandingSection.tsx`, `src/components/FileLabelsTable.tsx`, `src/components/LabelEditor.tsx`, `src/components/ConnectionsTable.tsx`, `src/styles.css`, `tests/understandingUi.test.tsx`
- Depends on: F5.6
- verify: `npm run typecheck && npx vitest run tests/understandingUi.test.tsx`

### F5.11 — Wiring into Project info, Studio, App, and default services
- Inputs: the controller, the existing Project info, the ingestion controller
- Outputs: the section below the Sandbox and the coverage panel and above the inventory; the real `analyze` and `loadCorrections` in the default ingestion services
- Invariants: no existing test edited beyond the two in F5.8; Screens 4 and 5 and the toolbar unchanged; ingestion, AI, shell, and harness behavior unchanged
- Files: `src/components/ProjectInfo.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/hooks/useIngestion.ts`, `src/styles.css`, `tests/understandingUi.test.tsx`
- Depends on: F5.8, F5.9, F5.10, F3.5
- verify: `npm run typecheck && npx vitest run && npm run build`
- manual gate (Unverified until run): headless browser run of every item in `requirements.md` section 6, item 13; zero console errors

### F5 as built (2C)
- Ignored files are those skipped for dependency, generated, minified, lock file, source map, or symlink reasons. Media and unsupported types stay sortable by path (the worked examples need `assets` for images).
- A call is never Broken when its address or method is unknown at read time (concatenation, template prefix, options without a literal `method`). `backendAllLoaded` requires every Backend file to be scanned. `treeComplete` is false when the 20,000-file cap cut entries.
- Credentials and query strings are removed from external hosts and request-call evidence. Paths over 250 characters cannot be corrected.

### F5 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- Sub-phase 2C gate (build-phases.md): no guessed labels; low-confidence files go to Needs Review

---

> plan_id: `P2D-CREW` — Scanner and Skeleton Crew (spec `.kiro/specs/06-scanner-skeleton-crew/`). Active product phase: Phase 2, Sub-phase 2D. Status: draft for approval; no node is approved for modification. Depends on 2A (`P2A-SHELL`), 2B (`P2B-HARNESS`), and 2C (`P2C-UNDERSTAND`) being built. Black-and-white wireframe, no animation, `AI_MODE=mock` only, no new dependency, no network and no AI call from any 2D code. `scripts/traceability/*` do not exist, so `verify:` commands call npm/vitest directly.

## F6 — Scanner and Skeleton Crew
Contract: An offline scanner with 16 built-in checks in four areas (Frontend, Backend, Security, APIs & Data) finds problems in the loaded files. Every finding shows its file, lines, a short redacted snippet, a plain explanation, why it matters, and a plan, with a severity, a Found or Possible certainty, and an honest fix label (one automatic fix, the rest Guided or Explanation only). No scores: only real counts and a list of what was and was not checked. The Skeleton Crew is an automatic run started by `start crew` that reuses the 2B controls, narrates each finding, proposes the one safe fix and waits for Approve or Reject, and verifies by checking again. Screen 4 shows the four-area map and the worker slots. Screen 5 shows one area's findings and narration. A command box serves both screens, and a Start Crew button on Screen 4 does the same as `start crew`. No sandbox, no editor, no AI, no network.

### F6.1 — Limits and the 16 scan skills
- Inputs: none
- Outputs: `SCAN_LIMITS`, `SKILLBOOK.scan` (16 skills), `scanSkillById`
- Invariants: ids, areas, severities, certainties, and fix labels match the requirements table; exactly one automatic fix; plain-English text without banned jargon, scores, or "secure"; the book is frozen; the 31 sort skills are unchanged; data only
- Files: `src/config/scanLimits.ts`, `src/skillbook/types.ts`, `src/skillbook/scanSkills.ts`, `src/skillbook/index.ts`, `tests/scanSkills.test.ts`
- Depends on: F5.1
- verify: `npm run typecheck && npx vitest run tests/scanSkills.test.ts tests/skillbook.test.ts`

### F6.2 — Scan helpers, Frontend checks, APIs & Data checks
- Inputs: file text and path
- Outputs: `maskComments` export, snippet and id helpers, five checks
- Invariants: comments ignored; snippets at most 12 lines of at most 200 characters with secrets redacted; ids stable per place and occurrence; bounded patterns; hostile input under 1 second; no React, store, or network imports
- Files: `src/engine/sourceScan.ts`, `src/engine/scanText.ts`, `src/engine/scanFrontend.ts`, `src/engine/scanApi.ts`, `tests/scanChecks.test.ts`
- Depends on: F6.1, F5.2
- verify: `npm run typecheck && npx vitest run tests/scanChecks.test.ts tests/sourceScan.test.ts`

### F6.3 — Security checks and the one automatic fix
- Inputs: file text, inventory paths, a finding
- Outputs: six checks; `buildTargetBlankFix`; `buildFixProposal`
- Invariants: a secret value never appears in any finding text; `env-file` works for unread files and ignores example files; an automatic fix is offered only when its diff applies, the finding disappears, nothing new appears, and the diff holds no secret; otherwise the finding is Guided with a note; reverse then apply restores the text exactly
- Files: `src/engine/scanSecurity.ts`, `src/engine/scanFix.ts`, `tests/scanChecks.test.ts`, `tests/scanSecrets.test.ts`, `tests/scanFix.test.ts`
- Depends on: F6.1, F6.2, F4.1
- verify: `npm run typecheck && npx vitest run tests/scanChecks.test.ts tests/scanSecrets.test.ts tests/scanFix.test.ts`

### F6.4 — Backend checks and route mismatch
- Inputs: file text, 2C edges
- Outputs: four Backend checks and `scan.api.route-mismatch`
- Invariants: Possible checks say what was not seen; a repository with no routes never gets a mismatch finding; one `no-auth-limit` finding per repository at the first write route; parameterised queries are not flagged; bounded patterns
- Files: `src/engine/scanBackend.ts`, `tests/scanChecks.test.ts`
- Depends on: F6.1, F6.2, F5.5
- verify: `npm run typecheck && npx vitest run tests/scanChecks.test.ts`

### F6.5 — Scan engine, view helpers, sample expectations
- Inputs: a snapshot, the 2C result, effective content, an abort signal, injected yield and clock
- Outputs: `ScanResult`; `scanProject`, `rescanPaths`, `scanFile`; counts, links, worker slots, and what-was-checked helpers
- Invariants: batches of 40; limits give plain-words partial reasons; abort leaves nothing; a throwing check is isolated; deterministic order; applicability follows effective labels; incremental re-check changes only the given paths; the three sample results equal the hand-written findings; no score, grade, percentage, "secure", or "no problems"
- Files: `src/engine/scanProject.ts`, `src/engine/scanView.ts`, `tests/scanProject.test.ts`, `tests/scanSamples.test.ts`, `tests/scanView.test.ts`
- Depends on: F6.2, F6.3, F6.4, F4.3
- verify: `npm run typecheck && npx vitest run tests/scanProject.test.ts tests/scanSamples.test.ts tests/scanView.test.ts`

### F6.6 — Scan state, actions, store slice, Security row
- Inputs: scan events
- Outputs: `StudioState.scan`; whole-state actions with Log entries; the optional scan argument of `summarize`
- Invariants: stale run ids ignored; log entries hold counts and titles only; state cleared with `ai`, `work`, and `understanding`; the Security row stays "pending scan (2D)" until a scan is done and then shows a count; existing tests pass unedited
- Files: `src/store/scanSlice.ts`, `src/store/scanActions.ts`, `src/store/useStudioStore.ts`, `src/engine/understandingView.ts`, `src/components/UnderstandingSection.tsx`, `tests/scanState.test.ts`
- Depends on: F6.5, F5.6, F5.7
- verify: `npm run typecheck && npx vitest run tests/scanState.test.ts tests/store.test.ts tests/understandingView.test.ts tests/understandingUi.test.tsx tests/workStore.test.ts`

### F6.7 — Crew script and run changes
- Inputs: findings, the 2B run state, commands and ticks
- Outputs: `buildCrewScript`, `narrate`; run kind `crew` with area, finding, propose, and verify steps; same-update re-check after approve, undo, and redo
- Invariants: the practice run is unchanged and the 2B suite passes unedited; each finding narrated once under its primary area; at most 12 per area and 150 steps with "left out" notes; narration holds no code and no secret; the crew never changes anything without a decision; "verified" only after a real re-check; findings and applied fixes never disagree; the 2B invariants hold for both kinds
- Files: `src/engine/crewScript.ts`, `src/store/workSlice.ts`, `src/store/workActions.ts`, `tests/crewScript.test.ts`, `tests/crewRun.test.ts`
- Depends on: F6.3, F6.5, F6.6, F4.4, F4.5
- verify: `npm run typecheck && npx vitest run tests/crewScript.test.ts tests/crewRun.test.ts tests/workState.test.ts tests/workActions.test.ts tests/workStore.test.ts`

### F6.8 — Commands, saved-record guard, harness changes
- Inputs: typed commands, the saved record, the harness timer
- Outputs: `start`, `start practice`, `start crew`; the crew run and proposal not saved; the history secret guard; crew tick 1,000 ms; crew wording in the Stop bar and card
- Invariants: only the 2B tests that assert `start` takes no argument change; a history diff with a secret prevents saving history and logs it; the practice-run record is unchanged; context diffs up to 2,000 characters round-trip and restore with fingerprint checks
- Files: `src/engine/commands.ts`, `src/store/workStorage.ts`, `src/hooks/useHarness.ts`, `src/components/StopBar.tsx`, `src/components/ProposalCard.tsx`, `tests/commands.test.ts`, `tests/crewStorage.test.ts`, `tests/crewRun.test.ts`
- Depends on: F6.7, F4.2, F4.6, F4.7
- verify: `npm run typecheck && npx vitest run tests/commands.test.ts tests/crewStorage.test.ts tests/crewRun.test.ts tests/workStorage.test.ts tests/harnessController.test.ts tests/harnessUi.test.tsx`

### F6.9 — Scan controller
- Inputs: the studio store, services
- Outputs: `createScanController`, `useScan`
- Invariants: starts only when the 2C analysis is done and never during loading; one scan at a time; abort on cancel, snapshot change, and dispose; a label correction marks the scan out of date and starts nothing; no fetch or AI import
- Files: `src/hooks/useScan.ts`, `tests/scanController.test.ts`
- Depends on: F6.6
- verify: `npm run typecheck && npx vitest run tests/scanController.test.ts`

### F6.10 — Screen components and command box
- Inputs: props only
- Outputs: area map, worker slots, scan summary, what-was-checked, findings table and detail, narration, request trace, changes made, command box, styles
- Invariants: text rendered as text; snippets escaped and redacted; no score, grade, percentage, "secure", or "no problems"; no Apply, Pause, Resume, or Step button; the only buttons acting on the run are Start Crew, Stop, Approve, and Reject, and Start Crew is disabled with its reason unless `start crew` would be accepted; tables scroll in boxes; black and white only, no transition or animation
- Files: `src/components/AreaMap.tsx`, `src/components/WorkerSlots.tsx`, `src/components/StartCrewButton.tsx`, `src/components/ScanSummary.tsx`, `src/components/WhatWasChecked.tsx`, `src/components/FindingsTable.tsx`, `src/components/FindingDetail.tsx`, `src/components/CrewNarration.tsx`, `src/components/RequestTrace.tsx`, `src/components/ChangesMade.tsx`, `src/components/CommandBar.tsx`, `src/styles.css`, `tests/crewUi.test.tsx`
- Depends on: F6.5
- verify: `npm run typecheck && npx vitest run tests/crewUi.test.tsx`

### F6.11 — Wiring Screens 4 and 5
- Inputs: the controllers, the harness, the stores
- Outputs: the real Skeleton Crew and Domain screens, with no toolbar and with the command box and Stop bar
- Invariants: the scan starts only when Screen 4 opens; the 2A, 2B, and 2C suites pass unedited apart from the named `start` tests; `open <panel>` from the command box returns to Screen 3
- Files: `src/components/SkeletonCrewScreen.tsx`, `src/components/DomainScreen.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/styles.css`, `tests/crewUi.test.tsx`
- Depends on: F6.8, F6.9, F6.10, F3.4, F3.5
- verify: `npm run typecheck && npx vitest run && npm run build`
- manual gate (Unverified until run): headless browser run of every item in `requirements.md` section 6, item 15; zero console errors

### F6 as built (2D)
- The four per-area check files are small functions over masked text (`ctx.masked`) and a string-blanked variant (`ctx.code`) so text inside strings and comments does not fire a check. `crewStartState` also refuses a stale scan (labels changed).
- Screens 4 and 5 keep their 2A props and render the live content only when `live` is given. The 2B run gained `kind`; `Proposal` gained `source`; `HistoryEntry` gained an optional `area` (saved, a plain word).
- Existing tests edited as named by the design or forced by new required fields: `tests/commands.test.ts` (`start` takes one word), and type-only additions in `tests/workState.test.ts` and `tests/workStore.test.ts`.

### F6 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- Sub-phase 2D gate (build-phases.md): every finding shows its file, lines, snippet, and reason; no invented scores

---

> plan_id: `P2E1-SANDBOX` — Sandbox Preview (spec `.kiro/specs/07-sandbox-preview/`). Active product phase: Phase 2, Sub-phase 2E-1. Status: draft for approval; no node is approved for modification. Depends on 2A to 2D being built. PatchBay's own screens stay black-and-white wireframe with no animation, `AI_MODE=mock` only, no new dependency, no network and no AI call from PatchBay's code. `scripts/traceability/*` do not exist, so `verify:` commands call npm/vitest directly.

## F7 — Sandbox Preview
Contract: The left Sandbox shows a safe preview of the loaded project in one of three honest modes: Live Static Preview (look-only by default, with an explicit switch to run the project's own scripts in a locked iframe), an approximate static Component Workbench for React, Vue, and Svelte, and Source Inspection. The preview document is rewritten from an allowlist with everything escaped, loaded inside an iframe whose sandbox flags and content policy block scripts (look-only), external content, popups, forms, and any access to PatchBay. Messages from a script-running preview are validated and shown only as text. The layout overflow check is measured in the look-only preview and is the 17th finding. The preview is read only. No Edit pad, no code changes.

### F7.1 — Limits and the 17th skill
- Inputs: none
- Outputs: `PREVIEW_LIMITS`; `scan.frontend.layout-overflow` (measured); merged findings and counts; updated "what was checked" text
- Invariants: the text scan never runs a measured skill; the crew script is built from merged findings in F7.10; the 2D sample expectations are unchanged; only the named 2D test assertions change
- Files: `src/config/previewLimits.ts`, `src/skillbook/types.ts`, `src/skillbook/scanSkills.ts`, `src/engine/scanProject.ts`, `src/engine/scanView.ts`, `tests/previewLimits.test.ts`, `tests/scanSkills.test.ts`, `tests/scanView.test.ts`
- Depends on: F6.1, F6.5
- verify: `npm run typecheck && npx vitest run tests/previewLimits.test.ts tests/scanSkills.test.ts tests/scanView.test.ts tests/scanProject.test.ts tests/scanSamples.test.ts tests/crewScript.test.ts`

### F7.2 — HTML tokenizer and allowlists
- Inputs: HTML text
- Outputs: tokens with offsets, lines, and columns; escape helpers; tag and attribute allowlists
- Invariants: never throws and is linear; tokens reproduce the input; allowlists contain no script, frame, object, embed, base, meta, link, or `on...` attribute; no DOM and no `DOMParser`
- Files: `src/preview/htmlTokens.ts`, `src/preview/htmlAllow.ts`, `tests/htmlTokens.test.ts`
- Depends on: none
- verify: `npm run typecheck && npx vitest run tests/htmlTokens.test.ts`

### F7.3 — Flags, CSS sanitiser, and the static document builder
- Inputs: effective page files, options (scripts, nonce, origin)
- Outputs: sandbox flag string, policy string, sanitised CSS, the preview document with an element table and a report
- Invariants: the sandbox string is exactly `allow-same-origin` or `allow-scripts` and never both or any other token; the policy is one of two fixed strings; the document is written from the allowlist with all text and attribute values escaped; exactly two `<meta>` tags; no PatchBay value in any output; bounded; deterministic; pure
- Files: `src/preview/previewFlags.ts`, `src/preview/cssSanitize.ts`, `src/preview/previewDocument.ts`, `tests/previewFlags.test.ts`, `tests/previewDocument.test.ts`, `tests/previewHostile.test.ts`
- Depends on: F7.2
- verify: `npm run typecheck && npx vitest run tests/previewFlags.test.ts tests/previewDocument.test.ts tests/previewHostile.test.ts tests/htmlTokens.test.ts`

### F7.4 — Mode detection and source viewer helpers
- Inputs: a snapshot and the 2C result
- Outputs: the mode, its reason, the entry page, the possible modes; grouped files; redacted numbered lines
- Invariants: a fixed reason sentence per rule; `source` is always possible; viewer lines redacted and capped; unread files show their reason
- Files: `src/preview/previewMode.ts`, `src/preview/sourceView.ts`, `tests/previewMode.test.ts`, `tests/sourceView.test.ts`
- Depends on: F5.6, F7.1
- verify: `npm run typecheck && npx vitest run tests/previewMode.test.ts tests/sourceView.test.ts`

### F7.5 — Workbench extractors and builder
- Inputs: JSX, TSX, Vue, and Svelte files, 2C imports
- Outputs: component list and approximate static documents
- Invariants: nothing is run or evaluated; expressions become visible markers; inlining at most 3 levels with cycle protection; one unreadable component does not stop the others; output goes through the same allowlist builder with no annotation; bounded
- Files: `src/preview/jsxExtract.ts`, `src/preview/templateExtract.ts`, `src/preview/workbenchDocument.ts`, `tests/workbench.test.ts`
- Depends on: F7.3, F5.5
- verify: `npm run typecheck && npx vitest run tests/workbench.test.ts`

### F7.6 — The bridge and the inspector
- Inputs: message events from the preview iframe
- Outputs: validated messages; the fixed inspector script text
- Invariants: source, origin `null`, strict schema, size, rate, and nonce checks; only a console line, a ready signal, or an invalid count can result; the inspector posts to the exact parent origin, never `'*'`, and contains no PatchBay data
- Files: `src/preview/previewBridge.ts`, `tests/previewBridge.test.ts`
- Depends on: F7.1
- verify: `npm run typecheck && npx vitest run tests/previewBridge.test.ts`

### F7.7 — Layout overflow check (pure)
- Inputs: measurement tables, the element table, effective content
- Outputs: measured findings for `scan.frontend.layout-overflow`
- Invariants: three fixed rules; `auto` and `scroll` excluded; one finding per element and kind across widths; at most 100 with a stated reason; numbers clamped; findings carry file, lines, a redacted snippet, and measured numbers
- Files: `src/preview/layoutCheck.ts`, `tests/layoutCheck.test.ts`
- Depends on: F7.1, F7.3
- verify: `npm run typecheck && npx vitest run tests/layoutCheck.test.ts`

### F7.8 — Preview state and actions
- Inputs: panel and bridge events
- Outputs: `StudioState.preview`; whole-state actions with Log entries
- Invariants: scripts forced off on every mode change, snapshot change, and reset; scripts can only be on in `static` mode; console and counters bounded; stale updates ignored; Log entries hold titles and counts only; nothing from the preview state is saved; existing tests pass unedited
- Files: `src/store/previewSlice.ts`, `src/store/previewActions.ts`, `src/store/useStudioStore.ts`, `tests/previewState.test.ts`
- Depends on: F7.1, F7.7, F1.7
- verify: `npm run typecheck && npx vitest run tests/previewState.test.ts tests/store.test.ts tests/workStorage.test.ts`

### F7.9 — Panel components, browser adapter, and controller
- Inputs: the preview state, effective content, the iframe
- Outputs: the Sandbox panel and its parts; the read-only DOM adapter; the controller for the bridge listener and the layout check
- Invariants: the iframe has no `src`, the exact sandbox value, `referrerpolicy="no-referrer"`, and `allow=""`; no PatchBay value in `srcdoc`; the confirmation text states both script-mode limits; the listener exists only while scripts are on and is always released; the adapter only reads; text rendered as text; black and white chrome only
- Files: `src/components/SandboxPanel.tsx`, `src/components/PreviewToolbar.tsx`, `src/components/ScriptsSwitch.tsx`, `src/components/PreviewNotes.tsx`, `src/components/ConsolePane.tsx`, `src/components/WorkbenchPicker.tsx`, `src/components/SourceViewer.tsx`, `src/preview/previewDom.ts`, `src/hooks/usePreview.ts`, `src/styles.css`, `tests/sandboxUi.test.tsx`, `tests/previewController.test.ts`
- Depends on: F7.3, F7.4, F7.5, F7.6, F7.7, F7.8
- verify: `npm run typecheck && npx vitest run tests/sandboxUi.test.tsx tests/previewController.test.ts`

### F7.10 — Wiring into the Studio and the 2D views
- Inputs: the panel, the findings
- Outputs: the panel on Screens 3, 4, and 5; measured findings in the 2D views; Open in viewer
- Invariants: only the named placeholder and check-count assertions in 2A and 2D tests change; screens remount the panel and scripts turn off; the Skeleton Crew narrates measured findings under Frontend from already-measured data, never measures itself, and says when nothing was measured; a state without measured findings gives the 2D crew script unchanged
- Files: `src/components/StudioLayout.tsx`, `src/components/SkeletonCrewScreen.tsx`, `src/components/DomainScreen.tsx`, `src/components/ScanSummary.tsx`, `src/components/FindingsTable.tsx`, `src/components/FindingDetail.tsx`, `src/components/WhatWasChecked.tsx`, `src/engine/crewScript.ts`, `src/store/workActions.ts`, `src/App.tsx`, `src/styles.css`, `tests/sandboxUi.test.tsx`, `tests/crewScript.test.ts`, `tests/crewRun.test.ts`
- Depends on: F7.9, F3.5, F6.7, F6.11
- verify: `npm run typecheck && npx vitest run && npm run build`
- manual gate (Unverified until run): the isolation browser test and the browser run in `requirements.md` section 6, items 13 and 14

### F7 as built (2E-1)
- `sanitizeCss` removes `<` and CSS backslash escapes first and filters until the text stops changing. Template extractors are capped at 100 KB and use the linear tokenizer.
- The bridge listener ignores messages from other windows, rate-limits before validating, and flushes the invalid counter at most once a second. A layout result is dropped when the content key changed while measuring.
- Not built: the "Open in viewer" button on a finding (the viewer exists in Source Inspection mode).
- Existing tests edited: 2D tests that counted 16 checks (now 17) and one crew-script test (the Frontend step carries the "not measured" sentence when no layout check ran).

### F7 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- Sub-phase 2E-1 gate (build-phases.md): imported code cannot read PatchBay data, cookies, or secrets, or load external scripts or any other external content; messages from the preview are validated and shown only as plain text

---

> plan_id: `P2E2-EDITPAD` — Edit Pad (spec `.kiro/specs/08-edit-pad/`). Active product phase: Phase 2, Sub-phase 2E-2. Status: draft for approval; no node is approved for modification. Depends on 2A to 2E-1 (`P2E1-SANDBOX`) being built. PatchBay's own screens stay black-and-white wireframe with no animation, `AI_MODE=mock` only, no new dependency, no network and no AI call. The 2E-1 isolation files are read only. `scripts/traceability/*` do not exist, so `verify:` commands call npm/vitest directly.

## F8 — Edit Pad
Contract: In the Edit panel the user selects elements in the look-only preview (click, lasso, background, or a list) and changes size, corners, spacing, border, shadow, text, and colours through validated tools and drag handles. When an element in a plain HTML page can be mapped exactly, the change is written as that element's `style` attribute in the in-memory practice copy and recorded in History (merged per element burst, with Undo and Redo and the 2B fingerprint checks). Everything else is Preview Only, with one fixed reason. Layout findings are re-checked after edits, with Try a fix suggestions to Keep or Discard. Nothing changes the loaded snapshot or the real repository. Export is 2F.

### F8.1 — Limits, style model, inline style
- Inputs: user field values
- Outputs: `EDIT_LIMITS`; validated `StyleDeclaration`s; merged inline style text
- Invariants: only the listed properties; numeric ranges and `#rrggbb` colours enforced; generated values never contain `url(`, `expression(`, quotes, semicolons, braces, angle brackets, or backslashes (fuzz proof); a complex `style` attribute is reported as too complex; pure
- Files: `src/config/editLimits.ts`, `src/edit/styleModel.ts`, `src/edit/inlineStyle.ts`, `tests/styleModel.test.ts`, `tests/inlineStyle.test.ts`
- Depends on: none
- verify: `npm run typecheck && npx vitest run tests/styleModel.test.ts tests/inlineStyle.test.ts`

### F8.2 — Text diff, mapping, start-tag rewrite, builder changes
- Inputs: file text, an element table entry, declarations
- Outputs: one-hunk diffs with 3 context lines; map results with fixed reasons; rewritten start tags; element keys and Preview Only application in the preview builders
- Invariants: only the start tag's text changes; a stale table or unknown tag or SVG element or complex style is not mapped; workbench elements are never mappable; the 2E-1 isolation tests still pass; only the named 2E-1 test assertions change
- Files: `src/edit/textDiff.ts`, `src/edit/elementMap.ts`, `src/preview/previewDocument.ts`, `src/preview/workbenchDocument.ts`, `tests/textDiff.test.ts`, `tests/elementMap.test.ts`, `tests/previewDocument.test.ts`, `tests/workbench.test.ts`
- Depends on: F8.1, F7.3, F7.5
- verify: `npm run typecheck && npx vitest run tests/textDiff.test.ts tests/elementMap.test.ts tests/previewDocument.test.ts tests/previewHostile.test.ts tests/workbench.test.ts tests/previewFlags.test.ts`

### F8.3 — Selection geometry and suggestions
- Inputs: element rectangles, pointer positions, layout findings
- Outputs: hit test, lasso selection (outermost, at most 20), handle resize maths, layout suggestions
- Invariants: whole pixels from 1 to 5000; inputs clamped; fixed suggestion per finding kind passing the validators; pure
- Files: `src/edit/geometry.ts`, `src/edit/suggestions.ts`, `tests/editGeometry.test.ts`
- Depends on: F8.1
- verify: `npm run typecheck && npx vitest run tests/editGeometry.test.ts`

### F8.4 — History integration
- Inputs: a path, a new text, an edit key
- Outputs: `applyUserEdit`; amended or appended or removed History entries; optional `editKey`
- Invariants: practice copy, History, Log, and findings change in one update; amend only for the same key, last entry, and empty redo list; text equal to the original removes the entry; refusals (stale, full, too large, no apply, secret) change nothing and become Preview Only; Undo and Redo restore exact text; old saved records still load; the snapshot is never mutated
- Files: `src/store/workSlice.ts`, `src/store/workActions.ts`, `src/store/workStorage.ts`, `tests/userEdit.test.ts`
- Depends on: F8.2, F4.4, F4.5, F4.6, F6.5
- verify: `npm run typecheck && npx vitest run tests/userEdit.test.ts tests/workState.test.ts tests/workActions.test.ts tests/workStorage.test.ts tests/crewRun.test.ts tests/crewStorage.test.ts`

### F8.5 — Edit state and actions
- Inputs: tool and selection events, Preview Only changes
- Outputs: `StudioState.edit`; whole-state actions; the page change
- Invariants: selection at most 20 with a notice; Preview Only at most 50 with a refusal message; element keys survive a rebuild or are reported missing; opening Edit turns scripts off; nothing saved; existing tests pass unedited
- Files: `src/store/editSlice.ts`, `src/store/editActions.ts`, `src/store/useStudioStore.ts`, `src/store/previewSlice.ts`, `src/store/previewActions.ts`, `tests/editState.test.ts`
- Depends on: F8.3, F8.4, F7.8
- verify: `npm run typecheck && npx vitest run tests/editState.test.ts tests/store.test.ts tests/previewState.test.ts tests/workStorage.test.ts`

### F8.6 — Browser adapter and controller
- Inputs: pointer, keyboard, and field events; the preview document
- Outputs: live style changes; the commit pipeline; selection and scroll restore; the layout re-check; suggestions
- Invariants: the only writes to the preview are `style.setProperty` and `style.removeProperty` with validated values on known `data-pb` numbers; one live update per frame; commits only on release, blur, Enter, or `change`; offsets rewritten from the end of the file backwards; everything released on close, rebuild, and unmount; no fetch or AI import
- Files: `src/edit/previewEditDom.ts`, `src/hooks/useEditPad.ts`, `tests/editController.test.ts`
- Depends on: F8.2, F8.3, F8.4, F8.5, F7.9
- verify: `npm run typecheck && npx vitest run tests/editController.test.ts`

### F8.7 — Panel components and overlay
- Inputs: props only
- Outputs: the Edit panel, tools, property form, selection details, Preview Only list, layout block, overlay, page selector
- Invariants: text rendered as text; labelled inputs with units and ranges; only Undo and Redo act on History; no Apply, Approve, Reject, Pause, Resume, or Step button; black and white only, no transition or animation
- Files: `src/components/EditPanel.tsx`, `src/components/EditTools.tsx`, `src/components/PropertyForm.tsx`, `src/components/SelectionInfo.tsx`, `src/components/PreviewOnlyList.tsx`, `src/components/LayoutFixList.tsx`, `src/components/EditOverlay.tsx`, `src/components/PageSelect.tsx`, `src/styles.css`, `tests/editUi.test.tsx`
- Depends on: F8.1, F8.5
- verify: `npm run typecheck && npx vitest run tests/editUi.test.tsx`

### F8.8 — Wiring and the Page selector
- Inputs: the controller, the Sandbox panel
- Outputs: the Edit panel for the Edit toolbar button; the overlay above the iframe in Edit mode; the Page selector; `useEditPad()` in `App`
- Invariants: no edit to any test beyond the named ones; Screens 4 and 5 have no Edit panel or overlay; choosing a page keeps History; opening Edit turns scripts off
- Files: `src/components/StudioLayout.tsx`, `src/components/SandboxPanel.tsx`, `src/components/PreviewToolbar.tsx`, `src/App.tsx`, `src/styles.css`, `tests/editUi.test.tsx`
- Depends on: F8.6, F8.7, F7.10
- verify: `npm run typecheck && npx vitest run && npm run build`
- manual gate (Unverified until run): the drawing browser run in `requirements.md` section 6, item 11

### F8 as built (2E-2)
- The Preview Only / Edit pad link uses a small `previewInfoStore` (plain data) and a `previewHandle` (the iframe, the layout re-check); the overlay reads the frame's current document at event time.
- Placeholder images are annotated so their start tags can be edited; recorded sizes win over the placeholder's default size.
- The edit key is `edit:<path>:<hash of the selected keys>` (fixed length). Undo closes the key (2F: it ends with `#u` instead of being removed), so editing after an undo or redo starts a new entry while the entry stays marked as your edit.
- Existing styles containing quotes or `!important` are "too complex". Background selects the page's top-level elements (the body is not in the element table).
- Existing tests edited (named): the 2E-1 workbench test (elements are now annotated, never mappable) and the preview stub in `tests/sandboxUi.test.tsx` (new `setEntry`).

### F8 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- Sub-phase 2E-2 gate (build-phases.md): no edit changes anything except the in-memory practice copy; unmapped changes never reach the code; every recorded change can be undone

---

> plan_id: `P2F-JOURNAL` — Journal and Export (spec `.kiro/specs/09-journal-export/`). Active product phase: Phase 2, Sub-phase 2F. Status: draft for approval; no node is approved for modification. Depends on 2A to 2E-2 being built. PatchBay's own screens stay black-and-white wireframe with no animation, `AI_MODE=mock` only, no new dependency, no network and no AI call. The Journal and the exports only read existing state. `scripts/traceability/*` do not exist, so `verify:` commands call npm/vitest directly.

## F9 — Journal and Export
Contract: The Journal panel explains the loaded project at three reading levels (Simple, Practical, Deeper) using fixed lessons and facts PatchBay already holds: an application overview, step-by-step flow traces that stop honestly, lessons for the findings that were actually found, and 12 concept cards. Three downloads leave PatchBay as local files only: a git-style patch of the approved applied changes (combined per file, verified, with honest exclusions), a log summary (Markdown and JSON), and a Journal copy (Markdown). The only new saved item is the reading level. No AI, no network, no push to GitHub, no repository change. The sub-phase ends with the full Phase 2 regression test.

### F9.1 — Limits, lesson rules, concept lessons
- Inputs: none
- Outputs: `JOURNAL_LIMITS`; the playbook schema, the one playbook file with the 12 concept cards, and the lookups `cardById`, `cardsForSkill`, `cardsByTag`, `searchCards`; `checkLessonText`
- Invariants: all cards live in one structured file with a version, tags, keywords, and a one-line summary; a strict schema and the same tests validate every card, so new cards (including the reserved `edge_case` kind) are easy to add safely; every card has three levels that meet the Simple, Practical, and Deeper writing rules; no jargon at Simple; no command, URL, code snippet, or banned phrase; every related id exists; the lookups let Phase 3 read matching cards directly with no database; data only
- Files: `src/config/journalLimits.ts`, `src/skillbook/playbookSchema.ts`, `src/skillbook/playbook.ts`, `src/skillbook/playbookLookup.ts`, `src/skillbook/index.ts`, `src/journal/lessonRules.ts`, `tests/lessonRules.test.ts`, `tests/playbook.test.ts`
- Depends on: F5.1, F6.1
- verify: `npm run typecheck && npx vitest run tests/lessonRules.test.ts tests/playbook.test.ts tests/skillbook.test.ts tests/scanSkills.test.ts`

### F9.2 — Check cards and the sorting card
- Inputs: the 17 scan skills
- Outputs: 17 check cards and one sorting card in the playbook, at three levels
- Invariants: exactly one lesson per scan skill; the secret lesson never shows an example secret; the layout lesson says the finding was measured; no claim of security, no score
- Files: `src/skillbook/playbook.ts`, `tests/playbook.test.ts`
- Depends on: F9.1
- verify: `npm run typecheck && npx vitest run tests/playbook.test.ts tests/lessonRules.test.ts`

### F9.3 — Package facts and the overview
- Inputs: loaded files and existing results
- Outputs: `OverviewFacts`; the overview parts at each level
- Invariants: only `package.json` names are read (never script commands or versions); every sentence comes from a template; Inferred facts are worded "probably" only at Practical and Deeper; facts are redacted and counted; the overview says it describes only the files PatchBay read; pure
- Files: `src/journal/packageFacts.ts`, `src/journal/overview.ts`, `tests/packageFacts.test.ts`, `tests/overview.test.ts`
- Depends on: F9.1, F5.6, F6.5, F7.4
- verify: `npm run typecheck && npx vitest run tests/packageFacts.test.ts tests/overview.test.ts`

### F9.4 — Flow traces
- Inputs: the 2C connections and the inventory
- Outputs: page, request, route, and setting flows with honest stops
- Invariants: a step is always a real connection with its certainty word; every stop uses a fixed sentence; bounded and deterministic; cycles do not loop; setting values are never shown
- Files: `src/journal/flows.ts`, `tests/flows.test.ts`
- Depends on: F9.1, F5.5
- verify: `npm run typecheck && npx vitest run tests/flows.test.ts`

### F9.5 — Journal model and Journal export
- Inputs: the overview facts, flows, findings (text and measured), Needs Review files, the level
- Outputs: `JournalModel`; the Journal Markdown
- Invariants: lessons only for findings that exist; at most 5 instances each with a "more" count; secrets named by kind only; no snippets; the same inputs give the same model object; builds in under 500 ms for 2,000 files; the export is cut at a section boundary above 200 KB
- Files: `src/journal/journalModel.ts`, `src/export/journalExport.ts`, `tests/journalModel.test.ts`, `tests/journalExport.test.ts`
- Depends on: F9.2, F9.3, F9.4
- verify: `npm run typecheck && npx vitest run tests/journalModel.test.ts tests/journalExport.test.ts`

### F9.6 — Multi-hunk diff and the patch export
- Inputs: loaded originals, effective content, applied History entries
- Outputs: unified diffs with several hunks; the patch plan; the patch text
- Invariants: every diff applies with two independent appliers and reverses exactly; each file is verified before it is offered; files with partial content, special-character paths, no net change, a failed self-check, a likely secret, or past the size limit are excluded with fixed reasons; only applied entries are exported, never Preview Only or undone changes; files with practice changes are unchecked by default; nothing is mutated
- Files: `src/export/diffLines.ts`, `src/export/unifiedDiff.ts`, `src/export/patchExport.ts`, `tests/diffLines.test.ts`, `tests/unifiedDiff.test.ts`, `tests/patchExport.test.ts`
- Depends on: F4.1, F8.2, F8.4
- verify: `npm run typecheck && npx vitest run tests/diffLines.test.ts tests/unifiedDiff.test.ts tests/patchExport.test.ts tests/diffApply.test.ts`

### F9.7 — Log export, names, download helper, export actions
- Inputs: the session log, History, counts, a clock
- Outputs: log Markdown and JSON; file names; a safe download helper; export Log entries
- Invariants: every string redacted with a note; no snippet, diff, value, or file content; downloads are `text/plain` Blobs with no navigation and the URL released; a failed download writes no Log entry; Log entries hold counts and the level only
- Files: `src/export/logExport.ts`, `src/export/exportName.ts`, `src/export/download.ts`, `src/store/exportActions.ts`, `tests/logExport.test.ts`, `tests/download.test.ts`, `tests/exportActions.test.ts`
- Depends on: F9.5
- verify: `npm run typecheck && npx vitest run tests/logExport.test.ts tests/download.test.ts tests/exportActions.test.ts`

### F9.8 — Preference and the Journal store
- Inputs: the chosen reading level; lesson focus requests
- Outputs: the saved level (`patchbay.journal.v1`); `openLesson`
- Invariants: strict record; bad or blocked storage gives Simple without error; nothing else is saved; the focus lesson is never saved; `openLesson` opens the Journal panel on Screen 3
- Files: `src/store/journalPrefs.ts`, `src/hooks/useJournal.ts`, `tests/journalPrefs.test.ts`
- Depends on: F3.1, F3.2, F4.5
- verify: `npm run typecheck && npx vitest run tests/journalPrefs.test.ts tests/layoutState.test.ts`

### F9.9 — Components
- Inputs: props only
- Outputs: the Journal panel and parts; the History export section; the Log export buttons; the export button
- Invariants: text rendered as text; the level buttons use `aria-pressed`; export buttons disabled with their reason; no Apply, Approve, Reject, Pause, Resume, or Step button added; black and white only, no transition or animation
- Files: `src/components/JournalPanel.tsx`, `src/components/LevelPicker.tsx`, `src/components/OverviewSection.tsx`, `src/components/FlowsSection.tsx`, `src/components/LessonsSection.tsx`, `src/components/ConceptsSection.tsx`, `src/components/JournalDownload.tsx`, `src/components/ExportChanges.tsx`, `src/components/LogExportButtons.tsx`, `src/components/ExportButton.tsx`, `src/styles.css`, `tests/journalUi.test.tsx`
- Depends on: F9.5, F9.6, F9.7, F9.8
- verify: `npm run typecheck && npx vitest run tests/journalUi.test.tsx`

### F9.10 — Wiring and the full Phase 2 test
- Inputs: the Studio, the panels, the finding detail
- Outputs: the Journal for the Journal button; export sections in History and Log; Learn more on findings; the end-to-end test
- Invariants: only the named placeholder and History-button assertions in existing tests change; `PlaceholderPanel.tsx` is deleted (approved) once nothing imports it; the end-to-end test shows History, practice copy, findings, and exports agree and no secret appears in any export
- Files: `src/components/StudioLayout.tsx`, `src/components/HistoryPanel.tsx`, `src/components/LogPanel.tsx`, `src/components/FindingDetail.tsx`, `src/App.tsx`, `src/components/PlaceholderPanel.tsx` (delete), `src/styles.css`, `tests/journalUi.test.tsx`, `tests/phase2Flow.test.ts`
- Depends on: F9.9, F3.5, F6.11, F7.10, F8.8
- verify: `npm run typecheck && npx vitest run && npm run build`
- manual gate (Unverified until run): the `git apply` check, the browser run, and the Phase 2 regression in `requirements.md` section 6, items 6, 14, and 15

### F9 as built (2F)
- Test files follow design section 4.1 with these names: `lessons`, `journal` (overview, flows, lessons on the samples), `lessonRules` checks are in `lessons`, `multiHunkDiff` (the existing spec-02 `unifiedDiff.test.ts` is kept unchanged), `patchSelfCheck` (the self-check with a mocked applier), plus `packageFacts`, `flows`, `journalExport` (also the model), `diffLines`, `patchExport`, `logExport` (also file names), `download`, `exportActions`, `journalPrefs`, `journalUi`, `phase2Flow`.
- A second, general test-side applier `tests/helpers/applyHunks.ts` is used, because the spec-02 helper only handles one line inserted at the top.
- The saved key is `patchbay.journal.v1` (R11.1). The sorting card id is `lesson.sorting.unsure`.
- **Open in viewer** did not exist after 2E-1, so 2F adds `requestViewer(path, line)` and `viewerTarget` to `src/edit/previewHandle.ts`; `SandboxPanel` switches to Source mode and passes `highlight` to the existing `SourceViewer` (the isolation files are unchanged). The line is marked with `>>`; the viewer does not scroll to it.
- Undo now closes the Edit pad key (`#u`) instead of removing it (`src/store/workSlice.ts`), so an undone and redone edit is still exported as **Your edits**. The 2E-2 test that asserted the key was removed now asserts the closed key and that a new edit does not merge.
- **Learn more** is on the Screen 5 finding detail (Screen 4 has no finding detail). `DomainScreen` passes it through.
- Request flow titles use the matched route target ("Request: PUT /api/profile/1" is the call; the route step names "PUT /api/profile/:id").
- The Journal download includes a "Related concepts" section for concepts linked from the lessons (R9.1) and the export time (R9.2).
- Flow strings (paths, titles, stop sentences, notes) are redacted in the model like every other fact. Patch and Journal size caps count UTF-8 bytes; the patch stops at the first file that does not fit and excludes every later one.
- The Myers trace keeps only the band of diagonals it needs per step (memory about D squared).
- No UI path can put a likely secret into History (2D and 2E-2 refuse such changes), so the patch secret exclusion is defence in depth and is proved by unit tests only.

### F9 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- Sub-phase 2F gate (build-phases.md): all earlier gates pass again, zero console errors

---

> plan_id: `P2G-SESSION` — Session Restore (spec `.kiro/specs/10-session-restore/`). Active product phase: Phase 2, Sub-phase 2G (the last sub-phase of Phase 2). Status: draft for approval; no node is approved for modification. Depends on 2A to 2F being built. PatchBay's own screens stay black-and-white wireframe with no animation, `AI_MODE=mock` only, no new dependency, no AI call, and no network use except the existing repository loading that a restore re-runs. The 2E-1 isolation files are read only. `scripts/traceability/*` do not exist, so `verify:` commands call npm/vitest directly.

## F10 — Session Restore
Contract: After a browser refresh PatchBay reloads the saved repository address through the normal Loading screen, then restores the screen and the Sandbox settings and lets the earlier sub-phases restore the layout, History, Log, paused practice run, label corrections, and reading level. A small session record (`patchbay.session.v1`) holds only the address, the screen, the Sandbox settings, and two counts. Cancel and failures keep everything and offer Retry, Resume, Reset session, and Back to Start. Back to Start deletes only the session record. Reset session (with confirmation) wipes the session, work, and corrections and keeps the preferences. A "Saved in this browser" block lists what is stored. The sub-phase ends with the Phase 2 exit tests: a refresh matrix, rapid-action tests, and a storage privacy test. Never any secret, file content, or AI text in storage.

### F10.1 — Limits, record, storage helpers, saved-data inventory
- Inputs: the studio, shell, and preview state; a storage object
- Outputs: `SessionRecordSchema`, `validateTarget`, `toIngestTarget`, `loadSession`, `saveSession`, `clearSessionRecord`, `clearAllSession`, `describeSavedData`, `buildSessionRecord`
- Invariants: strict schema with bounds and no extra or secret-like field; at most 4 KB; the record is never built while a load or restore runs or off the Studio; the mode, page, and component are saved only when the user chose them; storage helpers never throw; `clearAllSession` removes exactly the three session keys; the inventory shows sizes and fixed descriptions only
- Files: `src/config/sessionLimits.ts`, `src/store/sessionRecord.ts`, `tests/sessionRecord.test.ts`, `tests/sessionBuild.test.ts`, `tests/savedData.test.ts`
- Depends on: F3.1, F4.6
- verify: `npm run typecheck && npx vitest run tests/sessionRecord.test.ts tests/sessionBuild.test.ts tests/savedData.test.ts`

### F10.2 — Restore store and reset action
- Inputs: restore events
- Outputs: `SessionStoreState` and pure transitions; `resetSessionState`; the session Log lines
- Invariants: transitions ignore a run that is not the pending one; failed and cancelled keep the record; the reset keeps the ingestion run counter and clears every slice and the log; Log lines hold names and counts only
- Files: `src/store/sessionStore.ts`, `src/store/sessionActions.ts`, `tests/sessionStore.test.ts`
- Depends on: F10.1
- verify: `npm run typecheck && npx vitest run tests/sessionStore.test.ts tests/store.test.ts`

### F10.3 — Persistence subscriber
- Inputs: the studio, shell, and session stores
- Outputs: record writes
- Invariants: writes only when the content changed and never while a load runs, a restore is pending, or on the Start screen; never deletes; at most one write per distinct content under rapid changes; blocked storage never throws; subscriptions released
- Files: `src/store/sessionPersistence.ts`, `tests/sessionPersistence.test.ts`
- Depends on: F10.1, F10.2
- verify: `npm run typecheck && npx vitest run tests/sessionPersistence.test.ts`

### F10.4 — Controller, `ingestion.restore`, apply, Back to Start, Reset session
- Inputs: the saved record, the ingestion controller, the stores
- Outputs: automatic restore at startup, Resume, Cancel and failure handling, apply of the screen and Sandbox settings with Log lines, Back to Start, Reset session
- Invariants: starts once per page load; a failed or cancelled restore leaves the record and the other slots untouched; apply happens once, only for the matching run and repository, after the preview is initialised or after 3,000 ms; Back to Start deletes only the session record; Reset session deletes exactly three keys and keeps the preferences; no automatic retry; no network call of its own
- Files: `src/hooks/useIngestion.ts`, `src/hooks/useSessionRestore.ts`, `src/store/previewSlice.ts`, `src/store/previewActions.ts`, `src/hooks/usePreview.ts`, `tests/sessionApply.test.ts`, `tests/sessionReset.test.ts`, `tests/useIngestion.test.ts`
- Depends on: F10.1, F10.2, F10.3, F5.8, F7.8, F7.9, F8.5
- verify: `npm run typecheck && npx vitest run tests/sessionApply.test.ts tests/sessionReset.test.ts tests/useIngestion.test.ts tests/previewState.test.ts tests/previewController.test.ts`

### F10.5 — Scan on Screen 5
- Inputs: opening Screen 5
- Outputs: the 2D scan `ensure()` also runs on Screen 5
- Invariants: never on Screen 3 or during loading; no second scan when one exists or runs; only the one named 2D assertion changes
- Files: `src/components/DomainScreen.tsx`, `tests/crewUi.test.tsx`, `tests/scanController.test.ts`
- Depends on: F6.9, F6.11
- verify: `npm run typecheck && npx vitest run tests/crewUi.test.tsx tests/scanController.test.ts`

### F10.6 — Components
- Inputs: props only
- Outputs: `ResumeBanner`, `SavedDataPanel`, `ResetSessionButton` (with confirmation), `RestoreNotice`
- Invariants: text rendered as text; only Yes, reset acts; no stored value shown, only sizes and fixed descriptions; black and white only, no transition or animation; no Apply, Approve, Reject, Pause, Resume, or Step button
- Files: `src/components/ResumeBanner.tsx`, `src/components/SavedDataPanel.tsx`, `src/components/ResetSessionButton.tsx`, `src/components/RestoreNotice.tsx`, `src/styles.css`, `tests/sessionUi.test.tsx`
- Depends on: F10.1, F10.2
- verify: `npm run typecheck && npx vitest run tests/sessionUi.test.tsx`

### F10.7 — Wiring and restore integration test
- Inputs: the controller and components
- Outputs: the Start, Loading, and Studio screens with the new controls; `useSessionRestore` and persistence in `App`
- Invariants: no existing test edited beyond the one named in F10.5; Screens 4 and 5 unchanged; Back to Start and Reset session effects match the rules table; an end-to-end restore on the samples and a scoped load matches the pre-refresh state
- Files: `src/components/StartScreen.tsx`, `src/components/LoadingScene.tsx`, `src/components/StudioLayout.tsx`, `src/components/ProjectInfo.tsx`, `src/App.tsx`, `src/styles.css`, `tests/sessionUi.test.tsx`, `tests/sessionRestore.test.ts`
- Depends on: F10.4, F10.5, F10.6
- verify: `npm run typecheck && npx vitest run && npm run build`

### F10.8 — Phase 2 exit tests
- Inputs: the whole app at store level with fakes
- Outputs: the refresh matrix, the rapid-action test, and the storage privacy test
- Invariants: for each scenario the restorable state after a refresh equals the state before and the non-restorable items are absent with their Log lines; 1,000 or more random actions with periodic refreshes keep every earlier invariant and bound the writes; only the five known keys are written and no stored value holds file content, a secret, an instruction, a preview document, or a snippet; no source file changes in this task
- Files: `tests/refreshMatrix.test.ts`, `tests/phase2Rapid.test.ts`, `tests/storagePrivacy.test.ts`, `tests/helpers/sessionHarness.ts`
- Depends on: F10.7
- verify: `npm run typecheck && npx vitest run tests/refreshMatrix.test.ts tests/phase2Rapid.test.ts tests/storagePrivacy.test.ts`
- manual gate (Unverified until run): the browser refresh matrix and the Phase 2 exit evidence in `requirements.md` section 6, items 14 and 15

### F10 as built (2G)
- `ingestion.restore(target)` validates with the same schema as the record and starts a foreground load. The session controller lives in `src/hooks/useSessionRestore.ts`; the app starts the restore in a 0 ms timer after the mount settles, because React's StrictMode double effect disposes the ingestion controller once and would cancel a restore started in the first pass.
- The session controller also has `retry()` (the failure panel's Retry re-runs the same restore; the ingestion retry would start an unrelated run id).
- The persistence subscriber captures the target of the load that produced each snapshot, so a failed, cancelled, or dismissed folder reload never changes the saved scope.
- A restore whose loaded snapshot is a different repository (for example renamed on GitHub) applies nothing and writes no restore line.
- The component key is saved as `path#Name` (a safe path and an identifier) and restored only when `findComponents` still finds it in that file.
- `ResetSessionButton` uses a props-only `ResetSessionView`. Learn more and the Screen 5 scan both pass through `DomainScreen`'s `live` prop.
- Existing tests changed: only `tests/useIngestion.test.ts` (an appended `restore` block). The 2D Screen 4 assertion needed no change (effects do not run in the server-render tests); the Screen 5 start is checked by `tests/screen5Scan.test.ts` and the browser matrix.
- Known limit (2B and 2E-1 rule): while another repository's real work holds the 2B slot, Log lines alone never replace it, so a repository with no real work yet does not get its Log back after a refresh. The rapid-action test checks the Log exactly whenever the slot is the current repository's.

### F10 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- Sub-phase 2G gate (build-phases.md): refresh returns to the same screen with the same work; no secrets or file contents in storage; a failed reload shows a clear error and a reset path
- Phase 2 exit gate (build-phases.md, original): every interactive control updates state predictably; state survives a page refresh and handles rapid repeated clicks without desyncing or crashing

---

> **Phase 2 complete.** Sub-phases 2A to 2G (F3 to F10) are built, tested, reviewed, and merged into `main` (see `PHASE_2_REPORT.md`; 92 test files, 1,666 tests at the end of 2G). The user moved the active phase to **Phase 3 (Sub-phase 3A)** on 2026-11-26. F3 to F10 below are the as-built record and are not open for change except where a spec lists a deliberate change.

---

> plan_id: `P3A-LIVE-CHAT` — Live AI in AI Chat (spec `.kiro/specs/11-live-ai-chat/`). Active product phase: Phase 3, Sub-phase 3A. Status: built (L1 to L12); see `PHASE_3A_REPORT.md`. Black-and-white wireframe, no animation, `AI_MODE=mock` stays the default, no new runtime dependency, free tiers only. `scripts/traceability/*` do not exist, so `verify:` commands call npm/vitest directly.

## F11 — Live AI in AI Chat
Contract: With `AI_MODE=live`, AI Chat answers come from a free provider chain (Gemini, Groq, OpenRouter) through a Model Router, using a Context Engine that sends the smallest useful redacted context and a session cache. The AI can start safe actions and propose changes that enter the existing Approve, Reject, and Undo flow. Mock mode is unchanged. No change is applied without Approve, and only the practice copy changes.

### F11.1 — Contracts, validators, limits, provider table, mock `act` branch
- Inputs: an AI request or result, the environment names
- Outputs: the extended schemas (`act`, `skillId`, `connections`, `startLine`, `action`, `meta`), `AI_LIVE`, the provider table
- Invariants: mock output is byte-identical for every Phase 2 input; `approve`, `reject`, and `reset` can never be an action; `action` is valid only for `act` with no snippets; no key value anywhere in config
- Files: `src/types/contracts.ts`, `src/engine/aiValidate.ts`, `src/engine/mockAssistant.ts`, `src/config/aiLive.ts`, `src/config/aiProviders.ts`, `src/config/budgets-proxy.ts`, `tests/aiContracts.test.ts`, `tests/aiValidate.test.ts`, `tests/mockAssistant.test.ts`, `tests/aiLiveConfig.test.ts`, `tests/aiProviderConfig.test.ts`
- Depends on: F2.1, F2.3
- verify: `npm run typecheck && npx vitest run tests/aiContracts.test.ts tests/aiValidate.test.ts tests/mockAssistant.test.ts tests/aiLiveConfig.test.ts tests/aiProviderConfig.test.ts`

### F11.2 — Card picker and prompt builder
- Inputs: a request, the playbook, a tier
- Outputs: at most 2 cards; a prompt string
- Invariants: cards are chosen on the server only; the prompt never exceeds 12,000 characters; question and snippets stay in their data sections; no secret reaches the prompt
- Files: `src/engine/live/cardPicker.ts`, `src/engine/live/promptBuilder.ts`, `tests/cardPicker.test.ts`, `tests/promptBuilder.test.ts`
- Depends on: F11.1, F9.1
- verify: `npm run typecheck && npx vitest run tests/cardPicker.test.ts tests/promptBuilder.test.ts`

### F11.3 — Answer parser, edits to diff, provider adapters
- Inputs: model text; a prompt; a key and model
- Outputs: a validated `AIResponse` or `bad_answer`; a provider result with an outcome word
- Invariants: the model never writes diff headers; a diff applies to the snippet and reverses exactly; the key is only in a header; fixed endpoints; no provider body in any message
- Files: `src/engine/live/answerParser.ts`, `src/engine/live/providers.ts`, `tests/answerParser.test.ts`, `tests/liveProviders.test.ts`, `tests/helpers/fakeProviders.ts`
- Depends on: F11.1, F11.2
- verify: `npm run typecheck && npx vitest run tests/answerParser.test.ts tests/liveProviders.test.ts`

### F11.4 — Model Router and live assistant
- Inputs: a request, the providers' settings, a clock, a signal
- Outputs: an `AIResult` with `meta`, or a coded failure
- Invariants: fixed order; 429 skips the provider for the request; no same-model retry; 15 s per attempt and 25 s total; heavy falls to light only after all heavy fail and sets `lighter`
- Files: `src/engine/live/modelRouter.ts`, `src/engine/live/liveAssistant.ts`, `tests/modelRouter.test.ts`, `tests/liveAssistant.test.ts`
- Depends on: F11.1, F11.2, F11.3
- verify: `npm run typecheck && npx vitest run tests/modelRouter.test.ts tests/liveAssistant.test.ts`

### F11.5 — `/api/assistant` live mode and status
- Inputs: HTTP request, environment
- Outputs: `200` result, `GET` status, or a coded error
- Invariants: mock path unchanged and reads only `AI_MODE`; live with no provider is `503 unsupported` and never a mock answer; the status returns no key or model; logs hold codes only
- Files: `api/assistant.ts`, `vite.config.ts`, `.env.example`, `README.md`, `tests/assistantApi.test.ts`, `tests/assistantApiLive.test.ts`
- Depends on: F11.4, F2.4
- verify: `npm run typecheck && npx vitest run tests/assistantApi.test.ts tests/assistantApiLive.test.ts`

### F11.6 — Context Engine
- Inputs: a snapshot, chosen paths, a finding, the contents flag, the connection analysis
- Outputs: paths, snippets, up to 3 connection facts, a skill id, notes
- Invariants: no snippet unless the contents box is ticked; whole file only when at most 2 KB; connection facts never hold source text; redacted
- Files: `src/engine/contextEngine.ts`, `tests/contextEngine.test.ts`
- Depends on: F11.1, F5.5
- verify: `npm run typecheck && npx vitest run tests/contextEngine.test.ts`

### F11.7 — Session cache
- Inputs: a request and a live result
- Outputs: a stored or reused result
- Invariants: key includes every snippet fingerprint; failures, actions, and mock results are never stored; at most 30 entries and 256 KB; memory only
- Files: `src/engine/aiCache.ts`, `tests/aiCache.test.ts`
- Depends on: F11.1, F11.6
- verify: `npm run typecheck && npx vitest run tests/aiCache.test.ts`

### F11.8 — Client service, status, consent, controller, Log lines
- Inputs: form values, the store, the status endpoint
- Outputs: requests, results, slice changes, Log lines
- Invariants: a cache hit makes no network call; the notice gates the first live request; no question, snippet, or answer text in the Log or slice; command words never reach the AI
- Files: `src/engine/aiAssistant.ts`, `src/engine/aiStatus.ts`, `src/hooks/useAssistant.ts`, `src/store/aiSlice.ts`, `src/store/aiActions.ts`, `tests/aiAssistant.test.ts`, `tests/aiStatus.test.ts`, `tests/useAssistant.test.ts`, `tests/aiState.test.ts`
- Depends on: F11.5, F11.6, F11.7, F2.5, F2.6
- verify: `npm run typecheck && npx vitest run tests/aiAssistant.test.ts tests/aiStatus.test.ts tests/useAssistant.test.ts tests/aiState.test.ts tests/store.test.ts`

### F11.9 — Action policy, AI proposals into Approve, attempt cap
- Inputs: an AI result, the store state
- Outputs: a harness command, or a queued proposal, or a plain reason
- Invariants: an action can never approve, reject, or reset and never runs when snippets were sent; a queued AI change applies only after Approve, only to the practice copy, with a hash round-trip; at most 3 AI proposals per finding; a waiting AI proposal is never saved
- Files: `src/engine/aiActionPolicy.ts`, `src/engine/aiProposal.ts`, `src/store/aiProposalActions.ts`, `src/store/workSlice.ts`, `src/store/workActions.ts`, `tests/aiActionPolicy.test.ts`, `tests/aiProposal.test.ts`, `tests/aiProposalFlow.test.ts`
- Depends on: F11.1, F11.8, F4.4, F4.5
- verify: `npm run typecheck && npx vitest run tests/aiActionPolicy.test.ts tests/aiProposal.test.ts tests/aiProposalFlow.test.ts tests/workState.test.ts tests/workStorage.test.ts`

### F11.10 — The UI
- Inputs: the store, the controller
- Outputs: banner, notice, finding list, answers, proposal card
- Invariants: wireframe only; the existing mock line is unchanged; no Approve on a display-only patch; all AI text is React text; buttons at least 44 px
- Files: `src/engine/aiNotes.ts`, `src/components/AIStatusBanner.tsx`, `src/components/AINotice.tsx`, `src/components/FindingFocus.tsx`, `src/components/AIAssistantPanel.tsx`, `src/components/AIResponseView.tsx`, `src/components/ProposalCard.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/styles.css`, `tests/aiNotes.test.ts`, `tests/aiPanelLive.test.tsx`, `tests/aiResponseView.test.tsx`
- Depends on: F11.8, F11.9, F2.7, F4.8
- verify: `npm run typecheck && npx vitest run && npm run build`

### F11.11 — Privacy, injection, static, and exit-gate tests
- Inputs: the whole app at store level with fakes
- Outputs: the proofs
- Invariants: sentinels never leave the server or enter the Log, storage, cache, or errors; injection changes nothing; the three Phase 3 exit-gate items pass with fake providers
- Files: `tests/aiPrivacy.test.ts`, `tests/aiInjection.test.ts`, `tests/aiStatic.test.ts`, `tests/phase3aGate.test.ts`, `tests/helpers/aiHarness.ts`
- Depends on: F11.1 to F11.10
- verify: `npm run typecheck && npx vitest run tests/aiPrivacy.test.ts tests/aiInjection.test.ts tests/aiStatic.test.ts tests/phase3aGate.test.ts`

### F11 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- Phase 3 exit gate (build-phases.md), with fake providers: a deliberate bug is found, a valid patch is proposed and verified; the fix attempts halt at 3; a 429 on the primary falls back to the backup
- manual gate (Unverified until run): the browser run with a fake provider server, and your own real-key check (design section 14)

### F11 as built (3A)
- Defaults are Gemini `gemini-3.1-flash-lite` and `gemini-3.6-flash`, Groq `openai/gpt-oss-20b` and `openai/gpt-oss-120b`, OpenRouter `openrouter/free` for both tiers (verified against the providers' pages on 2026-11-26; real-key use is **Unverified**). Per attempt 15 s, whole request 25 s, browser wait 28 s (raised from 7 / 14 / 15 after a real heavy Gemini request timed out).
- A `plan` answer with no selected file becomes a `clarification` (design 9.2 said "fewer than 2 files"; a plan for one file is accepted).
- Stop rejects a waiting AI change even with no run (R9.7), but an AI-requested `stop` is refused while any change waits (review fix). `undo` and `redo` were removed from the AI's action list after review (user decision): only the user can change History.
- The AI proposal's History title is the fixed text "AI-proposed change to <path>" so no AI text is saved. The byline and the model's summary are shown only.
- Review fixes after the independent review: snippets are cut from the practice copy; the saved answers end on Approve, Undo, Redo, and any practice-copy change; file names sit inside a data block; a "Do something" request carries no connection facts; a held request is dropped when the AI panel is hidden; Send waits for the mode check; mock answers are never handed on.
- Existing tests changed (design 4.3): `assistantApi`, `aiContracts`, `aiValidate`, `mockAssistant`, `aiAssistant`, `aiState`, `useAssistant`, `aiResponseView`, `harnessUi` (appended blocks, plus the 405 and 501 assertions in `assistantApi`).
- Static test: provider host names appear only in `src/config/aiProviders.ts`; key variable names also appear in `liveAssistant.ts` and `aiNotes.ts` (setup text).
- After the first real-key run (a Gemini answer was refused with "gave an answer PatchBay could not use"): output caps raised to 1,500 (light) and 3,000 (heavy) because reasoning models count thinking tokens; a cut-off answer (`MAX_TOKENS` or `length`) is reported as such; every refusal now carries a fixed code word (for example `wrong_shape`), shown in plain words in the error and as `trace=` in the server log; unknown extra fields in a model answer are ignored (never copied); the one selected file may be written `./x`, `/x`, or `a/x`; a null `new_text` means delete the lines.

---

> plan_id: `P3B-LIVE-JOURNAL-CREW` — Live AI in the Journal and Skeleton Crew (spec `.kiro/specs/12-live-ai-journal-crew/`). Active product phase: Phase 3, Sub-phase 3B. Status: draft for approval; no node is approved for modification. Black-and-white wireframe, no animation, `AI_MODE=mock` stays the default, no new runtime dependency, free tiers only. `scripts/traceability/*` do not exist, so `verify:` commands call npm/vitest directly.

## F12 — Live AI in the Journal and Skeleton Crew
Contract: Next to the fixed Journal and crew text, buttons ask the live AI (3A router and Context Engine) to explain a lesson or flow in your project, review a finding, and (one opt-in request) narrate up to 8 findings. The AI text is shown in labelled blocks, kept in memory only, never in the Log, storage, or any download. A hand-off button opens AI Chat prefilled for a fix and sends nothing. Nothing here can change a file.

### F12.1 — Contracts, validators, limits, mock `narrate`
- Inputs: an AI request or result
- Outputs: the extended schemas (`level`, `findings`, task `narrate`, answer `narration`, 6 facts) and limits
- Invariants: `findings` only for `narrate` and each path is selected; a narration answer has exactly one line per finding; chat requests are unchanged; mock output for every earlier input is byte-identical
- Files: `src/types/contracts.ts`, `src/config/aiLive.ts`, `src/engine/aiValidate.ts`, `src/engine/mockAssistant.ts`, `tests/aiContracts.test.ts`, `tests/aiValidate.test.ts`, `tests/mockAssistant.test.ts`, `tests/aiLiveConfig.test.ts`
- Depends on: F11.1
- verify: `npm run typecheck && npx vitest run tests/aiContracts.test.ts tests/aiValidate.test.ts tests/mockAssistant.test.ts tests/aiLiveConfig.test.ts`

### F12.2 — Server: prompt, narration answer, cards rule, cache key
- Inputs: a request with a level or findings
- Outputs: a prompt with LEVEL and FINDINGS data blocks; a mapped `narration` answer
- Invariants: findings text and paths sit inside data blocks; a wrong line count, patch, action, or plan for `narrate` is refused; no cards for `narrate`; the cache key holds the level and the ordered findings
- Files: `src/engine/live/promptBuilder.ts`, `src/engine/live/answerParser.ts`, `src/engine/live/liveAssistant.ts`, `src/engine/aiCache.ts`, `tests/promptBuilder.test.ts`, `tests/answerParser.test.ts`, `tests/liveAssistant.test.ts`, `tests/aiCache.test.ts`
- Depends on: F12.1, F11.2, F11.3, F11.4, F11.7
- verify: `npm run typecheck && npx vitest run tests/promptBuilder.test.ts tests/answerParser.test.ts tests/liveAssistant.test.ts tests/aiCache.test.ts`

### F12.3 — Context Engine additions, request builders, level note
- Inputs: a lesson, a flow, a finding, or a findings list, the level, the switch
- Outputs: a validated `AIRequest`; a soft note
- Invariants: code lines only with the switch and never for narration; up to 6 facts for a flow, 3 for a finding; at most 8 findings; fixed instruction texts; the note never causes a retry
- Files: `src/engine/contextEngine.ts`, `src/engine/explainRequests.ts`, `src/engine/levelNote.ts`, `tests/contextEngine.test.ts`, `tests/explainRequests.test.ts`, `tests/levelNote.test.ts`
- Depends on: F12.1, F11.6, F9.1
- verify: `npm run typecheck && npx vitest run tests/contextEngine.test.ts tests/explainRequests.test.ts tests/levelNote.test.ts`

### F12.4 — Controller `sendBuilt`, origin, explain store, `heldOrigin`
- Inputs: a built request and its origin
- Outputs: AI slice and explain store changes, Log lines
- Invariants: one request at a time across chat and 3B; a held request never fires late; the explain store is memory only with at most 12 entries; answers end on a snapshot change, a practice change, reset, and a mode change; AI Chat shows only chat results
- Files: `src/store/explainStore.ts`, `src/store/aiSlice.ts`, `src/store/aiActions.ts`, `src/hooks/useAssistant.ts`, `src/components/AIAssistantPanel.tsx`, `tests/explainStore.test.ts`, `tests/useAssistant.test.ts`, `tests/aiState.test.ts`, `tests/aiPanelLive.test.tsx`
- Depends on: F12.1, F12.3, F11.8
- verify: `npm run typecheck && npx vitest run tests/explainStore.test.ts tests/useAssistant.test.ts tests/aiState.test.ts tests/aiPanelLive.test.tsx`

### F12.5 — The explainer, availability, and the chat prefill
- Inputs: button presses and the current state
- Outputs: requests sent through `sendBuilt`; a prefill for AI Chat
- Invariants: the hand-off sends nothing and carries the finding id; the prefill is taken once; availability texts are fixed; narration is one request
- Files: `src/hooks/useExplainer.ts`, `src/store/chatPrefill.ts`, `src/engine/aiNotes.ts`, `tests/explainer.test.ts`, `tests/chatPrefill.test.ts`, `tests/aiNotes.test.ts`
- Depends on: F12.3, F12.4
- verify: `npm run typecheck && npx vitest run tests/explainer.test.ts tests/chatPrefill.test.ts tests/aiNotes.test.ts`

### F12.6 — The components
- Inputs: an explainer binding and its state
- Outputs: the block, switch, notice, and narration bar
- Invariants: props only; all AI text is React text; the heading says the AI text is not part of the lesson; no color or motion; buttons at least 44 px
- Files: `src/components/AIExplainBlock.tsx`, `src/components/ExplainSwitch.tsx`, `src/components/ExplainNotice.tsx`, `src/components/AINarrationBar.tsx`, `tests/explainUi.test.tsx`
- Depends on: F12.5, F11.10
- verify: `npm run typecheck && npx vitest run tests/explainUi.test.tsx`

### F12.7 — Wiring Journal, Screens 4 and 5, App, and the prefill
- Inputs: the explainer
- Outputs: buttons and blocks on the Journal and the crew screens; AI Chat prefilled by the hand-off
- Invariants: the `explain` prop is optional and screens without it render as before; the fixed text is untouched and first; the notice appears in one place; leaving a screen drops a held request
- Files: `src/components/LessonsSection.tsx`, `src/components/FlowsSection.tsx`, `src/components/JournalPanel.tsx`, `src/components/FindingDetail.tsx`, `src/components/DomainScreen.tsx`, `src/components/SkeletonCrewScreen.tsx`, `src/components/CrewNarration.tsx`, `src/components/StudioLayout.tsx`, `src/components/AIAssistantPanel.tsx`, `src/App.tsx`, `src/styles.css`, `tests/explainUi.test.tsx`, `tests/journalUi.test.tsx`, `tests/crewUi.test.tsx`
- Depends on: F12.6, F9.9, F6.10
- verify: `npm run typecheck && npx vitest run && npm run build`

### F12.8 — Privacy, injection, static, and exit-gate tests
- Inputs: the whole app at store level with fakes
- Outputs: the proofs
- Invariants: no AI text in the Log, storage, errors, or any download (downloads byte-identical); injection changes nothing; the 3B and 3A gates pass with fake providers
- Files: `tests/phase3bPrivacy.test.ts`, `tests/phase3bInjection.test.ts`, `tests/phase3bStatic.test.ts`, `tests/phase3bGate.test.ts`, `tests/helpers/aiHarness.ts`
- Depends on: F12.1 to F12.7
- verify: `npm run typecheck && npx vitest run tests/phase3bPrivacy.test.ts tests/phase3bInjection.test.ts tests/phase3bStatic.test.ts tests/phase3bGate.test.ts`

### F12 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- 3B gate (build-phases.md): all 3A gates pass again; the same privacy rules hold; no AI text in any download
- manual gate (Unverified until run): the browser run with a fake provider server, and your own real-key check (design section 13)
