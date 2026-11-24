# Requirements: 01 Repository Ingestion

Source: PatchBay & Skeleton Debugger Blueprint v4, sections 2.1, 3.2 (validation), 3.3 (progress), 5.3, 5.4, 11.2, 12 (Phase 2).
Active product phase: Phase 1 (Skeleton). Wireframe UI only, no live AI, no colors or animation.

## 1. Purpose

Take a public GitHub repository URL, build an inventory of its entire available tree, load supported text files in bounded batches, and return a coverage-aware `RepoSnapshot`. Report real pipeline stages so the Loading screen never shows invented progress.

## 2. Scope

### In scope
- GitHub URL parsing and validation (client and server).
- `POST /api/repo` serverless endpoint (`api/repo.ts`).
- Full tree inventory (`src/engine/repoInventory.ts`).
- Supported-file selection and bounded batch loading (`src/engine/fileSelector.ts`).
- Coverage report (`RepoCoverage`) with per-file skip reasons.
- Client fetch service (`src/engine/repoFetcher.ts`) with stage events.
- Three bundled sample repositories, used only when the user picks one explicitly.
- Shared contracts and runtime validators (zod) for `RepoRequest`, `RepoResponse`, `RepoSnapshot`.
- Plain wireframe Start and Loading screens that show real stage labels and error states.

### Out of scope (later specs or phases)
- File classification beyond a placeholder (spec 03). Ingestion sets every entry to `unknown`, confidence `low`, with no evidence, and marks it as pending classification.
- Repository graph, preview building, audit rules, Journal, patching, AI Assistant.
- Private repositories and any user-supplied token.
- Persistence of snapshots.
- Monster art, haunted scene, animation, colors (Phase 4).

## 3. Glossary

- **Inventory:** every directory and file path GitHub returns for the ref, with metadata, before any content is read.
- **Coverage:** counts and reasons describing what was indexed, loaded, deferred, skipped, truncated, or failed.
- **Supported text file:** a file whose extension or name is on the supported list and whose size is within the per-file budget.
- **Budget:** limits stored in one config module (`src/config/budgets.ts`). Values come from a Phase 0 benchmark. Until that runs, they are provisional defaults marked as such in the file.

## 4. Functional requirements

### R1. URL parsing and validation
1. WHEN the user submits text in the repository field, THE SYSTEM SHALL parse it into `owner`, `repo`, and optional `ref` before any network call.
2. THE SYSTEM SHALL accept `https://github.com/{owner}/{repo}`, with optional trailing slash, optional `.git` suffix, and optional `/tree/{ref}` segment.
3. THE SYSTEM SHALL accept `{owner}/{repo}` shorthand.
4. IF the input is empty, not a GitHub URL, or has an invalid owner/repo format, THEN THE SYSTEM SHALL show an inline error describing the expected public repository URL format and SHALL NOT start ingestion.
5. THE SYSTEM SHALL reject owner, repo, and ref values that contain characters outside the allowed sets (owner: letters, digits, hyphen; repo: letters, digits, `.`, `_`, `-`; ref: no `..`, no control characters, no leading `-`), and SHALL enforce maximum lengths.
6. THE SYSTEM SHALL NOT accept any host other than `github.com`.

### R2. Ingestion endpoint
1. THE SYSTEM SHALL expose `POST /api/repo` accepting only JSON of shape `RepoRequest { owner, repo, ref?, scope? }`, where `scope` is an optional list of at most 20 repository-relative directory paths.
2. WHEN a request uses a method other than POST, THE SYSTEM SHALL respond `405` with an `Allow: POST` header.
3. WHEN the content type is not JSON, the body is larger than 4096 bytes, the body is not valid JSON, it has unknown fields, or it fails validation, THE SYSTEM SHALL respond `400` with a structured error code (`invalid_request`) and SHALL NOT repeat the rejected values. Once a request is accepted, THE SYSTEM SHALL respond `200` with an NDJSON event stream (`application/x-ndjson`); every later failure is delivered as a final `error` event carrying a structured code, and a successful run ends with exactly one `result` event.
4. THE SYSTEM SHALL re-validate owner, repo, and ref on the server and SHALL NOT fetch any URL, hostname, IP address, or path supplied by the client.
5. THE SYSTEM SHALL build GitHub URLs only from validated `owner`, `repo`, `ref`, and tree paths, with every path segment percent-encoded, against the two fixed hosts `api.github.com` (tree and repository information) and `raw.githubusercontent.com` (file content). It SHALL reject file paths or refs containing `.`, `..`, or empty segments, and SHALL fail the request if a redirect ends on any other host or on a non-https address.
6. IF a GitHub token is configured, THEN THE SYSTEM SHALL read it from a server environment variable only, SHALL send it to `api.github.com` only (never to the raw host), and SHALL NOT return it, log it, or accept one from the client. The token is intended to be a public-only token (see 6a).
6a. IF a GitHub token is configured, THEN THE SYSTEM SHALL load only repositories that GitHub confirms are public (`private: false`), including when the request names a `ref`, and SHALL reject any other repository with the same `not_found` code and message used for a missing repository, so a private repository's existence is not revealed. A missing privacy flag SHALL be treated as private.
7. THE SYSTEM SHALL apply a timeout to every upstream request.
8. THE SYSTEM SHALL return structured error codes: `invalid_request`, `not_found`, `rate_limited`, `unsupported`, `oversized`, `upstream_failure`, `timeout`.
9. WHEN GitHub returns `429`, or `403` with exhausted-quota or retry headers, THE SYSTEM SHALL report `rate_limited` and include the reset time when known.
10. THE SYSTEM SHALL NOT log file contents, tokens, or full upstream payloads. A failed ingestion logs only its error code and `owner/repo`.
11. THE SYSTEM SHALL cancel the body of any upstream response it does not read.

