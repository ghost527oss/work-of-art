# Design: 05 Project Understanding (Phase 2, Sub-phase 2C)

Implements `requirements.md` in this folder. Active product phase: **Phase 2, Sub-phase 2C**. Wireframe only, no animation, `AI_MODE=mock` only, no new dependency, no network, no AI. Built on 2A (shell) and 2B (harness): it uses `repoKeyOf`, the studio store slice pattern, the restore gate, `ProjectInfo`, and the session log.

## 1. Decisions already made

| Source | Decision |
|---|---|
| Blueprint section 1 | A built-in skill-book does the first pass offline, with zero AI tokens. |
| Blueprint section 2 | Read real clues, allow several labels per file, give a confidence and the exact reason, put unsure files in Needs Review, remember user corrections and log them. |
| Blueprint section 3 | Real connections only, proven kept apart from guessed, four areas with helper groups for images, tests, settings, and docs. |
| Phase 2 text, 2C gate | No guessed labels. Low-confidence files go to Needs Review. |
| 2A R9, 2B R8 | Saved parts use their own versioned key, hold no secrets or file contents, and use the restore gate. |
| Requirements section 7 (pending your answers) | Results in Project info. JavaScript, TypeScript, HTML, and CSS for connections. Security is not a label in 2C. `shared` only from imports. Analysis after loading. Corrections in their own slot. Provisional limits. |

## 2. Phase 2C compliance

| Rule (build-phases.md) | How this design complies |
|---|---|
| Design only the Current Active Sub-phase (2C) | File sorting, corrections, connection map, skill-book v1, and a section to show them. No scanner, no findings, no sandbox, no editor, no Journal. |
| Offline (no AI) file sorting, connection map, skill-book | Pure functions over the loaded snapshot. No network, no AI import. |
| Browser storage never holds secrets or whole repositories | Only the user's label corrections are saved: paths and label names. |
| Black-and-white wireframe, no animation | Text, tables, and borders only. Certainty is shown in words. |
| No new runtime dependency | None. A small hand-written source scanner replaces a parser library. |

## 3. Lightweight-architecture audit

| Gate | Status | Finding |
|---|---|---|
| 1. Dependency vetting | PASS | No package. A JavaScript parser library was considered and rejected: it adds hundreds of KB for a heuristic job, and every result is already labelled Confirmed, Inferred, or Broken. |
| 2. Memory and bundle | PASS | Results hold paths, labels, and short reasons shared by reference, not file contents. At most 20,000 file results and 5,000 edges. The scanner is about 300 lines. Bundle growth is reported in the final task against the 2B baseline. |
| 3. Free-tier resilience | PASS | No external service. The run is batched with an 8 second limit, so a large repository cannot freeze a 4 GB laptop. |
| 4. Teardown | PASS | One `AbortController` per run and one store subscription, released on unmount and when the snapshot changes. |

## 4. Files

All paths are relative to `work-of-art/`.

