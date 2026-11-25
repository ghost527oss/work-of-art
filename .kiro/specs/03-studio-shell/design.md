# Design: 03 Studio Shell (Phase 2, Sub-phase 2A)

Implements `requirements.md` in this folder. Active product phase: **Phase 2, Sub-phase 2A**. Wireframe only, no animation, `AI_MODE=mock` only, no new dependency.

## 1. Decisions already made

| Source | Decision |
|---|---|
| Interview answers | Toolbar is vertical on the far right edge, Screen 3 only. Top to bottom: Edit, AI Chat, Log, History, Journal, Skeleton Crew. Layout is saved in browser storage and never holds secrets. |
| Alignment Brief (approved) | One panel at a time. Panels collapse and change width. Screens 4 and 5 are empty wireframe pages. A refresh returns to Start, and the saved layout is used when a repository loads again. |
| Interview answer (new, approved direction) | By the end of Phase 2 a refresh restores the whole session (repository, sandbox, edits, Log, History, and the screen), never saving secrets. 2A must not block this (requirements R9). |
| Requirements section 7 (pending your answers) | The screen is kept in a store and saved later with the repository, not in 2A. Screens 4 and 5 keep the sandbox placeholder on the left. Area buttons on Screen 4 reach Screen 5. Defaults: AI Chat open, narrow, 22 rem and 40 rem. One shared collapsed and width setting. |

## 2. Phase 2A compliance

| Rule (build-phases.md) | How this design complies |
|---|---|
| Design only the Current Active Sub-phase (2A) | Only the frame, toolbar, panels, saved layout, and two empty pages. No action list, no chat commands, no scanner, no sandbox. |
| Interactive layout: collapsible and sliding panels, saved layout | Pure layout actions and a small saved record. "Sliding" means two fixed widths with no motion. |
| Browser storage never holds secrets or whole repositories | The saved record has four fields and is validated on read. |
| Black-and-white wireframe, no animation | New CSS uses only `#000`, `#fff`, borders, and no `transition` or `animation`. |
| Forbidden: real LLM calls, new dependencies without approval | Nothing is added. The AI panel is moved, not changed. |
| Screens 4 and 5 are empty pages in 2A | Heading, one sentence naming 2D, and navigation buttons only. |

## 3. Lightweight-architecture audit

| Gate | Status | Finding |
|---|---|---|
| 1. Dependency vetting | PASS | No new package. Zod validates the saved record. `localStorage` is a browser built-in. |
| 2. Memory and bundle | PASS | One saved record under 200 bytes, six small components, one small CSS block. Nothing grows with use. Bundle size is reported in the final task against the spec 02 baseline. |
| 3. Free-tier resilience | PASS | No network and no external service. Blocked or full storage degrades to in-memory layout. |
| 4. Teardown | PASS | One store subscription for saving, released on unmount. No timers, listeners, or controllers are created. |

## 4. Files

All paths are relative to `work-of-art/`.

