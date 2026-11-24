# Design: 02 Mock AI Adapter

Implements `requirements.md` in this folder, unchanged. Active product phase: **Phase 1 (Skeleton)**. Wireframe only, `AI_MODE=mock` only, no provider keys, no external AI calls.

## 1. Decisions already made

| Source | Decision |
|---|---|
| Requirements questions 1–6 (approved) | `AIResult { requestId, mode, response }` envelope; response type chosen by the number of selected files; file contents sent only when a box is ticked (off by default) and only from `loaded` files; `live` and any unknown `AI_MODE` return `unsupported`; no artificial delay setting; limits are provisional placeholders. |
| Interview answer 1 (approved) | AI state lives in its own pure modules (`aiSlice.ts`, `aiActions.ts`) composed into the one existing store. |
| Interview answer 2 (approved) | Redaction uses a fixed list of named patterns. A generic "looks random" detector is a possible Phase 3 addition and is not built. |
| Assumptions in the alignment brief (approved by "go with your recommendation") | HTTP statuses 405 / 400 / 413 / 501; plain JSON, not streamed; comment line chosen by file extension with a plain first line for types with no comment syntax; no new dependencies; spec files committed after each approved step. |

## 2. Phase-1 compliance

| Rule (build-phases.md) | How this design complies |
|---|---|
| One backend AI adapter with `AI_MODE = mock \| live` | `api/assistant.ts` reads `AI_MODE`. `mock` answers. `live` and unknown values fail closed with `unsupported`. |
| Mock returns instant deterministic payloads in the exact contract Phase 3 will use | The contract lives in `contracts.ts`. The mock is one pure function behind it. Phase 3 replaces the function, not the contract or any screen. |
| Never wire live keys or make external AI calls in Phases 1–2 | The handler reads no environment variable except `AI_MODE`, imports no provider code, and makes no outbound request. A test proves it with a throwing environment proxy and a fetch spy. |
| Plain black-and-white wireframe, no animation | New classes use borders and monospace only. No color, no transition. |
| Phase 1 exit gate: frontend triggers backend endpoints and renders mock payloads, zero console errors, zero unhandled server errors | Acceptance items 8 and 9 of the requirements (browser run and live dev-server run). |

Nothing here needs a Phase 2+ feature. There is no Apply, Approve, Reject, pause, or undo.

## 3. Lightweight-architecture audit

| Gate | Status | Finding |
|---|---|---|
| 1. Dependency vetting | PASS | No new package. Zod, React, and native `fetch`, `TextEncoder`, and `AbortSignal` cover everything. The unified-diff generator and the test-side applier are small hand-written functions. |
| 2. Memory and bundle | PASS | Request, response, and context sizes are capped (section 6.2). One request at a time and one stored result. The AI panel adds a few components and no library. Expected bundle growth is small; the build output is reported in the final task. |
| 3. Free-tier resilience | PASS | No external API at all. The client call to our own endpoint has a 15 s timeout and cancel. There is nothing to rate-limit or rotate; Phase 3 owns that. |
| 4. Teardown | PASS | One `AbortController` and one store subscription per request, both released in `finally`. The controller's `dispose()` cancels a pending request, as `useIngestion` does. |

## 4. Files

All paths are relative to `work-of-art/`.

