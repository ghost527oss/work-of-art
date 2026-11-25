# Requirements: 03 Studio Shell (Phase 2, Sub-phase 2A)

Sources: steering `build-phases.md` (Phase 2 text and the 2A gate); the approved Phase 2 blueprint (sections 4 and 5: the five screens and the edge toolbar); the approved Alignment Brief for 2A; specs 01 and 02 (what is already built).
Active product phase: **Phase 2, Sub-phase 2A**. Black-and-white wireframe only. No animation. `AI_MODE=mock` only. No new runtime dependency.

## 1. Purpose

Sub-phase 2A builds the **frame** that every later Phase 2 piece sits in: the Studio screen with a left area, a vertical toolbar on the far right edge, and a right-hand panel that opens, closes, collapses and changes width. It also adds two empty pages (Skeleton Crew and Domain Debugging) and remembers your panel layout after a refresh.

In simple words: this step builds the empty rooms and the doors between them. What goes inside the rooms comes in 2B to 2F.

**Direction for the end of Phase 2 (approved):** after a browser refresh, the whole session comes back where you left it: the loaded repository, the sandbox preview, your edits, Log, History, and the screen you were on (3, 4, or 5), with a clear way to switch or reset the repository. Secrets are never saved. Session restore is built in a later sub-phase. **2A does not build it, but 2A must not make it harder** (requirement R9). In 2A itself, a refresh still starts on the Start screen.

## 2. Scope

### In scope
- The Studio screen (Screen 3) layout: left area, right panel area, far-right vertical toolbar.
- The toolbar with 6 buttons, top to bottom: **Edit, AI Chat, Log, History, Journal, Skeleton Crew**.
- Panels for Edit, AI Chat, Log, History, Journal. One open at a time. Each can collapse to a thin strip and switch between a narrow and a wide width.
- Moving the existing Studio content into the new frame without losing any feature: the AI Assistant panel (behind AI Chat), the session log (inside Log), and the repository header, scoped-folder reload, coverage, and inventory (a "Project info" section in the left area).
- Placeholder panels for Edit, History, and Journal, and a placeholder body for Log's future content.
- Screen 4 (Skeleton Crew) and Screen 5 (Domain Debugging) as empty wireframe pages, with the toolbar hidden.
- Saving the panel layout in browser storage and restoring it.
- Tests, a browser check, and `traceability/PLAN.md` entries for 2A.

### Out of scope (later sub-phases or phases)
- Stop button, chat commands, practice run, real Log or History content, Undo, and the Automation / Self-editing switch (2B).
- File sorting, connection map, scanner, skill-book (2C, 2D).
- Real Skeleton Crew and Domain content (2D). Sandbox preview and the working Edit pad (2E). Journal lessons and export (2F).
- Free dragging of panels, and any change to backend endpoints or AI contracts.
- Colors, themes, animation, custom icons (Phase 4). Live AI (Phase 3).

## 3. Glossary

- **Studio (Screen 3):** the screen shown after a repository or sample finishes loading.
- **Toolbar:** the vertical strip of 6 buttons on the far right edge of Screen 3 only.
- **Panel:** the area to the left of the toolbar that shows what the chosen button opens. One panel at a time.
- **Collapsed:** the open panel is shrunk to a thin strip that keeps only an Expand button.
- **Width:** `narrow` or `wide`. The two sizes are fixed. They are not dragged.
- **Layout record:** the small saved record of which panel is open, whether it is collapsed, and its width.
- **Session:** everything that makes up "where you are": the loaded repository, the current screen, the layout, your edits, Log, and History. Only the layout is saved in 2A.
- **Slide:** the panel changes between its two widths. It jumps to the new width. There is **no animation** in Phase 2.

## 4. Functional requirements

### R1. Studio frame (Screen 3)
1. WHEN a snapshot is loaded and the screen is Studio, THE SYSTEM SHALL show: a left area, an optional right panel, and the toolbar on the far right edge.
2. THE SYSTEM SHALL show in the left area a placeholder box labelled "Sandbox (coming in sub-phase 2E)", followed by a "Project info" section.
3. THE "Project info" section SHALL contain everything the old Studio page showed except the AI Assistant and the session log: the repository title and ref, the Back to Start button and its note, the scoped-reload status and error blocks, the coverage panel (including the folder picker), and the inventory table with "Show more".
4. THE SYSTEM SHALL keep every existing behavior of those parts unchanged (scoped reload, cancel, retry, dismiss error, Back to Start).
5. THE SYSTEM SHALL show nothing when no snapshot is loaded, as before.

