# Design: 01 Repository Ingestion

Implements `requirements.md` in this folder. Active product phase: **Phase 1 (Skeleton)**. The blueprint is used only as a description of the application. Build order and visual rules follow the 5 steering phases.

## 1. Phase-1 compliance

| Rule (build-phases.md) | How this design complies |
|---|---|
| Plain black-and-white wireframe, no animation | One `styles.css` with black text on white, system font, borders only. No color tokens, transitions, or SVG art. |
| Backend endpoints, schemas, state storage | `api/repo.ts`, zod schemas, in-memory store. |
| No live AI, no external AI calls | This spec makes no AI calls. The mock AI adapter is a separate spec. |
| Phase-exit gate: frontend triggers backend and renders payloads; zero console errors and unhandled server errors | Acceptance checks A8 and A9 in section 11. |
| Never build later-phase features | No monster, haunted scene, motion, theme, panels that slide, or pause/resume controls. |

Nothing here needs a Phase 2+ feature. Items deferred: classification (spec 03), preview (spec 02), graph, audit, Journal, patching, AI.

## 2. Traceability status (what exists, what does not)

Read from the repository and the provided starter files:

- `traceability/PLAN.md` and `traceability/ACTION_LOG.md` were supplied as starter files. They are not in the repo yet. This design writes a real `traceability/PLAN.md` (replacing the starter nodes). `ACTION_LOG.md` is **not** created by hand: it is append-only and is written by `trace_ops.py`.
- `agents/*.json` and `hooks/*.json` reference `scripts/traceability/trace_ops.py`, `update_trace_map.py`, and `hook_guard.py`. **None of these scripts exist.** If the hooks run in a real workspace they will fail on every write. The skill `dependency-inspection` is also not in the repo.
- Because of that, the `verify:` commands in PLAN.md use `npm` and `vitest` directly. `record-go`, `can-modify`, drift, and `plan-check` cannot run until the scripts exist. Source files will carry `@node: F1.x` tags so the scripts can pick them up later.
- Per your instruction, writing the traceability scripts is out of scope here.
- The PLAN.md starter format has `Inputs / Outputs / Invariants / verify`. I added `Files` and `Depends on` lines. If a future `plan-check` parser is strict, those two lines are the only ones to change.

## 3. Lightweight-architecture audit

| Gate | Status | Finding / Lean alternative |
|---|---|---|
| 1. Dependency vetting | PASS (one RISK) | Runtime: `react`, `react-dom`, `zod`. Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `@types/react`, `@types/react-dom`, `@types/node`. No router, state library, HTTP client, or UI kit: routing is a stage switch, the store uses `useSyncExternalStore`, and HTTP is native `fetch`. RISK: `zod` adds bundle weight. The alternative is hand-written validators, which cost more code and more bugs at two trust boundaries. Task 1 reports the built bundle size so you can decide with a number. |
| 2. Memory and bundle | PASS (one RISK) | Content is bounded by the 3 MB session budget and one 25-file batch of raw responses at a time. Files are read through a size-capped stream reader, so an oversized file is never fully buffered. RISK: the inventory for a huge tree could reach tens of thousands of entries, so entries are capped (`maxInventoryEntries`) and the cap is reported as a tree warning. |
| 3. Free-tier resilience | PASS | Every upstream call has a 15 s timeout, 403/429 handling with reset time, and a labelled fallback. File contents come from `raw.githubusercontent.com`, which does not use the 60 requests/hour unauthenticated REST quota (per GitHub docs, that limit applies to REST API calls). A typical ingestion uses 2 REST calls. An optional server-side `GITHUB_TOKEN` raises the quota. |
| 4. Teardown | PASS | One `AbortController` per ingestion, owned by `useIngestion`. It is aborted on cancel, retry, and unmount. Timeouts use `AbortSignal.timeout`, which needs no manual timer. Stream readers are cancelled in `finally`. |

