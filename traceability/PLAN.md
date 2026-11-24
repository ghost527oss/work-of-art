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
- Files: `src/engine/unifiedDiff.ts`, `src/engine/mockAssistant.ts`, `tests/helpers/applyDiff.ts`, `tests/mockAssistant.test.ts`
- Depends on: F2.1, F2.2
- verify: `npx vitest run tests/mockAssistant.test.ts`

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
- Files: `src/components/AIAssistantPanel.tsx`, `src/components/AIResponseView.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/styles.css`
- Depends on: F2.6
- verify: `npm run typecheck && npx vitest run && npm run build`
- manual gate (Unverified until run): headless browser run for all four response types plus error, empty, pending, and cancel; zero console errors

### F2 gate
- verify: `npm run typecheck && npx vitest run && npm run build`
- Phase 1 core-loop evidence (with F1): live dev-server run of all four request shapes with no unhandled server error
