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
| 2C interview answers (approved) | Results in Project info below the Sandbox. Connections for JavaScript, TypeScript, HTML, CSS, and basic Python. Security shown as "pending scan (2D)", never 0. `shared` only from import proof. The analysis is the real `classifying` loading stage. Corrections saved for one repository with a Clear button. Limits of 2,000 files, 5,000 connections, 8 seconds, 500 corrections, and every limit reached marks the result Partial with a reason. |
| Questions A to E in requirements section 7 (pending) | The classify stage is listed after "Load source files". Two `store.test.ts` tests change. Loading may wait up to 8 seconds more. An analysis failure does not block loading. Python is basic. |

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
| `src/engine/sourceScan.ts` | `scanSource(path, content)`: dispatches by extension and holds the JavaScript, TypeScript, HTML, and CSS scanners. Pure. |
| `src/engine/sourceScanPy.ts` | `scanPython(path, content)`: the basic Python scanner (section 7.2). Pure. |
| `src/engine/sortFiles.ts` | `sortAll(...)`: runs the skills and builds results. Pure. |
| `src/engine/connectionMap.ts` | `buildConnections(...)`: resolves targets, mounts routes, matches calls, assigns certainty, collects partial reasons. Pure. |
| `src/engine/analyzeProject.ts` | `analyzeProject(snapshot, options)`: the batched async run that ties the three together and reports progress. |
| `src/engine/understandingView.ts` | Pure view helpers: `applyCorrections`, `AREA_OF_LABEL`, `HELPER_OF_LABEL`, `summarize`, `filterFiles`, `filterEdges`, `labelName`. |
| `src/store/understandingSlice.ts` | Types and pure transitions for the understanding state. |
| `src/store/understandingActions.ts` | Whole-state actions with log entries (like `aiActions.ts`). |
| `src/store/correctionsStorage.ts` | Saved corrections under `patchbay.corrections.v1`. |
| `src/hooks/useUnderstanding.ts` | `createUnderstandingController(...)` (re-run, cancel, corrections, saving) and `useUnderstanding()`. |
| `src/components/UnderstandingSection.tsx` | The section: state, partial line, summary, and the collapsible blocks. Props only. |
| `src/components/FileLabelsTable.tsx`, `LabelEditor.tsx`, `ConnectionsTable.tsx` | The files table with filters and Why?, the label form, the connections table. Props only. |
| Tests | `skillbook`, `sourceScan`, `sourceScanPy`, `sortFiles`, `connectionMap`, `analyzeSamples`, `analyzeProject`, `understandingView`, `understandingState`, `classifyStage`, `correctionsStorage`, `understandingController` (`*.test.ts`); `understandingUi` (`*.test.tsx`). |

### 4.2 Modified
| File | Change |
|---|---|
| `src/types/contracts.ts` | `NOT_YET_AVAILABLE_STAGES` becomes `['preparing_preview']`. No other change. |
| `src/store/useStudioStore.ts` | `StudioState` gains `understanding`. `IngestionState` gains `classifyProgress`. `freshStages()` makes `classifying` `pending`. New pure actions `beginClassifying`, `classifyProgressed`, `finishClassifying`. `completeIngestion` gains an optional last argument, the understanding state to store (default `idleUnderstanding()`). The four actions that clear `ai` and `work` also clear `understanding`. |
| `src/hooks/useIngestion.ts` | `IngestionServices` gains the optional `analyze` and `loadCorrections` services. After the snapshot is validated, the run does the classify stage (with the same `AbortController`) and then one `completeIngestion` carrying the result. Without `analyze`, the stage is skipped and nothing else changes. |
| `src/components/LoadingScene.tsx` | The stage list puts "Classify files" after "Load source files" and shows "(N of M files)" for it from `classifyProgress`. |
| `tests/store.test.ts` | **Exactly two tests** are updated: the initial stages test (`classifying` is now `pending`) and the "never changes the two stages that do not exist yet" test (now only `preparing_preview`). No other existing test changes. |
| `src/components/ProjectInfo.tsx` | Renders `UnderstandingSection` between the coverage panel and the inventory. Gains a prop for the controller actions. |
| `src/components/StudioLayout.tsx` | Passes the new prop down. |
| `src/App.tsx` | Calls `useUnderstanding()` once and gives the ingestion controller the analysis and corrections services. |
| `src/styles.css` | A black-and-white block for the section. |
| `traceability/PLAN.md` | Adds plan `P2C-UNDERSTAND` with nodes F5.1 to F5.11. |

