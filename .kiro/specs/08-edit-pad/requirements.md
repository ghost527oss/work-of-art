# Requirements: 08 Edit Pad (Phase 2, Sub-phase 2E-2)

Sources: steering `build-phases.md` (Phase 2 text, sub-phase 2E-2 and its gate); the approved Phase 2 blueprint (section 5: the Adobe-paint-style Edit pad, automatic layout checks, honest code mapping, the three change layers); specs 01 to 07 (what is built or specified); your answers for 2E: exact-mapped plain HTML elements become real `style` edits, everything else is Preview Only, your own edits apply right away into History with Undo and Redo, only Crew proposals need Approve, layout overflow is re-checked after edits, patch export stays in 2F.
Active product phase: **Phase 2, Sub-phase 2E-2**. PatchBay's own screens stay black-and-white wireframe with no animation (the Edit pad's colour tools change only the imported page's elements). `AI_MODE=mock` only. **No new runtime dependency.** No AI call and no network call. **This spec assumes 2A to 2E-1 are built and approved.**

## 1. Purpose

2E-2 builds the **Edit pad**: a visual editor for the preview. You click an element, draw a lasso, or pick the page background, and change its size, spacing, border, corners, shadow, text size, and colours. When PatchBay knows exactly where the element is in a plain HTML file, your change is written into that element's `style` attribute in PatchBay's in-memory copy, as a History entry you can undo. When it cannot be sure, the change is **Preview Only**: you see it, nothing is written, and PatchBay says why.

In simple words: you can drag and tweak things like in a paint program. The page on screen changes at once. If PatchBay can safely tell which line of the HTML file the thing came from, it also changes that line in its practice copy and keeps an undo list. If not, it tells you "this is only a preview change". Your real repository is never touched.

## 2. Scope

### In scope
- **The Edit panel** (replacing the 2B stub): the tools, the property form, the selection details, the Preview Only list, Undo and Redo buttons, and the layout re-check block.
- **Selection tools:** click (Select), rubber-band (Lasso), and Background, plus a **Pick from list** control that works without a pointer.
- **Style tools:** width, height (numbers and drag handles), corner roundness, padding, margin, border, shadow, text size, text colour, background colour, and a two-colour gradient.
- **Code mapping and the three layers:** Preview Only (layer 1) and the session code change in the practice copy (layer 2). Export (layer 3) stays in 2F.
- **History:** each commit is one History entry (consecutive edits to the same element merge into one), with Undo and Redo through the 2B rules and the 2B fingerprint checks.
- **Layout re-check after edits** and **Try a fix** suggestions that you Keep or Discard.
- **A Page selector** so you can preview and edit any HTML page in a static project, not only the entry page.
- **Workbench selection:** elements in the approximate Component Workbench can be selected and changed as Preview Only.
- Tests, a browser check of the drawing and dragging, and `traceability/PLAN.md` entries.

### Out of scope (later sub-phases or phases)
- Exporting changes (2F). Journal (2F). Session restore, including keeping Preview Only changes across a refresh (2G).
- Editing CSS rule files, JSX, Vue, or Svelte source, or any file other than the HTML page you are looking at. Editing text content, adding or deleting elements, or moving elements in the page.
- Editing while scripts run (R2.4), and on a narrow window (R7.8).
- Any AI help with editing (Phase 3).
- Colors or animation in PatchBay's own screens (Phase 4).

## 3. Glossary

- **Edit pad:** the Edit panel plus the selection overlay on the Sandbox.
- **Element key:** a stable name for an element: the file, the tag name, and how many of that tag came before it in the file (for example `index.html#button#1`).
- **Mapped:** PatchBay knows exactly where the element's start tag is in a plain HTML file and can safely rewrite its `style` attribute.
- **Preview Only:** the change shows in the preview but is not written to the practice copy.
- **Commit:** the moment a change is final (a drag ends, a field loses focus or Enter is pressed, a colour is chosen).
- **Edit key:** the name of a burst of edits to the same element in the same file, used to merge them into one History entry.
- **Layout finding:** a measured finding from 2E-1.

## 4. Functional requirements

