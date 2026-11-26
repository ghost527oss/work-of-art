# Tasks: 08 Edit Pad (Phase 2, Sub-phase 2E-2)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P2E2-EDITPAD` and the F8 nodes in `traceability/PLAN.md`. Active product phase: **Phase 2, Sub-phase 2E-2** (PatchBay's own screens black-and-white wireframe, no animation, `AI_MODE=mock` only, no AI and no network). **These tasks start only after 2A to 2E-1 are built and you have advanced the active sub-phase to 2E-2.**

Task ids are **P1 to P9**, so they cannot be confused with T, M, S, B, C, D, or E (earlier specs).

## How each task runs

1. **Wait for your explicit "Go" naming the task.** A "Go" covers that one task only. Nothing is written before the first "Go".
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F8.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts.
4. Check the diff against the scope myself, then report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait.

Rules for every task:
- Two consecutive verify failures on the same error: stop editing, hand a read-only diagnosis to `bug-auditor`, and wait for your approval before a third attempt.
- No new dependency. No network, `fetch`, AI, `mockAssistant`, `aiAssistant`, or `useAssistant` import in any 2E-2 file. No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or `new Function` anywhere in PatchBay's code. No `dangerouslySetInnerHTML`.
- **Do not touch the 2E-1 isolation code:** `previewFlags.ts`, `previewBridge.ts`, `htmlTokens.ts`, and `htmlAllow.ts` are read only for this spec. The sandbox flags and policy strings must not change.
- The only writes to the preview document are `style.setProperty` and `style.removeProperty` with validated names and values on elements that have a known `data-pb` number.
- The Edit pad changes nothing except the in-memory practice copy (through `applyUserEdit`). The loaded snapshot is never modified (deep-freeze tests).
- Secrets: the diff of a recorded change never contains a likely secret; a change that would is kept Preview Only.
- Selection, tools, Preview Only changes, and suggestions are never saved.
- Do not touch the files in design section 4.3. The 2B and 2E-1 files in design section 4.2 may change **only** as described there.
- New CSS for PatchBay's own chrome uses only `#000` and `#fff`, with no `transition` and no `animation`.
- `scripts/traceability/*` still do not exist. Approval is recorded in this chat.

## Branch and commits

The spec on `spec/08-edit-pad`, code on `feat/edit-pad` from the spec branch, **one commit per task**, a pull request after P9.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| P1 | F8.1 | Limits, style model, and inline style handling | none |
| P2 | F8.2 | Text diff, mapping, start-tag rewrite, and the 2E-1 builder changes | P1, 2E-1 (E3, E5) |
| P3 | F8.3 | Selection geometry and layout suggestions | P1 |
| P4 | F8.4 | History integration: `applyUserEdit`, `editKey`, amend | P2, 2B, 2D |
| P5 | F8.5 | Edit state and actions | P3, P4, 2E-1 (E8) |
| P6 | F8.6 | Browser adapter and controller | P2, P3, P4, P5, 2E-1 (E9) |
| P7 | F8.7 | Panel components and overlay | P1, P5 |
| P8 | F8.8 | Wiring, the Page selector, and the Sandbox overlay slot | P6, P7, 2E-1 (E10) |
| P9 | F8 | Final gate, drawing browser run, mutation checks, independent review | P1 to P8 |

---

