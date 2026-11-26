# Tasks: 03 Studio Shell (Phase 2, Sub-phase 2A)

Implements `design.md` for `requirements.md`, both in this folder. All tasks use `plan_id: P2A-SHELL` and the F3 nodes in `traceability/PLAN.md`. Active product phase: **Phase 2, Sub-phase 2A** (black-and-white wireframe, no animation, `AI_MODE=mock` only).

Task ids are **S1 to S6**, so they cannot be confused with T1 to T16 (spec 01) or M1 to M12 (spec 02).

## How each task runs

1. **Wait for your explicit "Go" naming the task.** A "Go" covers that one task only. Nothing is written before the first "Go".
2. Edit only the files in the task's `scope`. Tag every new or changed source file with `// @node: F3.x` for the task's node.
3. Run the task's verify command after the last edit and report the real exit code and counts.
4. Check the diff against the scope myself, then report what changed, the evidence, and anything **Unverified**. Return to `[MODE: DISCUSSION]` and wait.

Rules for every task:
- Two consecutive verify failures on the same error: stop editing, hand a read-only diagnosis to `bug-auditor`, and wait for your approval before a third attempt.
- No new dependency. No network call in any 2A code or test. The layout and navigation files must not import anything from `src/engine/`, `api/`, or the AI store files.
- Do not touch the files listed in design section 4.3.
- New CSS uses only `#000` and `#fff`, with no `transition` and no `animation`.
- `scripts/traceability/*` still do not exist. Approval is recorded in this chat.

## Branch and commits (decision needed, see "Questions")

The spec files are on `spec/03-studio-shell`. Proposed: after you approve the spec, commit and push it and open a pull request. Then create `feat/studio-shell` from it, make **one commit per task**, and open a second pull request after S6.

## Task index

| # | Node | Goal | Depends on |
|---|---|---|---|
| S1 | F3.1 | Layout state, saved layout, layout store and hook | none |
| S2 | F3.2 | Screen navigation (pure), screen store and hooks | none |
| S3 | F3.3 | Toolbar, panel frame, placeholder panel, shell CSS | S1 |
| S4 | F3.4 | Screens 4 and 5 and the sandbox placeholder | S2, S3 |
| S5 | F3.5 | Rewire `StudioLayout`, `ProjectInfo`, `LogPanel`, `App` | S1 to S4 |
| S6 | F3 | Final gate, browser run, mutation checks, independent review | S1 to S5 |

---

## S1. Layout state, saved layout, store and hook
- **plan_id:** P2A-SHELL  **node_id:** F3.1
- **scope:** `src/store/layoutSlice.ts`, `src/store/layoutStorage.ts`, `src/hooks/useLayout.ts`, `tests/layoutState.test.ts`, `tests/layoutStorage.test.ts`
- **goal:** Build design sections 6 and 7 exactly. `useLayout.ts` creates the module-level `layoutStore` from `loadLayout(browserStorage())`, exports `useLayout(selector)` (same `useSyncExternalStore` pattern as `useStudioStore`) and `useLayoutPersistence()` (an effect that calls `attachLayoutPersistence` and returns its unsubscribe). The store creator is the existing `createStore` imported from `useStudioStore.ts` (no change to that file).
- **acceptance:**
  - `togglePanel`: opens when closed, switches panels without closing first, closes when pressed on the open panel (expanded or collapsed), keeps `width`, and sets `collapsed` false when opening.
  - `setCollapsed`, `toggleWidth`, and `closePanel` follow the table in design section 6, including every no-op returning the **same object** (`Object.is`).
  - A deep-frozen input state is never mutated.
  - A seeded random sequence of 2,000 actions never produces `collapsed: true` with `openPanel: null`, and every state passes the record schema.
  - 100 `togglePanel('log')` presses end open, 101 end closed, from the default.
  - `loadLayout` returns the saved record for a valid value, and the default for each of: no storage, `getItem` returns null, `getItem` throws, bad JSON, wrong version, unknown field, unknown panel id, wrong types, `collapsed: true` with `openPanel: null`, and a value longer than 1,024 characters.
  - `saveLayout` writes text with exactly the keys `version`, `openPanel`, `collapsed`, `width`, under 200 bytes, and never throws when `setItem` throws. Saving a state object that carries an extra field (cast in the test) still writes only the four keys.
  - `attachLayoutPersistence` saves once per changed reference, never for a no-op, stops after the returned unsubscribe, and does nothing with `storage` undefined.
  - `layoutSlice.ts` and `layoutStorage.ts` import nothing from React, `src/engine/`, `api/`, or the AI store files (checked by reading the source text in a test).
