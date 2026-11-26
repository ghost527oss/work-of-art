# Design: 08 Edit Pad (Phase 2, Sub-phase 2E-2)

Implements `requirements.md` in this folder. Active product phase: **Phase 2, Sub-phase 2E-2**. PatchBay's own screens stay wireframe with no animation, `AI_MODE=mock` only, no new dependency, no network. Built on 2B (practice copy, History, `applyUnifiedDiff`, Undo and Redo), 2D (findings and the same-update re-check), and 2E-1 (the preview, the element table, the look-only iframe, the layout check).

## 1. Decisions already made

| Source | Decision |
|---|---|
| Blueprint section 5 | A paint-style pad: click, lasso, or background selection; size, corners, spacing, border, shadow, text, colours, gradients; layout checks; honest code mapping ("Preview Only" when not sure); three layers. |
| Your 2E answers | Exact-mapped plain HTML elements become real `style` edits, everything else is Preview Only. Your own edits apply right away into History with Undo and Redo, and only Crew proposals need Approve. Layout overflow is re-checked after edits. Patch export stays in 2F. |
| 2E-1 | The preview is look-only for editing (no scripts), the iframe is same-origin so PatchBay can read it, and every read value is untrusted data. |
| 2B and 2D | History holds diffs with fingerprints and a 50-entry cap, secrets block recording, and the practice copy, History, Log, and findings update in one step. |
| Requirements section 7 (pending your answers) | Undo and Redo buttons, workbench Preview Only edits, merging of bursts, the property list, the Page selector, the layout suggestions, a 640 px minimum window, Preview Only not saved, provisional limits. |

## 2. Phase 2E-2 compliance

| Rule (build-phases.md) | How this design complies |
|---|---|
| Design only the Current Active Sub-phase (2E-2) | The Edit pad only. No export, no Journal, no restore, no other file types. |
| Edit pad is Screen 3 only | It lives in the Edit panel of the Studio toolbar and is not available on Screens 4 and 5. |
| Colour tools change only the imported page | The colour inputs write only to the page's elements. PatchBay's own screens stay black and white. |
| Browser storage never holds secrets | Recorded changes are 2B History entries (secret guard). Nothing else is saved. |
| No new runtime dependency | None. |

## 3. Lightweight-architecture audit

| Gate | Status | Finding |
|---|---|---|
| 1. Dependency vetting | PASS | No package. Drag, lasso, and colour use pointer events and the browser's own `<input type="color">`. |
| 2. Memory and bundle | PASS | At most 20 selected elements, 50 Preview Only changes, 200 list items. About 1,000 lines of new code. Bundle growth is reported against the 2E-1 baseline. |
| 3. Free-tier resilience | PASS | No external service. |
| 4. Teardown | PASS | Pointer listeners, timers, and animation-frame requests are cleared on close, rebuild, and unmount. |

## 4. Files

All paths are relative to `work-of-art/`.

### 4.1 New
| File | Responsibility |
|---|---|
| `src/config/editLimits.ts` | Limits, provisional: 20 selection, 50 Preview Only, 200 list items, 2,000-character diff, 50 history entries (the 2B value), 300 ms re-check delay, 5000 px size, 640 px minimum window. |
| `src/edit/styleModel.ts` | `STYLE_PROPS` (the table), validators, builders (shadow presets, gradient), `buildDeclarations(change)`. Pure. |
| `src/edit/inlineStyle.ts` | `parseInlineStyle(text)`, `mergeStyle(existing, declarations)`, `serializeStyle(list)`. Pure. |
| `src/edit/textDiff.ts` | `buildLineDiff(path, oldText, newText)`: one hunk with 3 lines of context. Pure. |
| `src/edit/elementMap.ts` | `mapElement(entry, content, tableHash)` and `rewriteStartTag(content, entry, declarations)`. Pure. |
| `src/edit/geometry.ts` | Lasso selection, hit testing, handle drag maths, rectangle helpers. Pure. |
| `src/edit/suggestions.ts` | The three layout suggestions. Pure. |
| `src/store/editSlice.ts`, `editActions.ts` | `EditState`, pure transitions, whole-state actions with Log entries. |
| `src/edit/previewEditDom.ts` | The small browser adapter: `readRects`, `elementAtPoint`, `applyLiveStyle`, `removeLiveStyle`, `scrollPreview`. Writes only through `style.setProperty` and `style.removeProperty`. |
| `src/hooks/useEditPad.ts` | `createEditController(...)` and `useEditPad()`: pointer lifecycle, commit timing, selection and scroll restore, layout re-check scheduling. |
| `src/components/EditPanel.tsx` | Replaces the 2B stub (the file name stays). |
| `src/components/EditTools.tsx`, `PropertyForm.tsx`, `SelectionInfo.tsx`, `PreviewOnlyList.tsx`, `LayoutFixList.tsx`, `EditOverlay.tsx`, `PageSelect.tsx` | Parts of the pad. Props only. |
| Tests | `styleModel`, `inlineStyle`, `textDiff`, `elementMap`, `editGeometry`, `userEdit`, `editState`, `editController` (`*.test.ts`); `editUi` (`*.test.tsx`); the browser run in section 15. |

