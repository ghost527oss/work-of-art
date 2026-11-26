# Design: 07 Sandbox Preview (Phase 2, Sub-phase 2E-1)

Implements `requirements.md` in this folder. Active product phase: **Phase 2, Sub-phase 2E-1**. PatchBay's own screens are wireframe only with no animation, `AI_MODE=mock` only, no new dependency, no network from PatchBay's code. Built on 2A (screens), 2B (effective content, History), 2C (labels, imports), and 2D (findings, the 17th check).

## 1. Decisions already made

| Source | Decision |
|---|---|
| Blueprint section 5 | Three honest display modes, strict isolation, honest labelling that never pretends a component picture is the real app. |
| Your 2E answers | Look-only by default with an explicit run-scripts switch in a locked iframe with no outside network. Block external content, strip risky tags, placeholders for unloaded images. A static, approximate Component Workbench with no compiler. Everything from the preview is untrusted plain text and messages are validated. Split into 2E-1 (this) and 2E-2. The layout overflow check is the 17th finding. |
| Phase 2 text | Offline, no new dependency, no AI, no running of imported servers. |
| 2D | Findings need file, lines, snippet, and reason. The measured finding follows that rule using the element table. |

## 2. Phase 2E-1 compliance

| Rule (build-phases.md) | How this design complies |
|---|---|
| Design only the Current Active Sub-phase (2E-1) | Preview, three modes, isolation, bridge, layout check. No Edit pad, no selection, no style editing, no code changes. |
| Locked-down sandbox preview; imported code cannot read PatchBay data or load external content | Iframe sandbox flags, a content policy, an allowlist re-serializer, a validated bridge, and an adversarial browser test. |
| No new runtime dependency | None. The HTML tokenizer, the JSX extractor, and the checks are hand-written. |
| PatchBay's own screens stay black-and-white wireframe | The panel's own controls use borders and text only. The project's page inside the iframe shows its own styles. |
| Browser storage never holds secrets or whole repositories | Nothing from the preview is saved. |

## 3. Lightweight-architecture audit

| Gate | Status | Finding |
|---|---|---|
| 1. Dependency vetting | PASS | A DOM library, a JSX compiler, and a sanitizer library were considered and rejected: each adds weight, a compiler would run imported code, and a sanitizer is a second parser that can disagree with the browser. A small allowlist re-serializer that escapes everything it writes does not depend on matching the browser's parser. |
| 2. Memory and bundle | PASS | Preview document at most 1 MB, held only by the panel. At most 5,000 annotated elements, 50 console lines, and 100 measured findings. About 1,200 lines of new code, no library. Bundle growth is reported against the 2D baseline. |
| 3. Free-tier resilience | PASS | No external service. The preview cannot use the internet. Large projects fall back to Source Inspection. |
| 4. Teardown | PASS | The iframe, its message listener, and the layout-check timers are released on unmount, remount, and Stop scripts. |

## 4. Files

All paths are relative to `work-of-art/`.