- **verify:** `npm run typecheck && npx vitest run tests/layoutState.test.ts tests/layoutStorage.test.ts`

## S2. Screen navigation, screen store and hooks
- **plan_id:** P2A-SHELL  **node_id:** F3.2
- **scope:** `src/store/shellView.ts`, `src/hooks/useShell.ts`, `tests/shellView.test.ts`
- **goal:** Build design section 8: `ShellView`, `AREAS`, the four actions, `toolbarVisible`, `viewWhenStudio`, and `INITIAL_VIEW = { screen: 'studio' }`. In `useShell.ts` create the module-level `shellStore` (using the existing `createStore`), `useShellView`, `shellActions`, and `useShellReset()` (an effect that sets the view back to `INITIAL_VIEW` whenever the experience is not `studio`, reading the experience from the existing store with `useStudioStore`).
- **acceptance:**
  - Every allowed move in the table gives the expected view. Every other move (from each of the three screens) returns the same object.
  - `openDomain` carries each of the four areas, and `AREAS` has exactly four entries with the labels Frontend, Backend, Security, APIs & Data.
  - `toolbarVisible` is true only for `studio`.
  - A long seeded random sequence of actions never leaves a screen that is not one of the three, and never shows a domain screen without an area.
  - Inputs are not mutated (frozen-state test). `shellView.ts` imports nothing from React, the engine, or the stores.
  - `viewWhenStudio` keeps the view when `isStudio` is true, and returns `INITIAL_VIEW` when false.
  - Every reachable `ShellView` is unchanged by `JSON.parse(JSON.stringify(view))`.
  - Store behavior (with `createStore`, no React): `shellActions` update the store; the same moves that are ignored in the pure table are ignored in the store; setting the experience to `loading`, `start`, or a failed first load and applying `viewWhenStudio` returns Screen 3; a background reload (experience stays `studio`) keeps the view.
  - `useShell.ts` does not touch browser storage.
- **verify:** `npm run typecheck && npx vitest run tests/shellView.test.ts`

## S3. Toolbar, panel frame, placeholder panel, shell CSS
- **plan_id:** P2A-SHELL  **node_id:** F3.3
- **scope:** `src/components/StudioToolbar.tsx`, `src/components/PanelFrame.tsx`, `src/components/PlaceholderPanel.tsx`, `src/styles.css` (append the shell block only), `tests/studioShell.test.tsx`
- **goal:** Build design sections 9.1, 9.2, and 9.5 as components that take props only. `PlaceholderPanel` takes `title` and `phaseLabel` and renders a heading and one line, "Arrives in sub-phase <label>."
- **acceptance:**
  - With `react-dom/server`: the toolbar renders six `button` elements in the order Edit, AI Chat, Log, History, Journal, Skeleton Crew, inside a `nav` labelled "Studio tools". Only the open panel's button has `aria-pressed="true"`, and the Skeleton Crew button has no `aria-pressed`.
  - `PanelFrame`: expanded markup has the title and the buttons "Collapse", "Wide" (when narrow) or "Narrow" (when wide), and "Close". Collapsed markup has one button named "Expand <title>" and a `hidden` body that still contains the children. With `open` false the `aside` has `hidden` and still contains the children. Width class is `panel-narrow` or `panel-wide`.
  - Text inside a title or child that looks like markup (`<img src=x onerror=alert(1)>`) appears escaped.
  - Static checks on the new files and on the CSS block: no `dangerouslySetInnerHTML`, no color value other than `#000` and `#fff`, no `transition`, no `animation`, and no word Apply, Approve, Reject, Pause, Resume, or Stop in any control label.
  - Every new file carries an `@node: F3.3` tag, and the CSS block carries a comment tag.
  - Browser behavior (real clicks, widths, 375 px) is **not** claimed here. It is verified in S6.