### 4.2 Modified
| File | Change |
|---|---|
| `src/store/workSlice.ts` (2B) | `HistoryEntry` gains optional `editKey`. New pure transitions: `amendLastEntry`, `dropLastEntry`. |
| `src/store/workActions.ts` (2B) | New whole-state action `applyUserEdit`. |
| `src/store/workStorage.ts` (2B) | The record schema accepts the optional `editKey` (at most 200 characters). Old records still load. |
| `src/preview/previewDocument.ts` (2E-1) | The element table entries gain `key` (`path#tag#n`), `mappable`, and `reason`. The builder accepts Preview Only changes and writes them as inline `style` on the matching elements. |
| `src/preview/workbenchDocument.ts` (2E-1) | The workbench now annotates elements with `mappable: false` and the "component picture" reason. |
| `src/store/previewSlice.ts`, `previewActions.ts` (2E-1) | `entryPath` can be changed by a new `pvEntry` action (the Page selector). |
| `src/components/PreviewToolbar.tsx`, `SandboxPanel.tsx` (2E-1) | The Page selector; an overlay slot above the iframe; scroll and selection restore after a rebuild. |
| `src/store/useStudioStore.ts` | `StudioState` gains `edit`, cleared with the other slices. |
| `src/components/StudioLayout.tsx`, `src/App.tsx` | Render the new Edit panel and call `useEditPad()`. |
| `src/styles.css` | A black-and-white block for the pad and overlay. |
| Tests | Only the 2E-1 tests that assert "no `data-pb` in the workbench" and the builder's element table shape (each named in the tasks). |
| `traceability/PLAN.md` | Adds plan `P2E2-EDITPAD` with nodes F8.1 to F8.9. |

### 4.3 Not touched
`api/*`, spec 01 and 02 files, the 2C analysis, the 2D scanner and crew logic (called, not changed), the 2E-1 isolation code (`previewFlags.ts`, the bridge, the tokenizer, and the allowlists), and every existing test except those named.

## 5. Data model

```ts
type EditTool = 'select' | 'lasso' | 'background'
interface PreviewOnlyChange { elementKey: string; scope: string; property: string; value: string; reason: string; suggested?: boolean }

interface EditState {
  tool: EditTool
  selection: string[]                    // element keys, at most 20
  previewOnly: PreviewOnlyChange[]       // at most 50
  suggestions: PreviewOnlyChange[]       // pending Try a fix suggestions (Keep or Discard)
  notice?: string                        // short plain message, for example "Only the first 20 elements were selected."
}

interface StyleDeclaration { prop: string; value: string }   // already validated
interface HistoryEntry { /* 2B */ id; path; title; at; diff; beforeHash; afterHash; editKey?: string }
interface ElementEntry { /* 2E-1 */ id; path; tag; line; col; startOffset; endOffset; endLine; key: string; mappable: boolean; reason?: string }
```
Plain data. Nothing here is saved.

## 6. The style model (`styleModel.ts`)

`STYLE_PROPS` is the table of what the pad can write. Each entry has the CSS name, a validator, and a builder.

| Group | CSS properties | Input | Output |
|---|---|---|---|
| Size | `width`, `height` | number, unit `px` or `%`, or `auto` | `240px`, `50%`, `auto` |
| Corners | `border-radius` | number, `px` (0 to 500) or `%` (0 to 50) | `12px`, `50%` |
| Padding | `padding-top`, `-right`, `-bottom`, `-left` | whole number 0 to 500 | `8px` |
| Margin | `margin-top`, `-right`, `-bottom`, `-left` | whole number -500 to 500 | `-4px` |
| Border | `border-width`, `border-style`, `border-color` | 0 to 50; one of `none solid dashed dotted`; `#rrggbb` | `2px`, `dashed`, `#112233` |
| Shadow | `box-shadow` | preset and `#rrggbb` | None: `none`; Small: `0 1px 3px <c>`; Medium: `0 4px 8px <c>`; Large: `0 10px 24px <c>` |
| Text | `font-size`, `color` | 6 to 200; `#rrggbb` | `16px`, `#000000` |
| Background | `background-color`, `background-image` | `#rrggbb` or `transparent`; two colours and an angle 0 to 360 | `#ffffff`, `linear-gradient(90deg, #000000, #ffffff)` |
| Suggestions only | `overflow-wrap`, `max-width`, `height` | fixed: `anywhere`; `100%`; `auto` | |