### 4.1 New
| File | Responsibility |
|---|---|
| `src/store/layoutSlice.ts` | `PanelId`, `LayoutState`, `DEFAULT_LAYOUT`, `PANEL_ORDER`, and the pure actions `togglePanel`, `setCollapsed`, `toggleWidth`, `closePanel`. No imports from React, storage, or other stores. |
| `src/store/layoutStorage.ts` | `LayoutRecordSchema`, `loadLayout(storage)`, `saveLayout(storage, state)`, `browserStorage()`, `attachLayoutPersistence(store, storage)`. Never throws. |
| `src/store/shellView.ts` | `ShellView` (plain data), `INITIAL_VIEW`, `AREAS` (id and label), the pure actions `openSkeleton`, `openDomain`, `backToSkeleton`, `backToStudio`, `viewWhenStudio(view, isStudio)`, and `toolbarVisible(view)`. |
| `src/hooks/useShell.ts` | The module-level `shellStore` holding the current `ShellView`, the `useShellView` selector hook, `shellActions` (the four actions applied to the store), and `useShellReset()`: an effect that sets the view back to the Studio screen whenever the experience is not `studio`. Nothing is saved. |
| `src/hooks/useLayout.ts` | The module-level `layoutStore` (created from `loadLayout(browserStorage())`), the `useLayout` selector hook, and `useLayoutPersistence()` that attaches and releases the saving subscription. |
| `src/components/StudioToolbar.tsx` | The 6-button vertical toolbar. Props only, no store access. |
| `src/components/PanelFrame.tsx` | Title bar with Collapse / Expand, Narrow / Wide, Close; collapsed strip. Props only. |
| `src/components/PlaceholderPanel.tsx` | Heading and one line naming the sub-phase (Edit, History, Journal). |
| `src/components/ProjectInfo.tsx` | The repository header, reload status and error blocks, coverage panel, and inventory moved out of `StudioLayout`. Same markup and behavior. |
| `src/components/LogPanel.tsx` | The existing session log list plus the 2B note. |
| `src/components/SandboxPlaceholder.tsx` | The labelled placeholder box used on Screens 3, 4, and 5. |
| `src/components/SkeletonCrewScreen.tsx` | Screen 4. |
| `src/components/DomainScreen.tsx` | Screen 5. |
| Tests | `layoutState`, `layoutStorage`, `shellView` (`*.test.ts`); `studioShell`, `studioLayout`, `screens` (`*.test.tsx`). |

### 4.2 Modified
| File | Change |
|---|---|
| `src/components/StudioLayout.tsx` | Becomes the shell: reads the screen from `useShellView`, reads the layout store, renders the toolbar, panel frame, left area, and Screens 4 and 5. Owns no state of its own except the inventory "Show more" count it already had. Keeps the same props. |
| `src/App.tsx` | Calls `useLayoutPersistence()` and `useShellReset()` once. No other change. |
| `src/styles.css` | A new block for `.shell`, `.shell-left`, `.shell-panel`, `.toolbar`, `.panel-*`, `.sandbox-placeholder`. Black and white only. |
| `traceability/PLAN.md` | Adds plan `P2A-SHELL` with nodes F3.1 to F3.5. |
| `.kiro/steering/build-phases.md` | Already updated to "Phase 2 (Sub-phase 2A)" with the Phase 2 text (your approved change). |

### 4.3 Not touched
`api/*`, `src/engine/*`, `src/types/contracts.ts`, `src/config/*`, `src/store/{aiSlice,aiActions,useStudioStore}.ts`, `src/hooks/{useAssistant,useIngestion}.ts`, `AIAssistantPanel.tsx`, `AIResponseView.tsx`, `CoveragePanel.tsx`, `StartScreen.tsx`, `LoadingScene.tsx`, `vite.config.ts`, and all spec 01 and 02 tests. The layout is a separate small store, so none of the ingestion or AI actions can reset it by accident.

## 5. Screen and state map

```
App
 |- useLayoutPersistence()                  saves layout on change, released on unmount
 |- useShellReset()                         view -> Screen 3 whenever experience is not studio
 |- experience = start | loading | studio   (existing store)
      studio -> StudioLayout
                 view   = useShellView()    screen 3 | 4 | 5, plain data, in shellStore, NOT saved in 2A
                 layout = useLayout()       { openPanel, collapsed, width }, saved

Screen 3                                   Screens 4 and 5
+---------------------------+-+---------+   +---------------------------+-----------+
| left area                 |P| toolbar |   | left area                 | right     |
|  Sandbox placeholder      |A| Edit    |   |  Sandbox placeholder      | screen    |
|  Project info             |N| AI Chat |   |                           | content   |
|                           |E| Log     |   |                           |           |
|                           |L| History |   |  (no toolbar)             |           |
|                           | | Journal |   +---------------------------+-----------+
|                           | | Skeleton|
+---------------------------+-+---------+
```

State ownership:
- **Layout** lives in `layoutStore` (a `createStore` from the existing store module). It is saved.
- **Screen** lives in `shellStore` (also a `createStore`). It is plain data, so a later sub-phase can save it with one `JSON.stringify`. Components only read it and call `shellActions`. It is not saved in 2A. A remount of `StudioLayout` keeps it. It returns to Screen 3 only through `useShellReset` when the experience leaves `studio`.
- The ingestion and AI state stay in the existing store and are not changed.