### 4.1 New
| File | Responsibility |
|---|---|
| `api/assistant.ts` | `handleAssistantRequest(request, env, deps?)` and the default `fetch` export. No parsing or response logic of its own beyond orchestration. |
| `src/config/aiLimits.ts` | Every AI limit, marked provisional. |
| `src/engine/aiValidate.ts` | `validateAIRequest` (shape, size, path, and consistency checks, classified as `invalid_request` or `oversized`) and `validateAIResult`. |
| `src/engine/redact.ts` | `redact(text)` with the named patterns, and `containsSecret(value)`. |
| `src/engine/unifiedDiff.ts` | `buildInsertDiff` and `commentLineFor`. Pure. |
| `src/engine/mockAssistant.ts` | `mockResponse(request, context)`: the rule table and canned text. Pure. |
| `src/engine/httpBody.ts` | `readBodyCapped(request, limit)` for the assistant handler. |
| `src/engine/aiAssistant.ts` | Client service: `buildAIRequest`, `requestAssistant`, `AssistantError`. |
| `src/store/aiSlice.ts` | `AIState` type, `idleAI()`, and the transitions on `AIState` alone. No imports from the main store. |
| `src/store/aiActions.ts` | Whole-state actions with log entries: `beginAIRequest`, `completeAIRequest`, `failAIRequest`, `cancelAIRequest`, `clearAI`. |
| `src/hooks/useAssistant.ts` | `createAssistantController(store, services)` and the thin `useAssistant` hook. |
| `src/components/AIAssistantPanel.tsx` | The form, picker, and states. |
| `src/components/AIResponseView.tsx` | Renders the four response types as plain text. |
| `tests/helpers/applyDiff.ts` | Independent unified-diff parser and applier used only by tests. |
| Tests | `aiContracts`, `aiValidate`, `redact`, `mockAssistant`, `assistantApi`, `aiAssistant`, `aiState`, `useAssistant` (each `*.test.ts`). |

### 4.2 Modified (small, listed so nothing is a surprise)
| File | Change |
|---|---|
| `src/types/contracts.ts` | Adds the AI schemas and types (section 6.1). |
| `src/store/useStudioStore.ts` | `StudioState` gains `ai`. `initialState()` sets `idleAI()`. `withLog` becomes exported. Four actions that change or clear the snapshot also set `ai: idleAI()`: `beginIngestion` (foreground), `completeIngestion`, `cancelIngestion` (foreground), `reset`. |
| `src/components/StudioLayout.tsx` | Renders `AIAssistantPanel`; one new prop, `assistant`. |
| `src/App.tsx` | Creates the assistant controller with `useAssistant()` and passes it down. |
| `src/styles.css` | A few wireframe classes (`.assistant`, `.diff`, `.mock-label`). Black and white only. |
| `vite.config.ts` | The dev plugin serves a table of routes (`/api/repo`, `/api/assistant`) instead of one. |
| `README.md` | Documents `AI_MODE` and that only `mock` exists. |
| `traceability/PLAN.md` | Adds F2 nodes (section 15). |

### 4.3 Not touched
`api/repo.ts`, `src/engine/{githubSource,ingestPipeline,fileSelector,repoInventory,repoUrl,repoFetcher,ndjson}.ts`, and their tests. The small body-reading helper is copied into `httpBody.ts` instead of refactoring `api/repo.ts`, because `api/` files each become a serverless function, so a shared helper cannot live there. Merging the two copies is a possible later cleanup.

## 5. Data flow

```
AIAssistantPanel (form state is local: text, task type, chosen paths, include-contents)
  -> useAssistant.send(input)
       -> buildAIRequest(snapshot, input)          problem: inline message, nothing sent
       -> store: beginAIRequest                    ai.status = pending, log "AI request"
       -> requestAssistant(request, {signal})      POST /api/assistant
            api/assistant.ts
              405 -> mode check (501) -> content type -> capped body -> JSON
              -> validateAIRequest -> redact -> mockResponse -> validateAIResult
              -> { requestId, mode: "mock", response }
       -> client: AIResultSchema + validateAIResult + size cap
       -> store: completeAIRequest / failAIRequest  (stale requestId ignored)
AIResponseView renders store.ai.result as plain text
```

State ownership: the store owns the AI slice (status, request summary, result, error). The panel owns only the form fields. The controller owns the `AbortController`. Neither the store nor any component performs network calls.

## 6. Contracts and limits

### 6.1 Schemas (`contracts.ts`)

```ts
AITaskType      = 'explain' | 'suggest_change' | 'review_finding'

AIRequest (strict) {
  requestId: string            // 1..64, [A-Za-z0-9_-]
  instruction: string          // trimmed, then 1..2000 characters
  taskType: AITaskType
  selectedPaths: string[]      // 0..10
  sourceContext?: { filePath: string; content: string }[]   // 0..5 (strict items)
}

AIResponse = discriminated union on `type`
  { type: 'clarification';   questions: string[] }                                   // 1..5
  { type: 'explanation';     summary; evidencePaths: string[]; limitations: string[] } // limitations 1..8
  { type: 'plan';            summary; affectedPaths: string[]; steps: string[]; risks: string[] } // steps 1..12, risks 1..8
  { type: 'patch_proposal';  summary; affectedPaths: string[]; unifiedDiff: string; tests: string[]; risks: string[] } // tests 1..8, risks 1..8

AIResult (strict) { requestId; mode: 'mock' | 'live'; response: AIResponse }
```