### 4.1 New
| File | Responsibility |
|---|---|
| `src/config/understandingLimits.ts` | 2C limits, marked provisional: 2,000 scanned files, 200 edges per file, 5,000 edges, 20,000 file results, 40 files per batch, 8,000 ms, 500 corrections, 64 KB saved, 120-character details. |
| `src/skillbook/types.ts` | `SkillStrength`, `ClueFamily`, `SortSkill`, `SkillBook`. |
| `src/skillbook/sortSkills.ts` | The sort skills as data (section 6). |
| `src/skillbook/index.ts` | `SKILLBOOK` (`version`, `sort`), `skillById`. 2D adds `scan` here. |
| `src/engine/sourceScan.ts` | `scanSource(path, content)`: finds imports, loads, route definitions, API calls, config reads, and code patterns, with line numbers. Pure. |
| `src/engine/sortFiles.ts` | `sortFile(facts)` and `sortAll(...)`: runs the skills and builds results. Pure. |
| `src/engine/connectionMap.ts` | `buildConnections(scans, inventory, ...)`: resolves targets, mounts routes, matches calls, assigns certainty. Pure. |
| `src/engine/analyzeProject.ts` | `analyzeProject(snapshot, options)`: the batched async run that ties the three together. |
| `src/engine/understandingView.ts` | Pure view helpers: `applyCorrections`, `AREA_OF_LABEL`, `HELPER_OF_LABEL`, `summarize`, `filterFiles`, `filterEdges`, `labelName`. |
| `src/store/understandingSlice.ts` | Types and pure transitions for the understanding state. |
| `src/store/understandingActions.ts` | Whole-state actions with log entries (like `aiActions.ts`). |
| `src/store/correctionsStorage.ts` | Saved corrections under `patchbay.corrections.v1`. |
| `src/hooks/useUnderstanding.ts` | `createUnderstandingController(...)` and `useUnderstanding()`. |
| `src/components/UnderstandingSection.tsx` | The section: state, summary, Needs Review, files, connections, coverage note. Props only. |
| `src/components/FileLabelsTable.tsx` | The files table with filters and the Why? disclosure. Props only. |
| `src/components/LabelEditor.tsx` | The small label form. Props only. |
| `src/components/ConnectionsTable.tsx` | The connections table with filters. Props only. |
| Tests | `skillbook`, `sourceScan`, `sortFiles`, `connectionMap`, `analyzeSamples`, `analyzeProject`, `understandingView`, `understandingState`, `correctionsStorage`, `understandingController` (`*.test.ts`); `understandingUi` (`*.test.tsx`). |

### 4.2 Modified
| File | Change |
|---|---|
| `src/store/useStudioStore.ts` | `StudioState` gains `understanding: UnderstandingState`. `initialState()` sets `idleUnderstanding()`. The four actions that already set `ai` and `work` also set `understanding: idleUnderstanding()`. |
| `src/components/ProjectInfo.tsx` | Renders `UnderstandingSection` between the coverage panel and the inventory. Gains a `understanding` prop (the controller actions). |
| `src/components/StudioLayout.tsx` | Passes the new prop down. |
| `src/App.tsx` | Calls `useUnderstanding()` once. |
| `src/styles.css` | A black-and-white block for the section. |
| `traceability/PLAN.md` | Adds plan `P2C-UNDERSTAND` with nodes F5.1 to F5.9. |

### 4.3 Not touched
`api/*`, `src/engine/{ingestPipeline,repoInventory,fileSelector,githubSource,...}.ts`, `src/types/contracts.ts` (the existing labels, confidence, and evidence types are reused as they are), every 2B file except through `repoKeyOf` (imported), the AI files, and all existing tests.

## 5. Data model

```ts
type Label = FileClassification            // existing enum
type Strength = 'strong' | 'moderate' | 'weak'

interface FileUnderstanding {
  path: string
  labels: Label[]                          // enum order; ['unknown'] when no clue
  confidence: 'high' | 'medium' | 'low'
  evidence: ClassificationEvidence[]       // existing type: { source, description, relatedPath? }
  needsReview: boolean
  basis: 'content' | 'path_only'
  ignored: boolean
  ignoredReason?: string
}

type EdgeKind = 'imports' | 'loads' | 'defines_route' | 'calls_api' | 'calls_external' | 'reads_config'
interface Edge {
  id: string                               // `${from}:${line}:${kind}:${target}`
  kind: EdgeKind
  from: string                             // source path
  target: string                           // a path, a route such as "PUT /api/profile/:id", an address, or a setting name
  targetPath?: string                      // the file at the other end, when there is one
  certainty: 'confirmed' | 'inferred' | 'broken'
  line: number                             // 1-based line in `from`
  note?: string
}

interface AnalysisResult {
  snapshotId: string
  skillbookVersion: number
  files: FileUnderstanding[]               // sorted by path
  edges: Edge[]                            // sorted by from, line, kind, target
  externals: string[]                      // package names, sorted, unique
  coverage: {
    fileEntries: number; read: number; pathOnly: number; ignored: number
    scanned: number                        // files scanned for connections
    unsupportedLanguage: number            // loaded files whose language is not scanned
    aliasImportsNotFollowed: number
    partial: boolean; notAnalysed: number
  }
}

interface UnderstandingState {
  status: 'idle' | 'running' | 'done' | 'failed'
  runId: number
  snapshotId?: string
  progress?: { done: number; total: number }
  result?: AnalysisResult
  error?: string
  corrections: Record<string, Label[]>     // plain data, saved
}
```

