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