### R1. The Edit panel and when editing is available
1. THE Edit toolbar button SHALL open the Edit panel (the 2B placeholder is replaced). All 2B behavior stays: opening it switches to Self-editing mode and pauses automation, and the "Type resume in AI Chat to continue." line stays.
2. EDITING SHALL be available only when the Sandbox is in `static` mode in look-only, or in `workbench` mode. In any other state THE panel SHALL say why, in plain words, and offer no tool:
   - Source Inspection: "Editing needs a page preview. This project has no page to show."
   - Scripts on: PatchBay SHALL turn scripts off when the Edit panel opens, and say "Scripts were turned off because editing needs look-only mode."
   - Preview building or failed: "Editing starts when the preview is ready."
3. THE panel SHALL show the current page, a **Page** selector for static projects (R6), and "Changes here edit PatchBay's practice copy only. Your repository is never changed."
4. ON a window narrower than 640 px the tools SHALL be disabled with "Editing needs a wider window." The panel and the preview stay visible.
5. THE panel SHALL work by keyboard and touch, with buttons at least 44 px tall.

### R2. Selection
1. **Select:** a click on the preview selects the deepest element that has a `data-pb` number at that point. A click with Shift adds to or removes from the selection. A click on empty space clears it.
2. **Lasso:** dragging draws a dashed rectangle. On release THE SYSTEM SHALL select every element that lies fully inside the rectangle and whose parent is not also fully inside it (the outermost ones).
3. **Background:** the **Background** tool selects the page body.
4. **Pick from list:** a labelled control lists up to 200 elements ("tag, id, class, line") and selects the chosen one. It exists so editing works without a pointer.
5. THE selection SHALL hold at most 20 elements. Going over SHALL keep the first 20 and say "Only the first 20 elements were selected."
6. THE selected elements SHALL be shown with a dashed black outline in an overlay above the preview. A single selected element SHALL also show three drag handles (right edge, bottom edge, corner).
7. THE selection SHALL be kept by element key. After the preview is rebuilt (an edit, an undo, or a page reload), THE SYSTEM SHALL select the same elements again when they still exist, and SHALL restore the preview's scroll position.
8. THE overlay SHALL cover the preview in Edit mode so pointer events do not reach the page, SHALL pass mouse-wheel scrolling to the preview, and SHALL never run any page code.

### R3. The style tools
1. THE tools SHALL offer exactly these properties and no others:
   - **Size:** `width`, `height`: a number with unit `px` (0 to 5000) or `%` (0 to 100), or `auto`.
   - **Corners:** `border-radius`: `px` (0 to 500) or `%` (0 to 50).
   - **Padding** and **Margin:** each side separately (top, right, bottom, left), `px` 0 to 500 (margin may be negative down to -500), with a "same on all sides" checkbox that is on by default.
   - **Border:** `border-width` (px 0 to 50), `border-style` (`none`, `solid`, `dashed`, `dotted`), `border-color` (a `#rrggbb` colour).
   - **Shadow:** `box-shadow` from presets (**None**, **Small**, **Medium**, **Large**) and a shadow colour (`#rrggbb`). The preset sets fixed offsets and blur.
   - **Text:** `font-size` (px 6 to 200) and `color` (`#rrggbb`).
   - **Background:** `background-color` (`#rrggbb` or `transparent`) and a **Gradient** of two `#rrggbb` colours and an angle (0 to 360), written as `background-image: linear-gradient(<angle>deg, <colour>, <colour>)`, and **No gradient** to clear it.
2. EVERY value SHALL be built from validated parts (numbers inside the ranges, units and keywords from fixed lists, colours matching `#rrggbb`). THE tools SHALL NOT accept free-form CSS text anywhere. A generated value SHALL NEVER contain `url(`, `expression(`, quotes, semicolons, braces, angle brackets, or backslashes (tested over the whole input space of the builders with a fuzz).
3. A field with an invalid value SHALL show an inline message ("Use a number from 0 to 5000.") and SHALL change nothing.
4. THE colour fields SHALL use the browser's own colour input. PatchBay's own chrome stays black and white.
5. THE drag handles SHALL resize the selected element live: dragging the right edge changes `width`, the bottom edge changes `height`, the corner changes both. The new size SHALL be whole pixels, at least 1 and at most 5000. The live change is shown immediately (as an inline style on the element in the preview), and is committed when the pointer is released. The number fields show the same values and are the alternative to dragging.
6. WHEN several elements are selected, a change SHALL apply to each of them. The fields show the value when all agree and a blank otherwise.