### R2. Toolbar
1. THE SYSTEM SHALL show exactly 6 buttons in this top-to-bottom order: Edit, AI Chat, Log, History, Journal, Skeleton Crew. Each has a plain text label and no icon.
2. THE toolbar SHALL be vertical and attached to the far right edge of the Studio screen at every screen width.
3. THE first five buttons SHALL each open a panel (R3). THE sixth button, Skeleton Crew, SHALL go to Screen 4 (R5). It SHALL NOT open a panel.
4. THE panel buttons SHALL expose their state to assistive technology (`aria-pressed`): pressed while their panel is open (collapsed or not).
5. THE toolbar SHALL be a labelled navigation region, reachable and operable by keyboard (Tab, Enter, Space) and by touch, with each button at least 44 px tall.
6. THE toolbar SHALL NOT be shown on Screen 4 or Screen 5.

### R3. Panels
1. THE SYSTEM SHALL allow at most one panel open at a time.
2. WHEN a panel button is pressed and its panel is closed, THE SYSTEM SHALL open that panel (expanded, at the saved width) and close any other.
3. WHEN a panel button is pressed and its panel is already open (expanded or collapsed), THE SYSTEM SHALL close it.
4. THE open panel SHALL have a title, a **Collapse / Expand** button, a **Narrow / Wide** width button, and a **Close** button. Each is a text button.
5. WHEN collapsed, THE panel SHALL shrink to a thin strip that shows only the Expand button, whose accessible name includes the panel title. Its content SHALL stay available after Expand.
6. THE width button SHALL do nothing while the panel is collapsed. Collapse and width SHALL be remembered per session, not per panel (one shared setting).
7. THE panel contents SHALL be:
   - **AI Chat:** the existing AI Assistant panel, with its text and behavior unchanged.
   - **Log:** the existing session log (last 50 entries), plus the line "Planning and skill entries arrive in sub-phase 2B."
   - **Edit, History, Journal:** a heading and one line naming the sub-phase that fills them (Edit: 2E, History: 2B, Journal: 2F). Nothing else.
8. THE AI Assistant panel SHALL stay mounted but hidden while another panel is open, so typed text and chosen files are not lost when you switch panels. A request in flight SHALL continue.
9. THE SYSTEM SHALL NOT add Apply, Approve, Reject, Pause, Resume, or Stop controls in 2A.

### R4. Layout state
1. THE SYSTEM SHALL hold the layout in one state value `{ openPanel, collapsed, width }` where `openPanel` is one of `edit, ai, log, history, journal` or none, `collapsed` is true or false, and `width` is `narrow` or `wide`.
2. THE SYSTEM SHALL change it only through pure actions: toggle a panel, set collapsed, toggle width, close.
3. THE SYSTEM SHALL keep this rule at all times: `collapsed` is true only when a panel is open.
4. WHEN an action would not change the state, THE SYSTEM SHALL return the same state object, so nothing re-renders and nothing is saved.
5. THE default layout SHALL be: AI Chat open, expanded, narrow.
6. WHEN buttons are pressed many times quickly, THE SYSTEM SHALL end in the state the same sequence of presses always produces. Each press SHALL be applied once, in order.