### R3. Full tree inventory
1. WHEN the ref is resolved, THE SYSTEM SHALL retrieve the recursive tree for that ref and create one `RepoInventoryEntry` per file and directory returned.
2. IF `ref` is omitted, THEN THE SYSTEM SHALL resolve the repository's default branch and record the resolved name in `snapshot.ref`.
3. THE SYSTEM SHALL record `path`, `entryType`, `extension` (files), and `sizeBytes` (files, when provided).
4. IF GitHub reports the tree as truncated, THEN THE SYSTEM SHALL set `inventory.treeComplete = false`, add a `treeWarnings` entry, and set `coverage.treeComplete = false`.
5. THE SYSTEM SHALL include inventory entries for files whose content is never loaded.
6. THE SYSTEM SHALL NOT drop entries silently. Any entry the system chooses not to represent (duplicate paths, empty paths, unknown entry types, or entries beyond the inventory cap) SHALL be counted and explained in `coverage.warnings`, and SHALL set `inventory.treeComplete = false`.
7. WHEN a truncated tree is returned, THE SYSTEM SHALL surface the limitation in the UI and SHALL explain that loading only some folders is not available for an incomplete tree, because a scoped reload requests the same tree again. WHEN the tree is complete but source analysis is incomplete (for example the content budget was reached), THE SYSTEM SHALL offer a picker of top-level folders. A scoped reload loads content only from the chosen folders plus files at the repository root, lists every other supported file as deferred (`outside_scope`), and replaces the loaded snapshot only after the new one validates. Recovering paths missing from a truncated tree is out of scope for this version.

### R4. Supported-file selection and exclusions
1. THE SYSTEM SHALL decide for each file one of: `loaded`, `indexed_not_loaded`, `skipped`, `truncated`, `failed`, `needs_review` (the `FileLoadStatus` type).
2. THE SYSTEM SHALL skip by default, with a recorded reason: dependency directories (`node_modules`, `vendor`, `.venv`), generated or build output (`dist`, `build`, `.next`, `out`, `coverage`), minified files (`*.min.js`, `*.min.css`), lockfiles, source maps, and binary or media files.
3. THE SYSTEM SHALL record a `skippedReasons` entry `{ path, reason }` for every skipped file.
4. THE SYSTEM SHALL prioritize loading in this order: manifests and configuration, entry points, routes/handlers, source modules, styles, other supported text.
5. THE SYSTEM SHALL load supported text files in batches no larger than the configured batch size, and SHALL stop loading when the session byte or file budget is reached.
6. WHEN a file exceeds the per-file byte limit but not the hard ceiling (1 MB, provisional), THE SYSTEM SHALL load a prefix, mark it `truncated`, and record the reason. WHEN a file exceeds the hard ceiling, THE SYSTEM SHALL mark it `skipped` (`over_hard_ceiling`) without fetching it.
7. WHEN a file is supported but not loaded because a budget was reached, THE SYSTEM SHALL mark it `indexed_not_loaded` and count it in `deferredSourceFiles`.
8. WHEN a content fetch fails for a file, THE SYSTEM SHALL mark it `failed`, count it, and continue with the remaining files.
9. THE SYSTEM SHALL NOT set `sourceAnalysisComplete = true` unless the tree is complete and every supported, non-excluded file is `loaded`. A supported-type file that is `skipped` as `over_hard_ceiling` or `binary_content` (for example a UTF-16 source file) was not analysed and therefore makes the analysis incomplete. Skips by path or file-type rule (dependency and generated folders, lockfiles, minified files, media, unsupported types, symlinks) are always listed but do not make it incomplete.
10. THE SYSTEM SHALL NOT include binary content in the snapshot.