## P1. Limits, style model, and inline style handling
- **plan_id:** P2E2-EDITPAD  **node_id:** F8.1
- **scope:** `src/config/editLimits.ts`, `src/edit/styleModel.ts`, `src/edit/inlineStyle.ts`, `tests/styleModel.test.ts`, `tests/inlineStyle.test.ts`
- **goal:** Build design sections 6 and 7.
- **acceptance:**
  - **Validators:** for every property in the design table, the limits pass and one past each fails (`width` 0 and 5000 px pass, 5001 fails, `%` 100 passes and 101 fails, `border-radius` 500 px and 50 %, margin -500 to 500, font size 6 to 200, border width 0 to 50, angle 0 to 360); wrong units, `NaN`, `Infinity`, empty text, negative where not allowed, and non-numeric text fail with a plain message; decimals are rounded to whole numbers; colours accept `#rrggbb` in either case (output lower case) and reject `#fff`, `red`, `rgb(...)`, and `#gggggg`; keywords come from fixed lists.
  - **Builders:** the shadow presets and the gradient produce the exact strings in the design (written out by hand); "No gradient" clears `background-image`; "same on all sides" builds four longhand declarations; the suggestion-only properties accept only their fixed values.
  - **Fuzz:** 100,000 seeded random inputs over every builder never throw and every produced value matches an allowed-character pattern and contains none of `url(`, `expression(`, a quote, `;`, `{`, `}`, `<`, `>`, or a backslash.
  - **Inline style:** `parseInlineStyle` on plain lists, extra spaces, upper-case names, a trailing semicolon, an empty string, and each "too complex" case (`url(`, `{{`, a semicolon inside quotes or parentheses, an unbalanced quote or parenthesis, a declaration without a colon) returns the list or `null`; `mergeStyle` keeps order, replaces in place, and appends new properties in the table's order; `serializeStyle` writes `prop: value` joined by `; ` with no trailing semicolon; a round trip of valid input is stable.
  - `editLimits.ts` holds the design values and `provisional: true`.
  - The files import nothing from React, stores, the network, or the DOM.
- **verify:** `npm run typecheck && npx vitest run tests/styleModel.test.ts tests/inlineStyle.test.ts`

## P2. Text diff, mapping, start-tag rewrite, and the 2E-1 builder changes
- **plan_id:** P2E2-EDITPAD  **node_id:** F8.2
- **scope:** `src/edit/textDiff.ts`, `src/edit/elementMap.ts`, `src/preview/previewDocument.ts` (element `key`, `mappable`, `reason`, and Preview Only application only), `src/preview/workbenchDocument.ts` (annotate as not mappable only), `tests/textDiff.test.ts`, `tests/elementMap.test.ts`, and **in the 2E-1 tests only the assertions about workbench annotation and the element table shape** (`tests/previewDocument.test.ts`, `tests/workbench.test.ts`)
- **goal:** Build design sections 8, 9, and 4.2 (the builder changes). The builder accepts a list of Preview Only changes `{ elementKey, property, value }` and writes them as inline `style` on the matching elements (through `inlineStyle` merge and the CSS sanitiser), after the allowlist step.
- **acceptance:**
  - **Diff:** `buildLineDiff` gives one hunk with 3 lines of context, the right counts, and `---`/`+++` headers; applies with 2B `applyUnifiedDiff` and reverses exactly with `reverseUnifiedDiff`; works for a change on the first line, the last line, a one-line file, CRLF files, a file with no final newline, and an empty difference (`null`); a very large change is returned and the caller's 2,000-character rule is tested elsewhere.
  - **Mapping:** every rule of R4.3 passes and fails on fixtures, and every reason in R4.4 that belongs here is produced with the exact sentence: not HTML, table stale (hash differs), unknown tag, inside SVG, style too complex.
  - **Rewrite:** the worked examples in design section 8.1 give exactly the diff and the `<img>` result written there; tags without `style`, with `style` (merge, in-place replacement, append in table order), single-quoted `style`, other attributes in any order, self-closing, multi-line start tags, tabs, CRLF, a tag at the end of the file; **only the start tag's text changes** (a byte-by-byte comparison of the rest of the file); when the offsets no longer point at the tag, the result is `{ ok: false }`.
  - **Builder changes:** the element table entries have `key` (`path#tag#n`, `n` counting that tag in that file, stable for the same input), `mappable`, and `reason`; for static pages `mappable` is true except for unknown tags and elements inside SVG; for the workbench every entry has `mappable: false` and the reason "This element comes from a component picture, which is approximate."; Preview Only changes appear as inline styles on exactly the matching elements and never on others; an unknown key is ignored; the changed values go through the same sanitiser; the isolation tests from 2E-1 (hostile markup, exactly two `<meta>` tags, policy and flags unchanged) still pass.
  - **The only 2E-1 test changes** are the workbench "no `data-pb`" assertions and the element table shape. The report shows both diffs. Every other 2E-1 test passes unedited.
  - The new files import nothing from React, stores, the network, or the DOM.