- `result` is **derived**: it holds no file content, and reasons are short strings. It is not saved.
- `effective` file results (corrections applied) are computed by `applyCorrections(result, corrections)` on demand, not stored.
- The state is plain data. `corrections` and nothing else is saved.

## 6. The skill-book, version 1 (`sortSkills.ts`)

Each skill: `id`, `title`, `strength`, `label`, `family` (`name`, `folder`, `manifest`, `import`, `syntax`, `reference`), `explain` (one or two plain sentences), and `appliesTo` (a short description used by tests). The matching code lives next to the table, in `sortFiles.ts`, keyed by the skill id, so the table stays readable data.

| Id | Strength | Label | Clue (plain description) |
|---|---|---|---|
| `sort.ext.image` | strong | assets | Images, fonts, and media files (`png jpg jpeg gif webp svg ico bmp avif woff woff2 ttf otf eot mp3 mp4 webm`) |
| `sort.name.test` | strong | tests | `.test.` or `.spec.` in the name, or a folder named `__tests__`, `tests`, `test`, `spec`, or `e2e` |
| `sort.ext.docs` | strong | documentation | `md mdx rst txt` files, and `LICENSE`, `CHANGELOG`, `CONTRIBUTING` |
| `sort.folder.docs` | moderate | documentation | A folder named `docs` or `documentation` |
| `sort.name.infra` | strong | infrastructure | `Dockerfile`, `docker-compose.*`, `Procfile`, `vercel.json`, `netlify.toml`, `render.yaml`, `*.tf`, anything under `.github/workflows/` |
| `sort.name.config` | strong | configuration | `package.json`, `tsconfig*.json`, `*.config.*`, `.eslintrc*`, `.prettierrc*`, `.gitignore`, `.editorconfig`, `.nvmrc`, `.babelrc`, `.env*` |
| `sort.ext.data-file` | moderate | configuration | Other `json yml yaml toml ini` files |
| `sort.ext.markup` | moderate | frontend | `html htm vue svelte` |
| `sort.ext.style` | moderate | frontend | `css scss sass less` |
| `sort.ext.jsx` | moderate | frontend | `jsx tsx` |
| `sort.ext.server-lang` | moderate | backend | `py rb go rs java kt php cs ex` |
| `sort.ext.schema` | strong | api_data | `sql prisma graphql gql proto` |
| `sort.folder.frontend` | weak | frontend | A folder named `components`, `views`, `pages` (not `pages/api`), `screens`, `public`, `static`, `client`, `frontend`, or `web` |
| `sort.folder.backend` | moderate | backend | A folder named `server`, `backend`, `routes`, `controllers`, `middleware`, or `handlers`; a root-level `api/`; `pages/api/`; `app/api/` |
| `sort.folder.service` | weak | backend | A folder named `services` |
| `sort.folder.data` | moderate | api_data | A folder named `models`, `schemas`, `migrations`, `prisma`, `db`, `database`, or `repositories` |
| `sort.folder.client-api` | weak | api_data | `api/` below the root (for example `src/api/`), which is usually a client data layer, not a server |
| `sort.import.frontend` | strong | frontend | Imports `react`, `react-dom`, `vue`, `svelte`, `solid-js`, `preact`, `@angular/core`, or `next/*` components |
| `sort.import.server` | strong | backend | Imports `express`, `fastify`, `koa`, `hono`, `@hapi/hapi`, `next/server` |
| `sort.import.node` | moderate | backend | Imports `fs`, `path`, `child_process`, `http`, `net`, or any `node:` module |
| `sort.import.db` | moderate | api_data | Imports `pg`, `mysql`, `mysql2`, `mongodb`, `mongoose`, `sqlite3`, `redis`, `knex`, `sequelize`, `typeorm`, `drizzle-orm`, `@prisma/client` |
| `sort.import.http-client` | moderate | api_data | Imports `axios`, `ky`, `got`, `node-fetch`, `swr`, `@tanstack/react-query` |
| `sort.syntax.dom` | moderate | frontend | Uses `document.`, `window.`, `localStorage`, or `sessionStorage` |
| `sort.syntax.handler` | strong | backend | A request handler: `export default function handler(req`, exported `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` functions, or `exports.handler =` |
| `sort.syntax.route-def` | strong | backend | A route definition (an edge of kind `defines_route`) |
| `sort.syntax.route-data` | moderate | api_data | The same route definition (it serves requests and data) |
| `sort.syntax.request-call` | moderate | api_data | A call that sends a request (an edge of kind `calls_api` or `calls_external`) |
| `sort.manifest.frontend-project` | weak | frontend | `package.json` lists a frontend framework and no server framework, and the file is JavaScript or TypeScript under `src/` |
| `sort.manifest.backend-project` | weak | backend | `package.json` lists a server framework and no frontend framework, and the file is JavaScript or TypeScript |
| `sort.ref.loaded-by-html` | moderate | frontend | A web page loads this file with a script, stylesheet, or image tag |
| `sort.ref.shared` | moderate | shared | Imported by both a Frontend and a Backend file (second pass) |