### R5. Screens 4 and 5
1. WHEN Skeleton Crew is pressed, THE SYSTEM SHALL show Screen 4: the left sandbox placeholder and, on the right, the heading "Skeleton Crew", the line "The four-area map and the worker slots arrive in sub-phase 2D.", four area buttons (Frontend, Backend, Security, APIs & Data), and a "Back to Studio" button.
2. WHEN an area button is pressed, THE SYSTEM SHALL show Screen 5 with the left sandbox placeholder and, on the right, the area name as heading, the line "Findings and live debugging arrive in sub-phase 2D.", "Back to Skeleton Crew" and "Back to Studio" buttons.
3. WHEN "Back to Studio" is pressed, THE SYSTEM SHALL return to Screen 3 with the layout record as it was.
4. THE SYSTEM SHALL NOT show the toolbar on Screens 4 or 5 (R2.6).
5. THE current screen (3, 4, or 5) SHALL be kept as plain data in a small store, not inside a component, so that a later sub-phase can save and restore it. 2A itself SHALL NOT save it.
6. WHEN the app leaves the Studio (Back to Start, or a new load started from Start or from the loading screen), THE SYSTEM SHALL return the screen to Screen 3. A background folder reload SHALL keep the current screen. Remounting the Studio component SHALL NOT change the screen.
7. THE navigation SHALL be a pure state change with no network call and SHALL ignore a move that is not allowed from the current screen (for example opening Screen 5 from Screen 3).

### R6. Saved layout
1. THE SYSTEM SHALL save the layout record in browser storage under one key every time the layout changes, and read it once when the app starts.
2. THE saved record SHALL contain exactly: a version number, `openPanel`, `collapsed`, and `width`. It SHALL NOT contain repository data, file names, instructions, AI results, log text, tokens, or any secret.
3. WHEN the stored value is missing, unreadable, too large (over 1 KB), has an unknown version, has unknown fields, or breaks R4.3, THE SYSTEM SHALL use the default layout and SHALL NOT show an error.
4. WHEN storage is unavailable or full (for example private browsing), THE SYSTEM SHALL keep working with the layout in memory and SHALL NOT show an error or log anything.
5. WHEN the page is refreshed, THE SYSTEM SHALL, **in 2A only**, start on the Start screen (no repository, screen, or edits are saved yet), and WHEN a repository or sample finishes loading, THE Studio SHALL use the saved layout. This is a temporary limit that the session restore (R9) removes.
6. Back to Start and loading a new repository SHALL NOT reset the layout.

### R7. Appearance and responsiveness
1. THE SYSTEM SHALL use only black and white, no animation, and no transition. New CSS SHALL contain no color other than `#000` and `#fff`.
2. THE Studio SHALL show no horizontal page scrolling at a 375 px viewport width.
3. WHEN the viewport is narrow (640 px or less) and a panel is open and expanded, THE panel SHALL cover the left area. The toolbar SHALL stay at the right edge. WHEN the panel is collapsed or closed, THE left area SHALL be visible.
4. WHEN the viewport is wider than 640 px, THE left area and the open panel SHALL be side by side. THE narrow width SHALL be about 22 rem and THE wide width about 40 rem (provisional values, kept in one place).
5. THE left area and the panel SHALL scroll on their own when their content is taller than the window.

### R8. Safety, privacy, and resource rules
1. THE SYSTEM SHALL add no runtime dependency beyond `react`, `react-dom`, and `zod`.
2. THE SYSTEM SHALL make no network call from any 2A code. The layout and navigation code SHALL NOT import the engine, AI, or ingestion services.
3. THE SYSTEM SHALL render all text as React text, never as HTML.
4. THE SYSTEM SHALL release every store subscription it creates when the app unmounts.
5. THE SYSTEM SHALL keep memory small: the saved record is under 200 bytes and nothing grows with use.

### R9. Do not block session restore (forward compatibility)
1. THE SYSTEM SHALL keep each future saved part under its own versioned key named `patchbay.<part>.v<N>` (the layout key is `patchbay.studio-layout.v1`). A later part, such as the session record, SHALL be able to be added without changing or migrating the layout key.
2. THE layout and the screen SHALL each be small plain data (no functions, no class instances, no element references) so they can be written as JSON as they are.
3. THE screen state SHALL live in a store that any code can set, and the Studio component SHALL only read it. A restore step SHALL be able to load a repository and then set the screen and layout without the Studio component resetting them.
4. THE Studio component SHALL NOT assume it was reached from a fresh load. It SHALL take the loaded snapshot, the screen, and the layout only from stores.
5. THE existing **Back to Start** button SHALL remain the way to switch repository. A later sub-phase makes it also clear the saved session, and adds an explicit **Reset session** control. 2A adds neither.
6. NOTHING saved in any part SHALL ever include a secret, a token, file contents of the repository, or AI instruction text. What a restore needs is the repository **address** (owner, repository, ref, and chosen folders, or the sample id) and the user's own edits, so the repository is loaded again from its source. This keeps the rule "never store whole repositories".