### R4. Changes, mapping, and the three layers
1. EVERY committed change SHALL be one of:
   - **Mapped (layer 2):** written into the practice copy as a change to the element's `style` attribute (R4.3), recorded in History.
   - **Preview Only (layer 1):** applied in the preview and listed in the Preview Only list, with the reason (R4.4).
2. A change SHALL be committed when: a drag handle is released; a number field loses focus or Enter is pressed; a select or checkbox changes; a colour is chosen (the colour input's `change` event, not each movement). Moving a colour picker, typing in a field, or dragging SHALL update the preview live without recording anything until the commit.
3. AN element is **mapped** only when all of these hold: the page is a plain `.html` or `.htm` file; the element is in the page's own file (it has an entry in the current element table); the effective content has not changed since the table was built (a hash check); the start tag's `style` attribute is absent, or is a plain list of `name: value` declarations with no `url(`, no semicolons or colons inside quotes or parentheses, and no `{{`; the tag is not inside an SVG; and the tag is not an unknown or custom tag written as `span`.
4. WHEN an element is not mapped, THE reason SHALL be one fixed sentence: "This element comes from a component picture, which is approximate.", "This element's style is too complex to rewrite safely.", "The page changed after the preview was built; reload the preview.", "This element is inside an SVG.", "This tag was not recognised.", "The lines around this element contain a likely secret, so the change is not recorded.", "The change is too large to record (limit 2,000 characters).", "History is full (50 changes). Undo some changes first.", or "Only plain HTML pages can be written to the practice copy."
5. FOR a mapped element, THE SYSTEM SHALL rewrite only the start tag: it SHALL read the current `style` declarations, replace the ones the commit changes (keeping their position), append new ones in the table's fixed order after the existing ones, and write `style="..."` with double quotes (inserting the attribute right after the tag's last attribute when it did not exist). It SHALL NOT change any other character of the file.
6. THE SYSTEM SHALL record the change as a **History entry** using the 2B History: the diff is a single hunk with 3 lines of context (at most 2,000 characters), applied to the practice copy with `applyUnifiedDiff`, with the before and after fingerprints, the title "Style: <tag> at <path>:<line>" (plus the changed property names, at most 80 characters), and the redo list cleared. The change SHALL apply immediately, without an Approve step.
7. **Merging:** WHEN the most recent applied History entry has the same edit key, the redo list is empty, and a new commit arrives for the same elements in the same file, THE SYSTEM SHALL **amend** that entry (the diff is recomputed from the file as it was before the first commit of the burst to the new text; the before fingerprint stays and the after fingerprint is updated). WHEN the amended result equals the original text, the entry SHALL be removed and the Log SHALL say "Style change reverted". Merging SHALL end when any other History entry is added, undone, or redone.
8. A commit that would be the 51st History entry (and cannot be merged) SHALL be kept as Preview Only with the reason in R4.4.
9. A change that is not recordable SHALL still be applied as Preview Only, so the page always shows what the user asked for.
10. THE secret rule from 2D SHALL apply: before recording, THE SYSTEM SHALL check the diff with `containsSecret` and, when it matches, keep the change as Preview Only with the reason in R4.4.
11. THE practice copy, the History, the Log, and the scan findings SHALL all update in the **same** store update (the 2D rescan of the edited file included), so they never disagree.
12. NOTHING in the Edit pad SHALL change the loaded snapshot, a file outside the practice copy, or the real repository.

### R5. Preview Only changes
1. Preview Only changes SHALL be held in state as a list of `{ elementKey, scope, property, value }` (at most 50), applied to the preview document whenever it is built or rebuilt, and applied live to the iframe when committed.
2. THE Edit panel SHALL list them with the element, the property, the value, and the reason, with **Remove** for each and **Remove all**.
3. PREVIEW Only changes SHALL NOT be saved, SHALL be cleared when the snapshot changes, and SHALL be reapplied only to elements whose element keys still exist after a rebuild. A change whose element is gone SHALL be listed as "element not found" and can be removed.
4. A change that was recorded in History SHALL NOT also appear in the Preview Only list.
5. THE Preview Only scope SHALL be the page path (static) or the component name (workbench), so a tweak made to one component's picture does not appear on another.
6. IN the Component Workbench every change SHALL be Preview Only with the "component picture" reason.