- **verify:** `npm run typecheck && npx vitest run tests/textDiff.test.ts tests/elementMap.test.ts tests/previewDocument.test.ts tests/previewHostile.test.ts tests/workbench.test.ts tests/previewFlags.test.ts`

## P3. Selection geometry and layout suggestions
- **plan_id:** P2E2-EDITPAD  **node_id:** F8.3
- **scope:** `src/edit/geometry.ts`, `src/edit/suggestions.ts`, `tests/editGeometry.test.ts`
- **goal:** Build design section 11 and the three suggestions in requirements R8.3.
- **acceptance:**
  - **Hit test:** the deepest element wins; the smaller area wins among overlapping siblings; ties by document order; a point outside every rectangle returns none.
  - **Lasso:** selects fully contained elements and omits those whose parent is also fully contained; partly overlapping elements are not selected; at most 20 (the rest dropped with the reported count); order is document order; a zero-size lasso selects nothing.
  - **Resize:** the right, bottom, and corner handles give whole pixels, never below 1, never above 5000, and ignore `NaN`; negative drags clamp to 1.
  - Rectangles from outside are clamped to 0 to 100,000; `NaN`, `Infinity`, and negative sizes are ignored or clamped without throwing.
  - **Suggestions:** each layout finding kind gives exactly its suggestion (`overflow-wrap: anywhere`, `height: auto`, `max-width: 100%`), nothing for an unknown kind, and every value passes the validators from P1.
  - The files import nothing from React, stores, the network, or the DOM.
- **verify:** `npm run typecheck && npx vitest run tests/editGeometry.test.ts`

## P4. History integration
- **plan_id:** P2E2-EDITPAD  **node_id:** F8.4
- **scope:** `src/store/workSlice.ts` (`editKey`, `amendLastEntry`, `dropLastEntry`), `src/store/workActions.ts` (`applyUserEdit`), `src/store/workStorage.ts` (optional `editKey`), `tests/userEdit.test.ts`
- **goal:** Build design section 10 and the 2B changes in section 4.2.
- **acceptance:**
  - **The whole 2B and 2D suites pass unedited** (`workState`, `workActions`, `workStore`, `workStorage`, `crewRun`, `crewStorage`, `harnessController`).
  - **Append:** a first commit adds one entry with correct fingerprints, clears the redo list, updates the practice copy, writes the Log entry (status `applied`, path and title only), and updates `scan.result` through `rescanPaths` in the **same** update (a state comparison before and after).
  - **Amend:** a second commit with the same `editKey` while the entry is last and the redo list is empty replaces the diff (recomputed from the original text), keeps `id` and `beforeHash`, updates `afterHash`, `at`, and `title`, and does not add an entry; a different `editKey`, a non-empty redo list, or an intervening entry appends instead.
  - **Revert to original:** an amend whose new text equals the original removes the entry and logs "Style change reverted".
  - **Refusals (each leaves the work state unchanged and returns the reason):** stale `baseHash`; the 51st entry (50 applied plus undone) that cannot be amended; a diff over 2,000 characters; a diff that does not apply; a diff containing a secret fixture (`ghp_` plus 36 characters in a nearby line).
  - **Undo and redo** through the 2B commands restore the exact text after an append, after an amended burst (one undo removes the whole burst), and after a revert; the redo restores the amended diff.
  - A crew proposal waiting for the same file is not changed by `applyUserEdit`; at approval the 2B rule decides (a test with a non-overlapping proposal that still applies, and one that fails with the Log line "failed").
  - **Saving:** a record with `editKey` round-trips; a record written without `editKey` (the 2B format) still loads; an `editKey` over 200 characters is rejected by the schema; the secret guard from 2D still blocks saving when any history diff has a secret.
  - The loaded snapshot is never mutated (deep-freeze test). The slice file imports nothing from React or the network.
- **verify:** `npm run typecheck && npx vitest run tests/userEdit.test.ts tests/workState.test.ts tests/workActions.test.ts tests/workStorage.test.ts tests/crewRun.test.ts tests/crewStorage.test.ts`

