# PatchBay & Skeleton Debugger

A browser-based repository inspection studio. **This build contains repository ingestion only** (Phase 1 wireframe): paste a public GitHub repository URL, and the app indexes the whole file tree, loads supported text files within fixed limits, and reports exactly what was and was not analysed. The Studio screen is a placeholder. Preview, editing, audit, Journal, and AI features are later specs.

The app never runs the imported code, never writes to GitHub, and never changes the original repository.

## Development

```bash
npm install
npm run dev        # Serves /api/repo and /api/assistant without the Vercel CLI
npm run typecheck
npm test           # Offline; every GitHub and AI call is mocked
npm run build
```

Node 20 or newer.

## Using a GitHub token (optional, server-side only)

Without a token the app uses GitHub's anonymous API, which allows only 60 requests per hour per IP address. Set `GITHUB_TOKEN` on the server to raise that limit:

- **Use a token that can read public repositories only.** With GitHub fine-grained personal access tokens, choose "Public repositories (read-only)" and grant no private repository permissions. Do not use a classic token with the `repo` scope.
- **The server also enforces this.** When a token is configured, `/api/repo` loads only repositories GitHub confirms are public, and answers `not_found` for anything else (the same answer as a missing repository, so a private repository's existence is not revealed). This is a second safeguard, not a replacement for a public-only token.
- The token is read from the server environment only. It is sent to `api.github.com` only, never to the file-content host, never returned to the browser, and never logged. The browser cannot supply one.
- Locally: copy `.env.example` to `.env` (git-ignored). On Vercel: add `GITHUB_TOKEN` as an environment variable.

## What it does and does not promise

- Only **public** GitHub repositories. Private repositories are not supported.
- Every path GitHub returns appears in the inventory. File contents are loaded progressively within limits (200 KB per file prefix, 1 MB hard ceiling, 3 MB total, 25 files per batch, 15 s per request). **These limits are provisional** until benchmarked.
- The coverage report is derived from per-file status and says "complete for supported file types" only when the tree is complete and every supported file was fully read. Files skipped by folder or file-type rules, files over the ceiling, binary files, truncated files, and failed files are all listed with reasons.
- If GitHub truncates a very large tree, the app says so. Loading only some folders cannot recover missing paths in this version, so the folder picker is shown only when the tree is complete.
- If loading fails, the app shows the error. It never substitutes a sample repository; samples load only when you choose one.
- In development builds only, if the server route fails, the browser may load directly from GitHub and says so on screen. Production builds use the server route only.

## Layout

```
api/repo.ts          POST /api/repo, streams NDJSON events (Vercel function)
src/engine/          URL parsing, GitHub client, inventory, file selection, pipeline, fetcher
src/types, config    contracts (zod schemas) and limits
src/store, hooks     shared state and the ingestion controller
src/components       wireframe screens
src/data             three bundled sample repositories
tests/               offline unit tests
.kiro/specs/         requirements, design, tasks
traceability/        PLAN.md
```

## AI Assistant (AI_MODE)

The AI Assistant endpoint is at `POST /api/assistant`. It is controlled by the `AI_MODE` environment variable on the server:

| `AI_MODE` | Behaviour |
|---|---|
| unset or blank | Same as `mock` |
| `mock` | Returns instant, canned mock responses. No AI model is called. No data leaves your server. |
| `live` or any other value | Returns `501 unsupported` immediately, before reading the request body. No key is read; no network call is made. |

**Phase 1 (current):** only `mock` works. Live AI (Phase 3) will add a free-tier provider chain behind this same endpoint. Setting `AI_MODE=live` now returns `unsupported`.

The endpoint:
- Reads `AI_MODE` only from environment variables. No other env key is accessed.
- Makes zero outbound network requests.
- Logs only the error code and task type, never the instruction, file paths, or file content.
- Redacts likely secrets from request fields before building any response.



Verified by automated tests and by a headless-browser run. **Not yet verified:** a real Vercel deployment (including request cancellation), branch names containing `/` on the tree endpoint, and a physical phone.

## Studio shell (Phase 2, sub-phase 2A)

After a repository or sample loads, the Studio has a left area (a Sandbox placeholder and Project info) and a vertical toolbar on the far right edge with six buttons: Edit, AI Chat, Log, History, Journal, and Skeleton Crew. The first five open a panel on the right (one at a time). A panel can collapse to a thin strip, switch between a narrow and a wide width, and close. Skeleton Crew opens an empty Screen 4, whose four area buttons open an empty Screen 5. The toolbar is hidden on both. The panel layout is saved in browser storage under `patchbay.studio-layout.v1` (four fields, no repository data). After a refresh the app returns to the Start screen; the saved layout is used the next time a repository loads.

## Action harness (Phase 2, sub-phase 2B)

AI Chat now understands a short list of command words. Typing exactly one of them runs it instead of sending a request to the AI. Three or more words always go to the AI.

| Command | What it does |
|---|---|
| `help`, `status` | List the commands, or show the mode, the run, and the change counts. |
| `start` | Start the **practice run (no AI)**: a fixed script of up to 8 steps that reads the loaded repository and proposes one practice comment line per file. |
| `pause`, `resume`, `step` | Stop the run moving on by itself, let it move again, or run one step while paused. |
| `stop` | End the run, reject a waiting proposal, and cancel a pending AI request. A Stop button is always visible at the top. |
| `approve`, `reject` | Decide the waiting proposal (also buttons on the proposal card). Approving changes only an in-memory practice copy, never your repository. |
| `undo`, `redo` | Take back or re-apply the last practice change (only while paused or idle). |
| `open edit`, `open chat`, `open log`, `open history`, `open journal` | Open a panel. Opening Edit pauses the run; closing it does not resume. |
| `reset` | Clear the run, History, Log, and the saved work. |

The work (run, waiting proposal, History, last 200 Log lines) is saved for one repository under `patchbay.work.v1`: diffs of the practice line and short fingerprints only, never file contents, AI text, chat replies, or secrets. After a refresh, loading the same repository restores it (a running run comes back paused). If a file changed, the saved changes are discarded and the Log says so. Loading a different repository leaves the saved work alone until the next change, which replaces it.

## Project understanding (Phase 2, sub-phase 2C)

When a repository finishes loading, the app now runs an offline analysis (no AI, no network) as the real "Classify files" loading stage. The result appears in Project info as **Project understanding**:

- Every file gets one or more labels (Frontend, Backend, Shared, APIs & Data, Images and fonts, Settings, Tests, Docs, Infrastructure), a confidence, and plain reasons that name the skill-book rule that fired. Files with no clue go to **Needs Review** instead of being guessed.
- A connection map lists imports, page loads, routes, API calls, outside calls, and setting reads, each marked **Confirmed**, **Inferred**, or **Broken** in words. JavaScript, TypeScript, HTML, CSS, and basic Python are read; other languages are listed as not scanned.
- Limits (2,000 files, 200 connections per file, 5,000 in total, 8 seconds) mark the result **Partial** with a reason.
- You can set the labels of any file. Corrections are saved per repository under `patchbay.corrections.v1` (paths and label names only) and restored when the same repository loads again. **Clear my label corrections** removes them. The Security row reads "pending scan (2D)" until the scanner exists.

## Scanner and Skeleton Crew (Phase 2, sub-phase 2D)

Skeleton Crew (Screen 4) scans the loaded files offline with 16 checks (no AI, no network) and groups findings into four areas: Frontend, Backend, Security, and APIs & Data. Every finding shows the file, the lines, a redacted snippet, a plain explanation, why it matters, and whether it was **Found** or only **Possible**. There are no scores. A clean scan never says the project is secure: the page lists what was and was not checked.

- **Screen 4:** a map of the four areas with real counts and links, four worker boxes (workers take turns), a **Start Crew** button, a command box, and a "What was and was not checked" list.
- **Screen 5:** one area with its findings table, a Details view, the crew narration, the pending proposal card, the changes made, and (for APIs & Data) the request trace.
- **`start crew`** (or the button) runs the crew through the findings with the same controls as the practice run (`pause`, `resume`, `step`, `stop`, Edit auto-pause). Only one fix exists, **Auto-supported**: adding `rel="noopener noreferrer"` to a link. It is offered only when it applies exactly, the check no longer fires, nothing new appears, and the change holds no secret. You approve or reject it; it changes only the in-memory practice copy.
- Approving, undoing, or redoing re-checks the affected file in the same update. The crew run and its proposal are never saved; applied fixes come back through History.

## Sandbox preview (Phase 2, sub-phase 2E-1)

The left area of the Studio (and of Screens 4 and 5) now shows a **Sandbox** panel with a preview of the project, in one of three modes that PatchBay chooses and explains ("Mode: ... Why: ..."):

- **Live Static Preview**: a plain HTML project is shown as the browser would see it, with scripts off. Widths 375, 768, 1024, and Fit are available.
- **Component Workbench**: for React, Vue, and Svelte projects, an approximate picture is read from the source (nothing is run, expressions show as dashed `{...}` boxes).
- **Source Inspection**: files grouped by label with a redacted, numbered viewer.

The preview is a locked iframe built from `srcdoc` by an allowlist re-serializer: it writes a new document with only allowed tags and attributes, every value escaped, outside addresses blocked, and images shown as placeholders. The sandbox is exactly `allow-same-origin` (look-only, no script can run) or exactly `allow-scripts` (an opaque origin with no access to PatchBay's page or storage), never both, with a content policy that blocks every request the browser lets a policy block. **Run scripts** needs a confirmation and is only offered for static pages. A script that sends its own frame to another address is detected and the preview is reset (the browser may already have made that one request); a script can also freeze the tab with an endless loop.

**Check layout** measures the look-only preview and adds measured findings ("Text that does not fit its box") next to the 2D findings, with the measured numbers and widths. The Skeleton Crew narrates them under Frontend. Nothing from the preview is saved.