Sources: [Vercel `fetch` handler and cancellation](https://vercel.com/docs/functions/functions-api-reference), [Vercel function limits](https://vercel.com/docs/functions/limitations), [GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28). Content was rephrased for compliance with licensing restrictions.

## 4. Files

All paths are relative to `work-of-art/`. Everything is **new**. The only existing files are `LICENSE`, `agents/*`, `hooks/*`, which are not modified.

### 4.1 Project files
| File | Purpose |
|---|---|
| `package.json` | `"type": "module"` (required by Vercel for TS functions outside a framework), scripts `dev`, `build`, `typecheck`, `test`. |
| `tsconfig.json` | Strict mode. One config for `src`, `api`, `tests`, `vite.config.ts`. |
| `vite.config.ts` | React plugin, Vitest config, and a **dev-only** middleware that serves `POST /api/repo` by loading `api/repo.ts` through `server.ssrLoadModule`. No Vercel CLI needed. |
| `vercel.json` | `functions."api/*".supportsCancellation: true`, so a client disconnect aborts upstream work. |
| `index.html`, `.gitignore` | Standard. |

### 4.2 Backend: `api/`
| File | Responsibility |
|---|---|
| `api/repo.ts` | `export async function handleRepoRequest(request, env)` (testable) and `export default { fetch }` (Vercel). Checks method, size, JSON, schema. Streams NDJSON events. No parsing or classification logic. |

### 4.3 Engine: `src/engine/` (no React imports, runs in Node and the browser)
| File | Responsibility |
|---|---|
| `repoUrl.ts` | `parseRepoInput(text)` and the owner/repo/ref/path validators. Shared by client and server. |
| `githubSource.ts` | The only code that calls GitHub: `resolveDefaultBranch`, `fetchTree`, `fetchFileCapped`. Takes an injected `fetch`, optional token, and `AbortSignal`. Maps upstream failures to `IngestError`. |
| `repoInventory.ts` | `buildInventory(treeEntries, limits)`: one entry per path, directory entries, cap handling, `treeComplete`/`treeWarnings`, placeholder classification fields. |
| `fileSelector.ts` | Exclusion rules, supported types, priority ranking, scope filtering, load planning against budgets, `computeCoverage(inventory, treeComplete, warnings)`. |
| `ingestPipeline.ts` | `runIngestion(request, deps)`: the single pipeline used by the server, the browser fallback, and (through `buildSnapshotFromFiles`) the samples. Emits events. |
| `repoFetcher.ts` | Client service: `ingestRepository`, `ingestSample`. Calls `/api/repo`, reads NDJSON, validates, applies fallback. |
| `ndjson.ts` | `encodeEvent`, `readEvents(response, signal)` async iterator with a line-length cap. |

### 4.4 Shared types, config, data
| File | Responsibility |
|---|---|
| `src/types/contracts.ts` | Zod schemas and `z.infer` types, one source of truth. Only the contracts this spec needs (section 6). |
| `src/config/budgets.ts` | All limits, marked provisional. |
| `src/data/sampleRepos.ts` | Three sample file maps and `buildSampleSnapshot(id)`. |

### 4.5 Frontend: `src/`
| File | Responsibility |
|---|---|
| `src/store/useStudioStore.ts` | Vanilla store plus hook. State and pure actions only. No network. |
| `src/hooks/useIngestion.ts` | Owns the `AbortController`, calls `repoFetcher`, dispatches store actions, aborts on unmount. |
| `src/components/StartScreen.tsx` | Input, Enter Repository, sample picker, inline validation errors. |
| `src/components/LoadingScene.tsx` | Wireframe stage list with real status, progress counts, Cancel, error panel (Retry, sample, Back). The name matches the later visual scene. |
| `src/components/StudioLayout.tsx` | **Stub** for this spec: repository identity, `CoveragePanel`, inventory list, session log. Real Studio is a later spec. |
| `src/components/CoveragePanel.tsx` | Coverage counts, warnings, skip reasons, scoped-load picker. |
| `src/App.tsx`, `src/main.tsx`, `src/styles.css` | Stage switch, mount, black-and-white styles. |

### 4.6 Tests: `tests/`
`contracts`, `repoUrl`, `repoInventory`, `fileSelector`, `ingestPipeline`, `repoApi`, `repoFetcher`, `samples`, `store` (each `*.test.ts`).

## 5. Data flow

```
StartScreen
  -> useIngestion.start(input)
     -> parseRepoInput (repoUrl.ts)                       invalid: inline error, no network
     -> store.beginIngestion
     -> repoFetcher.ingestRepository
          1. POST /api/repo  (NDJSON stream)
               api/repo.ts: method, size, JSON, zod strict
               runIngestion:
                 resolving_ref   -> githubSource.resolveDefaultBranch (only if no ref)
                 fetching_tree   -> githubSource.fetchTree -> repoInventory.buildInventory
                 loading_sources -> fileSelector.plan -> batches of githubSource.fetchFileCapped
                 -> computeCoverage -> RepoSnapshot -> {type:"result"}
          2. on server-route failure (rules in 8.3): notice event, runIngestion in the browser
     -> validate result with zod + coverage consistency check
     -> store.completeIngestion(snapshot)  -> experience stage = studio
```

State ownership: the store owns the snapshot and ingestion status. Components render it. The hook owns the controller. Engines own no global state.

## 6. Contracts (`src/types/contracts.ts`)

Names follow the blueprint. Additions are marked **new**.

```ts
// Reused as-is from the blueprint
ProjectSource, FileClassification, ClassificationConfidence, FileLoadStatus,
ClassificationEvidence, RepoFile, RepoInventory, RepoCoverage, RepoSnapshot,
RepoResponse { snapshot }, SessionLogEntry

// Changed
RepoRequest {
  owner: string; repo: string; ref?: string;
  scope?: string[];              // new: directory paths to load content from
}
RepoInventoryEntry {
  ...blueprint fields,
  reasonCode?: ReasonCode;       // new
  reason?: string;               // new: human-readable
}

// New
type ReasonCode =
  | 'excluded_dependency' | 'excluded_generated' | 'excluded_minified'
  | 'excluded_lockfile'   | 'excluded_sourcemap'  | 'excluded_media'
  | 'unsupported_type'    | 'binary_content'      | 'symlink'
  | 'over_hard_ceiling'   | 'over_file_prefix'    | 'budget_reached'
  | 'outside_scope'       | 'deadline_reached'    | 'rate_limited' | 'fetch_failed';

type IngestStage = 'resolving_ref' | 'fetching_tree' | 'classifying'
                 | 'loading_sources' | 'preparing_preview';
// 'classifying' and 'preparing_preview' are in the type but never emitted
// until specs 03 and 02. The UI shows them as "not available yet".

type ApiErrorCode = 'invalid_request' | 'not_found' | 'rate_limited'
                  | 'unsupported' | 'oversized' | 'upstream_failure' | 'timeout';
ApiError { code: ApiErrorCode; message: string; resetAt?: string /* ISO */ }

IngestEvent =
  | { type: 'stage'; stage: IngestStage; status: 'started'|'finished'|'skipped'; detail?: string }
  | { type: 'progress'; stage: 'loading_sources'; loaded: number; total: number }
  | { type: 'notice'; code: 'fallback_in_use'; message: string }
  | { type: 'result'; response: RepoResponse }
  | { type: 'error'; error: ApiError }
```

**Field semantics**
- `scope`: up to 20 directory paths. A file is in scope if it is at the repository root, or its path equals a scope path, or starts with `scope path + '/'`. Out-of-scope supported files become `indexed_not_loaded` with `outside_scope`. The inventory always lists every path.
- Placeholder classification (until spec 03): `classifications: ['unknown']`, `confidence: 'low'`, `evidence: []`. `needsUserReview` stays `false` so the review queue is not flooded.
- `snapshot.files` holds only entries that have content (`loaded` or `truncated`). Every other state lives in the inventory with its `loadStatus` and reason.
- `RepoFile.truncated` is true exactly when `loadStatus === 'truncated'`.

**Coverage is derived, never incremented.** `computeCoverage` counts inventory statuses in one pass, so the counts cannot drift from the entries:
- `indexedPaths` = number of inventory entries (files and directories).
- `loadedSourceFiles` = status `loaded`. `truncatedFiles` = status `truncated`. These two are disjoint.
- `deferredSourceFiles` = `indexed_not_loaded`. `skippedFiles` = `skipped`. `failedFiles` = `failed`.
- `totalLoadedBytes` = sum of loaded and truncated content bytes.
- `skippedReasons` = one `{path, reason}` per skipped file.
- `sourceAnalysisComplete` = `treeComplete` and no entry is `indexed_not_loaded`, `truncated`, `failed`, or `needs_review`, and no entry is `skipped` with `over_hard_ceiling` or `binary_content` (see `INCOMPLETE_SKIP_REASONS`; changed in T16). Path and file-type exclusions (`excluded_*`, `unsupported_type`, `symlink`) do not make the analysis incomplete, but are always listed.

## 7. Budgets (`src/config/budgets.ts`)

All provisional until the Phase 0 benchmark. The file exports a `provisional: true` flag and the coverage panel shows the values in use.

| Key | Value | Source |
|---|---|---|
| `maxFilePrefixBytes` | 200 KB | approved |
| `maxTotalLoadedBytes` | 3 MB | approved |
| `batchSize` | 25 | approved |
| `requestTimeoutMs` | 15 000 | approved |
| `hardCeilingBytes` | 1 MB | **proposed**: files above are `skipped` / `over_hard_ceiling` |
| `fetchConcurrency` | 5 | proposed |
| `totalDeadlineMs` | 60 000 | proposed: after this, remaining files become `deferred` / `deadline_reached`. Vercel allows far more (300 s default on all plans), so this is a product choice. |
| `maxInventoryEntries` | 20 000 | proposed: beyond this, `treeComplete=false` and a warning states how many entries were not represented |
| `maxScopeEntries` | 20 | proposed |

## 8. Backend behavior

### 8.1 Request handling (`api/repo.ts`)
1. Method other than POST: JSON `405` `{error:{code:'invalid_request'}}`.
2. Body larger than 4 KB or `content-type` not JSON: `400` / `invalid_request`.
3. `RepoRequest` is parsed with a **strict** zod schema (unknown fields rejected). Failure: `400` / `invalid_request`.
4. Valid: respond `200`, `content-type: application/x-ndjson`, `cache-control: no-store`, body is a `ReadableStream` of one JSON event per line.
5. The pipeline receives `request.signal`. A client disconnect aborts all upstream fetches.
6. Every failure after step 4 is an `error` event, then the stream closes. A stream that ends with neither `result` nor `error` is treated by the client as `upstream_failure`.

### 8.2 GitHub calls (`githubSource.ts`)
Allowed hosts are the two constants `api.github.com` and `raw.githubusercontent.com`. URLs are built only from validated `owner`, `repo`, `ref`, and tree paths, with every path segment passed through `encodeURIComponent`. The client never supplies a URL.

| Step | Call | Notes |
|---|---|---|
| Default branch (only if no `ref`) | `GET https://api.github.com/repos/{o}/{r}` | reads `default_branch` |
| Tree | `GET https://api.github.com/repos/{o}/{r}/git/trees/{ref}?recursive=1` | `truncated: true` sets `treeComplete=false`. Entry types: `blob` = file, `tree` = directory, `commit` (submodule) = directory entry plus a tree warning. Mode `120000` = file skipped as `symlink`. |
| Content | `GET https://raw.githubusercontent.com/{o}/{r}/{ref}/{path}` | Read through a stream, stopping at the prefix limit. Content using raw does not consume the REST quota. |

Headers: `Accept: application/vnd.github+json`, `X-GitHub-Api-Version` pinned, `User-Agent` set. `Authorization: Bearer ${GITHUB_TOKEN}` is added **only** on the server, **only** for `api.github.com`, and never for raw hosts or the browser fallback.

**Error mapping**

| Upstream | Code |
|---|---|
| 404 on repo or tree | `not_found` (private repos also return 404 to anonymous callers) |
| 403 or 429 with `x-ratelimit-remaining: 0` or `retry-after` | `rate_limited`, `resetAt` from `x-ratelimit-reset` |
| 409 (empty repository) | an empty valid snapshot with an "empty repository" tree warning |
| Other 4xx, 5xx, malformed JSON | `upstream_failure` |
| Timeout from `AbortSignal.timeout` | `timeout` |
| Tree has more than `maxInventoryEntries` | not an error: capped, `treeComplete=false` |
| Caller signal aborted | not an error code: the promise rejects with `AbortError` and nothing is emitted |

A rate limit or failure on a **file** fetch does not fail the run: see 9.

### 8.3 Fallback rules (client)
Fallback to the in-browser pipeline happens only when the server route fails with `upstream_failure`, `timeout`, `rate_limited`, a network error, or a non-NDJSON response (for example, no `/api` route in a static deployment). It does not happen for `invalid_request`, `not_found`, `unsupported`, or `oversized`. A `notice` event `fallback_in_use` is emitted first and shown in the UI. Enabled by `FALLBACK_ENABLED` in `budgets.ts`, default `import.meta.env.DEV`, so production builds use only the server route unless you change it.

## 9. File selection and loading algorithm (`fileSelector.ts`)

Plan phase (pure, sizes come from the tree, so it is deterministic and unit-testable):
1. For each file entry, assign the first matching rule:
   1. mode `120000`: `skipped` / `symlink`.
   2. path segment in `node_modules, vendor, .venv, venv, bower_components, Pods`: `excluded_dependency`.
   3. segment in `dist, build, .next, .nuxt, out, coverage, __pycache__, .git`: `excluded_generated`.
   4. `*.min.js`, `*.min.css`: `excluded_minified`. `*.map`: `excluded_sourcemap`.
   5. known lockfile names: `excluded_lockfile`.
   6. image, font, audio, video, archive, document binaries, and `.svg`: `excluded_media`.
   7. extension or filename not in the supported list: `unsupported_type`.
   8. size known and `> hardCeilingBytes`: `skipped` / `over_hard_ceiling`.
   9. outside `scope` (if given): `indexed_not_loaded` / `outside_scope`.
   10. otherwise a **candidate**.
2. Rank candidates: manifests and config, entry points, route/handler paths, source modules, styles, other text. Ties: shallower path first, then alphabetical.
3. Walk the ranked list adding `min(size, maxFilePrefixBytes)` to a running estimate. Once `maxTotalLoadedBytes` would be exceeded, every remaining candidate becomes `indexed_not_loaded` / `budget_reached`.
4. The final candidate list is split into batches of `batchSize`.

Load phase:
- Batches run in order. Inside a batch, up to `fetchConcurrency` fetches run at once. Raw buffers are released after each batch.
- A response is read until `maxFilePrefixBytes`. If more data exists: `truncated` / `over_file_prefix`.
- A NUL byte in the first 8 KB: `skipped` / `binary_content`; content is discarded.
- A per-file failure (404, network, timeout): `failed` / `fetch_failed`; the run continues.
- A `403/429` rate limit on a file: stop fetching; all unfetched candidates become `indexed_not_loaded` / `rate_limited`; add a warning with the reset time. The run still returns a partial snapshot, honestly marked incomplete.
- When `totalDeadlineMs` passes: stop; remaining candidates become `indexed_not_loaded` / `deadline_reached`; add a warning.
- After each batch the pipeline emits `{progress, loaded, total}`, where `total` is the planned candidate count, a known number.

## 10. Frontend behavior

### 10.1 Store (`useStudioStore.ts`)
State for this spec only:
```
experience:  'start' | 'loading' | 'studio'          (skeleton_inspection added by a later spec)
ingestion:   { status: 'idle'|'running'|'failed'|'done',
               target?: { owner, repo, ref?, source: 'github'|'sample', sampleId? },
               stages: Record<IngestStage, 'pending'|'active'|'done'|'skipped'|'not_available'>,
               progress?: { loaded, total },
               notices: string[],
               error?: ApiError }
snapshot?:   RepoSnapshot
log:         SessionLogEntry[]                        (bounded to 500 entries)
```
Actions are pure functions: `beginIngestion`, `applyEvent`, `completeIngestion`, `failIngestion`, `cancelIngestion`, `reset`. `applyEvent` is the only place stage status changes, driven by events, so the screen cannot show progress that did not happen. `done` is set only in `completeIngestion`, after validation.

### 10.2 Screens (wireframe)
- **Start**: one text input, **Enter Repository**, helper text, secondary **Use a sample repository** with a three-option select. Enter key submits. Submit is disabled while running. Inline error text from `parseRepoInput`.
- **Loading**: repository identity (with "sample" label if applicable), ordered stage list with status words (pending, active, done, skipped, not available yet), `loaded / total` shown only when `progress` exists, an indeterminate text marker (`...`) for active stages without counts (no percentage anywhere), notices, **Cancel**. On error: code, message, reset time when present, **Retry**, **Use a sample repository**, **Back to Start**.
- **Studio stub**: repo name and ref, `CoveragePanel`, scrollable inventory list (path, type, load status, reason), session log. Banner: "Studio is a placeholder in this build."
- **CoveragePanel**: counts, warnings, skip reasons, budgets in use (with "provisional"), and, when `sourceAnalysisComplete` is false and top-level folders exist, a checkbox list with **Load selected folders**. This re-runs ingestion with `scope`. The previous snapshot stays visible until the new one validates.

### 10.3 Lifecycle (`useIngestion.ts`)
One `AbortController` per run. `start`, `retry`, and `cancel` abort the previous one first. Unmount aborts. Cancel discards partial state, returns to Start, and adds a `Cancelled` log entry. Rapid repeated submissions are ignored while `status === 'running'`.

## 11. Verification mapping

Command used everywhere: `npm run typecheck && npx vitest run <file>`; the final gate is `npm run typecheck && npx vitest run && npm run build`. All upstream calls are mocked through the injected `fetch`. No test makes a real network call.

| Check | Requirement | Test |
|---|---|---|
| A1 URL parsing | R1 | `repoUrl.test.ts` |
| A2 Endpoint cases (405, 400, not_found, rate_limited, timeout, upstream_failure, truncated, empty, oversized, failed file) | R2, R3, R4 | `repoApi.test.ts`, `ingestPipeline.test.ts` |
| A3 Inventory count equals mocked tree, including unloaded files | R3 | `repoInventory.test.ts` |
| A4 Coverage counts equal status tally; `sourceAnalysisComplete` false in every incomplete case | R5 | `fileSelector.test.ts` (property-style table over generated inventories) |
| A5 Event order; `done` never before validation | R6 | `ingestPipeline.test.ts`, `store.test.ts` |
| A6 Cancel leaves no snapshot | R6.6 | `repoFetcher.test.ts`, `store.test.ts` |
| A7 Samples validate and are consistent | R8 | `samples.test.ts` |
| A8 Browser: Start to Loading to Studio for one sample and one small public repo, zero console errors | R9, R10, phase gate | **Manual / Playwright power, not a vitest test.** Reported as Unverified until run. |
| A9 No silent sample substitution | R7.4 | `repoFetcher.test.ts` (failure never yields a sample snapshot) |
| Extra: server logs contain no file content | R2.10 | `repoApi.test.ts` spies on `console` |
| Extra: scope filtering and root files always in scope | R3.7 | `fileSelector.test.ts` |

## 12. Amendments to requirements (need your approval)

| Req | Change | Reason |
|---|---|---|
| R2.3, R2.8, R2.9 | Only invalid method, size, JSON, or schema return HTTP `405/400`. All failures after validation are `error` events inside the stream, with the same codes. | A streamed response has already sent `200`. This is what lets the Loading screen show real server-side stages. The alternative (one JSON response at the end) cannot show real stage progress for the server route. |
| R2.5 | Two fixed hosts: `api.github.com` and `raw.githubusercontent.com`. | File contents via the REST API would exhaust the 60/hour anonymous quota. |
| R6.1 | Emitted stages: `resolving_ref`, `fetching_tree`, `loading_sources`. `classifying` and `preparing_preview` are defined but show "not available yet". | They do not exist until specs 03 and 02. Showing them as done would be invented progress. |
| R7.2 | Fallback also triggers on server-reported `rate_limited`, and is on by default only in dev builds. | The browser has its own IP quota. You asked for dev convenience. |
| R3.7 / R4 | `scope` semantics and `RepoInventoryEntry.reasonCode/reason` as defined in section 6. | Needed to make skip reasons and the incomplete rule testable. |
| R4.6 | Hard ceiling is 1 MB (proposed). | You approved the rule but not the number. |

## 13. Risks and known limits

1. **Files are fetched by ref name.** If the branch moves during ingestion, content may not match the inventory. Mismatches show up as `failed` or differing sizes. Pinning to a commit SHA costs one more REST call and is a possible later change.
2. **Anonymous quota is 60 REST calls/hour per IP.** Serverless egress IPs can be shared. The optional server `GITHUB_TOKEN` and the browser fallback are the mitigations.
3. **Budgets are placeholders** until the Phase 0 benchmark on the 4 GB laptop.
4. **`export default { fetch }`** is supported by Vercel for non-framework `api/*.ts` (confirmed in their docs). Task 1 includes a local check through the dev middleware, but a real deploy check is **Unverified** until you deploy.
5. **Scoped re-run replaces the snapshot.** Any later Studio state tied to the old snapshot would be lost. Fine now, to revisit when Studio edits exist.
6. **Traceability scripts are missing** (section 2), so approval and drift checks are manual for now.

## 14. PLAN.md nodes

Written to `traceability/PLAN.md` (plan id `P1-ING`): F1.0 scaffold, F1.1 contracts and budgets, F1.2 URL parsing, F1.3 inventory/selector/coverage, F1.4 GitHub source and pipeline, F1.5 API endpoint, F1.6 samples and client fetcher, F1.7 store and wireframe UI. Task order and per-task scope belong to Step 3.

**Spec Step Completed:** Step 2: Design
**Files Written:** `.kiro/specs/01-repository-ingestion/design.md`, `traceability/PLAN.md`, and a small decision record added to `requirements.md` section 8.
**Decisions / Risks:** See section 12 (six amendments) and section 13.
**Waiting For:** Approval of the design and the section 12 amendments, then Step 3 (atomic tasks). No code is written until you say "Go" on a specific task.


## 15. Revision notes (T16, after the T15 review)

Changes made to the design after independent review. All approved by the user.

| Area | Change |
|---|---|
| Coverage | `binary_content` joins `over_hard_ceiling` in `INCOMPLETE_SKIP_REASONS` (`contracts.ts`). Both `computeCoverage` and `assertCoverageConsistent` use it. A supported-type file that turns out to be binary was not analysed. |
| Inventory | Dropped entries (duplicates, empty paths, unknown types) set `treeComplete = false`. |
| Redirects | `fetch` follows redirects. After each request `githubSource.ts` checks `response.url`: it must be `https` on `api.github.com` or `raw.githubusercontent.com`, otherwise the body is cancelled and the call fails with `upstream_failure`. Responses without a URL (test doubles) are accepted. Verified live: a renamed repository redirected within `api.github.com`. |
| Upstream bodies | Non-OK responses and refused redirects cancel their body. |
| Public-only token | `getRepoInfo` returns `{ defaultBranch, isPrivate }`; `isPrivate` is true unless GitHub says `private: false`. `runIngestion` takes `requirePublic`; the handler sets it whenever a token is configured. A private repository gets the same `not_found` code and message as a missing one. The repository endpoint is now called whenever `requirePublic` is set, even if a ref is given. |
| Scoped reload UI | The folder picker is shown only when the tree is complete. For an incomplete tree the panel explains why a folder reload cannot help (it requests the same tree again). Recovering paths from a truncated tree would need per-folder tree requests and is not built. |
| Wording | Complete analysis reads "complete for supported file types", with a count of files skipped by rule. |
| Controller | `useIngestion.ts` now exports `createIngestionController(store, services)`, a plain function with injectable store and services, plus a thin `useIngestion` hook. `dispose()` aborts the request and cancels the run in the store, so unmounting no longer leaves a run showing as active. |
| Tests | Handler-level cases for truncated tree, empty repository, oversized file, and failed file; redirect, body-cancel, and privacy tests; controller tests (`tests/useIngestion.test.ts`). |

Not changed (reported by the review, deferred): `loading_sources` still reports `finished` after a rate-limit or deadline cut (coverage and warnings state the cut); a reload replaces the snapshot rather than merging content.