All response strings are at most 2,000 characters; `unifiedDiff` is at most 20 KB (UTF-8 bytes). The schemas carry only shape and per-field bounds. Cross-field and byte-size rules live in `aiValidate.ts` (6.3), which keeps `contracts.ts` free of engine imports.

### 6.2 Limits (`aiLimits.ts`, all provisional)

| Key | Value |
|---|---|
| `maxRequestBodyBytes` | 128 KB |
| `maxInstructionChars` | 2,000 |
| `maxSelectedPaths` | 10 |
| `maxContextFiles` | 5 |
| `maxContextFileBytes` | 20 KB |
| `maxContextTotalBytes` | 60 KB |
| `maxResponseBytes` (client check) | 256 KB |
| `clientTimeoutMs` | 15,000 |
| `maxPickerRows` | 200 |
| `provisional` | `true` |

Response bounds (questions, steps, risks, and so on) are in section 6.1 and enforced by the schema.

### 6.3 Validation (`aiValidate.ts`)

`validateAIRequest(input)` returns `{ ok: true, request }` or `{ ok: false, code, message }`.
1. Parse with `AIRequestSchema`. If any issue is **not** a size issue (`too_big`), the code is `invalid_request`. If every issue is a `too_big`, the code is `oversized`. A malformed request is never reported as merely oversized.
2. Then the checks the schema cannot express, each failing as `invalid_request` unless noted:
   - every `selectedPaths` entry passes `isSafeRepoPath`, is unique, and survives `redact()` unchanged (a path that looks like a secret is rejected);
   - every `sourceContext.filePath` is unique and is in `selectedPaths`;
   - any `content` above 20 KB, or all contents above 60 KB (UTF-8 bytes): `oversized`.
3. Messages name the field, never the value (for example "selectedPaths contains an unsafe or duplicate path.").

`validateAIResult(request, result)` returns `{ ok: true }` or `{ ok: false, problems: string[] }`. It checks that `requestId` matches, that `evidencePaths` and `affectedPaths` are within `selectedPaths`, that a `plan` or `patch_proposal` has at least one affected path, that the diff is within 20 KB, and it re-parses the result with `AIResultSchema` so every bound is enforced.

## 7. Endpoint (`api/assistant.ts`)

Order of checks, which matters because the mode check must not touch the body:

| # | Check | Outcome |
|---|---|---|
| 1 | Method is not POST | `405`, header `Allow: POST`, code `invalid_request` |
| 2 | Mode: read `env.AI_MODE` only. Trim it. Empty or exactly `mock` means mock. Anything else, including `live`, `MOCK`, or a typo | `501`, code `unsupported`, fixed message "Live AI is not available in this build." The value is never echoed. |
| 3 | `content-type` does not contain `application/json` | `400`, `invalid_request` |
| 4 | Body larger than 128 KB (checked from `content-length` and while reading) | `413`, `oversized` |
| 5 | Body is not valid JSON | `400`, `invalid_request` |
| 6 | `validateAIRequest` fails | `400` `invalid_request` or `413` `oversized`, per 6.3 |
| 7 | Request signal already aborted | Stop with an empty `499` response and no work |
| 8 | Redact `instruction` and each `sourceContext.content`, then `mockResponse` | build result |
| 9 | Server-side self-check: `validateAIResult` and `containsSecret(result)` | A failure is a bug: `500`, code `upstream_failure`, generic message, one log line with the code only |
| 10 | Return `200` `{ requestId, mode: "mock", response }` | `content-type: application/json; charset=utf-8`, `cache-control: no-store`, `x-content-type-options: nosniff` |