### 4.1 New
| File | Responsibility |
|---|---|
| `src/config/previewLimits.ts` | Limits, provisional: 1 MB document, 30 inlined files, 5,000 elements, 50 console lines, 200-character lines, 20 bridge messages per second, 8 KB per message, 100 measured findings, 3,000 ms layout check, 200 components, 100 KB per component, 3 inlining levels, 2,000 viewer lines, 28 rem panel height. |
| `src/preview/htmlTokens.ts` | `tokenizeHtml(source)`: tolerant tokenizer with offsets, lines, and columns; `escapeText`, `escapeAttr`. Pure. |
| `src/preview/htmlAllow.ts` | The tag and attribute allowlists as data (section 7.2). |
| `src/preview/cssSanitize.ts` | `sanitizeCss(css)`: removes `@import`, non-`data:` `url(...)`, and `<` characters. Pure. |
| `src/preview/previewFlags.ts` | `sandboxFlags(scripts)`, `cspFor(scripts)`, `IFRAME_ATTRS`. Pure constants and functions. |
| `src/preview/previewDocument.ts` | `buildStaticPreview(input)`: the allowlist re-serializer and document builder (section 8). Pure. |
| `src/preview/previewMode.ts` | `detectPreviewMode(snapshot, understanding)` and `modeChoices(...)`. Pure. |
| `src/preview/jsxExtract.ts` | JSX and TSX component discovery and JSX-to-HTML (section 10). Pure. |
| `src/preview/templateExtract.ts` | Basic Vue `<template>` and Svelte markup extraction. Pure. |
| `src/preview/workbenchDocument.ts` | `buildWorkbench(input)`: picks the component, inlines children and CSS, then runs the same builder. Pure. |
| `src/preview/sourceView.ts` | `groupFiles(...)`, `viewerLines(content)` (redacted, numbered, capped). Pure. |
| `src/preview/previewBridge.ts` | `BridgeMessageSchema`, `validateBridgeEvent(event, expected)`, `RateLimiter`, `INSPECTOR_SOURCE(nonce, origin)`. Pure. |
| `src/preview/layoutCheck.ts` | `evaluateOverflow(measurements, width, docScrollWidth)` and `layoutFindings(...)`. Pure. |
| `src/preview/previewDom.ts` | The small browser-only adapter: `gatherMeasurements(doc, win)`. Tested in the browser run. |
| `src/store/previewSlice.ts`, `previewActions.ts` | `PreviewState`, pure transitions, whole-state actions with Log entries. |
| `src/hooks/usePreview.ts` | `createPreviewController(...)` (bridge listener, layout check runner, timers) and `usePreview()`. |
| `src/components/SandboxPanel.tsx` | The Sandbox panel and the iframe. |
| `src/components/PreviewToolbar.tsx`, `ScriptsSwitch.tsx`, `PreviewNotes.tsx`, `ConsolePane.tsx`, `WorkbenchPicker.tsx`, `SourceViewer.tsx` | Parts of the panel. Props only. |
| Tests | `previewFlags`, `htmlTokens`, `previewDocument`, `previewHostile`, `previewMode`, `workbench`, `sourceView`, `previewBridge`, `layoutCheck`, `previewState`, `previewController` (`*.test.ts`); `sandboxUi` (`*.test.tsx`); the isolation browser test described in section 16. |

### 4.2 Modified
| File | Change |
|---|---|
| `src/skillbook/types.ts`, `scanSkills.ts` (2D) | `ScanSkill` gains `kind: 'text' | 'measured'` (default `'text'`). One new skill, `scan.frontend.layout-overflow` (`measured`). |
| `src/engine/scanProject.ts` (2D) | Skips `measured` skills. |
| `src/engine/scanView.ts` (2D) | `allFindings`, counts, and `whatWasChecked` accept the measured findings. The "not checked" lines change. |
| `src/components/ScanSummary.tsx`, `FindingsTable.tsx`, `FindingDetail.tsx`, `WhatWasChecked.tsx` (2D) | Show "Measured" and the width. `FindingDetail` gains **Open in viewer**. The check list shows 17 checks. |
| `src/store/useStudioStore.ts` | `StudioState` gains `preview`, cleared with the other slices. |
| `src/components/SandboxPlaceholder.tsx` (2A) | Replaced by `SandboxPanel`. |
| `src/components/StudioLayout.tsx`, `SkeletonCrewScreen.tsx`, `DomainScreen.tsx` (2A, 2D) | Render `SandboxPanel` in the left area. |
| `src/App.tsx` | Calls `usePreview()`. |
| `src/styles.css` | A black-and-white block for the panel (its own chrome only). |
| Tests | Only: the 2A tests that look for the placeholder text, the 2D tests that assert 16 checks and three Frontend skills and the old "not checked" line (each named in the tasks). |
| `traceability/PLAN.md` | Adds plan `P2E1-SANDBOX` with nodes F7.1 to F7.10. |

### 4.3 Not touched
`api/*`, all spec 01 and 02 files, the 2B run machine and storage, the 2C analysis, the 2D crew script and run logic, `AIAssistantPanel.tsx`, and every existing test except those named above.

## 5. Data model