### R5. Coverage report
1. THE SYSTEM SHALL populate every field of `RepoCoverage`: `indexedPaths`, `loadedSourceFiles`, `deferredSourceFiles`, `skippedFiles`, `truncatedFiles`, `failedFiles`, `totalLoadedBytes`, `skippedReasons`, `warnings`, `treeComplete`, `sourceAnalysisComplete`.
2. THE SYSTEM SHALL ensure the counts agree with the per-entry statuses (verified by test).
3. WHEN the snapshot is shown, THE SYSTEM SHALL display the coverage counts and warnings on the Loading result and at the Studio entry point.
4. THE SYSTEM SHALL NOT label a repository "fully analysed" while `sourceAnalysisComplete` is false. WHEN it is true, THE SYSTEM SHALL word it "complete for supported file types" and, if any files were skipped by rule, state how many were not analysed.

### R6. Stage events and progress honesty
1. THE SYSTEM SHALL emit these ordered stage events from the pipeline: `resolving_ref`, `fetching_tree`, `loading_sources`, each with `started` and `finished` (or `skipped`). The stages `classifying` and `preparing_preview` are defined but SHALL NOT be emitted until specs 03 and 02 exist; the Loading screen SHALL show them as "not available yet". A run ends with one `result` or `error` event, delivered by the endpoint or fetch service, never by the pipeline itself.
2. WHEN a stage starts or ends, THE SYSTEM SHALL update the Loading screen's current-stage label from the event.
3. WHILE a stage has no measurable progress, THE SYSTEM SHALL show the stage name with an indeterminate indicator and SHALL NOT display a percentage.
4. WHILE `loading_sources` runs, THE SYSTEM SHALL show `loaded / total supported` file counts only when both numbers are known.
5. THE SYSTEM SHALL NOT report `done` before the snapshot is validated and stored.
6. WHEN the user cancels during loading, THE SYSTEM SHALL abort in-flight requests, discard the partial snapshot, return to the Start screen, and log the cancellation.

### R7. Client fetch service and fallback
1. THE SYSTEM SHALL perform all network calls in `repoFetcher.ts`, not in React components.
2. WHEN `/api/repo` fails with `upstream_failure`, `timeout`, `rate_limited`, a network error, a missing route, or a malformed stream, AND the fallback is enabled (by default in development builds only), THE SYSTEM SHALL run the same pipeline directly against GitHub from the browser, subject to the same budgets, and SHALL emit a visible `fallback_in_use` notice first. It SHALL NOT fall back for `invalid_request`, `not_found`, `unsupported`, or `oversized`. The browser never holds a token.
3. IF both routes fail, THEN THE SYSTEM SHALL show the error and offer Retry and an explicit "Use a sample repository" choice.
4. THE SYSTEM SHALL NOT substitute a sample repository after a failure without the user choosing it.
5. WHEN a response is received, THE SYSTEM SHALL validate it at runtime against the `RepoResponse` schema before storing it, and treat a failed validation as `upstream_failure`.

### R8. Sample repositories
1. THE SYSTEM SHALL bundle three sample repositories as local fixtures in `src/data/sampleRepos.ts`: a static HTML/CSS/JS project, a React-style frontend project, and a small full-stack project with a Node route file.
2. Each sample SHALL be a valid `RepoSnapshot` with `source = 'sample'`, a complete inventory, and accurate coverage.
3. WHEN the user selects a sample, THE SYSTEM SHALL run the same stage events and validation as a real repository, without network calls.
4. THE SYSTEM SHALL label sample snapshots as samples wherever the repository name is shown.

### R9. Start screen (wireframe)
1. THE SYSTEM SHALL show a single repository input, an "Enter Repository" button, helper text "Paste a public GitHub repository URL.", and a visually secondary "Use a sample repository" control.
2. WHILE ingestion is running, THE SYSTEM SHALL disable duplicate submission.
3. THE SYSTEM SHALL be operable by keyboard (Enter submits, tab order is logical) and by touch.
4. THE SYSTEM SHALL render with no custom colors, animation, or logo (Phase 1 rule).