### R6. The Page selector
1. FOR a static project with more than one `.html` or `.htm` file, THE Sandbox toolbar SHALL show a **Page** selector listing up to 50 pages (the entry page first). Choosing a page SHALL rebuild the preview from that page (look-only), clear the selection and the layout results, and keep the History.
2. THE chosen page SHALL be kept in the preview state, reset by a snapshot change, and not saved.
3. EDITS and layout checks SHALL apply to the chosen page. Pages are independent: an edit to one page's file does not rebuild another page until it is chosen.

### R7. The Edit panel contents
1. THE panel SHALL show, from the top: the mode line and the resume hint (2B); the availability message (R1.2); **Undo** and **Redo** buttons; the tools (**Select**, **Lasso**, **Background**) with `aria-pressed`; **Pick from list**; the selection details; the property form in collapsible groups (Size, Corners, Spacing, Border, Shadow, Text, Background); the Preview Only list; the layout block (R8).
2. THE selection details SHALL show, for one element: "<tag> id class" and either "Writes to <path>, line <n>" (mapped) or "Preview Only: <reason>". For several: the count and how many are mapped.
3. THE **Undo** and **Redo** buttons SHALL run exactly the same actions as the typed commands `undo` and `redo` (the 2B rules and refusals, including "Decide the waiting proposal first." and "Pause the run first."), and SHALL show the reply beside them.
4. THE form groups SHALL be labelled fieldsets with labelled inputs. Each numeric field SHALL show its unit and range. A "Reset" link per group SHALL clear the **Preview Only** values of that group for the selection (a mapped change is undone with Undo).
5. THE panel SHALL show "History: <n> changes. Type undo or redo in AI Chat, or use the buttons above." and no Apply, Approve, Reject, Pause, Resume, or Step button.
6. THE panel SHALL show clear loading, empty ("Select something in the preview to edit it."), and error states.
7. ALL text SHALL be React text.
8. THE tools SHALL be disabled on a narrow window (R1.4).

### R8. Layout re-check and suggestions
1. AFTER every commit and every Preview Only change, THE SYSTEM SHALL re-run the layout check (2E-1) at the current width after 300 ms of quiet, and update the layout findings. WHEN the number of layout findings changes, the Log SHALL say "Layout check: <n> findings (was <m>)."
2. THE Edit panel's layout block SHALL list the layout findings for the current page (element, kind, numbers, width), the count, and **Check layout** and **Check at all widths** buttons.
3. FOR each layout finding THE block SHALL offer **Try a fix**, which applies one suggested change as a **suggestion**:
   - text wider than its box: `overflow-wrap: anywhere`;
   - text cut off at the bottom: `height: auto`;
   - page wider than the screen: `max-width: 100%` on the widest element.
   A suggestion SHALL be shown in the preview at once and listed with **Keep** and **Discard**. **Keep** commits it like any other change (mapped or Preview Only). **Discard** removes it. The layout re-check SHALL then show whether the finding is gone ("Fixed in the preview." or "Still there.").
4. THE suggestion properties (`overflow-wrap`, `max-width`, `height: auto`) SHALL be built by the same validated builders and SHALL be allowed only through **Try a fix**.
5. THE layout re-check SHALL run only in static look-only mode. In the workbench the block SHALL say "Layout checks run on real pages, not on approximate pictures."

### R9. State, wiring, and the earlier specs
1. THE edit state (tool, selection by element key, Preview Only changes, suggestions, availability) SHALL live in the studio store in an `edit` slice, plain data, changed only by pure actions, and cleared when the snapshot is replaced or cleared.
2. THE recorded changes SHALL go through one whole-state action in the work actions (`applyUserEdit`), which updates the practice copy, History, Log, and scan findings atomically.
3. THE 2B `HistoryEntry` SHALL gain an optional `editKey` (at most 200 characters). THE saved record schema SHALL accept it. A record written before this change SHALL still load.
4. THE 2E-1 builders SHALL change in three ways only: elements get an **element key** in the element table; the workbench builder SHALL annotate elements with `mappable: false` and the "component picture" reason; and the Sandbox toolbar gains the Page selector. The 2E-1 tests that assert "no `data-pb` in the workbench" change accordingly (named in the tasks).
5. WHEN a crew proposal is waiting and you edit the same file, THE proposal SHALL stay as it is. At approval, the 2B rules decide: the diff applies if it still can, otherwise the Log says "failed" and the proposal stays waiting.
6. THE existing ingestion, AI, shell, harness, understanding, scanner, and preview behavior and tests SHALL stay unchanged, except the items in R9.3 and R9.4.
7. THE app SHALL add no network call and no runtime dependency.