## P5. Edit state and actions
- **plan_id:** P2E2-EDITPAD  **node_id:** F8.5
- **scope:** `src/store/editSlice.ts`, `src/store/editActions.ts`, `src/store/useStudioStore.ts` (add `edit` only), `src/store/previewSlice.ts` and `src/store/previewActions.ts` (`pvEntry` and the Edit-open scripts-off rule only), `tests/editState.test.ts`
- **goal:** Build design section 5 and the actions: `setTool`, `select` (replace, add, toggle), `clearSelection`, `setPreviewOnly`, `removePreviewOnly`, `removeAllPreviewOnly`, `addSuggestion`, `keepSuggestion`, `discardSuggestion`, `setNotice`, `reapplyAfterRebuild(keys)`, and the `pvEntry` page change.
- **acceptance:**
  - **Existing tests still pass with no edits** (`store`, `previewState`, `scanState`, and the earlier slices), and `initialState().edit` equals `idleEdit()`.
  - Every transition; the selection cap of 20 with the notice "Only the first 20 elements were selected."; the Preview Only cap of 50 (the 51st is refused with a message, nothing dropped); a recorded change removes matching Preview Only entries; stale updates change nothing (same object).
  - **Element keys** survive a simulated rebuild with the same table; a key missing from the new table is reported as "element not found" in the list and removed from the selection.
  - `pvEntry` clears the selection and layout results, keeps scripts off, and keeps History (the work state is identical before and after).
  - Opening the Edit panel turns scripts off through the existing preview action and sets the notice; with Source Inspection mode the availability message is the exact sentence in R1.2.
  - The state clears with `ai`, `work`, `understanding`, `scan`, and `preview` on snapshot replacement, `reset`, and foreground cancel; nothing from `edit` reaches the 2B saved record (a test compares records with and without a populated `edit` state).
  - The slice file imports nothing from React or the network.
- **verify:** `npm run typecheck && npx vitest run tests/editState.test.ts tests/store.test.ts tests/previewState.test.ts tests/workStorage.test.ts`

## P6. Browser adapter and controller
- **plan_id:** P2E2-EDITPAD  **node_id:** F8.6
- **scope:** `src/edit/previewEditDom.ts`, `src/hooks/useEditPad.ts`, `tests/editController.test.ts`
- **goal:** Build design section 12.
- **acceptance:**
  - **Adapter (recording fake document):** `readRects` reads only elements whose `data-pb` number is in the table and clamps numbers; `elementAtPoint` returns the first element with a valid number; `applyLiveStyle` and `removeLiveStyle` call only `style.setProperty` and `style.removeProperty` with validated names and values; any other call on the fake (setting `innerHTML`, `setAttribute`, `eval`, `appendChild`) fails the test; unknown numbers are ignored.
  - **Controller (fake adapter, fake timers, fake `raf`):** a pointer drag produces at most one live update per frame and exactly one commit on release; a lasso selects on release; a click with Shift toggles; number fields commit on blur and Enter only; a colour input commits on `change` only; invalid values show the inline message and change nothing; losing pointer capture or closing the panel mid-drag removes the live style and commits nothing.
  - **Commit pipeline:** several selected elements in one file are rewritten from the end of the file backwards so offsets stay correct, and one `applyUserEdit` call is made per file with the sorted element keys in `editKey`; an unmapped element becomes Preview Only with its reason; a refused commit becomes Preview Only with the reason; the mixed case (one mapped, one not) does both; the worked example in design section 8.1 is reproduced end to end through the controller with a fake store.
  - **Rebuild handling:** after a recorded change, undo, or redo, the scroll offsets are saved before and restored after the new `load`, the selection is restored by key, and Preview Only changes are reapplied by the builder.
  - **Layout re-check:** runs 300 ms after the last change (reset by each new change), reports "(was m)" in the Log through the preview action, and is cancelled on close, rebuild, and unmount. In the workbench it does not run and the block shows the sentence from R8.5.
  - **Suggestions:** Try a fix adds and applies the suggestion live, Keep commits it, Discard removes it, and the re-check result text is "Fixed in the preview." or "Still there."
  - Closing the Edit panel, rebuilding, and unmounting release every listener, timer, and frame request (counted on the fakes).
  - Resizing the window below 640 px disables the tools and cancels a drag.
  - The files import no `fetch`, AI, or `mockAssistant` module (source-text check) and contain none of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, or `new Function`.