- **verify:** `npm run typecheck && npx vitest run tests/studioShell.test.tsx`

## S4. Screens 4 and 5 and the sandbox placeholder
- **plan_id:** P2A-SHELL  **node_id:** F3.4
- **scope:** `src/components/SandboxPlaceholder.tsx`, `src/components/SkeletonCrewScreen.tsx`, `src/components/DomainScreen.tsx`, `src/styles.css` (append to the shell block only), `tests/screens.test.tsx`
- **goal:** Build design section 9.3 with the texts in requirements R5 and R1.2.
- **acceptance:**
  - `SandboxPlaceholder` shows "Sandbox (coming in sub-phase 2E)" inside a section labelled "Sandbox".
  - `SkeletonCrewScreen` shows the heading "Skeleton Crew", the 2D sentence, four area buttons with the labels from `AREAS`, and "Back to Studio".
  - `DomainScreen` shows the chosen area name as its heading for each of the four areas, the 2D sentence, "Back to Skeleton Crew", and "Back to Studio".
  - Neither screen renders a `nav` labelled "Studio tools" or any toolbar button.
  - Static checks as in S3 for the new files and the added CSS.
- **verify:** `npm run typecheck && npx vitest run tests/screens.test.tsx tests/studioShell.test.tsx`

## S5. Rewire the Studio
- **plan_id:** P2A-SHELL  **node_id:** F3.5
- **scope:** `src/components/ProjectInfo.tsx`, `src/components/LogPanel.tsx`, `src/components/StudioLayout.tsx`, `src/App.tsx`, `src/styles.css` (only if a class from S3 or S4 needs a fix), `tests/studioLayout.test.tsx`
- **goal:** Build design sections 5, 9.4, and 10.
  1. Move the repository header, reload status and error blocks, `CoveragePanel`, and the inventory (with "Show more") from `StudioLayout` into `ProjectInfo`, **keeping the old markup and text word for word**. Props: the same callbacks `StudioLayout` receives.
  2. Move the session log list into `LogPanel` with the 2B note.
  3. `StudioLayout` keeps its current props and `export` name, reads the screen with `useShellView` and the layout with `useLayout`, and renders as in 9.4. It holds no screen state of its own. `App.tsx` calls `useLayoutPersistence()` and `useShellReset()` once and passes the same props.
- **acceptance:**
  - The existing suite passes unchanged, including the AI panel and store tests. No existing test is edited.
  - With a seeded store and `react-dom/server`: the Studio markup contains the toolbar (6 buttons), the sandbox placeholder, the Project info text (title, ref, Back to Start, coverage heading, inventory heading), and the AI panel text inside a wrapper that is **not** hidden when `openPanel` is `ai`, and **is** hidden when another panel or none is open. The Log panel shows the logged entries. No Apply, Approve, Reject, Pause, Resume, or Stop control exists anywhere in the Studio markup.
  - With `openPanel` set to each of the five ids, exactly that panel's title shows in the frame.
  - With the screen store set to Skeleton Crew, rendering `StudioLayout` twice (a remount) shows Screen 4 both times. With it set to a domain area, Screen 5 shows that area. No toolbar appears on either.
  - The old reload-in-progress and reload-failed blocks still render when the store holds a background run or error.
  - `StudioLayout` and `App` import no engine module that they did not import before.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