The `explain` text for each is written for a beginner, for example `sort.ext.jsx`: "Files ending in .jsx or .tsx hold screen pieces, so they belong to the frontend." No skill text contains jargon from the banned list in the tests.

## 7. The source scanner (`sourceScan.ts`)

`scanSource(path, content)` returns `{ imports, loads, routes, calls, env, patterns, aliasImports, unsupported }`. It never throws and never returns content, only specifiers, addresses, names, and line numbers.

1. **Choose the language** from the extension: JavaScript family, HTML, CSS, or unsupported.
2. **Mask comments** in JavaScript and CSS with one linear pass that tracks whether it is inside a string, a template literal, a line comment, or a block comment, and replaces comment characters with spaces (keeping line breaks so line numbers stay right). Strings stay, because the specifiers and addresses are strings.
3. **Find tokens with small anchored patterns on the masked text**, each bounded in length (no nested open-ended repetition, to avoid slow matches):
   - `import x from '...'`, `import '...'`, `export ... from '...'`, `require('...')`, `import('...')`.
   - `fetch(`, `axios(`, `axios.get|post|put|patch|delete(`, `ky(`, `ky.get(...)`, and `.open('METHOD', '...')`. The first string or the template prefix is the address. A `method: 'PUT'` inside the next 200 characters sets the method. No `method` for `fetch` means GET.
   - Route calls: `X.get|post|put|patch|delete('/...'` where `X` is `app` or `router`, or is assigned in the same file from `express()`, `express.Router()`, `Router()`, `new Hono()`, or `fastify()`. This keeps `axios.get('/x')` from being read as a route.
   - Mounts: `X.use('/prefix', ident)` with `ident` bound in the same file by `require('./...')` or `import ident from './...'`.
   - Config reads: `process.env.NAME`, `process.env['NAME']`, `import.meta.env.NAME`.
   - Patterns: `document.`, `window.`, `localStorage`, `sessionStorage`; handler forms for `sort.syntax.handler`.
4. **HTML** uses a few anchored patterns for `<script ... src="...">`, `<img ... src="...">`, and `<link ... rel="stylesheet" ... href="...">` (any attribute order), ignoring text inside HTML comments. **CSS** uses `@import '...'` and `@import url(...)`.
5. **Limits:** it stops after 200 results per file and works only on the first 200 KB (the loaded size is already capped at that). It treats a line longer than 10,000 characters as one token and does not scan inside it, to keep the time bounded.

It is a scanner, not a parser. That is why every connection carries a certainty, and why anything the scanner cannot be sure of is Inferred.

## 8. Sorting (`sortFiles.ts`)

