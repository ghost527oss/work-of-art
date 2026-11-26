# Requirements: 10 Session Restore (Phase 2, Sub-phase 2G)

Sources: steering `build-phases.md` (Phase 2 text, sub-phase 2G and its gate, and the original Phase 2 exit gate: every control updates state predictably, state survives a page refresh, rapid repeated clicks do not desync or crash); your direction for the end of Phase 2 (after a refresh the whole session stays where you left it: the loaded repository, the Sandbox preview, your edits, Log, History, and which screen you were on, with a clear way to switch or reset the repository, and never saving secrets); specs 01 to 09 (what is built or specified), especially 2A R9 (do not block session restore), 2B R8 (saved work), 2C R9 (saved corrections), 2E-2 (Preview Only changes are not saved), and 2F (the reading level).
Active product phase: **Phase 2, Sub-phase 2G**. PatchBay's own screens stay black-and-white wireframe with no animation. `AI_MODE=mock` only. **No new runtime dependency.** No AI call. The only network use is the existing repository loading that a restore re-runs. **This spec assumes 2A to 2F are built and approved.**

## 1. Purpose

2G makes a browser refresh harmless. After a refresh PatchBay loads the same repository again from its saved **address**, and puts back the screen you were on, the Sandbox settings, your edits, the Log, and the History. It gives you clear ways to leave or wipe a session. It ends Phase 2 with the full exit test.

In simple words: PatchBay remembers *where you were*, not *what the files contain*. After a refresh it downloads the repository again (from GitHub, or from its bundled samples), then puts everything back the way you left it. If the download fails, it tells you why, keeps what it saved, and gives you a button to start over. You can always wipe everything it saved. It never saves secrets or file contents.

## 2. Scope

### In scope
- **The session record** (`patchbay.session.v1`): the repository address, the screen, and the Sandbox settings, in a few hundred bytes.
- **Automatic restore on page load:** reload the repository through the normal Loading screen, with the existing Classify stage, then restore the screen, the Sandbox settings, and notes in the Log.
- **Using what earlier sub-phases already save:** layout (2A), History, Log, and the paused practice run (2B), label corrections (2C), and the reading level (2F). 2G orders and verifies them. It adds no new copy of that data.
- **Failure handling:** a clear error, Retry, a way to reset, and the saved session kept.
- **Back to Start** and **Reset session** with exact rules, a confirmation for Reset, and a **Resume last session** button on the Start screen.
- **A "Saved in this browser" panel** that lists what is stored, how big it is, and what it contains.
- **The Phase 2 exit test:** a store-level refresh matrix, rapid-action tests, a storage privacy test, and a browser refresh matrix.
- Tests, a browser check, and `traceability/PLAN.md` entries.

### Out of scope (later phases)
- Restoring Preview Only changes, the selection and tool, scripts-on, a running Skeleton Crew run or practice step in progress, AI Chat text and results, scan and analysis results (these are recomputed), the Journal's open sections, and the console. See R3.3.
- Syncing between browser tabs or windows (the last write wins).
- Pinning a GitHub repository to a commit (see R2.6).
- Keeping several sessions or repositories (one session at a time, as in 2B and 2C).
- Any server-side storage, accounts, or cloud sync.
- Live AI, a bring-your-own-key setting, and anything Phase 3. A key must never enter the session record (R7.3).
- Colors, themes, animation (Phase 4).

## 3. Glossary

- **Session:** everything that makes up "where you are".
- **Session record:** the small saved record of the address, the screen, and the Sandbox settings.
- **Address:** the repository identity needed to load it again: owner, repository, ref, chosen folders, or the sample id. Never the contents.
- **Restore:** loading the repository again and putting the session back.
- **Resume:** starting a restore from the Start screen when a record exists.
- **Back to Start:** leave the current repository and forget the session record.
- **Reset session:** wipe the saved session data and return to Start.
- **Preferences:** the layout (2A) and the reading level (2F). They are not part of the session.
- **Saved parts:** the five browser-storage keys PatchBay uses in Phase 2.

## 4. Functional requirements