## 6. Layout state (`layoutSlice.ts`)

```ts
type PanelId = 'edit' | 'ai' | 'log' | 'history' | 'journal'
interface LayoutState { openPanel: PanelId | null; collapsed: boolean; width: 'narrow' | 'wide' }
DEFAULT_LAYOUT = { openPanel: 'ai', collapsed: false, width: 'narrow' }
```

| Action | Result |
|---|---|
| `togglePanel(s, id)` | If `s.openPanel === id`, close: `{ openPanel: null, collapsed: false, width }`. Otherwise `{ openPanel: id, collapsed: false, width }`. |
| `setCollapsed(s, value)` | No-op (same object) when no panel is open or the value is unchanged. Otherwise `{ ...s, collapsed: value }`. |
| `toggleWidth(s)` | No-op while no panel is open or while collapsed. Otherwise flips `width`. |
| `closePanel(s)` | No-op when already closed. Otherwise `{ openPanel: null, collapsed: false, width }`. |

Invariant: `collapsed` implies `openPanel !== null`. Every action preserves it, and `loadLayout` repairs or rejects any record that breaks it. Each action takes the state and returns a state, with no hidden input. `store.update(fn)` runs synchronously, so ten quick presses are ten ordered updates.

## 7. Saved layout (`layoutStorage.ts`)

- Key: `patchbay.studio-layout.v1`.
- Stored text: `{"version":1,"openPanel":"ai","collapsed":false,"width":"narrow"}` (about 70 bytes).
- `LayoutRecordSchema` is a strict zod object: `version` is the literal `1`, `openPanel` is one of the five ids or `null`, `collapsed` is a boolean, `width` is one of two strings. Unknown fields fail.
- `loadLayout(storage)`:
  1. Return the default when `storage` is undefined.
  2. `getItem(key)` inside `try`. A throw gives the default.
  3. A missing value, a value over 1,024 characters, bad JSON, a failed schema, or `collapsed && openPanel === null` gives the default.
  4. Otherwise return the record without `version`.
- `saveLayout(storage, state)`: `setItem` inside `try`, swallowing any failure. It builds the text from the four known fields only, so nothing else can be written by mistake.
- `browserStorage()`: returns `window.localStorage` inside `try`, or `undefined` when `window` or storage access fails.
- `attachLayoutPersistence(store, storage)`: subscribes, remembers the last saved state object, and saves only when the state reference changed. Returns the unsubscribe function. With `storage` undefined it subscribes to nothing and returns a no-op.
- Storage is injected as `{ getItem, setItem }`, so tests use a fake and never need a browser.

## 8. Screen navigation (`shellView.ts`)

```ts
type AreaId = 'frontend' | 'backend' | 'security' | 'apis_data'
type ShellView = { screen: 'studio' } | { screen: 'skeleton' } | { screen: 'domain'; area: AreaId }
```

| Action | Allowed from | Result |
|---|---|---|
| `openSkeleton` | studio | `{ screen: 'skeleton' }` |
| `openDomain(area)` | skeleton, domain | `{ screen: 'domain', area }` |
| `backToSkeleton` | domain | `{ screen: 'skeleton' }` |
| `backToStudio` | skeleton, domain | `{ screen: 'studio' }` |

Any other move returns the same object (ignored). `toolbarVisible(view)` is true only for `studio`. `viewWhenStudio(view, isStudio)` returns `view` when `isStudio` is true, and `INITIAL_VIEW` otherwise (same object when already initial). `useShellReset` applies it whenever the experience changes. `ShellView` contains only strings, so it survives `JSON.stringify` and `JSON.parse` unchanged. `AREAS` holds the four ids and labels (Frontend, Backend, Security, APIs & Data) in one place.

## 9. Components