`sortAll(inventoryFiles, scans, manifestFacts)`:
1. **Ignored:** an entry whose `reasonCode` is in the existing `POLICY_SKIP_REASONS` becomes `{ ignored: true, labels: [], needsReview: false }`. Its reason names the policy reason in words.
2. **Hits:** for each remaining file entry, run the path skills (name, folder, extension, manifest) and, when the file has content, the import and syntax skills. Reference skills run in a second step with the edges.
3. **Suppression rule:** when a file has a **strong** hit for `assets`, `tests`, `documentation`, `configuration`, or `infrastructure`, every `frontend`, `backend`, and `api_data` hit that is not strong is dropped. (A test file that imports `fs`, or a config file that uses `node:path`, is not "also Backend".)
4. **Confidence per label:** High when it has a strong hit or two moderate hits; Medium when it has one moderate hit or two weak hits; Low when it has one weak hit. Weak and moderate hits for different skills count separately.
5. **Low labels** are dropped when any label is Medium or High.
6. **No hits:** `unknown`, Low, `needsReview`, reason "No clue found. Extension and folder do not say what this file is."
7. **Overall confidence** is the lowest among the remaining labels. `needsReview` is true when the labels are `unknown` or the confidence is Low.
8. **Evidence:** one record per hit, in label order then strength then id, with `source` set from the clue family (`path` for name and folder, `extension`, `manifest`, `import`, `syntax`, `reference`) and the description `"[<id>] <explain> (<detail>)"`. The detail is a short fact such as the extension, the folder name, the import specifier, or the dependency name, cut to 120 characters and passed through `redact()`.
9. **Second pass (`sort.ref.loaded-by-html`, `sort.ref.shared`):** after the connection map exists, a file that is the target of a `loads` edge gets the first skill, and a file imported (Confirmed edges) by at least one file with a Medium or better `frontend` label and at least one with a Medium or better `backend` label, and with no own `frontend` or `backend` hit, gets `shared` and the reason lists up to three importers. The pass then repeats steps 3 to 7 for those files only. It runs once, in file path order, so the result does not depend on the order the files are processed.
10. **Path only:** a file with no content skips content skills. Its evidence gains the final line "Not read; sorted by its path and type."
11. **Per-file failure:** the call for one file is wrapped, so a failure marks only that file Needs Review with "Could not be analysed."

## 9. The connection map (`connectionMap.ts`)

1. **Resolve targets.** For a relative specifier, join it to the source folder, normalise `..` and `.`, and try the candidate list in the requirements (R4.2). A root-relative target (`/src/main.tsx`) is resolved from the repository root. Anything starting with an alias prefix (`@/`, `~/`, `#`, `$lib`) is counted in `aliasImportsNotFollowed`. A package name is added to `externals` (the scope plus the name for scoped packages, otherwise the first path segment).
2. **Routes.** File-placement routes come from path rules (root `api/name.ext` gives `/api/name` with no method; `pages/api/**`; `app/**/route.ext`, where the folders give the path and the exported method names give the methods). Code routes come from the scanner. Mounts apply as in R4.2: the prefix is joined to the route path, and the `defines_route` edge's note says "mounted at <prefix> by <file>:<line>". A router whose mount cannot be resolved keeps its own path and the note "mount path unknown".
3. **Matching a call to a route.** Split paths on `/`, ignore the query string and a trailing slash, and compare segment by segment. A route segment starting with `:` or written `[name]` matches any one segment. A call segment containing `${...}` matches any one segment but makes the result Inferred. Methods are compared when both are known. The certainty rules are exactly R4.4.
4. **Edges** are built in a fixed order and capped (200 per file, 5,000 total). When a cap cuts results, `coverage.partial` is true.
5. **The `to` of a `calls_api` edge** that matches a route is the route's file in `targetPath` and `"<METHOD> <route path>"` in `target`.
6. **Environment names** are stored only as names. The scanner does not capture anything after `=`.

## 10. Worked examples (expected results for the three samples)

These are the expectations the tests write out by hand. Lines are 1-based in the sample file.

### 10.1 Static site
| Path | Labels | Confidence | Why (skills) |
|---|---|---|---|
| `README.md` | documentation | High | `sort.ext.docs` |
| `about.html` | frontend | Medium | `sort.ext.markup` |
| `css/styles.css` | frontend | High | `sort.ext.style`, `sort.ref.loaded-by-html` |
| `img/logo.png` | assets | High | `sort.ext.image`, not read |
| `index.html` | frontend | Medium | `sort.ext.markup` |
| `js/app.js` | frontend | High | `sort.syntax.dom`, `sort.ref.loaded-by-html` |
| `node_modules/left-pad/index.js` | none, ignored | n/a | excluded dependency |