```ts
type PreviewMode = 'static' | 'workbench' | 'source'
type PreviewWidth = 375 | 768 | 1024 | 0          // 0 = fit

interface ElementEntry { id: number; path: string; tag: string; line: number; col: number; startOffset: number; endOffset: number; endLine: number }
interface PreviewReport { removed: Record<string, number>; blockedExternal: string[]; placeholders: string[]; inlinedFiles: number; unknownTags: number; truncated: boolean }
interface PreviewBuild  { ok: true; html: string; elements: ElementEntry[]; report: PreviewReport; notes: string[] }
                      | { ok: false; reason: string }

interface Measurement { id: number; tag: string; clientWidth: number; scrollWidth: number; clientHeight: number; scrollHeight: number; overflowX: string; overflowY: string; hasText: boolean }

type BridgeMessage =
  | { v: 1; type: 'ready';   nonce: string }
  | { v: 1; type: 'error';   nonce: string; message: string; line?: number }
  | { v: 1; type: 'console'; nonce: string; level: 'log' | 'warn' | 'error'; text: string }

interface PreviewState {
  mode: PreviewMode; chosenBy: 'auto' | 'user'; reason: string
  entryPath?: string; component?: string; width: PreviewWidth
  scripts: boolean; status: 'idle' | 'building' | 'ready' | 'failed'; error?: string
  notes: string[]; console: { level: string; text: string }[]; invalidMessages: number
  layout: { status: 'idle' | 'running' | 'done' | 'stopped'; widths: number[]; findings: Finding[]; contentKey: string; partialReasons: string[] }
}
```
The built `html` string is **not** in the state. The panel keeps it in memory with `useMemo`. All state is plain data.

## 6. Isolation design

### 6.1 The two iframe configurations (`previewFlags.ts`)
| | Look-only | Run scripts |
|---|---|---|
| `sandbox` | `allow-same-origin` | `allow-scripts` |
| Page scripts | Cannot run (the sandbox forbids scripts, so inline handlers and `javascript:` addresses are also dead) | Run, in an **opaque origin** |
| Document | `srcdoc`, same origin as PatchBay, so PatchBay can read it | `srcdoc`, opaque origin, PatchBay cannot read it |
| Policy | `default-src 'none'; img-src data:; font-src data:; media-src data:; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'` | The same plus `script-src 'unsafe-inline'` |
| Other attributes | `referrerpolicy="no-referrer"`, `allow=""`, `title` | The same |

`sandboxFlags(scripts)` returns one of the two exact strings and nothing else, so no code path can build another combination. A test enumerates both inputs and a fuzz of other values (treated as `false`).

### 6.2 What each attack meets
| Attempt | Look-only | Run scripts |
|---|---|---|
| Run a script | Blocked by the sandbox (no `allow-scripts`) | Allowed (that is the mode) |
| Read PatchBay's page, storage, or cookies | No script runs | Opaque origin: `parent.document`, `top.location`, `localStorage`, `sessionStorage`, `indexedDB`, and `document.cookie` all throw a security error |
| Request a URL (`fetch`, XHR, beacon, WebSocket, image, font, stylesheet, script, import, worker, media) | Blocked by the policy | Blocked by the policy |
| Load a frame or object | Not emitted, and blocked by the policy | The same |
| Submit a form | `form-action 'none'`, no `allow-forms`, and `action` dropped | The same |
| Open a popup or change the top page | No `allow-popups`, no `allow-top-navigation` | The same |
| Navigate the preview frame itself (`<meta refresh>` or `location = ...`) | `<meta>` is never emitted (allowlist), and no script runs | **Cannot be blocked.** Detected by a second `load` event, the frame is replaced by a fresh look-only preview, and the notice is shown. The box holds no PatchBay data. |
| Freeze the tab with an endless loop | No script runs | **Cannot be fully prevented.** Stop scripts, reload. Warned about in the confirmation text. |
| Forge a bridge message | Not applicable (no bridge) | Messages are validated, rate-limited, size-limited, and can only add a console line, signal ready, or add to the invalid count |

### 6.3 Why the allowlist re-serializer
The browser parses the document PatchBay gives it. If PatchBay tried to *filter* markup with its own parser, a difference between the two parsers could let a dangerous tag through. PatchBay instead **writes a new document from scratch**: it reads tokens, and for each token writes either an allowed tag with allowed attributes (every value escaped) or nothing. Text is always escaped, so any `<` that the page's author wrote in an odd place becomes visible text. Because everything written is escaped and chosen from fixed lists, there is no markup left for the browser to misread. The sandbox and the policy stay the real boundary, and the allowlist covers the one case they cannot (frame navigation by `<meta>`) and keeps the preview clean.

