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

The AI Assistant endpoint is `/api/assistant` (`POST` asks a question, `GET` reports the mode). It is controlled by the `AI_MODE` environment variable on the server:

| `AI_MODE` | Behaviour |
|---|---|
| unset or blank | Same as `mock` |
| `mock` (default) | Returns instant, canned mock responses. No AI model is called. No data leaves your server. |
| `live` | Asks a free outside AI provider (Phase 3A). The order is Gemini, then Groq, then OpenRouter. With no key set at all, it answers **"Live AI is not set up"** and never a mock answer. |
| any other value | `501 unsupported`, before the body is read. |

Live mode settings are server-side only (copy `.env.example` to `.env`; never use a `VITE_` prefix):

| Variable | Meaning |
|---|---|
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` | Any one is enough. A provider without a key is skipped. |
| `*_MODEL_LIGHT`, `*_MODEL_HEAVY` | Optional model names. Empty uses the defaults: Gemini `gemini-3.1-flash-lite` and `gemini-3.6-flash`, Groq `openai/gpt-oss-20b` and `openai/gpt-oss-120b`, OpenRouter `openrouter/free` for both. Free model names change often, so these are easy to override. |

How live mode works: the **Context Engine** (in the browser) picks the smallest useful redacted context and remembers answers for the session. The **Model Router** (on the server) sends light jobs (explanations, safe actions) to the light models and code-change jobs to the heavy models first, falling back to the next provider on a rate limit or error (each attempt at most 15 s, the whole request at most 25 s; the browser waits up to 28 s). Every answer shows which provider answered. The AI can propose a code change, but nothing changes until you press Approve, and only PatchBay's practice copy changes, never your repository.

The endpoint:
- In mock mode reads `AI_MODE` only and makes zero outbound requests.
- In live mode reads `AI_MODE` and the nine names above, and calls only three fixed provider addresses (keys go in headers, never in a URL).
- Logs only codes and outcome words, never the question, file paths, file content, answers, or keys.
- Redacts likely secrets from the question and snippets before any provider sees them, and again checks every answer.

**Real providers are Unverified** until you run the real-key check in `.kiro/specs/11-live-ai-chat/design.md` section 14; the automated tests use fake providers.

## Live AI in AI Chat (Phase 3, sub-phase 3A)

With `AI_MODE=live`, AI Chat shows a banner (live, "Live AI is not set up.", or "Could not check the AI mode.") and a few new controls.

- **Notice.** The first live question of a page session waits for you to press **OK** on a short notice (redacted pieces go to an outside company, free plans may use them, contents are off by default, nothing changes without Approve). Switching panels, Cancel, Stop, or `reset` drops the waiting question. A refresh forgets the OK.
- **What the AI sees.** Your question, the file names, up to three one-line connection facts, and (only when "Include the contents of the selected files" is ticked) a few redacted lines around the point of interest. The server adds one or two playbook cards. Whole large files are not sent.
- **Saved answers.** Asking the same thing about the same text again shows "Saved answer from earlier in this session." and sends nothing. **Ask again** sends a new request. Saved answers live in memory only and end on a refresh, a new repository, `reset`, a mode change, and any change to the practice copy.
- **Which model answers.** Explanations and "Do something" use the light models. "Suggest a change" tries the heavy models first, then the light ones ("Answered by a lighter model; review carefully."). Each answer says who answered, and a calm line says who was busy ("Gemini was busy, so Groq answered.").
- **About a finding.** Pick a scan finding to ask about its file and line. The AI can propose a change for it. A proposal is checked against the real file, shown as an "AI-proposed change" card, and applied to the practice copy only after you press Approve. Approve, Reject, Undo, and Redo work as for any change. After Approve the file is re-scanned and the Log says whether the finding is "no longer found" or "still found". At most 3 AI proposals are accepted per finding.
- **Do something.** A sentence such as "start the crew" can run a safe action (`help`, `status`, `start practice`, `start crew`, `pause`, `resume`, `step`, `stop`, `open <panel>`). The AI can never approve, reject, reset, undo, or redo (only you can change History), can never stop while a change waits for your decision, and no action runs when file contents or connection facts were sent with the question.
- **Typed command words** (`stop`, `approve`, `undo`...) never go to the AI.

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

## Edit pad (Phase 2, sub-phase 2E-2)

The **Edit** panel (Screen 3) is now an edit pad for the page in the Sandbox. Opening it pauses the practice run as before and turns preview scripts off. A clear overlay covers the preview so no page code ever gets your clicks.

- **Select** (click, Shift-click to add), **Lasso** (drag a box), **Background** (the page's top-level elements), or **Pick from list** (no pointer needed). One selected element shows three drag handles to resize it.
- The property form covers size, corners, spacing, border, shadow, text, and background (colours and a gradient). Every value is built from checked numbers, units, and colours; there is no free-form CSS anywhere.
- On a plain HTML page, a change to an element whose start tag can be rewritten safely is **written to the practice copy at once** as a `style` change and recorded in History (no Approve step). A burst of changes to the same elements merges into one entry; one Undo reverses the burst. Everything else (component pictures, complex styles, SVG, a page that changed) is **Preview Only**, listed with the reason, and never saved.
- After each change the layout is checked again; **Try a fix** proposes one of three fixed suggestions you can Keep or Discard. Undo and Redo buttons do exactly what the typed commands do.

## Journal and exports (Phase 2, sub-phase 2F)

The **Journal** toolbar button opens the Learning Journal. It explains how the loaded project works and what PatchBay found, at three reading levels (**Simple**, **Practical**, **Deeper**; the choice is saved). The Log still shows what PatchBay did.

- **Application overview**, **How things flow** (page, request, route, and setting traces that stop with a plain reason when PatchBay cannot see further), **Lessons from your project** (one lesson per check that found something, with the files and lines), and **Concepts** (12 short explanations). **Open in viewer** shows a file in the Sandbox's Source viewer with the line marked. **Learn more** on a finding (Screen 5) jumps to its lesson.
- All teaching text lives in one structured file, `src/skillbook/playbook.ts` (cards with tags, keywords, and three levels, checked by tests). Lookups (`cardById`, `cardsForSkill`, `cardsByTag`, `searchCards`) are ready for the Phase 3 AI. No AI is used now.
- Nothing in the Journal or the downloads comes from file contents: only paths, names, counts, and fixed text. Every fact goes through the secret redaction first.
- **Export changes** (History panel) downloads a `.patch` of your applied changes, one combined diff per file, made against the files as PatchBay loaded them. Apply it in your own project with `git apply <file>`. Files with practice-run changes are unchecked by default; files that were only partly read, have unusual path characters, contain a likely secret, or cannot be verified are left out with the reason. Preview Only changes are never exported.
- The **Log** panel downloads the log as Markdown or JSON (redacted, no file contents). The Journal downloads as Markdown at the current level.
- Downloads are made in the browser only. Nothing is uploaded.

## Saving and resetting a session (Phase 2, sub-phase 2G)

A browser refresh is harmless. PatchBay remembers **where you were**, not what the files contain: a small record (`patchbay.session.v1`) holds the repository address (owner, name, ref, chosen folders, or the sample), the screen, and the Sandbox width, mode, and page. After a refresh the Loading screen says "Restoring your session", loads the same repository again, and puts back the screen, the Sandbox settings, the panel layout, your History and edits, the Log, a paused practice run, your label corrections, and the reading level.

- Not restored, on purpose: Preview Only changes, the selection, scripts turned on, a Skeleton Crew run in progress, AI Chat text, and the scan (it runs again). The Log says so when it matters.
- If the repository cannot be loaded again (offline, rate limited, private), the failure panel keeps everything and offers Retry, Reset session, and Back to Start. Cancel during a restore goes to Start with **Resume last session**.
- **Back to Start** forgets the session record but keeps your History and corrections for that repository. **Reset session** (it asks first) deletes the session, History, Log, and corrections in this browser and keeps your layout and reading level. Your repository is never changed.
- **Saved in this browser** (Start screen and Project info) lists the five saved parts with their sizes. PatchBay never saves file contents, secrets, or what you type to the AI.
- Known limits: every refresh downloads the repository again (GitHub limits apply; samples cost nothing); a branch that moved since drops your saved changes to files that changed; two tabs overwrite each other (last write wins).