### R10. Safety, privacy, and resources
1. THE SYSTEM SHALL change the preview only through `style.setProperty` and `style.removeProperty` with validated names and values on elements that have a `data-pb` number, and SHALL NOT use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or anything that runs code in the preview.
2. THE SYSTEM SHALL treat everything read from the preview (rectangles, element numbers) as untrusted data: numbers are clamped, element numbers are checked against the element table, and unknown numbers are ignored.
3. THE SYSTEM SHALL never save the selection, the tool, Preview Only changes, or suggestions. History entries are saved by 2B with its secret guard.
4. THE SYSTEM SHALL keep memory bounded: at most 20 selected elements, 50 Preview Only changes, 200 list items, one History entry per burst.
5. THE SYSTEM SHALL release pointer listeners, timers, animation-frame requests, and the overlay when the Edit panel closes, the preview rebuilds, or the app unmounts. Dragging SHALL be throttled to one update per animation frame.

## 5. Error and empty states

| Condition | Required behavior |
|---|---|
| Preview not ready | "Editing starts when the preview is ready." |
| Source Inspection mode | "Editing needs a page preview. This project has no page to show." |
| Scripts were on | Turned off with the notice. |
| Narrow window | Tools disabled with "Editing needs a wider window." |
| Nothing selected | "Select something in the preview to edit it." |
| Invalid number or colour | Inline message, nothing changes. |
| Element not mapped | Change shown as Preview Only with one fixed reason. |
| History full | Change kept Preview Only with the reason. |
| Diff too large or contains a secret | Change kept Preview Only with the reason. |
| Page changed after the table was built | Preview Only with "reload the preview" reason. |
| Undo or Redo refused | The 2B reply is shown beside the buttons. |
| Layout check cannot run | Reason text (scripts on, workbench, preview not ready). |
| Element no longer exists after a rebuild | Its Preview Only change is listed as "element not found". |
| Crew proposal waiting and the same file edited | 2B approval rules decide. |

## 6. Acceptance and verification gate

The spec is satisfied when all of the following hold:

1. **Style model tests:** every property's validator accepts its range limits and rejects one past each limit, wrong units, `NaN`, empty, and non-numeric text; colours accept `#rrggbb` only; presets and the gradient build the exact strings in the design; a fuzz of 100,000 inputs over every builder never produces a value containing `url(`, `expression(`, a quote, a semicolon, a brace, an angle bracket, or a backslash, and never throws.
2. **Inline style tests:** parse, merge, and serialise: existing declarations keep order, a changed property is replaced in place, new properties are appended in table order, a trailing semicolon and extra spaces are normalised, uppercase names are lowered, a `url(`, a semicolon in quotes, `{{`, or an unbalanced quote makes the style "too complex" (not mapped).
3. **Mapping and rewrite tests:** every rule of R4.3 and every reason in R4.4; the start-tag rewrite on a tag without `style`, with `style`, with other attributes in any order, self-closing (`<img ... />`), multi-line start tags, CRLF files, tabs, a tag at the end of the file, and a tag with no trailing newline; only the start tag changes (a byte-by-byte comparison of everything else); the worked examples in the design (the `index.html` button and the `<img>`).
4. **Diff and History tests:** `buildLineDiff` makes one hunk with 3 lines of context, applies with `applyUnifiedDiff`, reverses exactly, stays within 2,000 characters or refuses; `applyUserEdit` appends an entry with correct fingerprints, clears the redo list, amends a burst (same edit key, last entry, empty redo list), removes the entry when the text returns to the original, refuses the 51st entry as Preview Only, refuses a diff containing a secret fixture, updates the practice copy, the History, the Log, and the 2D findings in one update (a state comparison before and after), and never changes the snapshot (deep freeze); `undo` and `redo` restore the exact text including after an amended burst; the saved record round-trips `editKey` and an old record without it still loads.
5. **Geometry tests:** the lasso selects only fully contained outermost elements; the hit test picks the deepest element; the handle maths for right, bottom, and corner give whole pixels between 1 and 5000 and ignore negative sizes; the 20-element cap and its message.
6. **Edit state tests:** the pure actions (tool, select, add, remove, cap, set Preview Only, remove, remove all, suggestion add, keep, discard); stale updates; element keys survive a simulated rebuild and vanish when the element is gone; clearing on snapshot change; scripts are turned off when Edit opens; nothing from the edit state reaches the saved record.
7. **Controller tests (fake iframe document, fake timers and `raf`):** a drag updates once per frame and commits once on release; a number field commits on blur and Enter only; a colour input commits on `change` only; after a commit the preview rebuild restores selection by key and scroll position; the layout re-check runs 300 ms after the last commit and reports the change; listeners and timers are released on close, rebuild, and unmount; the adapter uses only `style.setProperty`, `style.removeProperty`, and reads (a test with a recording fake fails on any other call); an element number not in the table is ignored; numbers from the preview are clamped.
8. **Component tests (server render):** the panel in each availability state; the tools with `aria-pressed`; the form groups with units and ranges; the selection details for mapped, Preview Only, and several elements; the Preview Only list with Remove and Remove all; Undo and Redo buttons with replies; the layout block with Try a fix, Keep, and Discard; the Page selector; the overlay's outlines and handles for a given rectangle set; text shown escaped; no Apply, Approve, Reject, Pause, Resume, or Step button; no color other than `#000` and `#fff` in PatchBay's own CSS; no `transition` or `animation`; no `dangerouslySetInnerHTML`.
9. **Static checks:** no network, `fetch`, AI, or `mockAssistant` import in any 2E-2 file; no new dependency; no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or `new Function`; every new file tagged.
10. **Regression:** the full existing suite passes, with only the tests named in the tasks changed (the 2E-1 tests about workbench annotation, and nothing else).
11. **Browser run (headless Chromium, built app, real pointer events):** load the static sample; open Edit; click an element and see its outline; lasso two elements; select the background; pick from the list; drag the right handle and see the width change live and one History entry on release; type a width and a height and see them merge into one entry; change colour, border, radius, padding, shadow, text size, and a gradient; open the History panel and see the entries; `undo`, `redo`, and the buttons; see the same line changed in the diff; reload the preview and see the edit and the selection; edit an element with a complex `style` and see Preview Only with its reason; edit in the React workbench and see Preview Only; switch the Page selector to `about.html` and edit it; create an overflow in a fixture page, see the layout finding, **Try a fix**, **Keep**, and the finding disappear; open the Edit panel with scripts on and see them turn off; a narrow window disables the tools; refresh and see the History entries restored (and the Preview Only list empty); no change reaches the loaded snapshot; AI Chat, the 2B commands, 2C, 2D, and 2E-1 still work; zero console errors.
12. **Phase 2E-2 gate (build-phases.md):** no edit changes anything except the in-memory practice copy; unmapped changes never reach the code; every recorded change can be undone.

## 7. Open questions for approval

**Status: all nine approved by the user (including the small test and type updates to 2A, 2B, 2D, and 2E-1 named in the tasks).**

1. **Undo and Redo buttons in the Edit panel (R7.3).** They run the same commands as typing `undo` and `redo`, and show the same replies. A paint-style pad feels wrong without them. Approve, or keep it typed only?
2. **Workbench elements can be selected and changed as Preview Only (R5.6, R9.4).** This changes the 2E-1 builder so the workbench annotates elements as not mappable. Approve?
3. **Merging a burst of edits into one History entry (R4.7).** Many small changes to the same element become one entry, so the 50-entry limit is not used up by dragging. Approve?
4. **Only these style properties (R3.1), no free CSS text (R3.2).** Approve this list, or add a property?
5. **A Page selector (R6)** so every HTML page of a static project can be previewed and edited. Approve?
6. **Layout "Try a fix" with Keep and Discard (R8.3)** using three fixed suggestions. Approve?
7. **Editing needs a window of at least 640 px (R1.4).** On a phone-sized window the Edit panel covers the preview. Approve?
8. **Preview Only changes are not saved across a refresh (R5.3),** and are not part of session restore in 2G either. Recorded History changes are saved by 2B. Approve, or should 2G also restore Preview Only changes?
9. **Limits (R2.5, R4.4, R5.1, R10.4):** 20 selected elements, 50 Preview Only changes, 200 list items, a 2,000-character diff, 50 History entries, a 300 ms re-check delay, 5000 px maximum size. Approve as placeholders?