Rules:
- The handler reads `env.AI_MODE` and nothing else from `env`. The default export passes `process.env`; tests pass a Proxy that throws on any other key.
- It never calls `fetch`, and `deps` has no fetch slot. Tests spy on `globalThis.fetch`.
- It holds no state between requests and writes nothing.
- It logs only on an internal failure, and the line holds the code and `taskType` only: `[api/assistant] failed: upstream_failure (suggest_change)`. It never logs the instruction, content, or paths.
- Error bodies are `{ error: { code, message } }` using the existing `ApiError` shape.

The dev server serves both routes through one table, so `npm run dev` needs no Vercel CLI. `vercel.json` already matches `api/*`.

## 8. Redaction (`redact.ts`)

`redact(text)` returns `{ text, count, kinds }`. Each match is replaced by `[REDACTED:<kind>]`. Patterns are applied in this order; the first to match a span wins.

| kind | What it matches |
|---|---|
| `private_key` | `-----BEGIN ... PRIVATE KEY-----` through the matching `END` line; an unterminated BEGIN redacts to the end of the text |
| `github_token` | `gh[pousr]_` followed by 36 to 255 letters or digits; `github_pat_` followed by 22 to 255 letters, digits, or underscores |
| `aws_access_key_id` | `AKIA`, `ASIA`, `AGPA`, `AIDA`, `AROA`, `ANPA`, `ANVA`, or `AIPA` followed by 16 uppercase letters or digits |
| `google_api_key` | `AIza` followed by 35 characters from `A-Za-z0-9_-` |
| `slack_token` | `xox` + one of `abprs` + `-` + 10 or more characters |
| `jwt` | three base64url segments of 8 or more characters, the first starting `eyJ` |
| `bearer_token` | `Bearer` and whitespace, then 16 or more token characters (the word `Bearer` is kept) |
| `assignment` | A name containing `password`, `passwd`, `secret`, `token`, `api key`, `access key`, `private key`, or `client secret` (in the usual `_`, `-`, camelCase spellings), then `:` or `=`, then a value. Only the value is replaced. A **quoted** value of 4 or more characters is always replaced. An **unquoted** value is replaced only if it is 8 or more characters and contains a digit or a symbol, so type annotations such as `token: string` survive. Values already starting `[REDACTED:` are left alone. |

Properties the tests pin: idempotent (`redact(redact(x)) === redact(x)`); never lengthens beyond a fixed marker per match; never throws on any string (including huge or binary-looking input); `containsSecret(value)` walks every string in a JSON value and returns true if redaction would change any of it.

Known limits, stated plainly: this is a fixed list. It will miss secrets in formats it does not name, and it may redact some harmless values. It is a safety net for the mock and a baseline for Phase 3, not a guarantee.

## 9. Mock responder (`mockAssistant.ts`)

`mockResponse(request, { redactionCount }) -> AIResponse`, a pure function of its arguments (no clock, no randomness, no environment). It does **not** echo the instruction text, so nothing the user or a file says can steer or inject into the output.

Rule table, as required by R3.2:

| taskType | selected files | Response |
|---|---|---|
| `explain` | any | `explanation` |
| `review_finding` | any | `explanation` written as an audit |
| `suggest_change` | 0 | `clarification` |
| `suggest_change` | 1 | `patch_proposal` |
| `suggest_change` | 2 or more | `plan` |

Constant `MOCK_NOTICE = "This is a mock response; no AI model was used."` is the first entry of every `limitations` or `risks` list. Further canned lines:
- **explanation (explain):** evidence = selected paths; limitations add "The text is canned and does not describe the real code." and, with zero paths, "No files were selected."
- **explanation (review_finding):** summary presents one example finding, "possible missing input validation (example)"; limitations add "A static scan indicates a possible issue; it does not prove one." and "No real scan was run."
- **clarification:** questions such as "Which file should this change apply to?" and "Do you want a change to one file, or a plan across several?", and one that says no file was selected.
- **plan:** four steps: review the listed files; make the example change in each file, one at a time; run the type check and tests; review the diff before applying anything. Risks add "Changes across several files can affect each other."
- **patch_proposal:** `affectedPaths` is the one selected path; `tests` has "Run the project's tests after applying the example change."; `risks` carries the diff notes from section 10.
- If `redactionCount > 0`, one extra line "N likely secrets were redacted from the input before processing." goes into `limitations` or `risks` where the response has one.