## S6. Final gate and independent review
- **plan_id:** P2A-SHELL  **node_id:** F3
- **scope:** no source changes except fixes you approve. Reports only. Throwaway scripts live outside the repo and are deleted afterwards. `README.md` (one line about the Studio shell, if the README describes screens) and `traceability/PLAN.md` are updated to the as-built state.
- **goal:** Prove the sub-phase and its Phase 2A gate.
  1. Full gate: `npm run typecheck && npx vitest run && npm run build`, `npm audit`, and bundle sizes against the spec 02 baseline.
  2. Static checks: no new dependency in `package.json`, no color other than `#000` and `#fff` in new CSS, no `transition` or `animation`, no network import in the layout, navigation, or shell files, every new file tagged.
  3. Mutation checks (break, see tests fail, restore): the "same object on no-op" rule, the `collapsed` invariant, the record version check, the unknown-field rejection, the 1,024-character guard, the swallowing of `setItem` errors, the not-allowed screen moves, and the AI wrapper's `hidden` rule.
  4. Browser run (headless Chromium on the built app): load a sample, then check every item in requirements section 6, item 7: all five panel buttons, collapse, width, Close, reload then reload the sample and see the same layout, 50 rapid presses ending in one consistent state, Skeleton Crew, an area page and both Back buttons with the toolbar hidden, the AI Chat panel sending a request and showing its result, blocked storage, zero console errors, black and white only, no animation, and no horizontal overflow at 375 px.
  5. Independent behavioral review with `semantic_reviewer`, focused on lost state, saved-data hygiene, and the Phase 2A scope rules. Fix findings only with your approval.
  6. A map of every acceptance item in `requirements.md` section 6 to its evidence.
- **acceptance:** each of the eight acceptance items is marked **Verified** (with command output) or **Unverified** (with the reason). I then say whether 2A passes its gate: layout survives refresh and rapid clicks cause no desync. Advancing to 2B stays your decision, and I never edit `Current Active Phase` for it.
- **verify:** `npm run typecheck && npx vitest run && npm run build`

---

## Requirement coverage

| Requirement | Tasks |
|---|---|
| R1 Studio frame | S4 (placeholder), S5 |
| R2 Toolbar | S3, S5 |
| R3 Panels | S3, S5 |
| R4 Layout state | S1 |
| R5 Screens 4 and 5 | S2, S4, S5 |
| R6 Saved layout | S1, S5 (wiring), S6 |
| R7 Appearance and responsiveness | S3, S4, S6 |
| R8 Safety, privacy, resources | S1 to S6 |

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Layout state | S1 |
| 2. Saved layout | S1 |
| 3. Navigation | S2 |
| 4. Components | S3, S4, S5 |
| 5. Static checks | S3, S4, S6 |
| 6. Regression | S5, S6 |
| 7. Browser run | S6 |
| 8. Ingestion still works | S5, S6 |

## Questions

1. **Branch and commits.** Commit and push this spec on `spec/03-studio-shell` and open a pull request now, then use a `feat/studio-shell` branch with one commit per task? Or keep everything on one branch?
2. **Requirement questions 1 to 5** at the end of `requirements.md` (screen not saved, sandbox on Screens 4 and 5, area buttons, default layout and widths, shared collapse setting).
3. **Approval of the spec** and then your explicit "Go" naming **S1**.

---

## Build report (sub-phase 2A, as built)

Copied from `PHASE_2_REPORT.md` at the repository root, which also has the summary table and the Phase 2 exit evidence. Numbers are real command output; **Unverified** items say why.


**What was built.** After a repository loads, the Studio is a workspace with a vertical toolbar on the right: Edit, AI Chat, Log, History, Journal, and Skeleton Crew.
- The first five buttons open one panel at a time. A panel can collapse, switch between narrow and wide, and close.
- Skeleton Crew opens Screen 4. Its area buttons open Screen 5.
- The panel layout is saved under `patchbay.studio-layout.v1`: four fields, no repository data.

**Files.** Created:
- `src/store/{layoutSlice,layoutStorage,shellView}.ts`
- `src/hooks/{useLayout,useShell}.ts`
- `src/components/{StudioToolbar,PanelFrame,PlaceholderPanel,SandboxPlaceholder,SkeletonCrewScreen,DomainScreen,ProjectInfo,LogPanel}.tsx`
- 6 test files

Changed: `StudioLayout.tsx` (rewritten as the shell), `App.tsx`, `styles.css`, `README.md`, `PLAN.md`.

**Results.**
- 27 files, 868 tests. Build 384.14 kB (116.98 kB gzip).
- 10 of 10 mutations killed.
- Browser run 28 of 28, zero console errors. It covered panels, wide, collapse, layout after a refresh, 50 and 51 rapid presses, Screens 4 and 5, AI Chat, 375 px, and blocked storage.
- The review found a keyboard-focus loss on collapse and close. It was fixed.

**Known limits.** The AI form text and Project info local state reset when you visit Screens 4 and 5.

**Unverified.** None.