- **verify:** `npm run typecheck && npx vitest run tests/editController.test.ts`

## P7. Panel components and overlay
- **plan_id:** P2E2-EDITPAD  **node_id:** F8.7
- **scope:** `src/components/EditPanel.tsx`, `EditTools.tsx`, `PropertyForm.tsx`, `SelectionInfo.tsx`, `PreviewOnlyList.tsx`, `LayoutFixList.tsx`, `EditOverlay.tsx`, `PageSelect.tsx` (all in `src/components/`), `src/styles.css` (append the 2E-2 block only), `tests/editUi.test.tsx`
- **goal:** Build design section 13 as components that take props only.
- **acceptance:**
  - With `react-dom/server`: the panel in each availability state (preview not ready, Source Inspection, scripts were on, narrow window, nothing selected, one mapped element, one Preview Only element, several elements, workbench); the three tools with `aria-pressed`; the Pick from list control; each property group with labelled inputs, units, and ranges; the "same on all sides" checkbox; inline error text; the Reset link per group; the Preview Only list with **Remove** and **Remove all**; suggestions with **Keep** and **Discard**; the layout block with **Check layout**, **Check at all widths**, and **Try a fix**; **Undo** and **Redo** buttons with the reply text; the Page selector; the line "Changes here edit PatchBay's practice copy only. Your repository is never changed."
  - The overlay renders a dashed outline for each rectangle, three handles for a single selection and none for several, and a lasso rectangle; all positions come from props.
  - Text from the project (tags, ids, classes, paths) appears escaped (a markup-looking class name is escaped).
  - **No Apply, Approve, Reject, Pause, Resume, or Step button** anywhere in the panel. The only buttons that act on History are Undo and Redo.
  - Static checks on the new files and the CSS block: no `dangerouslySetInnerHTML`, no `innerHTML`, no color value other than `#000` and `#fff`, no `transition`, no `animation`, every new file tagged `@node: F8.7`.
  - Browser pointer behavior is **not** claimed here. It is verified in P9.
- **verify:** `npm run typecheck && npx vitest run tests/editUi.test.tsx`

## P8. Wiring, the Page selector, and the Sandbox overlay slot
- **plan_id:** P2E2-EDITPAD  **node_id:** F8.8
- **scope:** `src/components/StudioLayout.tsx`, `src/components/SandboxPanel.tsx` (overlay slot, scroll and selection restore hooks), `src/components/PreviewToolbar.tsx` (Page selector), `src/App.tsx`, `src/styles.css` (only to fix a class from P7), `tests/editUi.test.tsx` (append wiring tests)
- **goal:** Render the new Edit panel for the Edit toolbar button, put the overlay above the iframe in Edit mode, add the Page selector to the Sandbox toolbar, and call `useEditPad()` in `App`.
- **acceptance:**
  - **The existing suite passes with no edit** apart from the tests named in P2, including the 2A shell, 2B harness, 2C, 2D, and 2E-1 tests.
  - With a seeded store and `react-dom/server`: with the Edit panel open on the static sample, the Sandbox shows the overlay layer and the Edit panel shows the tools; without the Edit panel there is no overlay; the Page selector lists the sample's two pages (`index.html` first) and is absent for a single-page project and for the workbench; Screens 4 and 5 have no Edit panel and no overlay.
  - Choosing a page calls `pvEntry` and clears the selection (store-level test); the History is unchanged by it.
  - Opening Edit with scripts on turns scripts off (store-level test) and the Sandbox shows the notice.
  - `StudioLayout` and `SandboxPanel` import no engine module they did not need before, apart from types and the new overlay.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