Every list above stays within the bounds of 6.1, and the tests run `validateAIResult` on every combination.

## 10. Unified diff (`unifiedDiff.ts`)

`buildInsertDiff({ path, content?, comment })` returns a unified diff that inserts exactly one line at the top of the file and removes nothing.

- **With content** (already redacted): split into lines, remembering a trailing newline and whether lines end in `\r\n`. Take up to 3 leading lines as context. Hunk header `@@ -1,k +1,k+1 @@`, then `+<comment>`, then the context lines. If the context reaches the last line of a file with no trailing newline, add `\ No newline at end of file` after it. An empty file gives `@@ -0,0 +1 @@`. If the diff would exceed 16 KB (very long lines), drop the context and use `@@ -0,0 +1 @@`. The inserted line uses the file's own line ending.
- **Without content:** the zero-context form `@@ -0,0 +1 @@`, which is valid and carries no claim about the file.
- Headers are `--- a/<path>` and `+++ b/<path>`. The path is a validated, redaction-safe path.
- **Comment line** (`commentLineFor(path, text)`, chosen by extension; the text is a fixed phrase, "MOCK: example change from the PatchBay mock assistant (not a real proposal)"):

| Style | Extensions and names |
|---|---|
| `// text` | js jsx mjs cjs ts tsx mts cts java kt kts cs swift go rs c h cpp hpp php scss sass less jsonc graphql gql |
| `# text` | py rb sh bash yml yaml toml Dockerfile Makefile Procfile Gemfile Rakefile `.gitignore` `.editorconfig` `.env.example` |
| `-- text` | sql |
| `/* text */` | css |
| `<!-- text -->` | html htm xml vue svelte md mdx |
| plain `text` | json, txt, and any other type with no comment syntax |

In the without-content case the diff is checked against nothing, so `risks` says "This diff was not checked against the file." When content was given and redaction changed it, `risks` says "Content was redacted, so this diff may not apply to the original file."

The independent applier in `tests/helpers/applyDiff.ts` parses the diff separately from the generator, checks header and hunk counts, checks that the context lines match the input, and applies the hunk. It also asserts exactly one added line, no removed line, and that no other file is named.

## 11. Client service (`aiAssistant.ts`)

- `buildAIRequest(snapshot, { instruction, taskType, selectedPaths, includeContent }, newId?)` returns `{ ok: true, request }` or `{ ok: false, message }`. It trims the instruction; rejects empty text, more than 10 paths, and any path that is not a `loaded` file in the snapshot. Content is attached only when `includeContent` is true, and only from `loaded` files, never `truncated` ones. It checks the 20 KB and 60 KB limits and returns a message naming the limit. The request id is `ai-<base36 time>-<counter>`, injectable for tests.
- `requestAssistant(request, { signal, fetchImpl, endpoint, timeoutMs })` validates the request with `validateAIRequest` first (no network on failure), posts JSON, and requires a JSON response. It reads at most 256 KB; a larger or non-JSON body is `upstream_failure`. A JSON error body becomes `AssistantError` with its code. A network failure is `upstream_failure`, the 15 s timeout is `timeout`, and a caller abort rejects with `AbortError`. A success body is checked with `AIResultSchema`, `validateAIResult`, and `mode` being `mock` or `live`; any failure is `upstream_failure`.
- It never builds, caches, or substitutes a response. There is no mock code in the browser path.
- `AssistantError` is its own class (code plus message, `toApiError()`), so this module does not import the GitHub client.

## 12. Store and session log

`AIState` (in `aiSlice.ts`):
```ts
{ status: 'idle' | 'pending' | 'done' | 'failed',
  requestId?: string,
  summary?: { taskType; selectedCount; includesContent },   // counts only, never text
  result?: AIResult,
  error?: ApiError }
```
- `aiSlice.ts` holds the transitions on `AIState` alone. `aiActions.ts` wraps them with log entries and operates on `StudioState`, importing `withLog` and the types from `useStudioStore.ts` (one-way: `useStudioStore` imports only `idleAI`).
- `beginAIRequest` returns the same state when a request is already pending. `completeAIRequest` and `failAIRequest` ignore a `requestId` that is not the pending one. `cancelAIRequest` only acts while pending. `clearAI` returns to idle without a log entry.
- Log entries (`SessionLogEntry`, `redacted: false` because they hold no sensitive text):