### 4.3 Not touched
`api/*`, `src/engine/{ingestPipeline,repoInventory,fileSelector,githubSource,repoFetcher,...}.ts` (the server and the `/api/repo` events do not change), every 2B file except through `repoKeyOf` (imported), the AI files, and every existing test except the two named above.

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
    notScanned: Record<string, number>     // extension -> count, for "connections not scanned for this language"
    aliasImportsNotFollowed: number
    djangoUrlFilesSeen: boolean
    partial: boolean
    partialReasons: string[]               // plain-words reasons, one per limit reached, empty when not partial
    notAnalysed: number
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

// Summary rows come from `summarize(result, corrections)`. The Security area is the fixed value
// 'pending' (never a number) until 2D adds the scanner.
```

- `IngestionState` (existing) gains `classifyProgress?: { done: number; total: number }`, set only while the `classifying` stage is active and only with both numbers known.
- `result` is **derived**: it holds no file content, and reasons are short strings. It is not saved.
- `effective` file results (corrections applied) are computed by `applyCorrections(result, corrections)` on demand, not stored.
- The state is plain data. `corrections` and nothing else is saved.

## 6. The skill-book, version 1 (`sortSkills.ts`)

Each skill: `id`, `title`, `strength`, `label`, `family` (`name`, `folder`, `manifest`, `import`, `syntax`, `reference`), `explain` (one or two plain sentences), and `appliesTo` (a short description used by tests). The matching code lives next to the table, in `sortFiles.ts`, keyed by the skill id, so the table stays readable data.

| Id | Strength | Label | Clue (plain description) |
|---|---|---|---|
| `sort.ext.image` | strong | assets | Images, fonts, and media files (`png jpg jpeg gif webp svg ico bmp avif woff woff2 ttf otf eot mp3 mp4 webm`) |
| `sort.name.test` | strong | tests | `.test.` or `.spec.` in the name, `test_*.py`, `*_test.py`, `conftest.py`, or a folder named `__tests__`, `tests`, `test`, `spec`, or `e2e` |
| `sort.ext.docs` | strong | documentation | `md mdx rst txt` files, and `LICENSE`, `CHANGELOG`, `CONTRIBUTING` |
| `sort.folder.docs` | moderate | documentation | A folder named `docs` or `documentation` |
| `sort.name.infra` | strong | infrastructure | `Dockerfile`, `docker-compose.*`, `Procfile`, `vercel.json`, `netlify.toml`, `render.yaml`, `*.tf`, anything under `.github/workflows/` |
| `sort.name.config` | strong | configuration | `package.json`, `tsconfig*.json`, `*.config.*`, `.eslintrc*`, `.prettierrc*`, `.gitignore`, `.editorconfig`, `.nvmrc`, `.babelrc`, `.env*`, `requirements*.txt`, `pyproject.toml`, `Pipfile`, `setup.cfg` |
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
| `sort.import.server` | strong | backend | Imports `express`, `fastify`, `koa`, `hono`, `@hapi/hapi`, `next/server`; in Python `flask`, `fastapi`, `django`, `starlette`, `tornado`, `bottle`, `sanic` |
| `sort.import.node` | moderate | backend | Imports `fs`, `path`, `child_process`, `http`, `net`, or any `node:` module |
| `sort.import.db` | moderate | api_data | Imports `pg`, `mysql`, `mysql2`, `mongodb`, `mongoose`, `sqlite3`, `redis`, `knex`, `sequelize`, `typeorm`, `drizzle-orm`, `@prisma/client`; in Python `sqlalchemy`, `psycopg2`, `asyncpg`, `pymongo`, `peewee`, `sqlite3`, `django.db` |
| `sort.import.http-client` | moderate | api_data | Imports `axios`, `ky`, `got`, `node-fetch`, `swr`, `@tanstack/react-query`; in Python `requests`, `httpx`, `urllib3` |
| `sort.syntax.dom` | moderate | frontend | Uses `document.`, `window.`, `localStorage`, or `sessionStorage` |
| `sort.syntax.handler` | strong | backend | A request handler: `export default function handler(req`, exported `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` functions, or `exports.handler =` |
| `sort.syntax.route-def` | strong | backend | A route definition (an edge of kind `defines_route`) |
| `sort.syntax.route-data` | moderate | api_data | The same route definition (it serves requests and data) |
| `sort.syntax.request-call` | moderate | api_data | A call that sends a request (an edge of kind `calls_api` or `calls_external`) |
| `sort.manifest.frontend-project` | weak | frontend | `package.json` lists a frontend framework and no server framework, and the file is JavaScript or TypeScript under `src/` |
| `sort.manifest.backend-project` | weak | backend | `package.json` (or `requirements.txt`) lists a server framework and no frontend framework, and the file is JavaScript, TypeScript, or Python |
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

### 7.2 Python (`sourceScanPy.ts`)

`scanPython(path, content)` returns the same shape as `scanSource`, and the dispatcher in `sourceScan.ts` calls it for `.py`.
1. **Mask** `#` comments and the bodies of triple-quoted strings (replace with spaces, keep line breaks). Ordinary string literals stay, because route paths and addresses are strings.
2. **Imports**, matched only at the start of a line (after indentation): `import a.b`, `import a.b as c`, `from a.b import c, d`, `from . import x`, `from .x import y`, `from ..x import y`. The result keeps the dotted module, the imported names, and the number of leading dots.
3. **Bindings:** `X = Flask(...)`, `X = Blueprint('name', __name__, url_prefix='/p')`, `X = FastAPI(...)`, `X = APIRouter(prefix='/p')`, and the imported names from step 2. The `url_prefix=` or `prefix=` string is read from the call.
4. **Routes:** a decorator line `@X.route('/p', methods=['GET', 'POST'])` or `@X.get|post|put|patch|delete('/p')` where `X` is a binding from step 3. One route per method (or one route with no method when `methods` is missing).
5. **Mounts:** `app.register_blueprint(Y, url_prefix='/p')` and `app.include_router(Y, prefix='/p')` where `Y` is a binding (same file or imported). The prefix is stored with `Y`.
6. **Calls:** `requests.<method>(`, `httpx.<method>(`, `requests.request('METHOD', `, and `urllib.request.urlopen(` with a string literal or an f-string first address. `{...}` inside an f-string becomes the unknown marker. External addresses are recognised by `http://` or `https://`.
7. **Config reads:** `os.environ['NAME']`, `os.environ.get('NAME')`, `os.getenv('NAME')`.
8. **Not read:** Django `urls.py` forms, class-based views, dynamic imports, and star imports. A file named `urls.py` that contains `path(` or `re_path(` sets `djangoUrlFilesSeen`.
9. The same limits as 7.1 apply: 200 results per file, lines over 10,000 characters skipped, linear time, and no source lines or values in the output.

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
7. **Python resolution.** A dotted module `a.b.c` is tried from the repository root and from `src/` as `a/b/c.py`, then `a/b/c/__init__.py`. For `from a.b import c`, the module `a/b/c.py` is tried first (when `c` is a submodule), then `a/b.py`, then `a/b/__init__.py`. Relative forms start at the importing file's folder, one level up per extra dot. A relative import that does not resolve follows the same Broken or Inferred rule as JavaScript. An absolute import that does not resolve adds its top-level name to `externals` (shown as "external package or standard library") and makes no edge.
8. **Python routes and mounts** use the same matching as JavaScript. A `Blueprint` or `APIRouter` prefix, joined with a `register_blueprint` or `include_router` prefix, is put in front of each route path, and the note says "mounted at <prefix> by <file>:<line>". A router that is never mounted keeps its own path with the note "mount path unknown".

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

## 11. The analysis run and the `classifying` stage

### 11.1 `analyzeProject(snapshot, { signal, yieldToMain, now, onProgress })`
1. Build the file facts from `snapshot.inventory.entries` (files only) and `snapshot.files`. Collect the manifest facts (`package.json` and `requirements.txt` dependency names).
2. In batches of 40 files (sorted by path), scan the content of `loaded` files with a supported language (up to 2,000 files), call `onProgress({ done, total })`, then `await yieldToMain()` and check the abort signal and the 8 second limit.
3. Build connections, then sort files (with the second pass), then assemble the result with `coverage.notScanned` (extension and count for every loaded code or markup file that is not scanned).
4. **Partial reasons** are collected as plain sentences, one per limit reached, in this fixed order: files scanned (2,000), time (8 seconds), connections in total (5,000), connections per file (200), file results (20,000). Each names the limit and the amount missing. `coverage.partial` is true exactly when the list is not empty. The files not analysed because of time are marked Needs Review with "Not analysed: time limit."
5. On abort, throw an abort error and return nothing. `yieldToMain` is injected: `() => new Promise(r => setTimeout(r, 0))` in the app, a counter in tests.

### 11.2 The classify stage inside the loading run (`useIngestion.ts` and the store)
The server pipeline and `/api/repo` are unchanged and still emit no `classifying` events. The client owns the stage:

```
snapshot validated (existing step)
  -> store.update(beginClassifying(runId))                 stage classifying = active, classifyProgress cleared
  -> corrections = services.loadCorrections(snapshot)      matching repository only, existing paths only; never throws
  -> result = await services.analyze(snapshot, { signal, onProgress })
        onProgress -> store.update(classifyProgressed(runId, done, total))
  -> store.update(finishClassifying(runId, 'done'))
  -> store.update(completeIngestion(runId, snapshot, now, understandingDone(result, corrections)))   ONE update
failure of analyze (not abort):
  -> store.update(finishClassifying(runId, 'failed'))
  -> store.update(completeIngestion(..., understandingFailed(message, corrections)))   loading still finishes
abort: nothing more (cancel or dispose already updated the state)
services.analyze missing: store.update(finishClassifying(runId, 'skipped')) and complete as before
```

- The order of stages on the Loading screen is: Resolve branch, Fetch file tree, Load source files, Classify files, Prepare preview. Display order is set in `LoadingScene.tsx`. The `IngestStage` enum order does not change.
- `beginClassifying`, `classifyProgressed`, and `finishClassifying` ignore a stale `runId`, like every other ingestion action. `finishClassifying` never fails the run: it only sets the stage status.
- For a **background** run (scoped folder reload) the same code runs, the Studio keeps showing the old data, and the reload banner is unchanged.
- The one `completeIngestion` call is what makes the Studio open with the snapshot, the result, and the corrections together.

### 11.3 Understanding state and actions
- `understandingSlice.ts` holds the pure transitions: `uBegin(runId)`, `uProgress`, `uComplete(runId, result)`, `uFail(runId, message)`, `uCancel`, `uSetCorrection(path, labels)`, `uRemoveCorrection(path)`, `uClearCorrections()`. These serve the Studio re-run and the corrections. Stale run ids are ignored. `uSetCorrection` refuses with a message when 500 corrections exist and the path is new.
- `understandingActions.ts` wraps them with `withLog`: `understanding_started`, `understanding_done` ("N files sorted, M need review, K connections"; "Partial result." when partial), `understanding_failed`, `label_corrected`, `label_reset`, `labels_cleared`. Entries hold paths, counts, and label names only. The loading run writes `understanding_done` or `understanding_failed` when it completes.
- `useStudioStore.ts` clears `understanding` wherever `ai` and `work` are cleared (and sets it from the completion argument at `completeIngestion`).

## 12. Saved corrections (`correctionsStorage.ts`)

- Key `patchbay.corrections.v1`. Record `{ version: 1, repoKey, savedAt, corrections: Record<path, Label[]> }`, strict. At most 500 paths, each at most 250 characters, each with 1 to 9 labels from the selectable set, and the whole text at most 64 KB.
- `loadCorrections(storage, snapshot)` returns the matching corrections (same `repoKeyOf`, paths present in the inventory) or `{}`. It, `saveCorrections`, and `clearCorrectionsSlot` never throw.
- **Saving.** The controller subscribes to the store and keeps `lastCorrections`, the corrections object it last saw. It saves only when `understanding.corrections` is a new object that came from a user action (set, remove, or clear) and a snapshot is loaded. At every `completeIngestion` it only updates `lastCorrections` and does not write, so loading never overwrites the slot of another repository. Because the corrections are delivered in the same update as the snapshot, no restore gate is needed.

## 13. The controller (`useUnderstanding.ts`)

```ts
createUnderstandingController(studio, services): { actions, dispose }
services: { storage, yieldToMain, now, analyze }       // analyze = analyzeProject in the app, a fake in tests
actions: { run(): void; cancel(): void; setLabels(path, labels): string | null; removeCorrection(path): void; clearCorrections(): void }
```

- `run()` re-analyses the loaded snapshot (used by Run again and Try again). It starts only when none is running and a snapshot exists, creates an `AbortController`, and delivers progress and the result through the understanding actions. `cancel()` aborts it and returns the state to `idle`.
- `setLabels` returns an error message when refused (the 500 limit, or an invalid set) and `null` otherwise.
- A studio-store subscriber aborts a running re-analysis when the snapshot is replaced or cleared, and saves corrections as in section 12.
- `dispose()` aborts, unsubscribes, and ignores later results.
- `useUnderstanding()`: `useMemo` and an effect to dispose, like `useHarness`.
- The loading run uses `analyzeProject` and `loadCorrectionsFor` directly through the ingestion services, not through this controller, so the stage is part of the one loading run and one `AbortController`.

## 14. User interface

- **Loading screen:** the stage list reads Resolve branch, Fetch file tree, Load source files, Classify files, Prepare preview. "Classify files" shows "in progress (N of M files)" and then done, failed, or skipped. Nothing else on the Loading screen changes.
- **`UnderstandingSection`** sits in Project info, below the Sandbox and the coverage panel. It shows, always: the heading "Project understanding", the state line ("Analysing N of M files." with **Cancel**, "Analysis was cancelled." with **Run again**, "Analysis failed: <message>" with **Try again**, or "Analysis is up to date."), the line "Partial result: <reasons>" when partial, and the **summary** table. Everything else is in collapsible `<details>` blocks that scroll inside themselves (at most 24 rem tall):
  - **Needs Review (n)**: open when n > 0. Path, first reason, **Set labels**.
  - **Files**: closed. Filters (area or helper group, confidence, "Needs Review only", a text box), a table of 200 rows with **Show more**, columns Path, Labels, Confidence, Reason, and a **Why?** disclosure per row. A row for a file type that is not scanned says "connections not scanned for this language".
  - **Connections**: closed. Filters for kind, certainty, and a text box, a table of 200 rows with **Show more**, columns Kind, From, To, Certainty, Line, Note. Certainty is written "Confirmed", "Inferred", or "Broken".
  - **What was and was not scanned**: closed. Files read, files sorted by path only, ignored, file types not scanned (extension and count), alias imports not followed, "Django URL files are not followed" when it applies, the external names (first 20), and every partial reason.
- **Summary table:** rows for each label, each area, each helper group, Needs Review, and Ignored. The Security row reads "pending scan (2D)" and never a number.
- **Label editor:** a labelled fieldset of checkboxes with plain names, **Save**, **Cancel**, and **Remove my change** when corrected. A refusal (the 500 limit) shows its message above the buttons.
- **Clear my label corrections:** a button, shown when any correction exists.
- All text is React text. No color, icon, transition, or animation. Tables have header cells and sit in a scroll box so the page never scrolls sideways.

## 15. Failure handling

| Failure | Handling |
|---|---|
| A file's scan or sort throws | That file only is Needs Review, "Could not be analysed." |
| Whole analysis throws during loading | The stage shows failed, loading finishes, the section shows the message and Try again. |
| Whole analysis throws during a re-run | State `failed` with a short message and Try again. |
| Abort (Cancel, snapshot change, unmount) | The run stops and no result is stored. During loading the whole run is cancelled. |
| Any limit reached | Partial result with one plain-words reason per limit. |
| 500 corrections reached | The new correction is refused with a message. |
| Saved corrections bad, old, or for another repository | None restored, no message. |
| Storage blocked or full | Corrections kept for this visit. |
| `analyze` service missing | The stage is skipped and loading behaves as before. |
| Slow pattern risk | Anchored, length-bounded patterns, long lines skipped, and a timing test on hostile input. |

## 16. Verification mapping

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Skill-book | `tests/skillbook.test.ts` (C1) |
| 2. Source scanner | `tests/sourceScan.test.ts` (C2), `tests/sourceScanPy.test.ts` (C3) |
| 3. Sorting | `tests/sortFiles.test.ts` (C4) |
| 4. Connections | `tests/connectionMap.test.ts` (C5) |
| 5. Samples | `tests/analyzeSamples.test.ts` (C6) |
| 6. Analysis run and classify stage | `tests/analyzeProject.test.ts` (C6), `tests/classifyStage.test.ts` (C8) |
| 7. State and corrections | `tests/understandingState.test.ts`, `tests/understandingView.test.ts` (C6, C7) |
| 8. Storage | `tests/correctionsStorage.test.ts` (C9) |
| 9. Controller | `tests/understandingController.test.ts` (C9), `tests/classifyStage.test.ts` (C8) |
| 10. Components | `tests/understandingUi.test.tsx` (C10, C11) |
| 11. Static checks | C1 to C11 acceptance, C12 |
| 12. Regression | C7, C8, C11, C12 |
| 13. Browser run | C12 |
| 14. Phase 2C gate | C12 |

## 17. Risks and known limits

- **It is a scanner, not a parser.** Odd formatting, code built from strings, or macros can be missed. Missed items are absent, not wrong, and the coverage note says what was scanned. Anything pattern-based is Inferred.
- **Python is basic.** Django URLs, class-based views, star imports, and dynamic imports are not read. Absolute imports that do not resolve are listed as external (they could also be the standard library). The note says so.
- **Aliases and other languages are not followed.** Go, PHP, Java, and the rest show "connections not scanned for this language".
- **The extension alone never labels `.js`, `.ts`, or `.py`.** Many files will go to Needs Review in loosely organised repositories. That is deliberate (no guessing), and corrections make it quick to fix. (`.py` is moderate Backend by `sort.ext.server-lang`; `.js` and `.ts` get nothing from the extension.)
- **Loading is slower.** The stage adds up to 8 seconds for a very large repository, then shows a Partial result.
- **The Loading screen order changes** (Classify after Load). Two existing store tests change with it.
- **Results are recomputed on every load.** Only corrections are saved.
- **Security is "pending scan (2D)"** until the scanner exists.
- **2D will extend `SKILLBOOK` and use the edges.** The skill-book type already reserves a place for `scan` skills.
- **`scripts/traceability/*` still do not exist.** Approvals are recorded in chat.

## 18. PLAN.md nodes

Plan `P2C-UNDERSTAND`, feature `F5 — Project Understanding`, with nodes F5.1 (skill-book and limits), F5.2 (scanner for JavaScript, HTML, CSS), F5.3 (Python scanner), F5.4 (sorting), F5.5 (connection map), F5.6 (analysis run, view helpers, samples), F5.7 (understanding state and actions), F5.8 (the `classifying` stage in the loading run), F5.9 (saved corrections and controller), F5.10 (section components), F5.11 (wiring into Project info and App). Full text is in `traceability/PLAN.md`.