## 7. The HTML tokenizer and the allowlists

### 7.1 `tokenizeHtml(source)`
Produces tokens `{ type: 'start' | 'end' | 'text' | 'comment' | 'doctype', name?, attrs?, selfClosing?, start, end, line, col }`. It handles: tag open and close with quoted and unquoted attribute values; comments including `<!-->` and unterminated ones (to end of input); `<!doctype>`; CDATA treated as text; raw-text elements (`script`, `style`, `textarea`, `title`) whose body runs to the matching end tag or the end of input; void elements; lower-casing of names; `\0` replaced by a space; an unterminated tag treated as text. It never throws and is linear: one forward pass with no backtracking. Line and column come from a precomputed line-start table.

### 7.2 The allowlists (`htmlAllow.ts`)
- **Tags written:** `a abbr address article aside b bdi bdo big blockquote br button caption center cite code col colgroup data dd del details dfn div dl dt em fieldset figcaption figure font footer form h1 h2 h3 h4 h5 h6 header hgroup hr i input ins kbd label legend li main mark menu meter nav ol optgroup option output p pre progress q rp rt ruby s samp search section select small span strike strong sub summary sup table tbody td textarea tfoot th thead time tr tt u ul var wbr` plus the basic SVG set `svg g path circle ellipse rect line polyline polygon text tspan defs linearGradient radialGradient stop clipPath title desc`.
- **Special handling:** `img`, `picture`, `source`, `video`, `audio`, `track`, `canvas`, and `iframe`-like media become placeholders (section 8.3). `link rel=stylesheet` and `style` become sanitised `<style>`. `script` is dropped in look-only mode and inlined (escaped) in Run scripts mode. `noscript` becomes a `div` in look-only mode and is dropped in Run scripts mode. `html`, `head`, and `body` are written by the builder itself, copying only allowed attributes from the page's `body`.
- **Attributes written:** `class id style lang dir title alt width height type value placeholder name for min max step rows cols colspan rowspan span role tabindex checked selected disabled readonly required open hidden aria-* data-*` (page `data-*` attributes are kept but renamed `data-x-<name>` so they cannot collide with `data-pb`). `href` is written as `#` for `a`. `src` is handled only by the media rules. The `style` attribute value is passed through `sanitizeCss` (declarations only). All values are escaped with `escapeAttr` and written in double quotes.
- **Anything else** (including unknown tags, which are written as `span` with the note) is dropped and counted in `report.removed`.

### 7.3 `sanitizeCss(css)`
Removes `@import ...;`, replaces every `url(...)` that is not `data:image/...` or `data:font/...` with `none` (or removes the declaration), removes `<` and `expression(`, and removes `-moz-binding` and `behavior`. It works with one linear pass that tracks strings and comments. The CSS is placed in `<style>` with every `<` escaped as `\3c ` so `</style>` cannot appear.

## 8. The static document builder (`buildStaticPreview`)

Input: `{ entryPath, effective(path), loaded paths, scripts, nonce, origin, idStart }`. Steps:
1. Read the effective content of the entry page. Tokenize.
2. Create the output head: the policy meta (first), `<meta charset="utf-8">`, one base `<style>` for PatchBay's placeholder classes (`.pb-img`, `.pb-expr`, `.pb-box`: dashed black borders, monospace 12 px), the page's `<title>` text if any (escaped), then the inlined stylesheets.
3. For each token in order: write by the rules in 7.2, resolving `href`/`src` to loaded files (relative to the entry page, and root-relative from the repository root). Stylesheets to loaded files are inlined (`sanitizeCss`, `@import` removed, nested `@import` is not followed). In Run scripts mode, local `<script src>` is inlined with escaping, and the inspector (section 12) is written first in the body. A reference to anything not loaded or outside the project is dropped and counted.
4. **Placeholders (8.3):** an `<img>` whose source is a loaded SVG becomes `<img src="data:image/svg+xml;charset=utf-8,...">` (percent-encoded, at most 100 KB, else a placeholder). Every other image, and `video`, `audio`, `canvas`, `picture`, and a `@font-face` file that was not loaded, becomes `<span class="pb-img" ...>image not loaded: path</span>` with the original `id`, `class`, `style`, `width`, and `height` copied (so layout stays close), default 120 by 80.
5. **Annotation (look-only):** each written element in the body gets `data-pb="<n>"` (starting at `idStart`), and an `ElementEntry` is added with the file, tag, line, column, offsets of the start tag, and the end line of the start tag. At most 5,000; more sets `truncated`.
6. **Bounds:** more than 30 inlined files, output over 1 MB, or more than 5,000 elements without a safe way to continue returns `{ ok: false, reason }`.
7. Build the notes from the report in plain words.
8. The builder never reads the DOM, the network, or the clock. The nonce and the origin come from the caller.