| action | status | message |
|---|---|---|
| `ai_request` | `info` | `AI request: suggest_change, 1 file selected, contents not included.` |
| `ai_response` | `info` | `AI response: patch_proposal (mock).` |
| `ai_failed` | `failed` | `AI request failed: upstream_failure.` |
| `ai_cancelled` | `info` | `AI request cancelled.` |

  `affectedPaths` holds the selected paths. The instruction and the file contents are never put in the store or the log. The panel keeps the typed text in its own state only.
- Clearing: the four snapshot-changing actions set `ai: idleAI()`. A scoped reload that completes therefore clears the AI result, because the data it referred to has been replaced. A reload that is cancelled or fails keeps it.
- Nothing is persisted.

## 13. Assistant controller (`useAssistant.ts`)

`createAssistantController(store = studioStore, services = defaults)` returns `{ actions, dispose }`, the same pattern as `createIngestionController`, so it is testable without a DOM. `services` holds `requestAssistant`, `now`, and `newId`.

- `send(input)`: returns an error string (inline validation from `buildAIRequest`) or `null`. Ignored while pending. Otherwise it dispatches `beginAIRequest`, calls `requestAssistant`, and dispatches complete or fail with the request id it started with. An `AbortError` dispatches nothing, since cancel already did.
- During a request the controller subscribes to the store. If the pending request id changes or the status leaves `pending` (cancel, Back to Start, snapshot replaced), it aborts the request. The subscription is released in `finally`.
- `cancel()`, `clear()`, `dispose()` (abort and `cancelAIRequest`; safe to call repeatedly).
- `useAssistant()` is a `useMemo` plus `useEffect` cleanup around it.

## 14. AI panel

Shown in the Studio stub whenever a snapshot is loaded; remounts per `snapshot.id` so the picker and form reset when the data changes.

- **Always visible:** the line "Mock mode: responses are canned examples. No AI model is used and nothing is sent to an AI provider." After a response, "Mode: mock" (taken from the result).
- **Form** (plain labelled controls): instruction textarea with a live "N / 2000" counter and an over-limit message; task-type select (Explain, Suggest a change, Review a finding); file filter box and a checkbox list of `loaded` files, first 200 matches, a 10-file limit that disables further boxes with a note; checkbox "Include the contents of the selected files in the request" (unchecked by default); **Send**; **Cancel** while pending.
- **Hint under the form:** "Select no file to get a clarifying question, one file for a patch proposal, or several files for a plan." This makes each outcome reachable and honest.
- **States:** empty ("No response yet."), pending ("Waiting for the response ..." with Cancel), error (code and message, and **Retry**, which sends the same form again), done. Inline validation shows before anything is sent.
- **`AIResponseView`:** renders each type as React text: clarification (numbered questions); explanation (summary, evidence paths, limitations); plan (summary, affected paths, ordered steps, risks); patch proposal (summary, paths, the diff in a `<pre>` that preserves whitespace and scrolls sideways inside its box, tests, risks, and "This proposal cannot be applied in this build."). No Apply, Approve, or Reject control exists. Nothing is set as HTML.
- Keyboard and touch operable; no color; no animation; the `<pre>` scrolls inside its own box, so the page does not overflow at 375 px.

## 15. Failure handling

| Failure | Where handled | Result |
|---|---|---|
| Empty instruction, no path picked where one is needed, more than 10 files, file not loaded, content over a limit | `buildAIRequest` | Inline message; no request. |
| Not POST | endpoint | `405` + `Allow: POST`. |
| `AI_MODE` is `live` or unknown | endpoint, before the body | `501` `unsupported`; no env read beyond `AI_MODE`, no network. |
| Bad content type, bad JSON, wrong shape, unknown field, unsafe, duplicate, or secret-like path, context outside the selection | endpoint | `400` `invalid_request`; message names the field only. |
| Body or field over a limit | endpoint | `413` `oversized`. |
| Client disconnects | endpoint | Stops; empty `499`. |
| Internal self-check fails | endpoint | `500` `upstream_failure`, generic message, one code-only log line. |
| Response invalid, oversized, non-JSON | client | `upstream_failure`; no result shown. |
| Network error | client | `upstream_failure`; Retry offered. |
| 15 s timeout | client | `timeout`; Retry offered. |
| Cancel, Back to Start, snapshot replaced | controller + store | Request aborted; slice idle; late reply ignored. |