Edges (all Confirmed `loads`): `about.html:3 -> css/styles.css`, `index.html:6 -> css/styles.css`, `index.html:11 -> img/logo.png`, `index.html:16 -> js/app.js`. No external packages. Needs Review: none.

### 10.2 React frontend
| Path | Labels | Confidence | Why (skills) |
|---|---|---|---|
| `README.md` | documentation | High | `sort.ext.docs` |
| `index.html` | frontend | Medium | `sort.ext.markup` |
| `package-lock.json` | none, ignored | n/a | excluded lock file |
| `package.json` | configuration | High | `sort.name.config` |
| `public/favicon.ico` | assets | High | `sort.ext.image`, not read |
| `src/App.tsx` | frontend | Medium | `sort.ext.jsx`, `sort.manifest.frontend-project` |
| `src/api/auth.ts` | api_data | Medium | `sort.syntax.request-call`, `sort.folder.client-api` (the Low frontend label from `sort.manifest.frontend-project` is dropped) |
| `src/components/LoginForm.tsx` | frontend | High | `sort.import.frontend`, `sort.ext.jsx`, `sort.folder.frontend` |
| `src/main.tsx` | frontend | High | `sort.import.frontend`, `sort.ext.jsx`, `sort.syntax.dom`, `sort.ref.loaded-by-html` |
| `src/styles.css` | frontend | Medium | `sort.ext.style` |
| `vite.config.ts` | configuration | High | `sort.name.config` |

Edges: `index.html:4 -> src/main.tsx` (loads, Confirmed); `src/main.tsx:2 -> src/App.tsx` and `src/main.tsx:3 -> src/styles.css` (imports, Confirmed); `src/App.tsx:1 -> src/components/LoginForm.tsx` (imports, Confirmed); `src/components/LoginForm.tsx:2 -> src/api/auth.ts` (imports, Confirmed); `src/api/auth.ts:2` calls `POST /api/sign-in` (calls_api, **Inferred**, note "No backend routes were found in this repository; the route may live elsewhere."). External packages: `@vitejs/plugin-react`, `react`, `react-dom`, `vite`. Needs Review: none.

### 10.3 Full-stack API
| Path | Labels | Confidence | Why (skills) |
|---|---|---|---|
| `.env.example` | configuration | High | `sort.name.config` |
| `README.md` | documentation | High | `sort.ext.docs` |
| `client/app.js` | frontend, api_data | Medium | frontend: `sort.syntax.dom`, `sort.ref.loaded-by-html`, `sort.folder.frontend`; api_data: `sort.syntax.request-call` (the Low backend label from `sort.manifest.backend-project` is dropped) |
| `client/favicon.ico` | assets | High | `sort.ext.image`, not read |
| `client/index.html` | frontend | Medium | `sort.ext.markup`, `sort.folder.frontend` |
| `node_modules/express/index.js` | none, ignored | n/a | excluded dependency |
| `package.json` | configuration | High | `sort.name.config` |
| `server/index.js` | backend | High | `sort.import.server`, `sort.folder.backend`, `sort.manifest.backend-project` |
| `server/middleware/validate.js` | backend | Medium | `sort.folder.backend`, `sort.manifest.backend-project` |
| `server/routes/profile.js` | backend, api_data | Medium | backend: `sort.import.server`, `sort.syntax.route-def`, `sort.folder.backend`, `sort.manifest.backend-project`; api_data: `sort.syntax.route-data` |
| `server/services/profileService.js` | backend | Medium | `sort.folder.backend`, `sort.folder.service`, `sort.manifest.backend-project` |

Edges: `client/index.html:6 -> client/app.js` (loads, Confirmed); `server/index.js:2 -> server/routes/profile.js` (imports, Confirmed); `server/index.js:7` reads setting `PORT` (reads_config, Confirmed); `server/routes/profile.js:3 -> server/services/profileService.js` and `server/routes/profile.js:2 -> server/middleware/validate.js` (imports, Confirmed); `server/routes/profile.js:7` defines `PUT /api/profile/:id` (defines_route, Confirmed, note "mounted at /api/profile by server/index.js:6"); `client/app.js:3` calls `PUT /api/profile/1` and matches that route (calls_api, **Confirmed**, `targetPath` `server/routes/profile.js`). External packages: `express`. Needs Review: none.