Numbers must be finite and within their range, written as integers (decimals are rounded). Colours are matched with `^#[0-9a-fA-F]{6}$` and lower-cased. Nothing else is accepted. `buildDeclarations(change)` returns a list of `StyleDeclaration` or an error message per field. Every output string is built only from the validated parts and fixed words, so it cannot contain a quote, semicolon, brace, angle bracket, backslash, `url(`, or `expression(`; a fuzz test proves this over the input space.

## 7. Inline style handling (`inlineStyle.ts`)

- `parseInlineStyle(text)` splits on semicolons that are outside quotes and parentheses and returns `[{prop, value}]` (property names lower-cased, spaces trimmed), or `null` ("too complex") when the text contains `url(`, `{{`, an unbalanced quote or parenthesis, a `;` inside quotes or parentheses, or a declaration without a colon.
- `mergeStyle(existing, changes)` keeps the existing order, replaces a property in place, and appends new properties in the table's order.
- `serializeStyle(list)` writes `prop: value` joined by `; ` with no trailing semicolon.

## 8. Mapping and the start-tag rewrite (`elementMap.ts`)

- **Element key:** `path#tag#n` where `n` is the 1-based count of that tag name before and including this element in the file. It is stable until the page structure changes.
- `mapElement(entry, content, tableHash, currentHash)`: returns `{ ok: true }` only when the rules in requirements R4.3 hold: `.html` or `.htm`; the hash the table was built from equals the current hash of the effective content; the entry's `mappable` is true (set by the builder: not an unknown tag, not inside `svg`); and the start tag's `style` parses (`parseInlineStyle` is not `null`). Otherwise `{ ok: false, reason }` with one of the fixed reasons.
- `rewriteStartTag(content, entry, changes)`: re-tokenizes the start tag at `entry.startOffset..entry.endOffset` (with the 2E-1 tokenizer), reads the existing `style` attribute, builds the merged style, and returns the new content where only the start tag's text changed. The attribute is written with double quotes (the old quote style is replaced). When no `style` attribute exists it is inserted as ` style="..."` right after the end of the last attribute (or right after the tag name). It checks that the tag text at the offsets still begins with `<tag` and returns `{ ok: false }` otherwise.

### 8.1 Worked example (the static sample)
Setting the width of the button on line 13 of `index.html` to 200 px gives the new start tag `<button id="order" class="btn" style="width: 200px">`, and this diff (3 lines of context):

```
--- a/index.html
+++ b/index.html
@@ -10,7 +10,7 @@
     <main>
       <img src="img/logo.png" />
       <p>Fresh bread every morning.</p>
-      <button id="order" class="btn">Order now</button>
+      <button id="order" class="btn" style="width: 200px">Order now</button>
       <p id="message"></p>
     </main>
     <script src="js/app.js"></script>
```
A second commit setting the height to 40 px on the same element amends the entry: the diff from the original text becomes `style="width: 200px; height: 40px"`, the before fingerprint stays, and the after fingerprint changes. Undo removes both at once. The `<img src="img/logo.png" />` on line 11 (shown as a placeholder) maps to `<img src="img/logo.png" style="width: 100px" />`: the attribute is inserted after the last attribute, before the space and slash. An element whose `style` contains `background: url(x.png)` is not mapped ("too complex") and its change is Preview Only.

## 9. The text diff (`textDiff.ts`)

`buildLineDiff(path, oldText, newText)` splits both texts into lines (keeping line endings), finds the common prefix and suffix lines, and writes one hunk with up to 3 lines of context before and after, the `--- a/<path>` and `+++ b/<path>` headers, and correct counts. It handles CRLF, a missing final newline (with the standard marker line), and an empty difference (returns `null`). The caller refuses a diff longer than 2,000 characters.

## 10. Recording a change: `applyUserEdit` (2B actions)

