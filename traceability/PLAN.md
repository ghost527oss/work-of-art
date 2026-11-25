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

### F5 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- Sub-phase 2C gate (build-phases.md): no guessed labels; low-confidence files go to Needs Review