### R10. Loading screen (wireframe)
1. THE SYSTEM SHALL show the repository identity, the current stage label from R6, a Cancel control, and coverage counts when available.
2. WHEN ingestion succeeds, THE SYSTEM SHALL move to the Studio stage and retain the snapshot in the shared store.
3. WHEN ingestion fails, THE SYSTEM SHALL show the error code, a plain-language message, Retry, "Use a sample repository", and "Back to Start".

## 5. Error and empty states

| Condition | Required behavior |
|---|---|
| Invalid URL | Inline message with expected format; no network call. |
| Repository not found or private | `not_found` message stating it could not be accessed; no silent switch. |
| Rate limited | `rate_limited` message with reset time if known; Retry and explicit sample option. |
| Tree truncated | Inventory shown, `treeComplete=false`, warning displayed, scoped loading offered. |
| Empty repository (zero files) | Valid snapshot with empty inventory and a visible "empty repository" notice. |
| Oversized file or session budget reached | Files marked `truncated`/`indexed_not_loaded`/`skipped` with reasons; coverage shows incomplete analysis. |
| Individual file fetch failure | File marked `failed`; run continues. |
| Malformed upstream or API response | Treated as `upstream_failure`; nothing stored. |
| Timeout | `timeout` message; Retry available. |
| Cancelled by user | Partial data discarded; return to Start. |

## 6. Non-functional requirements

1. **Memory (4 GB target):** THE SYSTEM SHALL keep loaded file content bounded by the session byte budget, SHALL NOT hold more than one batch of raw responses at a time, and SHALL release request buffers after each batch.
2. **Dependencies:** runtime additions limited to `react`, `react-dom`, and `zod`. Dev: `vite`, `typescript`, `vitest`, and their type packages. No UI, state, or HTTP libraries.
3. **Free tier:** unauthenticated GitHub API use must work for a small public repository. Rate-limit handling is required because the unauthenticated limit is low.
4. **Security:** inputs validated at both boundaries; fixed upstream host; no secrets in client bundles or logs; imported content treated as untrusted data and never rendered as HTML.
5. **Budgets:** all limits (files, bytes, batch size, timeout) live in `src/config/budgets.ts`, are shown in the coverage report, and are marked provisional until the Phase 0 benchmark is run.
6. **Cleanup:** AbortControllers and timers are disposed on completion, error, cancel, and unmount.
7. **Mock-first rule:** this spec makes no AI calls.

## 7. Acceptance and verification gate

The spec is satisfied when all of the following hold:

1. Unit tests cover URL parsing (valid, shorthand, `.git`, `/tree/ref`, invalid hosts, bad characters, length limits).
2. Endpoint tests cover 405, 400, `not_found`, `rate_limited`, `timeout`, `upstream_failure`, a truncated tree, an empty repository, an oversized file, and a failed file fetch, using a mocked upstream.
3. Inventory test: entry count equals the tree returned by the mocked upstream, including unloaded files.
4. Coverage test: counts equal the per-entry status tally; `sourceAnalysisComplete` is false whenever anything is deferred, skipped-as-supported, truncated, failed, or the tree is truncated.
5. Stage-event test: events arrive in order and `done` is never emitted before validation.
6. Cancellation test: aborting mid-load leaves no stored snapshot.
7. Each sample repository validates against the schema and passes the coverage-consistency test.
8. In the browser, Start to Loading to Studio completes for a sample and for one small public repository, with zero console errors and zero unhandled server errors.
9. No code path substitutes a sample after a failure unless the user chooses it.

## 8. Decisions recorded (approved by the user)

1. **Per-file over-limit behavior:** load a truncated prefix (up to the per-file limit) for files up to a hard ceiling, and skip files above the ceiling. The ceiling value is set in design.
2. **Direct-API fallback (R7.2):** kept, for local-dev convenience.
3. **Provisional budgets:** 200 KB per file, 3 MB total loaded, 25 files per batch, 15 s request timeout. Placeholders until benchmarked.
4. **Folder-scoped loading (R3.7):** included now. `RepoRequest` gains an optional `scope` field (design defines its shape).

5. **Design amendments (design.md section 12):** approved by the user and applied to R2, R3, R4, R6, and R7 above.
6. **Review fixes (task T16), approved by the user:** a supported file that is binary counts as incomplete (R4.9); dropped tree entries mark the tree incomplete (R3.6); the folder picker is hidden for an incomplete tree with an explanation (R3.7); redirects must stay on the two GitHub hosts (R2.5); with a token configured only public repositories load, and the token should be a public-only token (R2.6, R2.6a); non-OK upstream bodies are cancelled (R2.11); the "complete" wording is qualified (R5.4).