If the implementation produces anything different, the expectations here are reviewed first with the user, because they are the hand-written truth for 2C.

## 11. The analysis run, state, and actions

### 11.1 `analyzeProject(snapshot, { signal, yieldToMain, now })`
1. Build the file facts from `snapshot.inventory.entries` (files only) and `snapshot.files`.
2. In batches of 40 files (sorted by path), scan content (only for `loaded` files with content and a supported language, up to 2,000 files), then `await yieldToMain()` and check the abort signal and the 8 second limit.
3. Build connections from the scans, then sort files (with the second pass), then assemble the result.
4. On abort, throw an abort error and return nothing. On the time limit, stop scanning, mark the remaining files `needsReview` with "Not analysed: time limit.", and set `partial`.
5. `yieldToMain` is injected: `() => new Promise(r => setTimeout(r, 0))` in the app, a counter in tests.

### 11.2 State and actions
- `understandingSlice.ts` holds the pure transitions: `uBegin(runId)`, `uProgress`, `uComplete(runId, result)`, `uFail(runId, message)`, `uCancel`, `uSetCorrection(path, labels)`, `uRemoveCorrection(path)`, `uClearCorrections()`, `uRestoreCorrections(map)`. Stale run ids are ignored, like ingestion runs.
- `understandingActions.ts` wraps them with `withLog`: `understanding_started`, `understanding_done` ("N files sorted, M need review, K connections"), `understanding_failed`, `label_corrected` ("Labels for <path> set to <names>."), `label_reset`, `labels_cleared`. Entries hold paths, counts, and label names only.
- `useStudioStore.ts` clears `understanding` (including corrections in memory) wherever `ai` and `work` are cleared.

## 12. Saved corrections (`correctionsStorage.ts`)

- Key `patchbay.corrections.v1`. Record `{ version: 1, repoKey, savedAt, corrections: Record<path, Label[]> }`, strict. At most 500 paths, each at most 250 characters, each with 1 to 9 labels from the selectable set, and the whole text at most 64 KB.
- `loadCorrections(storage)`, `saveCorrections`, `clearCorrectionsSlot`: never throw.
- On restore, only paths that exist in the new snapshot's inventory are kept.
- The controller uses the same **restore gate** as 2B: save only when the snapshot exists and `restoredFor === snapshot.id`.

## 13. The controller (`useUnderstanding.ts`)

```ts
createUnderstandingController(studio, services): { actions, dispose }
services: { storage, yieldToMain, now, analyze }       // analyze = analyzeProject in the app, a fake in tests
actions: { run(): void; cancel(): void; setLabels(path, labels): void; removeCorrection(path): void; clearCorrections(): void }
```

- A studio-store subscriber: when the snapshot id changes, abort the current run, restore corrections (once for that id), then start a run with a new `AbortController`. When the snapshot is cleared, abort and do nothing else.
- `run()` starts a new run only when none is running. `cancel()` aborts and returns the state to `idle`.
- After every change, when the gate allows, corrections are saved (or the slot cleared when empty and a clear was asked for).
- `dispose()` aborts, unsubscribes, and ignores later results.
- `useUnderstanding()`: `useMemo` and an effect to dispose, like `useHarness`.

## 14. User interface (`UnderstandingSection` and children)