Input: `{ path, baseHash, newContent, editKey, title }`. Steps, all in one pure update:
1. `current = practiceContent(...)` for the path. If `hashText(current) !== baseHash`, refuse with the "page changed" reason (the change becomes Preview Only).
2. `last = work.applied.at(-1)`. If `last.editKey === editKey` and `work.undone` is empty: **amend**. `original = apply reverse(last.diff) to current`. `newDiff = buildLineDiff(path, original, newContent)`. If `newDiff` is `null` (text equals the original): `dropLastEntry` and Log "Style change reverted". Otherwise replace the entry's `diff`, `afterHash = hashText(newContent)`, `at`, and `title`; keep `id` and `beforeHash`.
3. Otherwise **append**: refuse as Preview Only when `work.applied.length + work.undone.length >= 50`. `diff = buildLineDiff(path, current, newContent)`, `beforeHash = hashText(current)`, `afterHash = hashText(newContent)`, and clear `undone`.
4. In both cases check: `diff.length <= 2000`; `applyUnifiedDiff(current-or-original, diff)` produces `newContent` (a safety check on the diff builder); `containsSecret(diff)` is false. A failure makes the change Preview Only with the matching reason and leaves the work state unchanged.
5. Update `scan.result` with `rescanPaths(..., [path])` (2D) so findings follow the edit.
6. Write the Log entry ("Style change recorded: <title>", status `applied`) with the path and title only.
7. A pending crew proposal is left alone (2B decides at approval).

The 2B `undo` and `redo` commands already reverse and re-apply entries with their fingerprints, so amended entries undo as one change.

## 11. Selection geometry (`geometry.ts`)

All functions take plain rectangles `{ id, left, top, width, height, parentId? }` read from the preview and clamp them to 0 to 100,000.
- `hitTest(rects, x, y)`: the deepest element containing the point (smallest area wins; ties broken by document order).
- `lassoSelect(rects, box)`: elements fully inside `box` whose parent is not also fully inside it, at most 20, in document order.
- `resizeFromHandle(rect, handle, dx, dy)`: new width and height as whole pixels between 1 and 5000 for `right`, `bottom`, and `corner`.
- `overlayRect(iframeRect, elementRect)`: position for an outline in PatchBay's coordinate space.

## 12. The browser adapter and controller

### 12.1 `previewEditDom.ts` (browser only)
`readRects(doc, win, ids)` reads `getBoundingClientRect()` for elements found by their `data-pb` number (only numbers present in the element table). `elementAtPoint(doc, x, y)` uses `doc.elementsFromPoint` and returns the first element with a valid `data-pb` number. `applyLiveStyle(doc, id, declarations)` calls `el.style.setProperty(name, value)` for validated names and values; `removeLiveStyle` calls `removeProperty`. `scrollPreview(win, dx, dy)` and `getScroll`/`setScroll` use `win.scrollBy` and `win.scrollTo`. No other DOM writes exist in the file, and it never calls anything that runs code.

### 12.2 `useEditPad.ts`
`createEditController(studio, services)` with `services` `{ now, setTimer, clearTimer, raf, cancelRaf, dom }`.
- **Availability:** computed from the preview state and the window width. When the Edit panel opens, scripts are turned off through the preview action.
- **Pointer handling** on `EditOverlay` through React props: `pointerdown` starts a click, a lasso, or a handle drag (setting pointer capture); `pointermove` is throttled to one update per animation frame; `pointerup` commits. `wheel` is forwarded to `scrollPreview`. All listeners are removed on close and unmount.
- **Live updates:** a drag or a field edit applies `applyLiveStyle` immediately. **Commits** follow the rules in R4.2.
- **Commit pipeline:** for each selected element, check `mapElement`. Group mapped elements by file and call `rewriteStartTag` once per element in order (offsets are adjusted from the end of the file backwards so earlier rewrites do not move later ones). Call `applyUserEdit` once per file with the `editKey` (`edit:<path>:<sorted element keys>`). Unmapped elements and refused commits go to `previewOnly` with their reason. A commit that recorded a change removes any Preview Only entries for the same element and property.
- **Rebuild handling:** after a recorded change, undo, or redo, the Sandbox panel rebuilds the document (new `key`). The controller reads the scroll offsets before the rebuild and writes them after `load`, re-selects by element key, and reapplies Preview Only changes through the builder.
- **Layout re-check:** after each commit or Preview Only change, a 300 ms timer (reset by each new change) calls the 2E-1 layout runner at the current width and updates the counts.
- **Suggestions:** `suggestFix(finding)` returns the fixed suggestion; **Try a fix** adds it to `suggestions` and applies it live; **Keep** runs the commit pipeline for it; **Discard** removes the live style and the entry.
- **Page selector:** `pvEntry(path)` rebuilds the preview, clears the selection and layout results, and keeps the History.
- `dispose()` clears every timer and frame request and removes the overlay handlers.

## 13. The Edit panel

