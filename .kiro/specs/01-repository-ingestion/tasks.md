# Tasks: 01 Repository Ingestion

Implements `design.md`. All tasks use `plan_id: P1-ING` and nodes from `traceability/PLAN.md`. Active product phase: Phase 1 (black-and-white wireframe, no AI, no animation).

## How each task runs

1. **Wait for your explicit "Go" naming the task.** A "Go" covers that one task only. It is not reused for the next task.
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F1.x` using the task's node.
3. Run the task's verify command after the last edit and report the real exit code and output.
4. Hand the diff to the `verification-agent` sub-agent for an independent check (diff hygiene, scope, phase rules).
5. Report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait.

Rules that apply to every task:
- If two consecutive verify runs fail on the same error, stop editing and hand a read-only diagnosis to `bug-auditor`. Wait for your approval before a third attempt.
- Add no dependency beyond the list in design section 3 without asking.
- Keep tests offline: all upstream calls go through the injected `fetch`.
- Never put secrets in source. `GITHUB_TOKEN` is read from the server environment only.
- `scripts/traceability/*` do not exist, so `record-go`, `can-modify`, drift, and `plan-check` cannot run. Approval is recorded in this chat and, if you want, in `traceability/ACTION_LOG.md` by hand.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| T1 | F1.0 | Project scaffold | none |
| T2 | F1.1 | Contracts, budgets, coverage consistency check | T1 |
| T3 | F1.2 | URL parsing and validators | T2 |
| T4 | F1.3 | Tree inventory | T2, T3 |
| T5 | F1.3 | File selection and load plan | T4 |
| T6 | F1.3 | Derived coverage | T5 |
| T7 | F1.4 | GitHub source client | T3, T6 |
| T8 | F1.4 | Ingestion pipeline and snapshot builder | T7 |
| T9 | F1.5 | NDJSON helpers and `/api/repo` handler | T8 |
| T10 | F1.5 | Dev-server middleware for `/api/repo` | T9 |
| T11 | F1.6 | Sample repositories | T8 |
| T12 | F1.6 | Client fetcher and fallback | T9, T11 |
| T13 | F1.7 | Store | T2 |
| T14 | F1.7 | Ingestion hook and wireframe screens | T12, T13 |
| T15 | F1 | Final gate and review | T1–T14 |

---

## T1. Project scaffold
- **plan_id:** P1-ING  **node_id:** F1.0
- **scope:** `package.json`, `tsconfig.json`, `vite.config.ts`, `vercel.json`, `index.html`, `.gitignore`, `src/main.tsx` (empty placeholder, replaced in T14)
- **goal:** A Vite + React + TypeScript project with strict TS, `"type": "module"`, scripts `dev`, `build`, `typecheck`, `test` (`vitest run --passWithNoTests`), and `vercel.json` with `supportsCancellation` on `api/*`. Install only the dependencies in design section 3 and record the exact installed versions in the report. `vite.config.ts` contains the React plugin and Vitest config only (the dev middleware comes in T10).
- **acceptance:** typecheck and build succeed; `node --version` is 20 or higher, or the task stops and reports.
- **verify:** `npm run typecheck && npm run build`
- **needs your OK:** this task runs `npm install` (network access to the npm registry).

## T2. Contracts, budgets, coverage consistency check
- **plan_id:** P1-ING  **node_id:** F1.1
- **scope:** `src/types/contracts.ts`, `src/config/budgets.ts`, `tests/contracts.test.ts`
- **goal:** Zod schemas and inferred types for everything in design section 6 (`RepoRequest` strict with optional `scope`, `RepoInventoryEntry` with `reasonCode`/`reason`, `RepoFile`, `RepoInventory`, `RepoCoverage`, `RepoSnapshot`, `RepoResponse`, `ApiError`, `IngestEvent`, `SessionLogEntry`, `ReasonCode`, `IngestStage`). `BUDGETS` with the values in design section 7 and `provisional: true`. `assertCoverageConsistent(snapshot)` that recomputes counts from entry statuses and throws on any mismatch, and checks the `sourceAnalysisComplete` rule.
- **acceptance:** valid objects parse; unknown fields on `RepoRequest` are rejected; scope longer than 20 entries is rejected; a snapshot with a wrong count fails `assertCoverageConsistent`; a snapshot with a deferred file and `sourceAnalysisComplete: true` fails.
- **verify:** `npm run typecheck && npx vitest run tests/contracts.test.ts`

## T3. URL parsing and validators
- **plan_id:** P1-ING  **node_id:** F1.2
- **scope:** `src/engine/repoUrl.ts`, `tests/repoUrl.test.ts`
- **goal:** `parseRepoInput(text)` returning `{ok:true, value:{owner,repo,ref?}}` or `{ok:false, message}`. Also exports `isValidOwner`, `isValidRepo`, `isValidRef`, `isSafeRepoPath` (used by the server schema and scope validation). Accepts `https://github.com/o/r`, trailing slash, `.git`, `/tree/{ref}` (refs with slashes), and `o/r` shorthand. Rejects other hosts, empty input, `..`, control characters, a leading `-` in ref, and over-length values.
- **acceptance:** cases for each rule in R1 pass; no function touches the network.
- **verify:** `npm run typecheck && npx vitest run tests/repoUrl.test.ts`

## T4. Tree inventory
- **plan_id:** P1-ING  **node_id:** F1.3
- **scope:** `src/engine/repoInventory.ts`, `tests/repoInventory.test.ts`
- **goal:** `buildInventory(treeEntries, {truncated, maxEntries})` returns a `RepoInventory`. One entry per blob (file) and per tree (directory). Submodules become a directory entry plus a tree warning. Mode `120000` is kept as a file entry for the selector to skip. Entries beyond `maxEntries` set `treeComplete=false` with a warning stating the count not represented. Every entry carries placeholder classification (`['unknown']`, `low`, no evidence). Output order is deterministic (sorted by path).
- **acceptance:** entry count equals input count when under the cap; truncated input sets `treeComplete=false` and a warning; over-cap input reports the exact omitted count; empty tree gives an empty valid inventory.
- **verify:** `npm run typecheck && npx vitest run tests/repoInventory.test.ts`

## T5. File selection and load plan
- **plan_id:** P1-ING  **node_id:** F1.3
- **scope:** `src/engine/fileSelector.ts`, `tests/fileSelector.test.ts`
- **goal:** `planLoading(inventory, {scope, budgets})` assigns each file the first matching rule from design section 9 (symlink, dependency, generated, minified, sourcemap, lockfile, media, unsupported type, hard ceiling, outside scope, candidate), ranks candidates (manifests, entry points, routes, source, styles, other), applies the total-budget cutoff using `min(size, maxFilePrefixBytes)`, and splits the result into batches. Returns updated entries (status, `reasonCode`, `reason`) and the ordered batches. Pure and deterministic.
- **acceptance:** each rule has a test; root files are always in scope; scope paths match by whole path segment (`src` does not match `src2`); budget cutoff marks the rest `budget_reached`; batch sizes never exceed `batchSize`; ranking order is stable.
- **verify:** `npm run typecheck && npx vitest run tests/fileSelector.test.ts`

## T6. Derived coverage
- **plan_id:** P1-ING  **node_id:** F1.3
- **scope:** `src/engine/fileSelector.ts` (add `computeCoverage`), `tests/fileSelector.test.ts` (add cases)
- **goal:** `computeCoverage(inventory, warnings)` counts entry statuses in one pass and fills every `RepoCoverage` field per design section 6, including `sourceAnalysisComplete`.
- **acceptance:** a table of generated inventories (all loaded, one deferred, one truncated, one failed, one `over_hard_ceiling`, one policy exclusion only, truncated tree) gives the expected counts and the expected `sourceAnalysisComplete`; every result passes `assertCoverageConsistent` from T2.
- **verify:** `npm run typecheck && npx vitest run tests/fileSelector.test.ts tests/contracts.test.ts`

## T7. GitHub source client
- **plan_id:** P1-ING  **node_id:** F1.4
- **scope:** `src/engine/githubSource.ts`, `tests/githubSource.test.ts` (new test file; PLAN.md F1.4 file list is updated with it)
- **goal:** `resolveDefaultBranch`, `fetchTree`, `fetchFileCapped` and an `IngestError` class carrying an `ApiErrorCode`. Takes injected `fetch`, optional token, `AbortSignal`. Builds URLs only on the two allowed hosts with every path segment encoded. Per-request timeout via `AbortSignal.timeout` combined with the caller signal; distinguishes timeout from caller abort. Maps statuses per design section 8.2 (404, 403/429 with reset time, 409 empty repository, other, malformed JSON). The token goes only to `api.github.com`. `fetchFileCapped` reads the response stream up to `maxFilePrefixBytes`, cancels the reader, and reports `truncated`, and flags NUL bytes in the first 8 KB.
- **acceptance:** tests with a mocked `fetch` cover every mapped status, token placement (present on API, absent on raw), URL encoding of odd paths, timeout versus abort, cap and truncation behavior, and binary detection.
- **verify:** `npm run typecheck && npx vitest run tests/githubSource.test.ts`

## T8. Ingestion pipeline and snapshot builder
- **plan_id:** P1-ING  **node_id:** F1.4
- **scope:** `src/engine/ingestPipeline.ts`, `tests/ingestPipeline.test.ts`
- **goal:** `runIngestion(request, deps)` runs resolve ref, tree, inventory, plan, batched loading, then builds the snapshot with `computeCoverage`. Emits events in order with a `progress` event after each batch. Applies the degrade rules: per-file failure continues, file-level rate limit stops loading and defers the rest with a warning, total deadline defers the rest with a warning. Abort rejects with `AbortError` and emits no `result`. Also exports `buildSnapshotFromFiles(meta, fileMap, budgets)` that runs the same plan and coverage steps on in-memory files (used by samples).
- **acceptance:** tests cover event order, empty repository, truncated tree, oversized file (truncated prefix), file above ceiling (skipped), failed file, mid-run rate limit, deadline, cancel, scope, and that the result passes `assertCoverageConsistent`. `done`/`result` is never emitted before the snapshot is built.
- **verify:** `npm run typecheck && npx vitest run tests/ingestPipeline.test.ts`

## T9. NDJSON helpers and `/api/repo` handler
- **plan_id:** P1-ING  **node_id:** F1.5
- **scope:** `src/engine/ndjson.ts`, `api/repo.ts`, `tests/repoApi.test.ts`
- **goal:** `encodeEvent` and `readEvents(response, signal)` (line-length cap, validates each event with the contract schema). `api/repo.ts` exports `handleRepoRequest(request, env)` and `export default { fetch }`. Behavior per design section 8.1: 405, 400 on size/content-type/JSON/strict schema, otherwise a `200` NDJSON stream; failures after that become `error` events; client disconnect aborts upstream work. Logs only the error code and repository name, never file content, tokens, or full payloads.
- **acceptance:** tests cover 405, oversized body, bad JSON, unknown field, valid stream with a mocked pipeline dependency, each error code arriving as an event, abort propagation, and a `console` spy proving no content or token appears in logs.
- **verify:** `npm run typecheck && npx vitest run tests/repoApi.test.ts`

## T10. Dev-server middleware
- **plan_id:** P1-ING  **node_id:** F1.5
- **scope:** `vite.config.ts`
- **goal:** A dev-only Vite plugin that serves `POST /api/repo` by loading `api/repo.ts` with `server.ssrLoadModule`, converting the Node request to a Web `Request`, and streaming the `Response` body back. Passes `process.env` to the handler and propagates client disconnect as an abort. Not included in production builds.
- **acceptance:** with the dev server running in the background, `curl` of a valid request to a tiny public repository streams NDJSON ending in a `result` event; an invalid body returns `400`; stop the server afterwards. This check needs live network access to GitHub. If the sandbox blocks it, the result is reported **Unverified** and a mocked-upstream curl is shown instead.
- **verify:** `npm run typecheck && npm run build`, plus the curl checks above.

## T11. Sample repositories
- **plan_id:** P1-ING  **node_id:** F1.6
- **scope:** `src/data/sampleRepos.ts`, `tests/samples.test.ts`
- **goal:** Three in-code sample file maps (static HTML/CSS/JS; React-style frontend; small full-stack with a Node route file) and `buildSampleSnapshot(id)` using `buildSnapshotFromFiles`. Each sample includes at least one path that is skipped by policy (for example a `node_modules` entry) so coverage is non-trivial. `source` is `'sample'`, names are labelled as samples.
- **acceptance:** each sample passes the snapshot schema and `assertCoverageConsistent`, has a complete tree, and has `sourceAnalysisComplete` true only if nothing is deferred.
- **verify:** `npm run typecheck && npx vitest run tests/samples.test.ts`

## T12. Client fetcher and fallback
- **plan_id:** P1-ING  **node_id:** F1.6
- **scope:** `src/engine/repoFetcher.ts`, `tests/repoFetcher.test.ts`
- **goal:** `ingestRepository(target, {signal, onEvent, fetchImpl, fallbackEnabled})` posts to `/api/repo`, reads events, validates the result with the schema and `assertCoverageConsistent`, and returns the snapshot. Applies the fallback rules in design section 8.3 and emits the `fallback_in_use` notice first. `ingestSample(id, {onEvent})` runs the sample path with `skipped` events for the network stages. Any failed validation becomes `upstream_failure`. A stream that ends with no `result` or `error` becomes `upstream_failure`. No path ever returns a sample after a real failure.
- **acceptance:** tests cover the server success path, each non-fallback error, each fallback trigger, fallback disabled, malformed events, early stream end, abort with no snapshot returned, and that a failure never returns a sample snapshot.
- **verify:** `npm run typecheck && npx vitest run tests/repoFetcher.test.ts`

## T13. Store
- **plan_id:** P1-ING  **node_id:** F1.7
- **scope:** `src/store/useStudioStore.ts`, `tests/store.test.ts`
- **goal:** Vanilla store (`getState`, `subscribe`, pure actions) plus a `useStudioStore` hook built on `useSyncExternalStore`. State and actions per design section 10.1: `beginIngestion`, `applyEvent`, `completeIngestion`, `failIngestion`, `cancelIngestion`, `reset`. Stage status changes only inside `applyEvent`. `done` only in `completeIngestion`. Log capped at 500 entries. No network or timers in the store.
- **acceptance:** tests cover stage transitions from events, `not_available` for the two unimplemented stages, no `done` before `completeIngestion`, cancel clearing snapshot and adding a log entry, retry resetting state, log cap.
- **verify:** `npm run typecheck && npx vitest run tests/store.test.ts`

## T14. Ingestion hook and wireframe screens
- **plan_id:** P1-ING  **node_id:** F1.7
- **scope:** `src/hooks/useIngestion.ts`, `src/components/StartScreen.tsx`, `src/components/LoadingScene.tsx`, `src/components/StudioLayout.tsx`, `src/components/CoveragePanel.tsx`, `src/App.tsx`, `src/main.tsx`, `src/styles.css`
- **goal:** Screens and behavior per design section 10.2 and 10.3. Black text on white only, system font, borders, no color, no animation, no images. `useIngestion` owns one `AbortController`, aborts on start/retry/cancel/unmount, ignores submits while running. Loading shows real stage status, counts only when known, and no percentages. Studio is a labelled stub. Scoped load re-runs ingestion with `scope` and keeps the old snapshot until the new one validates. All text is rendered as text, never as HTML.
- **acceptance:** typecheck and build pass. Manual browser checks (Playwright power or your browser), each reported as run or **Unverified**:
  1. Start with an invalid URL shows the inline error and makes no request.
  2. A sample goes Start, Loading, Studio with correct coverage numbers.
  3. A small public repository does the same through `/api/repo`.
  4. Cancel mid-load returns to Start with no snapshot.
  5. Browser console shows zero errors in all of the above.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

## T15. Final gate and independent review
- **plan_id:** P1-ING  **node_id:** F1
- **scope:** no source changes. Report only. If a defect is found, I stop and propose a fix for your approval.
- **goal:** Run the full suite and build, report bundle sizes, run the manual checks from T14 that were not run, and have `verification-agent` review the full diff against the requirements acceptance list (requirements section 7, items 1–9) and the Phase 1 rules (no color, no animation, no AI).
- **acceptance:** every item in requirements section 7 is marked Verified (with command output) or **Unverified** (with the reason). I then recommend whether Phase 1 ingestion is ready. Advancing the Active Phase stays your decision.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

---

## Requirement coverage

| Requirement | Tasks |
|---|---|
| R1 URL parsing | T3 |
| R2 Endpoint | T7, T9, T10 |
| R3 Inventory, truncated tree, scope | T4, T5, T14 |
| R4 Selection and exclusions | T5, T7, T8 |
| R5 Coverage | T2, T6, T14 |
| R6 Stage events, cancel | T8, T13, T14 |
| R7 Client fetcher, fallback | T12 |
| R8 Samples | T11 |
| R9 Start screen | T14 |
| R10 Loading screen | T14 |
| Non-functional (memory, deps, security, cleanup) | T1, T7, T8, T9, T14, T15 |

**Spec Step Completed:** Step 3: Atomic Tasks
**Files Written:** `.kiro/specs/01-repository-ingestion/tasks.md`
**Decisions / Risks:** T1 runs `npm install` and needs network. T10 and the browser checks in T14 need live access to GitHub, which may be blocked in this sandbox; those results would be reported Unverified. T7 adds `tests/githubSource.test.ts`, which is not in PLAN.md yet.
**Waiting For:** Your explicit "Go" on **T1** (and your OK for its `npm install`). I will not start any task before that.


---

## T16. Review fixes
- **plan_id:** P1-ING  **node_id:** F1 (touches F1.1, F1.3, F1.4, F1.5, F1.7)
- **scope:** `src/types/contracts.ts`, `src/engine/fileSelector.ts`, `src/engine/repoInventory.ts`, `src/engine/githubSource.ts`, `src/engine/ingestPipeline.ts`, `api/repo.ts`, `src/hooks/useIngestion.ts`, `src/components/CoveragePanel.tsx`, `src/styles.css` (tag only), `README.md`, `.env.example`, the spec documents, and tests.
- **goal:** Fix the eight small items from the T15 review (binary files make analysis incomplete; dropped entries make the tree incomplete; "complete for supported file types" wording; cancel on unmount; cancel non-OK bodies; folder picker only for a complete tree; handler-level tests for the four missing acceptance cases; `@node` tag on the CSS), verify that redirects cannot leave the two GitHub hosts, reject private repositories on the server when a token is configured, document the public-only token in the README, and sync `requirements.md` with the approved amendments.
- **verify:** `npm run typecheck && npx vitest run && npm run build`