## P9. Final gate, drawing browser run, and independent review
- **plan_id:** P2E2-EDITPAD  **node_id:** F8
- **scope:** no source changes except fixes you approve. Reports only. Throwaway scripts and fixture repositories live outside the repo and are deleted afterwards. `README.md` (a short section on the Edit pad) and `traceability/PLAN.md` are updated to the as-built state.
- **goal:** Prove the sub-phase and its Phase 2E-2 gate.
  1. Full gate: `npm run typecheck && npx vitest run && npm run build`, `npm audit`, and bundle sizes against the 2E-1 baseline.
  2. Static checks: no new dependency; no network, AI, or `mockAssistant` import in any 2E-2 file; none of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function`, or `dangerouslySetInnerHTML`; the 2E-1 isolation files unchanged (`git diff` empty for `previewFlags.ts`, `previewBridge.ts`, `htmlTokens.ts`, `htmlAllow.ts`); every new file tagged; the diff of existing tests shows only the named ones.
  3. Mutation checks (break, see tests fail, restore): each property range, the colour pattern, the no-forbidden-characters guarantee, the style merge order, the mapping rules (each reason), the start-tag-only rewrite, the 3-line context diff, the 2,000-character and secret refusals, the 50-entry cap, the amend rule (same key, last entry, empty redo list), the revert-to-original removal, the same-update rescan, the lasso outermost rule, the 20-element cap, the handle limits, the one-update-per-frame throttle, the commit timing, the scripts-off-on-Edit rule, and listener release.
  4. **Drawing browser run (headless Chromium, built app, real pointer events)** of every item in requirements section 6, item 11, with screenshots of the overlay, the lasso, and the handles (kept outside the repo), including the exact History diff for the worked example, undo and redo through the buttons and the typed commands, the merged burst, Preview Only with each reason that can be reproduced, the Page selector, the layout fixture with Try a fix and Keep, the narrow window, refresh with History restored, and zero console errors. Real pointer behavior that cannot be checked is marked **Unverified**.
  5. A check that no edit reaches anything outside the practice copy: the loaded snapshot, the saved storage keys other than the 2B record, and the network log show no change and no request.
  6. Independent behavioral review with `semantic_reviewer`, focused on writes outside the practice copy, anything that could put unvalidated text into the preview or the file, the honesty of "mapped" and "Preview Only", lost edits, and the 2E-2 scope rules. Fix findings only with your approval.
  7. A map of every acceptance item in `requirements.md` section 6 to its evidence.
- **acceptance:** each of the twelve acceptance items is marked **Verified** (with command output) or **Unverified** (with the reason). I then say whether 2E-2 passes its gate: no edit changes anything except the in-memory practice copy, unmapped changes never reach the code, and every recorded change can be undone. Advancing to 2F stays your decision.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

---

## Requirement coverage

| Requirement | Tasks |
|---|---|
| R1 The Edit panel and availability | P5, P7, P8 |
| R2 Selection | P3, P6, P7 |
| R3 The style tools | P1, P6, P7 |
| R4 Changes, mapping, and the three layers | P1, P2, P4, P6 |
| R5 Preview Only changes | P2, P5, P7 |
| R6 The Page selector | P5, P8 |
| R7 The Edit panel contents | P7, P8 |
| R8 Layout re-check and suggestions | P3, P6, P7 |
| R9 State, wiring, and the earlier specs | P2, P4, P5, P8 |
| R10 Safety, privacy, and resources | P1 to P8, P9 |

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Style model | P1 |
| 2. Inline style | P1 |
| 3. Mapping and rewrite | P2 |
| 4. Diff and History | P2, P4 |
| 5. Geometry | P3 |
| 6. Edit state | P5 |
| 7. Controller | P6 |
| 8. Components | P7, P8 |
| 9. Static checks | P1 to P8, P9 |
| 10. Regression | P2, P4, P8, P9 |
| 11. Browser run | P9 |
| 12. Phase 2E-2 gate | P9 |

## Questions

1. **Requirements questions 1 to 9** at the end of `requirements.md` (also written out in the chat message).
2. **Branch pattern** for code: same as before. Confirm or change.
3. **Approval of the spec**, and then, once 2A to 2E-1 are built and you advance the active sub-phase to 2E-2, your explicit "Go" naming **P1**.