## 16. Verification mapping

Final gate: `npm run typecheck && npx vitest run && npm run build`. All tests are offline.

| Acceptance item (requirements section 6) | Test |
|---|---|
| 1. Schemas and limits | `aiContracts.test.ts`, `aiValidate.test.ts` (each limit at and just over its bound; unknown fields; unsafe, duplicate, secret-like paths; context outside the selection; bad request id; `too_big` versus other issues) |
| 2. Responder rule table, determinism, diff validity | `mockAssistant.test.ts` with `tests/helpers/applyDiff.ts` (3 task types x 0, 1, 2+ paths; two calls and reordered keys give identical output; `validateAIResult` on every output; applier applies the diff to redacted content; empty file, no trailing newline, CRLF, long lines) |
| 3. Redaction | `redact.test.ts` (each kind, idempotence, no throw, secret-laden request leaves no secret in the result, log, or error) |
| 4. Endpoint | `assistantApi.test.ts` (405; modes unset, blank, `mock`, `live`, `MOCK`, garbage; env proxy; fetch spy; content type; sizes; JSON; all four response types; disconnect; logging) |
| 5. Client service | `aiAssistant.test.ts` |
| 6. Store | `aiState.test.ts` and `useAssistant.test.ts` (stale ids, one request at a time, clearing on Back to Start and on snapshot replacement, no instruction text or content in the log, dispose, cancel then resend) |
| 7. Prompt-injection fixture | `mockAssistant.test.ts` and `assistantApi.test.ts` |
| 8. Browser | Headless run on a built app with request interception to hold a reply for the pending and cancel states: all four response types, error, empty, pending, cancel; console clean; black and white; 375 px |
| 9. Live dev server | A short script starts the dev server, posts each of the four request shapes, and checks results and the server log |
| 10. No client-side canned response | `aiAssistant.test.ts` (every failure rejects, never resolves with a result) and a source check that the browser path contains no mock import |

Mutation checks planned for the final task, as in spec 01: break the mode check, the env restriction, the redaction, the subset rule, the stale-id rule, and dispose, and confirm tests fail.

## 17. Risks and known limits

1. **Redaction is a fixed list** (section 8). It can miss formats and can over-redact. The result text always says when something was redacted.
2. **Diff edge cases** (CRLF, no trailing newline, tiny files, long lines) are handled and tested, but the generator is new code. The test-side applier is deliberately written separately from it.
3. **The panel lives in the Studio stub.** It will move into the Studio rail in a later spec. Moving it should only change where it is rendered.
4. **Two copies of the capped body reader** (`api/repo.ts` and `httpBody.ts`) until a later cleanup.
5. **`vite.config.ts` and the store are touched**, which are spec 01 files already in PR #1. The changes are small and covered by the existing tests plus new ones.
6. **Pending and cancel states in a real browser** are exercised by request interception, because the mock answers instantly.
7. **Phase 1 exit gate:** after this spec is built and verified, the gate evidence is the browser run plus the dev-server run across both features. Advancing the active phase stays your decision.

## 18. PLAN.md nodes

Added to `traceability/PLAN.md` as plan `P1-AI`: F2.1 contracts, limits, and validation; F2.2 redaction; F2.3 diff and mock responder; F2.4 endpoint and dev routes; F2.5 client service; F2.6 store slice, actions, and controller; F2.7 AI panel; and an F2 gate. Task order and per-task scope belong to Step 3.

**Spec Step Completed:** Step 2: Design
**Files Written:** `.kiro/specs/02-mock-ai-adapter/design.md` and the F2 nodes in `traceability/PLAN.md`
**Decisions / Risks:** See sections 1 and 17. One new decision for you: the mode check runs before the body is read, so a `live` or misconfigured deployment answers `501` to every POST, even a malformed one.
**Waiting For:** Approval of the design, then Step 3 (atomic tasks).