### R1. The session record
1. THE SYSTEM SHALL save one record under the key `patchbay.session.v1`:
   `{ version: 1, savedAt, target, screen, preview, notes }`, where
   - `target` is `{ source: 'github' | 'sample', owner, repo, ref?, scope?, sampleId? }`: for GitHub, the resolved owner, repository, and **ref** as shown on the loaded snapshot, and the chosen folders (`scope`) of the last completed load; for a sample, its `sampleId`;
   - `screen` is `{ screen: 'studio' | 'skeleton' | 'domain', area? }` (the area only for `domain`);
   - `preview` is `{ width, mode, entryPath?, component? }`: the width (`375`, `768`, `1024`, or `0` for fit), the mode (`auto`, or the user's choice of `static`, `workbench`, or `source`), the page only when the user chose a page other than the detected one, and the picked component only when set;
   - `notes` is `{ crewWasActive: boolean, previewOnlyCount: number }`.
2. THE record SHALL be a strict schema with these bounds: owner at most 39 characters and valid as a GitHub owner, repository at most 100 characters and valid, ref at most 250 characters, at most 20 folders each a safe repository path of at most 250 characters, `sampleId` one of the bundled samples, `entryPath` a safe path of at most 250 characters, `component` an identifier of at most 100 characters, `previewOnlyCount` from 0 to 50, and the saved text at most 4 KB.
3. THE record SHALL contain **no other field**. In particular it SHALL NOT contain file contents, file names other than the address and the chosen page, instructions or AI text, log text, findings, snippets, selections, scripts-on, tokens, keys, or secrets. Any unknown field SHALL make the record invalid.
4. THE SYSTEM SHALL write the record only when all of these hold: a repository is loaded and the Studio is shown; no load or restore is running; and no restore is waiting to be applied. It SHALL write only when the content (ignoring `savedAt`) has changed since the last write.
5. THE SYSTEM SHALL NOT delete or change the record while the Start screen is shown, while a restore runs, or when a restore fails. Only Back to Start, Reset session, and a later successful load (which replaces it) change it.
6. WHEN the stored text is missing, unreadable, over 4 KB, from another version, or fails the schema, THE SYSTEM SHALL ignore it with no error message and treat the session as empty. The bad text SHALL be replaced at the next save.
7. WHEN storage is blocked or full, THE SYSTEM SHALL keep working without saving and SHALL NOT show an error.

### R2. Automatic restore on page load
1. WHEN the app starts on the Start screen and a valid session record exists, THE SYSTEM SHALL start a restore at once by running the normal repository loading for the saved `target`: a GitHub repository through `/api/repo`, or a bundled sample through the sample path.
2. THE restore SHALL use the Loading screen, with the heading "Restoring your session" and the line "<owner/name> at <ref>. Your saved changes come back when the repository has loaded.", the usual stages (including **Classify files**), the usual **Cancel**, and the saved-session note in R5.4.
3. WHEN the load finishes, THE SYSTEM SHALL, in this order: let the 2C corrections and the 2B work restore as they already do for a matching repository; apply the screen and the Sandbox settings (R3); and write the Log line "Session restored: <owner/name>, screen <3, 4, or 5>."
4. THE restore SHALL start only once per page load. A second start (for example the double effect of React's strict mode) SHALL be ignored.
5. WHEN the user presses **Cancel** during a restore, THE SYSTEM SHALL stop the load, return to Start, and keep the session record, so the Start screen offers **Resume last session** (R5.6).
6. THE restore SHALL load the ref saved on the snapshot, by name. It SHALL NOT pin to a commit. When the branch has moved since, files that changed are caught by the 2B fingerprints (R3.2 and the 2B discard rule), the restore still completes, and the Log says what was not restored.
7. THE restore SHALL make no request other than the ones the normal loading makes.
8. WHILE a restore is waiting to be applied, no other save of the session record SHALL happen (R1.4).

### R3. What is restored, and what is not
1. THE SYSTEM SHALL restore:
   - the **repository** (reloaded from the address, including the chosen folders);
   - the **screen** (Studio, Skeleton Crew, or Domain with its area). A saved screen that is not valid (a domain screen without a known area) SHALL fall back to the Studio screen;
   - the **layout** (open panel, collapsed, width), which 2A restores at startup, so the Edit or Journal panel can open as before;
   - the **Sandbox settings**: width, the mode choice (only when that mode is possible for the project, otherwise the automatic mode with the Log line "The saved preview mode is not available, so the automatic mode was used."), the page, and the component;
   - the **History**, the **Log**, the **pending practice proposal**, and the **paused practice run**, through the 2B restore (a saved running run comes back paused);
   - the **label corrections** (2C);
   - the **reading level** (2F, already restored at startup).
2. THE edits SHALL come back through the 2B History restore: each applied diff is re-applied to the freshly loaded files and checked by its fingerprints. WHEN a file changed, THE 2B rule applies (the History, the run, and the proposal are discarded and the Log says "Saved changes did not match the loaded files, so they were not restored.") and the session restore SHALL still complete with the screen and settings.
3. THE SYSTEM SHALL NOT restore, by design: Preview Only changes and suggestions, the selection and the active tool, scripts turned on (they are always off), a Skeleton Crew run in progress, AI Chat text and results, scan and analysis results (they are recomputed, and a restore to Screen 4 or 5 starts the scan), the Journal's open sections and any lesson focus, and the preview console.
4. WHEN the record says the crew run was active, THE Log SHALL say "The Skeleton Crew run was not restored. Start it again with Start Crew." WHEN the record says Preview Only changes existed, THE Log SHALL say "<n> Preview Only changes were not restored." (counts only).
5. A restore directly to **Screen 5** SHALL start the scan the same way opening Screen 5 does (the 2D controller's `ensure()` runs when Screen 5 opens as well as Screen 4).
6. AFTER the restore, the app SHALL be in the same state it would have had if the user had navigated there by hand, for everything restored. In particular the Stop bar, the History panel, the Log, the Project understanding section, and the findings agree with each other.

### R4. When the repository cannot be loaded again
1. WHEN the restore fails (the repository is private or gone, GitHub is rate limited, the network is down, the load times out, or the server errors), THE Loading screen SHALL show the existing failure panel with the code, the message, and the rate-limit reset time when known, plus these actions: **Retry** (the same restore), **Reset session** (R5), **Back to Start** (R5), and the sample picker.
2. THE failure panel SHALL say: "Your saved session is kept until you press Reset session or Back to Start."
3. THE session record, the 2B work slot, and the 2C corrections slot SHALL NOT be changed by a failed restore.
4. WHEN the user chooses a sample or another repository from the failure panel and it loads, THE SYSTEM SHALL replace the session record as for any new load (and the 2B and 2C slots follow their own one-slot rules).
5. A failed restore SHALL NOT retry by itself.

### R5. Back to Start, Reset session, and Resume
1. **Back to Start** (the existing buttons on the Studio screen and the Loading failure panel) SHALL return to Start and **delete the session record**. It SHALL keep the 2B work slot and the 2C corrections slot, so loading the same repository again brings its History, Log, and corrections back (2B R8.11 and 2C R9.7 stay as written).
2. **Reset session** SHALL: stop any load, wipe the three session parts from browser storage (`patchbay.session.v1`, `patchbay.work.v1`, and `patchbay.corrections.v1`), clear the in-memory work, History, Log, corrections, understanding, scan, preview, edit, and AI state, set the screen back to the Studio default, and return to Start with the notice "Session reset. Nothing from it is saved." It SHALL keep the preferences (layout and reading level) and SHALL NOT touch the repository.
3. **Reset session** SHALL ask first. Its button SHALL first show "This clears your saved History, Log, label corrections, and session in this browser. Your repository is not changed." with **Yes, reset** and **Cancel**. Only **Yes, reset** acts.
4. THE **Reset session** button SHALL appear: on the Start screen when anything is saved; in the Studio's Project info header next to Back to Start; on the Loading screen while a restore runs; and in the failure panel.
5. THE 2B `reset` command SHALL stay as it is (it clears the work for the current repository only).
6. WHEN a record exists and no restore is running (after **Cancel**, or after a failed restore the user left by refreshing and then cancelling), THE Start screen SHALL show "Last session: <owner/name> at <ref>, saved <local date and time>." with **Resume last session** and **Reset session**. **Resume** SHALL start the same restore as R2.
7. AFTER Reset session, a refresh SHALL show the plain Start screen with nothing to resume.

### R6. "Saved in this browser"
1. THE Start screen and the Studio's Project info SHALL offer a **Saved in this browser** block (closed by default) that lists the five saved parts in plain words with their size in bytes, or "nothing saved":
   - Session address and view (`patchbay.session.v1`)
   - Your changes, Log, and paused practice run (`patchbay.work.v1`)
   - Label corrections (`patchbay.corrections.v1`)
   - Panel layout (`patchbay.studio-layout.v1`)
   - Reading level (`patchbay.journal.v1`)
2. THE block SHALL say "PatchBay saves addresses, your changes, and settings. It never saves file contents, secrets, or what you type to the AI." and SHALL include the **Reset session** button.
3. THE sizes SHALL be read from the stored text lengths. Nothing from the stored values SHALL be shown except the sizes and these fixed descriptions.

### R7. Privacy and secrets
1. THE SYSTEM SHALL store, across all five saved parts, nothing but what the earlier specs define plus the session record. A privacy test SHALL run a full session and then scan **every stored value** for: any line of any loaded file's content (from the three samples and from a fixture with secret-looking lines), the secret fixtures, the AI instruction sentinel, preview documents, snippets, and tokens. None SHALL appear.
2. THE test SHALL also assert that the only keys PatchBay writes are the five saved parts.
3. A bring-your-own-key setting, tokens, or any API key (Phase 3) SHALL NEVER be stored in the session record. The schema rejects unknown fields, and a test asserts that no field name contains `token`, `key`, `secret`, `password`, or `auth`.
4. THE GitHub token (server side) SHALL never reach the browser or storage (unchanged).

### R8. Rapid actions and consistency (the Phase 2 exit rules)
1. EVERY interactive control built in Phase 2 SHALL update state predictably. THE exit test SHALL check this for the controls of each sub-phase (panels, collapse and width, screen navigation, commands, Stop, Approve and Reject, Undo and Redo, the scan and Start Crew, the Sandbox width, mode, page, and scripts switch, the Edit pad commits, the Journal level, and the exports).
2. WHEN controls are pressed rapidly and repeatedly, THE state SHALL end where the same presses applied one at a time would end, with no crash, no duplicate History entry, no lost entry, and no invalid record in storage.
3. THE session record SHALL be written at most once per distinct state, never per event.
4. A refresh at any moment SHALL leave valid saved parts. A refresh during a load, a scan, a crew run, a drag, or a download SHALL lose only the in-flight work.
5. TWO tabs on the same site SHALL be allowed, with the last write winning. This is a known limit (R10.5).

### R9. Wiring into earlier specs
1. THE restore SHALL start from the app's startup using a new controller and the existing ingestion controller, which gains one action, `restore(target)`, equivalent to starting the saved target as a foreground load.
2. THE Start, Loading, and Studio components SHALL gain only the controls in R5 and R6 and the Loading heading in R2.2.
3. THE 2D scan controller's `ensure()` SHALL also run when Screen 5 opens (R3.5).
4. THE existing ingestion, AI, shell, harness, understanding, scanner, preview, Edit pad, and Journal behavior and tests SHALL stay unchanged, except the items in R9.1 to R9.3. The tests that must change (if any) are named in the tasks.
5. THE app SHALL add no network call of its own and no runtime dependency.

### R10. Safety, privacy, and resources
1. THE SYSTEM SHALL validate the saved target with the same validators the Start screen uses before starting a load, so a damaged or edited record cannot start a request to anything but GitHub or the bundled samples through the normal path.
2. THE SYSTEM SHALL render every string from storage as React text.
3. THE SYSTEM SHALL release every subscription and timer on unmount.
4. MEMORY and storage SHALL stay bounded: the session record at most 4 KB, and the five saved parts together at most about 1 MB in the worst case (the existing caps).
5. THE known limits SHALL be stated in the Journal-style notes of the final report: two tabs, a moved branch, GitHub limits, Preview Only changes.

## 5. Error and empty states

| Condition | Required behavior |
|---|---|
| No record | The plain Start screen. |
| Invalid, old, or oversized record | Ignored with no message. |
| Record valid at startup | Automatic restore with the Loading screen. |
| Restore running | Loading screen with the restore heading, Cancel, and Reset session. |
| Restore cancelled | Start with Resume last session and Reset session. The record is kept. |
| Restore failed | Failure panel with Retry, Reset session, Back to Start, and the kept-session sentence. Nothing saved is changed. |
| Rate limited | The existing message with the reset time. |
| Private or deleted repository | The existing `not_found` message. |
| Branch moved, files changed | The restore completes. The Log says the saved changes did not match. |
| Saved mode not possible | Automatic mode with the Log line. |
| Saved screen invalid | Studio screen. |
| Storage blocked or full | No saving, no message. |
| Reset pressed | Confirmation first. |
| Reset confirmed | Start with the notice and nothing saved. |

## 6. Acceptance and verification gate

The spec is satisfied when all of the following hold:

1. **Record tests:** a valid record round-trips; every bad variant (missing, bad JSON, over 4 KB, wrong version, unknown field, bad owner or repository or ref, too many or unsafe folders, unknown sample, bad width, bad mode, unsafe page, bad component, bad area, `previewOnlyCount` out of range) is ignored without a throw; no field name contains `token`, `key`, `secret`, `password`, or `auth`; the record text holds only the allowed fields.
2. **Record building tests:** `buildSessionRecord` for GitHub, scoped GitHub, and sample states; the mode saved only when chosen by the user; the page saved only when different from the detected page; notes from the work and edit states; a state that must not be saved (Start screen, load running, restore pending) returns `null`.
3. **Persistence tests (fake storage):** writes happen only on content change; never while a load or restore is running; never on the Start screen; never during a pending restore; a rapid sequence of 200 navigation actions gives at most one write per distinct content; the stored text is always valid; `savedAt` changes only with content.
4. **Restore state machine tests:** idle, pending, applying, done, failed, cancelled; a second start is ignored; Cancel keeps the record; failure keeps the record and the other slots; Retry re-runs the same target; applying happens once after completion and only for the matching repository; a stale completion (another run) does nothing.
5. **Apply tests:** the screen and the Sandbox settings are applied in order; an invalid area, an impossible mode, and an unknown component fall back with their Log lines; the three Log lines (restored, crew not restored, Preview Only not restored) have the exact text and hold counts only.
6. **Reset and Back to Start tests:** Back to Start deletes only the session record and leaves the work and corrections slots; Reset session deletes exactly the three keys, clears the in-memory slices and the log, keeps layout and reading level, and returns to Start; the confirmation must be accepted; the 2B `reset` command is unchanged; a refresh after either shows what the rules say.
7. **Saved-data panel tests:** the five parts with sizes and fixed descriptions, "nothing saved", no stored value shown, and the Reset button.
8. **Refresh matrix (store level, simulated refresh = new stores and controllers over the same fake storage):** for each of these scenarios the state after the refresh equals the state before for everything restorable, and the non-restorable items are absent with their Log lines:
   - Studio with the Journal panel open (screen 3)
   - Skeleton Crew (screen 4) with a finished scan
   - Domain screen for each of the four areas
   - after approving a crew fix (History restored, the finding gone after the new scan)
   - a paused practice run with a pending proposal
   - an Edit pad change, an undo, and a redo
   - label corrections
   - a scoped GitHub load
   - a bundled sample
   - a failed restore (the record and slots kept, Retry succeeds later)
   - a cancelled restore (Resume works)
   - an invalid record
   - blocked storage
   - a moved branch (a changed file: History discarded, the session restored)
9. **Rapid-action tests:** a seeded random sequence of at least 1,000 actions across all Phase 2 controls (the controls listed in R8.1, using the pure actions and the controllers with fakes), with a simulated refresh every 50 actions: after every refresh the restored state equals the pre-refresh state for restorable items, the invariants of each earlier spec hold (one proposal at most, 50 History entries at most, scripts off, stale actions ignored, saved parts valid), and the number of storage writes stays within the bound of R8.3.
10. **Privacy test (R7):** a full scripted session writes only the five keys, no stored value contains any file content line, secret fixture, instruction sentinel, preview document, snippet, or token, and the sizes are within the caps.
11. **Component tests (server render):** the Start screen with and without a record (Resume banner, Reset, the saved-data block); the Loading screen in restore mode (heading, Cancel, Reset) and in failure (the four actions and the kept-session sentence, the rate-limit time); the Studio header with Back to Start and Reset session; the confirmation text and its two buttons; no new color, transition, or animation; all text escaped; no Apply, Approve, Reject, Pause, Resume, or Step button added.
12. **Static checks:** no network, `fetch`, AI, or `mockAssistant` import in any 2G file (the only network is the existing ingestion path); no new dependency; no `innerHTML`, `eval`, or `new Function`; every new file tagged; the 2E-1 isolation files unchanged.
13. **Regression:** the full existing suite passes, with only the tests named in the tasks changed (if any).
14. **Browser refresh matrix (headless Chromium, built app, real reloads, `/api/repo` served by the dev server and intercepted for the failure cases):** for each scenario in item 8 plus Screen 3 with each panel, the sandbox width and page, a crew fix with refresh, an Edit pad change with refresh, Reset session and Back to Start, a failed restore with Retry, a cancelled restore with Resume, offline, rate limited (a simulated `429` with a reset time), private repository, and rapid clicking with reloads. Each shows the same screen with the same work, or the documented difference. Zero console errors in every run.
15. **Phase 2 exit evidence:** a table mapping the original Phase 2 gate ("every interactive control updates state predictably; state survives a refresh; rapid repeated clicks do not desync or crash") and every sub-phase gate (2A to 2G) to fresh evidence from the final build.
16. **Phase 2G gate (build-phases.md):** refresh returns to the same screen with the same work; no secrets or file contents in storage; a failed reload shows a clear error and a reset path.

## 7. Open questions for approval

1. **Automatic restore (R2.1).** Every refresh reloads the repository and restores your session without asking, with Cancel on the Loading screen. This is what you asked for. Approve, or ask first with a Resume button?
2. **Back to Start versus Reset session (R5.1, R5.2).** Back to Start forgets where you were but keeps your History, Log, and corrections for that repository, so opening it again brings them back (as 2B and 2C specified). Reset session wipes the session, History, Log, and corrections, and keeps your layout and reading level. Approve?
3. **No commit pinning (R2.6).** The restore loads the saved branch by name. If it moved, changed files are detected and your edits to them are dropped with a clear message. Pinning to a commit would be exact but needs a change to the repository-loading code and an extra GitHub request. Approve no pinning?
4. **What is not restored (R3.3).** Preview Only changes, selection, scripts-on, a crew run in progress, AI Chat text, and scan and analysis results (recomputed). Approve?
5. **GitHub limits (R2, R4).** Every refresh downloads the repository again, so frequent refreshes can hit GitHub's hourly limit (60 requests without the server token). You see the reset time, the session is kept, and samples never use GitHub. Approve?
6. **The "Saved in this browser" block (R6).** A transparent list of what is stored and how big. Approve?
7. **Cancel and failures keep the record (R2.5, R4.3).** Cancel returns to Start with a Resume button. A failed restore keeps everything until you press Reset session or Back to Start. Approve?
8. **Confirmation before Reset session (R5.3).** Approve?
9. **Scan on Screen 5 (R3.5).** Restoring directly to Screen 5 starts the scan there as it does on Screen 4. Approve?
10. **Limits (R1.2, R8):** a 4 KB session record, 20 chosen folders, writes only on changed content. Approve as placeholders?
11. **After 2G.** Phase 2 is complete when this passes. Advancing `Current Active Phase` to Phase 3 stays your decision, and I will recommend it only with the evidence table. Approve?