The workbench builder (section 10) produces an HTML string and calls the same functions with `annotate: false`.

## 9. Mode detection (`previewMode.ts`)

`detectPreviewMode(snapshot, understanding)` implements requirements R1.2 and returns `{ mode, reason, entryPath?, components? }`. Framework signals come from the `package.json` dependency names (2C manifest facts), the entry page tokens (a `script type=module` whose `src` ends in `.tsx .jsx .ts .vue .svelte`, or a body whose only element has id `root` or `app` and no text), and the 2C labels. `modeChoices` lists the possible modes (`static` only with an entry page, `workbench` only with components, `source` always). The reason is a fixed sentence per rule.

## 10. The Component Workbench

### 10.1 JSX components (`jsxExtract.ts`)
1. **Find components:** `function Name(...)`, `export function Name`, `export default function Name`, and `const Name = (...) =>` or `= function` where `Name` starts with a capital letter, and the body contains `return (` or `return <` (or an arrow function whose expression starts with `(` or `<`). The scan is linear and skips strings, template literals, and comments.
2. **Take the returned JSX:** from the opening `<` to the matching close, by tracking tag depth, brace depth, and strings. A fragment `<>...</>` is allowed.
3. **Parse the JSX:** tag name, attributes (name with a string literal, a `{...}` expression, or no value; a spread `{...x}`), self-closing, children (text, nested elements, `{...}` expressions). An expression is kept only as a marker.
4. **Convert:** the rules in requirements R5.3. Expressions become `<span class="pb-expr">{...}</span>`. A capitalised tag looks up the component by name in the same file or in a file imported by it (using the 2C `imports` edges), and inlines its converted markup up to 3 levels, with a visited set to stop cycles; otherwise a `<div class="pb-box">&lt;Name /&gt;</div>` is written. Attributes that remain are passed to the allowlist builder, which drops everything not allowed.
5. **Output:** an HTML string per component, and a list `{ name, path, exported, markup | error }`.

### 10.2 Vue and Svelte (`templateExtract.ts`)
Vue: the text between `<template>` and `</template>` (outermost), `{{ ... }}` replaced by the marker, attributes starting with `v-`, `:`, or `@` dropped, and the `<style>` section returned as CSS. Svelte: the markup outside `<script>` and `<style>`, `{...}` replaced by the marker, `on:` and `bind:` attributes dropped, `{#if ...}`, `{:else}`, `{/if}`, `{#each ...}`, and `{/each}` lines removed (their inner markup stays).

### 10.3 The workbench document (`workbenchDocument.ts`)
Picks the component (default `App`), inlines it, collects CSS files imported by the component and by the entry chain (2C `imports` edges from `main`, `index`, or `App` files, up to 3 levels, only `.css`), and returns the builder's output with `annotate: false`. The label "Approximate: read from the source, not run." is part of the panel, not the document.

## 11. Source Inspection (`sourceView.ts` and `SourceViewer`)
`groupFiles` groups the loaded file paths by their 2C labels (frontend, backend, and so on) and helper groups, sorted. `viewerLines(content, firstLine?)` returns up to 2,000 numbered lines, each `redact(line).text` cut to 400 characters, plus the "Show more" offset. The component shows a filter box, the grouped list, and a `pre` with the lines. A line range from a finding is highlighted with a thick border (not a color). Unread files show their reason (from the inventory entry).