- **Header and state:** "Project understanding". A line for the state: "Analysing N of M files." with **Cancel**, "Analysis was cancelled." with **Run again**, "Analysis failed: <message>" with **Try again**, or "Analysis is up to date." (and "Partial result: <n> files not analysed." when partial).
- **Summary** (a table): rows for each label, each area, each helper group, Needs Review, Ignored. Area Security reads 0 with the note "Security is checked by the scanner in sub-phase 2D."
- **Needs Review** (a list): path, the first reason, and **Set labels**.
- **Files**: filters (select for area or helper group, select for confidence, a "Needs Review only" checkbox, a text box), a table of 200 rows with **Show more**, columns Path, Labels, Confidence, Reason. A **Why?** `<details>` shows all reasons, and the earlier automatic reasons below "Before your change" when corrected. **Set labels** opens the editor.
- **Label editor:** a labelled fieldset of checkboxes with plain names, **Save**, **Cancel**, and **Remove my change** when corrected. A hint line explains that you can choose several labels.
- **Connections**: filters for kind (select), certainty (select), and a text box; a table of 200 rows with **Show more**, columns Kind, From, To, Certainty, Line, Note. Certainty is written "Confirmed", "Inferred", or "Broken".
- **Coverage note** (a paragraph and list): files read, files sorted by path only, ignored, languages not scanned, alias imports not followed, external packages (first 20), and "The map is partial." when true.
- **Clear my label corrections:** a button, shown when any correction exists.
- Tables sit in a scroll box so the page never scrolls sideways. All text is React text.

## 15. Failure handling

| Failure | Handling |
|---|---|
| A file's scan or sort throws | That file only is Needs Review, "Could not be analysed." |
| Whole run throws | `failed` state with a short message, Try again, the rest of Project info works. |
| Abort (snapshot change, Cancel, unmount) | The run stops, no partial result, state `idle` or cleared. |
| Time limit | Partial result with the list of not-analysed files in Needs Review. |
| Bounds hit (files, edges) | Partial map with counts in the note. |
| Saved corrections bad, old, or from another repository | None restored, no message. |
| Storage blocked or full | Corrections kept for this visit. |
| Slow pattern risk | Anchored, length-bounded patterns, long lines skipped, and a timing test on hostile input. |

## 16. Verification mapping

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Skill-book | `tests/skillbook.test.ts` (C1) |
| 2. Source scanner | `tests/sourceScan.test.ts` (C2) |
| 3. Sorting | `tests/sortFiles.test.ts` (C3) |
| 4. Connections | `tests/connectionMap.test.ts` (C4) |
| 5. Samples | `tests/analyzeSamples.test.ts` (C5) |
| 6. Analysis run | `tests/analyzeProject.test.ts` (C5) |
| 7. State and corrections | `tests/understandingState.test.ts`, `tests/understandingView.test.ts` (C6) |
| 8. Storage | `tests/correctionsStorage.test.ts` (C7) |
| 9. Controller | `tests/understandingController.test.ts` (C7) |
| 10. Components | `tests/understandingUi.test.tsx` (C8, C9) |
| 11. Static checks | C1 to C9 acceptance, C10 |
| 12. Regression | C6, C9, C10 |
| 13. Browser run | C10 |
| 14. Phase 2C gate | C10 |

## 17. Risks and known limits

- **It is a scanner, not a parser.** Odd formatting, code built from strings, or macros can be missed. Missed items are absent, not wrong, and the coverage note says what was scanned. Anything pattern-based is Inferred.
- **Aliases and non-JS languages are not followed.** The note counts them. A repository that relies on them will show fewer connections, and says so.
- **The extension alone never labels `.js` and `.ts`.** Many files will go to Needs Review in loosely organised repositories. That is deliberate (no guessing), and corrections make it quick to fix.
- **Folder names are weak evidence.** They are weighted that way, and the reason always names the folder.
- **Results are recomputed on every load.** Only corrections are saved. A very large repository stops at the 8 second limit with a partial result.
- **Security is empty in the summary until 2D.**
- **2D will extend `SKILLBOOK` and `Edge` use.** The skill-book type already reserves a place for `scan` skills.
- **`scripts/traceability/*` still do not exist.** Approvals are recorded in chat.

## 18. PLAN.md nodes

Plan `P2C-UNDERSTAND`, feature `F5 — Project Understanding`, with nodes F5.1 (skill-book and limits), F5.2 (source scanner), F5.3 (sorting), F5.4 (connection map), F5.5 (analysis run, view helpers, samples), F5.6 (state, actions, store integration), F5.7 (saved corrections and controller), F5.8 (components), F5.9 (wiring into Project info and App). Full text is in `traceability/PLAN.md`.