### 9.1 `StudioToolbar`
Props: `openPanel: PanelId | null`, `onTogglePanel(id)`, `onSkeleton()`. Renders `<nav aria-label="Studio tools">` with six `<button type="button">`. The five panel buttons carry `aria-pressed={openPanel === id}`. The Skeleton Crew button has no `aria-pressed`. Labels come from one constant table (`PANEL_ORDER` plus labels), so tests and UI cannot disagree.

### 9.2 `PanelFrame`
Props: `title`, `collapsed`, `width`, `onToggleCollapsed()`, `onToggleWidth()`, `onClose()`, `children`.
- Expanded: `<aside aria-label={title}>` with a header (title and three text buttons: "Collapse", "Wide" or "Narrow", "Close") and a scrolling body.
- Collapsed: the header shows only one button whose text is "Expand" and whose accessible name is `Expand <title>`. The body stays in the page but has the `hidden` attribute, so nothing inside it is unmounted.
- Closed (`open` is false): the whole `<aside>` has the `hidden` attribute and is still rendered. This keeps the AI panel mounted (see 9.4). An extra prop `open: boolean` carries this.
- The root class includes `panel-narrow` or `panel-wide`. Sizes are CSS, not JavaScript.

### 9.3 Left area and Screens 4 and 5
- `SandboxPlaceholder`: `<section aria-label="Sandbox">` with a dashed border box and the text "Sandbox (coming in sub-phase 2E)".
- `SkeletonCrewScreen` props: `onOpenArea(area)`, `onBack()`. `DomainScreen` props: `area`, `onBackToSkeleton()`, `onBackToStudio()`. Both are plain text and buttons.

### 9.4 `StudioLayout` rendering
1. No snapshot: return `null`.
2. `view.screen === 'skeleton'` or `'domain'`: render the shell with the left placeholder and the matching right screen. No toolbar.
3. `view.screen === 'studio'`:
   - Left: `SandboxPlaceholder` then `ProjectInfo`. The AI wrapper (below) is keyed by `snapshot.id`, as the old Studio keyed the AI panel, so a newly loaded repository starts with an empty AI form.
   - Right panel: one `PanelFrame` that is **always rendered** (`open={openPanel !== null}`). Its title and body come from `openPanel`. Inside the body, the AI panel is always rendered in a wrapper that has the `hidden` attribute unless `openPanel === 'ai'`. The other panels (Log, Edit, History, Journal) render only when chosen. Because the AI panel never leaves the page, its form text, chosen files, and in-flight request stay when you switch panels, collapse, or close. When the user opens Screen 4 the whole Studio view unmounts, so the form text is lost; the stored AI result and any pending request remain in the store. This is a known limit (section 13).
   - `StudioToolbar` at the far right.

### 9.5 CSS (all in `styles.css`)
- `.shell { display: flex; min-height: 100vh }`, `.shell-left { flex: 1; min-width: 0; overflow: auto; padding: 1rem }`, `.shell-panel` with `border-left: 2px solid #000`, `overflow: auto`, `width` set by `.panel-narrow { width: 22rem }`, `.panel-wide { width: 40rem }`, `.panel-collapsed { width: 3rem }`.
- `.toolbar { display: flex; flex-direction: column; width: 5rem; border-left: 2px solid #000 }` with buttons `min-height: 44px; width: 100%; white-space: normal; overflow-wrap: anywhere`, and a thick border or underline on `[aria-pressed='true']` (not color).
- `@media (max-width: 40rem)`: an expanded open panel gets `width: auto; flex: 1` and `.shell-left` is hidden while such a panel is open (class set by the component, not by `:has`, to keep older browsers working).
- The existing `.screen { max-width: 60rem; margin: 0 auto }` is not used by the shell, so the Studio can use the full width. Start and Loading screens are unchanged.
- No color other than `#000` and `#fff`, no `transition`, no `animation`.

## 10. Data flow for one press

```
click AI Chat -> onTogglePanel('ai')
  -> layoutStore.update(s => togglePanel(s, 'ai'))      one synchronous pure step
  -> subscribers run: StudioLayout re-renders; persistence saves if the reference changed
click Skeleton Crew -> shellStore.update(openSkeleton)   (not saved in 2A)
click Back to Start  -> existing ingestion path (store reset); layoutStore is untouched
```