## 12. The bridge and the inspector (`previewBridge.ts`)

- `INSPECTOR_SOURCE(nonce, origin)` returns a fixed script text with only the nonce and the parent origin filled in (both validated as `[0-9a-f]{16}` and a URL origin). It posts `ready`, `error`, and `console` messages with `parent.postMessage(message, origin)`. It uses no `'*'`. It is the first script in the document. The page's scripts can read the nonce, so the nonce is only a noise filter, not a secret.
- `validateBridgeEvent(event, { source, nonce })` checks: `event.source === source`, `event.origin === 'null'`, the data is a plain object, its JSON length is at most 8 KB, `BridgeMessageSchema` (a strict zod union) passes, and the nonce matches. Text fields have control characters removed and are cut to 200 characters. It returns `{ ok: true, message }` or `{ ok: false }`.
- `RateLimiter(20 per second)` drops messages over the rate and counts them as invalid.
- The controller handles `ready` (marks the preview ready), `error` and `console` (append a line, keeping the last 50), and counts invalid messages. Nothing else. Tests assert that no message type can cause any other action.

## 13. The layout overflow check

- **Measure (`previewDom.ts`, browser only):** `gatherMeasurements(doc, win)` reads up to 5,000 `[data-pb]` elements: `clientWidth`, `scrollWidth`, `clientHeight`, `scrollHeight`, the computed `overflow-x` and `overflow-y`, and whether the element has its own non-blank text node. It also returns `doc.documentElement.scrollWidth`. Numbers are clamped to 0 to 100,000. It reads only.
- **Evaluate (`layoutCheck.ts`, pure):** the three rules in requirements R8.3, skipping `auto` and `scroll`. One result per element and kind, with the list of widths.
- **Findings:** `layoutFindings(results, elements, effective)` builds a `Finding` for each: `skillId: 'scan.frontend.layout-overflow'`, primary Frontend, severity Medium, certainty Found, fix Guided, the start-tag lines from the element table, a snippet from `snippetFor` on the effective content (redacted), `extra` with the numbers and width, and an id from `makeFindingId`. At most 100.
- **Run (`usePreview`):** for the chosen width (or the three widths) set the iframe width, wait two animation frames, measure, restore the width. A timer stops the run at 3,000 ms with "The layout check took too long and was stopped." It runs only when the preview is `ready`, in look-only mode, in `static` mode. The content key (a hash of the entry page's and its files' effective contents) is stored with the result, and a changed key discards it.
- **Merge:** `allFindings(scan.result.findings, preview.layout.findings)` is used by every 2D view. The crew script keeps using `scan.result.findings` only.

## 14. State, controller, and panel

- **`previewSlice.ts` / `previewActions.ts`:** pure transitions `pvInit(snapshot info)`, `pvMode`, `pvWidth`, `pvScripts` (turning scripts on is refused unless the mode is `static`), `pvBuildState`, `pvConsole`, `pvInvalid`, `pvLayout*`, `pvReset`. Log entries: `preview_mode` ("Preview mode: <name>."), `preview_scripts` ("Preview scripts turned on." / "off."), `preview_reset` ("The preview tried to leave the page and was reset."), `layout_check_done` ("Layout check: <n> findings at <widths>."). Entries hold titles and counts only. The state is cleared with the other slices, and `scripts` is forced to `false` by every mode change, snapshot change, and reset.
- **`usePreview.ts`:** `createPreviewController(studio, services)` owns the bridge listener (added only while scripts are on, removed on stop, remount, and dispose), the layout-check runner, and its timers. `services` has `now`, `setTimer`, `clearTimer`, and `raf`.
- **`SandboxPanel`:** reads the store state and the effective content keys (`snapshot.id` and the applied history ids), builds the document with `useMemo`, renders the toolbar, notes, and the iframe (`key` changes with the document, mode, and scripts), wires `onLoad` (counts loads to detect a second document), and renders the console and the picker or viewer by mode. In `source` mode there is no iframe.
- **Toolbar (look-only static):** width buttons (375, 768, 1024, Fit), Reload, Check layout, Check at all widths, mode selector, and the scripts switch. With scripts on: Stop scripts, the console, and a disabled Check layout with the reason.
- **Height:** the panel is 28 rem tall with its own scroll, so Project info remains reachable on Screen 3 and the right-hand screens remain visible on Screens 4 and 5. The iframe is `width` px inside a horizontally scrollable box.