- **Top:** the mode line and resume hint (2B), the availability message, the Page selector (static projects with several pages), **Undo** and **Redo** buttons (they call `harness.run('undo')` and `harness.run('redo')`, and show the reply), and the line "Changes here edit PatchBay's practice copy only. Your repository is never changed."
- **Tools:** **Select**, **Lasso**, **Background** buttons (`aria-pressed`), and the **Pick from list** select.
- **Selection details:** `SelectionInfo` shows the tag, id, and class, and "Writes to <path>, line <n>" or "Preview Only: <reason>".
- **Property form:** collapsible `details` groups (Size, Corners, Spacing, Border, Shadow, Text, Background), each a labelled fieldset of inputs with units and ranges, inline error text, and a Reset link for Preview Only values. Spacing has the "same on all sides" checkbox.
- **Preview Only list:** items with element, property, value, reason, **Remove**; **Remove all**; suggestions with **Keep** and **Discard**.
- **Layout block:** the count, **Check layout**, **Check at all widths**, the findings with **Try a fix**, and the result of the last re-check.
- **Overlay (`EditOverlay`):** absolutely positioned inside the Sandbox, above the iframe: a dashed 2 px black outline per selected element, three small square handles for a single selection, and the dashed lasso rectangle while dragging. It uses only black, white, and dashes.
- All text is React text. Controls are at least 44 px tall. No color other than `#000` and `#fff` in PatchBay's own CSS.

## 14. Failure handling

| Failure | Handling |
|---|---|
| Invalid field value | Inline message, no change. |
| Element number from the preview is not in the table | Ignored. |
| `mapElement` fails | Preview Only with the fixed reason. |
| `rewriteStartTag` cannot find the tag at the offsets | Preview Only with "The page changed after the preview was built". |
| Diff too large, contains a secret, or does not apply | Preview Only with the reason. The work state is unchanged. |
| History full | Preview Only with the reason. |
| Rebuild fails after an edit | The panel shows the build failure with Try again. History is kept. |
| Pointer capture lost or the panel closes during a drag | The drag is cancelled, the live style is removed, nothing is committed. |
| Page selector change during a drag | The drag is cancelled first. |
| Narrow window | Tools disabled with the message. |
| Undo or Redo refused | The 2B reply shown beside the buttons. |

## 15. Verification mapping

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Style model | `tests/styleModel.test.ts` (P1) |
| 2. Inline style | `tests/inlineStyle.test.ts` (P1) |
| 3. Mapping and rewrite | `tests/elementMap.test.ts` (P2) |
| 4. Diff and History | `tests/textDiff.test.ts` (P2), `tests/userEdit.test.ts` (P4) |
| 5. Geometry | `tests/editGeometry.test.ts` (P3) |
| 6. Edit state | `tests/editState.test.ts` (P5) |
| 7. Controller | `tests/editController.test.ts` (P6) |
| 8. Components | `tests/editUi.test.tsx` (P7, P8) |
| 9. Static checks | P1 to P8, P9 |
| 10. Regression | P2, P4, P8, P9 |
| 11. Browser run | P9 |
| 12. Phase 2E-2 gate | P9 |

## 16. Risks and known limits

- **Only `style` attributes are written.** A page whose looks come from CSS rules will show your change (inline styles win) but the written change is an inline style, not an edit to the rule. That is deliberate: rule editing is ambiguous. The panel says what it wrote.
- **Element keys can shift when the page structure changes.** Preview Only changes may then attach to a different element or become "element not found". They are never saved.
- **Pointer drawing is only partly testable without a browser.** The geometry and commit logic are pure and tested; the real pointer behavior is verified in the browser run and marked **Unverified** until run.
- **Colour inputs are the browser's own.** Their look varies and is outside PatchBay's control.
- **Merging bursts changes how Undo feels.** One Undo reverses a whole run of tweaks to one element. That is intended and stated in the panel.
- **A crew proposal and your edit can collide on the same file.** The 2B approval check protects against a bad apply, and the Log explains a failure.
- **2B and 2E-1 code change in a few named places.** The changes are small, listed, and covered by the existing suites (only the named tests change).
- **`scripts/traceability/*` still do not exist.** Approvals are recorded in chat.

## 17. PLAN.md nodes

Plan `P2E2-EDITPAD`, feature `F8 — Edit Pad`, with nodes F8.1 (limits, style model, inline style), F8.2 (text diff, mapping, rewrite, and the 2E-1 builder changes), F8.3 (geometry and suggestions), F8.4 (History integration: `applyUserEdit`, `editKey`, amend), F8.5 (edit state and actions), F8.6 (browser adapter and controller), F8.7 (panel components and overlay), F8.8 (wiring and the Page selector). Full text is in `traceability/PLAN.md`.