## 5. Error and empty states

| Condition | Required behavior |
|---|---|
| No snapshot loaded | The Studio shows nothing, as today. |
| No panel open | The left area uses the full width. The toolbar shows no button as pressed. |
| Saved record missing, damaged, old, too large | Default layout. No message. |
| Storage blocked or full | Layout works for this visit only. No message. |
| Repository reload fails in the background | The same error block as today appears in Project info. The previous data stays. |
| Not-allowed screen move (Screen 5 from Screen 3) | Ignored. |
| Studio component remounts while on Screen 4 | Stays on Screen 4 (the screen is in a store). |
| Rapid repeated presses | Each press applied once, in order. Final state matches the press sequence. |

## 6. Acceptance and verification gate

The spec is satisfied when all of the following hold:

1. **Layout state tests:** every action and every no-op returns the expected state; the same state object comes back for no-ops; a long random sequence of actions never breaks R4.3; repeating one action pair 100 times ends where the parity says; actions never mutate their input (frozen-state test).
2. **Saved layout tests:** a valid record round-trips; every bad variant in R6.3 gives the default; blocked, throwing, and full storage give no error; the stored text has exactly the four keys and under 200 bytes; no secret-looking or repository text can reach it.
3. **Navigation tests:** each allowed move works, each disallowed move is ignored, the toolbar is visible only on Screen 3, leaving the Studio returns to Screen 3, a background reload keeps the screen, and unmounting and remounting the Studio component keeps the screen.
4. **Component tests (server render):** the toolbar has 6 buttons in order with the right labels and pressed states; panel controls exist; collapsed and wide markup differs as expected; Screens 4 and 5 text and buttons match R5; the AI panel stays in the markup (hidden) when another panel is open; no Apply, Approve, Reject, Pause, Resume, or Stop control exists.
5. **Static checks:** the layout and screen state survive `JSON.parse(JSON.stringify(x))` unchanged (R9.2), no color other than `#000` and `#fff`, no `transition` or `animation`, no `dangerouslySetInnerHTML`, no new dependency, every new file carries an `@node` tag, and the layout code imports nothing from the engine or AI services.
6. **Regression:** the full existing suite still passes (spec 01 and 02 behavior unchanged), including the AI panel tests.
7. **Browser run (headless Chromium, built app):** from a loaded sample: all 5 panel buttons open, switch, and close panels; collapse and width work; reload the page, load the sample again, and the same layout returns; 50 rapid presses leave one consistent state; Skeleton Crew, an area page, and both Back buttons work with the toolbar hidden on Screens 4 and 5; the AI Chat panel still sends a request and shows a result; zero console errors; black and white only; no horizontal overflow at 375 px; blocked storage still works.
8. **No regression of ingestion:** scoped reload, cancel, and Back to Start still work in the new frame (browser or tests).

## 7. Open questions for approval

1. **Screen kept restorable, saved later (R5.5, R9).** 2A keeps the screen in a store and does not save it, because saving it without the repository would open an empty Screen 4 after a refresh. The screen is saved together with the repository in the session-restore sub-phase. Approve?
2. **Screens 4 and 5 keep the left Sandbox placeholder (R5).** This follows the blueprint (the sandbox stays on the left). The brief said "empty pages". Approve?
3. **Reaching Screen 5 (R5.1).** The brief did not say how Screen 5 is reached. I put four area buttons on Screen 4. Approve?
4. **Default layout and widths (R4.5, R7.4).** AI Chat open and narrow at 22 rem, wide at 40 rem, as placeholders. Approve?
5. **One shared collapsed/width setting (R3.6)** instead of one per panel. Approve?
6. **Where session restore is built (R9).** It needs the sandbox and your edits, so it cannot come before 2E. See the question in the 2B hand-off message. The decision affects `build-phases.md`, so it is yours to make.