## 15. Failure handling

| Failure | Handling |
|---|---|
| Builder bound exceeded | `{ ok: false }`, mode falls back to Source Inspection with the reason. |
| Builder or extractor throws | Caught: the panel shows "The preview could not be built" with Try again. Other panels work. |
| Component cannot be read | That component shows "could not be read". |
| Second document in the iframe | Replaced by a fresh look-only preview, with the notice. |
| Invalid bridge message | Dropped and counted. |
| Console flood | Rate limit, 50-line cap. |
| Layout check too slow | Stopped with the message. |
| Content changes under a layout result | Result discarded. |
| Unmount, remount, Stop scripts | Listener, timers, and iframe released. |

## 16. Verification mapping

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Mode detection | `tests/previewMode.test.ts` (E4) |
| 2. Sandbox flags | `tests/previewFlags.test.ts` (E3) |
| 3. Document builder | `tests/previewDocument.test.ts`, `tests/htmlTokens.test.ts` (E2, E3) |
| 4. Hostile markup | `tests/previewHostile.test.ts` (E3) |
| 5. Bridge | `tests/previewBridge.test.ts` (E6) |
| 6. Workbench | `tests/workbench.test.ts` (E5) |
| 7. Source view | `tests/sourceView.test.ts` (E4) |
| 8. Layout check | `tests/layoutCheck.test.ts` (E7), 2D tests (E1) |
| 9. State | `tests/previewState.test.ts` (E8), `tests/previewController.test.ts` (E9) |
| 10. Components | `tests/sandboxUi.test.tsx` (E9, E10) |
| 11. Static checks | E1 to E10, E11 |
| 12. Regression | E1, E8, E10, E11 |
| 13. Isolation browser test | E11 |
| 14. Browser run | E11 |
| 15. Phase 2E-1 gate | E11 |

The **isolation browser test** (E11) uses a fixture repository and a probe page. The page's inline script tries each escape and reports its result through `postMessage` to the inspector's bridge (and logs to the console), and the test harness (Playwright in the sandbox environment) records every network request with `page.on('request')` and compares PatchBay's `localStorage` and cookies before and after.

## 17. Risks and known limits

- **The sandbox and policy depend on the browser.** They are the standard browser mechanisms, but a browser bug could weaken them. Look-only mode does not run any imported code at all, which is why it is the default.
- **Script mode cannot stop a frame from navigating itself, or from freezing the tab.** Both are stated in the confirmation, detected where possible, and recoverable.
- **The workbench is approximate by design.** Conditional content, loops, and values do not appear. The label says so.
- **Images are placeholders.** Ingestion does not download them and the preview may not reach the internet. Loaded SVGs are drawn.
- **Hand-written HTML and JSX readers** can miss unusual markup. Their failures are isolated, show as notes or "could not be read", and never open a security hole because the output is rewritten and escaped.
- **Layout numbers depend on the browser and fonts.** The finding says what was measured and at which width.
- **Same-origin look-only iframe:** PatchBay reads it but never runs code in it, and no script can run there. Tests assert the flags and the absence of `allow-scripts`.
- **2A and 2D code and tests change in a few named places.** They are listed and small.
- **`scripts/traceability/*` still do not exist.** Approvals are recorded in chat.

## 18. PLAN.md nodes

Plan `P2E1-SANDBOX`, feature `F7 — Sandbox Preview`, with nodes F7.1 (limits and the 17th skill), F7.2 (HTML tokenizer and allowlists), F7.3 (flags, CSS sanitiser, and the static document builder), F7.4 (mode detection and the source viewer helpers), F7.5 (the workbench extractors), F7.6 (the bridge and inspector), F7.7 (layout check), F7.8 (preview state and actions), F7.9 (panel components and controller), F7.10 (wiring into the Studio and the 2D views). Full text is in `traceability/PLAN.md`.