## 11. Failure handling

| Failure | Handling |
|---|---|
| Stored layout missing or damaged | `loadLayout` returns the default. No message. |
| `localStorage` access throws | `browserStorage()` gives `undefined`. In-memory layout only. |
| `setItem` throws (full, blocked) | Swallowed. The next change tries again. |
| Rapid presses | Synchronous pure updates give a deterministic result. |
| Not-allowed screen move | Same object returned, nothing changes. |
| Panel open with no snapshot | Not reachable: `StudioLayout` returns `null`. |
| Leaving the Studio while on Screen 4 or 5 (Back to Start, new load) | `useShellReset` sets the view to Screen 3 as soon as the experience is not `studio`. |
| Background folder reload while on Screen 4 or 5 | The experience stays `studio`, so the screen is kept. |
| `StudioLayout` remounts | The screen comes from `shellStore`, so it is kept. |

## 12. Verification mapping

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Layout state | `tests/layoutState.test.ts` (S1) |
| 2. Saved layout | `tests/layoutStorage.test.ts` (S1) |
| 3. Navigation | `tests/shellView.test.ts` (S2) |
| 4. Components | `tests/studioShell.test.tsx` (S3), `tests/screens.test.tsx` (S4), `tests/studioLayout.test.tsx` (S5) |
| 5. Static checks | S3 to S6 acceptance scripts |
| 6. Regression | `npx vitest run` in S5 and S6 |
| 7. Browser run | S6 |
| 8. Ingestion still works | S5 tests and S6 browser run |

## 13. Risks and known limits

- **Form text is lost when you go to Screen 4.** The AI form's local fields live in the AI panel component, which unmounts with the Studio view. The result and any pending request stay in the store. Accepted for 2A. A later sub-phase may keep the form state in the store. The AI form text is never part of a saved session (R9.6).
- **Server-render tests cannot click.** Component tests check markup and pure actions. Real clicking is proved in the browser run (S6) and marked **Unverified** until it is run.
- **The width values and default layout are placeholders** kept in one CSS block and one constant.
- **Another browser tab can change the saved layout.** Not handled in 2A. The last write wins.
- **Moving `StudioLayout` content is the riskiest edit.** It is done in its own task (S5) with the full existing suite as the safety net, and the old markup of each moved block is kept verbatim.
- `scripts/traceability/*` still do not exist. Approvals are recorded in chat.

## 14. Session restore later (not built in 2A)

This section records what 2A leaves ready, so the later sub-phase can add restore without redoing 2A.

| Part | Saved key (planned) | Content | Built in |
|---|---|---|---|
| Layout | `patchbay.studio-layout.v1` | open panel, collapsed, width | 2A |
| Run state, Log, History | own keys, named in the 2B spec | entries and run position, no file contents or secrets | 2B |
| Session | `patchbay.session.v1` (planned) | repository address (owner, repository, ref, chosen folders, or sample id), current screen and area, and the edits as small diffs | session-restore sub-phase |

How restore will work, using what 2A provides:
1. On start, read the session record. If there is none, show Start as today.
2. If there is one, run the existing loading path with the saved address (the repository is read again from GitHub or from the bundled sample, never from storage). Then set `shellStore` and the layout from the record and re-apply the saved edits. Because the screen is plain data in a store and the Studio only reads it (R9.3, R9.4), nothing in 2A has to change.
3. If the repository cannot be loaded again (private, deleted, rate limited), show the normal loading error with "Back to Start" and a "Reset session" button, and keep the saved session until the user chooses.
4. If the repository has changed since, the edit drift check (2E) flags the edits instead of applying them silently.
5. **Back to Start** and **Reset session** clear the session record and the other saved parts the user chooses. Neither is built in 2A.

## 15. PLAN.md nodes

Plan `P2A-SHELL`, feature `F3 — Studio Shell`, with nodes F3.1 (layout state and saving), F3.2 (screen navigation), F3.3 (toolbar and panel frame), F3.4 (Screens 4 and 5), F3.5 (Studio rewiring). Full text is in `traceability/PLAN.md`.
