# Design: 10 Session Restore (Phase 2, Sub-phase 2G)

Implements `requirements.md` in this folder. Active product phase: **Phase 2, Sub-phase 2G**. PatchBay's own screens stay wireframe with no animation, `AI_MODE=mock` only, no new dependency. The only network use is the existing repository loading, which a restore runs again. Built on 2A to 2F: it orders and checks what they already save, adds one small record, and adds the controls and the exit tests.

## 1. Decisions already made

| Source | Decision |
|---|---|
| Your direction (end of Phase 2) | A refresh keeps the loaded repository, the Sandbox, your edits, Log, History, and the screen, with a clear way to switch or reset the repository, and never saves secrets. |
| 2A R9 | The screen and layout are plain data in stores, the Studio only reads them, each saved part has its own versioned key, and Back to Start later also clears the saved session and a Reset session control is added. |
| 2B R8, 2C R9 | One saved slot for work and one for corrections. Back to Start keeps those slots. Restore is by matching repository key and fingerprints. |
| 2E-2 | Preview Only changes are not saved and are not part of session restore. |
| 2F | The reading level is the only Journal preference. |
| Requirements section 7 (pending your answers) | Automatic restore, Back to Start versus Reset session, no commit pinning, the non-restored list, GitHub limits, the saved-data block, Cancel and failure keep the record, a confirmation, scan on Screen 5, limits, and the Phase 3 hand-off. |

## 2. Phase 2G compliance

| Rule (build-phases.md) | How this design complies |
|---|---|
| Design only the Current Active Sub-phase (2G) | The record, the restore, the reset rules, the saved-data block, and the exit tests. Nothing else is added to the product. |
| Reload from the saved address and restore the screen, layout, edits, Log, and History | The record holds the address and view. 2A, 2B, 2C, and 2F restore the rest. |
| Back to Start and Reset session clear saved data | R5 defines exactly what each clears. |
| No secrets or file contents in storage | A strict schema, a privacy test over every stored value, and a key inventory. |
| Failed reload shows a clear error and a reset path | The existing failure panel plus Retry, Reset session, and Back to Start. |
| Browser storage never holds whole repositories | Only addresses and small diffs, as before. |
| No new runtime dependency | None. |

## 3. Lightweight-architecture audit

| Gate | Status | Finding |
|---|---|---|
| 1. Dependency vetting | PASS | No package. Zod validates the record. |
| 2. Memory and bundle | PASS | One record of at most 4 KB, one tiny store, and a few components. Bundle growth is reported against the 2F baseline. |
| 3. Free-tier resilience | PASS | A restore of a GitHub repository costs the same requests as a normal load (the server token, when configured, raises the limit). Samples cost none. A failure keeps everything and offers Retry. |
| 4. Teardown | PASS | One store subscription and one timer, released on unmount and after the restore finishes. |

## 4. Files

All paths are relative to `work-of-art/`.

### 4.1 New
| File | Responsibility |
|---|---|
| `src/config/sessionLimits.ts` | Limits, provisional: 4 KB record, 20 folders, 250-character paths, 3,000 ms apply wait. |
| `src/store/sessionRecord.ts` | `SessionRecordSchema`, `validateTarget`, `toIngestTarget`, `loadSession`, `saveSession`, `clearSessionRecord`, `clearAllSession`, `describeSavedData`, `buildSessionRecord`. Pure except the storage calls, which never throw. |
| `src/store/sessionStore.ts` | The small restore store: `status` (`idle`, `pending`, `applying`, `done`, `failed`, `cancelled`), the loaded `record`, the `pendingRunId`, a `notice`, and the pure transitions. Uses the 2A `createStore`. |
| `src/store/sessionActions.ts` | Whole-state actions on `StudioState`: `resetSessionState`, and the Log lines (`session_restored`, `session_note`) with counts only. |
| `src/store/sessionPersistence.ts` | `attachSessionPersistence(deps)`: the saving subscriber with all the gates of R1.4 and the write-only-on-change rule. |
| `src/hooks/useSessionRestore.ts` | `createSessionController(deps)` and `useSessionRestore(ingestion)`: startup, resume, apply, cancel and failure handling, Back to Start, Reset session. |
| `src/components/ResumeBanner.tsx`, `SavedDataPanel.tsx`, `ResetSessionButton.tsx`, `RestoreNotice.tsx` | The new UI parts. Props only. |
| Tests | `sessionRecord`, `sessionBuild`, `sessionPersistence`, `sessionStore`, `sessionApply`, `sessionReset`, `savedData`, `refreshMatrix`, `phase2Rapid`, `storagePrivacy` (`*.test.ts`); `sessionUi` (`*.test.tsx`). |

### 4.2 Modified
| File | Change |
|---|---|
| `src/hooks/useIngestion.ts` (spec 01) | `IngestionActions` gains `restore(target)`: validates the target and starts it as a foreground load. Nothing else changes. |
| `src/components/StartScreen.tsx` (spec 01) | Renders `ResumeBanner` and `SavedDataPanel` above and below the form. |
| `src/components/LoadingScene.tsx` (spec 01, 2C) | Shows the restore heading and line and the **Reset session** button while a restore runs and in the failure panel, plus the kept-session sentence. |
| `src/components/StudioLayout.tsx`, `ProjectInfo.tsx` | Renders `ResetSessionButton` next to Back to Start and the Saved in this browser block. `onBack` is the composed handler. |
| `src/hooks/useScan.ts`, `DomainScreen.tsx` (2D) | `ensure()` also runs when Screen 5 opens. |
| `src/store/previewSlice.ts`, `previewActions.ts`, `src/hooks/usePreview.ts` (2E-1) | Only if missing: an action to set the picked component (`pvComponent`) that validates the name against the extracted list. |
| `src/App.tsx` | Calls `useSessionRestore(ingestion)`, composes `onBack` and the new `onResetSession` handlers, and passes the record to the Start screen. |
| `src/styles.css` | A black-and-white block for the new parts. |
| Tests | Only the 2D assertion that the scan starts when Screen 4 opens is extended to Screen 5 (named in the tasks). |
| `traceability/PLAN.md` | Adds plan `P2G-SESSION` with nodes F10.1 to F10.8. |

### 4.3 Not touched
`api/*`, the server loading code, the 2B persistence and restore logic, the 2C corrections storage, the 2E-1 isolation code, the 2E-2 edit logic, the 2F export and Journal logic, and every existing test except the one named above.

## 5. Data model

```ts
interface SessionTarget { source: 'github' | 'sample'; owner: string; repo: string; ref?: string; scope?: string[]; sampleId?: string }
interface SessionRecord {
  version: 1; savedAt: number
  target: SessionTarget
  screen: { screen: 'studio' | 'skeleton' | 'domain'; area?: 'frontend' | 'backend' | 'security' | 'api_data' }
  preview: { width: 375 | 768 | 1024 | 0; mode: 'auto' | 'static' | 'workbench' | 'source'; entryPath?: string; component?: string }
  notes: { crewWasActive: boolean; previewOnlyCount: number }
}
interface SessionStoreState {
  status: 'idle' | 'pending' | 'applying' | 'done' | 'failed' | 'cancelled'
  record?: SessionRecord          // the record read at startup, shown by the Resume banner
  pendingRunId?: number           // the ingestion run id of the restore load
  screenApplied: boolean; previewApplied: boolean
  notice?: string                 // "Session reset. Nothing from it is saved."
}
```
Plain data. The store holds no file content and no secrets.

## 6. The saved parts (the inventory)

| Key | Written by | Holds | Cleared by Back to Start | Cleared by Reset session |
|---|---|---|---|---|
| `patchbay.session.v1` | 2G | address, screen, Sandbox settings, two notes | **Yes** | Yes |
| `patchbay.work.v1` | 2B | History diffs and fingerprints, Log, paused practice run and proposal | No | Yes |
| `patchbay.corrections.v1` | 2C | paths and label names | No | Yes |
| `patchbay.studio-layout.v1` | 2A | panel layout | No | No (preference) |
| `patchbay.journal.v1` | 2F | reading level | No | No (preference) |

`describeSavedData(storage)` reads only the stored text lengths and returns these five rows with their fixed descriptions.

## 7. Building and saving the record

### 7.1 `buildSessionRecord(input)`
Input (all from existing state): the experience, the snapshot (source, owner, name, ref), the target of the last completed run (`ingestion.target`: scope and sample id), the ingestion status, the shell view, the preview state, the detected entry page (memoised `detectPreviewMode(snapshot, understanding.result).entryPath`), the Edit state's Preview Only count, the work state's crew-run flag, and the restore status.
Returns `null` when any of these hold: not in the Studio; no snapshot; an ingestion run is running (foreground or background); the restore status is `pending` or `applying`. Otherwise it returns the record with:
- `target`: for GitHub `{ source, owner: snapshot.owner, repo: snapshot.name, ref: snapshot.ref, scope: ingestion.target?.scope }`; for a sample `{ source: 'sample', owner: 'sample', repo: sampleId, sampleId }`;
- `screen` from the view (a `domain` view carries its area);
- `preview`: `mode` is `preview.mode` when `preview.chosenBy === 'user'`, else `'auto'`; `entryPath` only when it differs from the detected page; `component` only when set; `width` as set;
- `notes`: `crewWasActive` is true when the work state's run is of kind `crew` and not finished or stopped; `previewOnlyCount` is the length of the Preview Only list.
`savedAt` is added by the writer, not the builder, so tests can compare records without it.

### 7.2 `attachSessionPersistence({ studio, shell, session, storage, now })`
Subscribes to the studio store, the shell store, and the session store. On every notification it builds the record. If the result is `null` it does nothing. Otherwise it serialises the record **without `savedAt`**; if the text equals the last text written, it does nothing; otherwise it writes the record with `savedAt: now()` and remembers the text. It never deletes anything. It returns the unsubscribe function. Because notifications can arrive in bursts (rapid clicks), the work per notification is a few comparisons and at most one small write.

## 8. The restore

### 8.1 State machine (`sessionStore.ts`)
```
idle --begin(record, runId)--> pending
pending --loaded(runId)------> applying     (the load finished for that run)
applying --applied------------> done        (screen and preview applied, or the wait timed out)
pending --failed(runId)------> failed       (the load failed for that run; the record stays)
pending --cancelled----------> cancelled    (the user cancelled; the record stays)
failed|cancelled --begin-----> pending      (Retry through ingestion.retry, or Resume)
any --reset------------------> idle (record cleared)
```
All transitions are pure and ignore a run id that is not the pending one.

### 8.2 The controller (`useSessionRestore.ts`)
`createSessionController({ studio, shell, session, ingestion, storage, setTimer, clearTimer, now })`:
1. **`startup()`** (once per controller, ignored afterwards): read the record with `loadSession`. Put it in the session store as `record`. If the experience is `start`, call `begin(record)` and `ingestion.restore(toIngestTarget(record.target))`, then store the run id.
2. **Studio-store subscriber** (only while `pending` or `applying`):
   - The pending run is `done` with a snapshot and `experience === 'studio'`: go to `applying`.
   - The pending run is `failed`: go to `failed`.
   - The experience is `start` with the ingestion idle after the run started: go to `cancelled`.
3. **Applying** (idempotent, each part once):
   - **Screen:** from the Studio view, call `openSkeleton` for `skeleton`, or `openSkeleton` then `openDomain(area)` for `domain` (a missing area falls back to the Studio screen). Set `screenApplied`.
   - **Preview settings:** wait until the preview slice has been initialised for this snapshot (its `reason` is not empty). Then set the width, set the mode only when it is in the possible choices (else Log "The saved preview mode is not available, so the automatic mode was used."), set the page when it is one of the project's HTML pages, and set the component when it is in the extracted list. Set `previewApplied`. A timer of 3,000 ms applies whatever is left and finishes, so a missing preview can never leave the restore pending.
   - **Log:** one `session_restored` line, and the two note lines when the notes ask for them.
   - Then `done`: the persistence subscriber may write again (it writes only if the content changed).
4. **`resume()`:** from the Start screen with a record, same as `startup()`'s begin.
5. **`backToStart()`:** `ingestion.backToStart()`, then `clearSessionRecord(storage)`, then the session store `reset` (keeping the notice empty).
6. **`resetSession()`:** `ingestion.backToStart()` (it aborts any load), `clearAllSession(storage)`, a studio update with `resetSessionState` (everything back to the initial state except the ingestion run counter), the shell back to the Studio screen, the session store `reset` with the notice "Session reset. Nothing from it is saved."
7. **`dispose()`:** unsubscribe, clear the timer.
`useSessionRestore(ingestion)` creates the controller with `useMemo`, calls `startup()` in an effect (guarded so React's double effect starts it once), and disposes on unmount. After a dispose, a new `attach()` can subscribe again (the double effect), without a second startup.

### 8.3 `ingestion.restore(target)`
In `useIngestion.ts`: validate the target with `validateTarget` (the same owner, repository, ref, and path validators as the Start screen); on a bad target do nothing and return a message; otherwise call the internal `run(toIngestTarget(target), false)`. The existing run already does the Classify stage, loads the corrections, completes in one update, and lets the 2B controller restore the work for a matching repository.

### 8.4 What the other controllers do (unchanged)
- **2B** restores the History, Log, practice run, and proposal for the matching repository key, by fingerprints, once per page load for the Log.
- **2C** restores the corrections inside the loading run.
- **2A** restored the layout at startup.
- **2F** restored the reading level at startup.
The session controller does not copy any of this. It waits for the load and then applies only the screen and the Sandbox settings.

## 9. Reset and Back to Start

`resetSessionState(state)` returns `{ ...initialState(), ingestion: { ...initialState().ingestion, runId: state.ingestion.runId } }`. That clears the snapshot, the experience, the log (and its counter), and the work, understanding, scan, preview, edit, and AI slices. The preferences are not in `StudioState` (they are the layout store and the Journal store), so they are untouched. The 2B and 2C controllers see the snapshot disappear and write nothing.

| Action | Session record | 2B work slot | 2C corrections slot | In-memory state | Layout and reading level |
|---|---|---|---|---|---|
| Back to Start | deleted | kept | kept | the usual 2A reset (the log is kept in memory as before) | kept |
| Reset session | deleted | deleted | deleted | all cleared, including the log | kept |
| 2B `reset` command | unchanged | deleted | unchanged | work and log cleared | kept |

## 10. User interface

- **Start screen:** `ResumeBanner` when a record exists and no restore is running: "Last session: <owner/name> at <ref>, saved <local date and time>." with **Resume last session** and **Reset session**. The 2A form and sample picker stay. `SavedDataPanel` is a closed `details` titled "Saved in this browser" with the five rows, the privacy sentence, and the Reset button. The `notice` (after a reset) shows as a status line.
- **Loading screen (restore mode):** the heading "Restoring your session", the line "<owner/name> at <ref>. Your saved changes come back when the repository has loaded.", the usual stages and Cancel, and **Reset session**. In the failure panel the actions Retry, Reset session, Back to Start, and the sample picker, and the sentence "Your saved session is kept until you press Reset session or Back to Start."
- **Studio header:** Back to Start, then **Reset session**. Pressing Reset session replaces the button by the confirmation text with **Yes, reset** and **Cancel**. The Saved in this browser block sits in Project info.
- All text is React text. No color, icon, transition, or animation. Buttons are at least 44 px tall.

## 11. The Phase 2 exit tests

### 11.1 Refresh matrix (`refreshMatrix.test.ts`)
A helper `refresh(storage)` creates fresh stores and controllers over the same fake storage, fake ingestion services (the three bundled samples and a fixture project), fake timers, and fake `fetch`-free services. Each scenario in requirements section 6 item 8 builds a session, snapshots the restorable state (screen, layout, Sandbox settings, History, practice copy of each edited file, Log entries up to the refresh, corrections, practice run status, findings after the new scan), calls `refresh`, runs the restore, and compares. The non-restorable items are asserted absent with their Log lines.

### 11.2 Rapid actions (`phase2Rapid.test.ts`)
A seeded generator picks from the pure actions and fake-driven controllers for every Phase 2 control (panel toggle, collapse, width, screen moves, commands, Stop, Approve, Reject, Undo, Redo, scan, Start Crew, Sandbox width, mode, page, scripts switch, Edit commits, level, exports, Back to Start, Reset). Every 50 actions it simulates a refresh. After each step it checks the invariants of each earlier spec, and after each refresh it compares the restorable state. It counts storage writes and asserts the bound.

### 11.3 Storage privacy (`storagePrivacy.test.ts`)
A recording storage runs a full scripted session on the samples and on a fixture with secret-looking lines, instructions typed into AI Chat, preview documents, and snippets. It asserts the five keys only, the sizes, and that no stored value contains any line of any loaded file (at least 8 characters, trimmed), any secret fixture, any sentinel, any HTML from a preview document, or any key name of the forbidden list.

### 11.4 Browser matrix (final task)
Real reloads in headless Chromium, with `/api/repo` and the samples, interception for failures (offline, `429` with a reset time, `404`, timeout), and rapid clicking with reloads. It records zero console errors for each run and produces the evidence table of acceptance item 15.

## 12. Failure handling

| Failure | Handling |
|---|---|
| Record invalid or old | Ignored. Replaced at the next save. |
| Restore load fails | `failed`. Failure panel. Record and slots untouched. Retry through the existing retry. |
| User cancels | `cancelled`. Start with Resume. Record kept. |
| Snapshot arrives for another run | Ignored by the run id check. |
| Preview never initialises | The 3,000 ms timer applies the rest and finishes. |
| Saved mode, page, or component no longer possible | Automatic mode or the default, with a Log line. |
| 2B fingerprints do not match | The 2B discard and its Log line. The restore completes. |
| Storage blocked or full | No saving. No message. |
| Reset during a load | The load is aborted, then the reset runs. |
| Second tab | Last write wins (known limit). |

## 13. Verification mapping

| Acceptance item (requirements section 6) | Where it is proved |
|---|---|
| 1. Record | `tests/sessionRecord.test.ts` (K1) |
| 2. Record building | `tests/sessionBuild.test.ts` (K1) |
| 3. Persistence | `tests/sessionPersistence.test.ts` (K3) |
| 4. State machine | `tests/sessionStore.test.ts` (K2) |
| 5. Apply | `tests/sessionApply.test.ts` (K4) |
| 6. Reset and Back to Start | `tests/sessionReset.test.ts` (K4) |
| 7. Saved-data panel | `tests/savedData.test.ts` (K1), `tests/sessionUi.test.tsx` (K6) |
| 8. Refresh matrix | `tests/refreshMatrix.test.ts` (K8) |
| 9. Rapid actions | `tests/phase2Rapid.test.ts` (K8) |
| 10. Privacy | `tests/storagePrivacy.test.ts` (K8) |
| 11. Components | `tests/sessionUi.test.tsx` (K6, K7) |
| 12. Static checks | K1 to K8, K9 |
| 13. Regression | K5, K7, K8, K9 |
| 14. Browser matrix | K9 |
| 15. Phase 2 exit evidence | K9 |
| 16. Phase 2G gate | K9 |

## 14. Risks and known limits

- **Every refresh downloads the repository again.** GitHub's limits apply. A failed restore keeps everything and shows the reset time.
- **A moved branch can drop edits.** The fingerprints detect it and say so. Pinning would fix it and is not in 2G.
- **Two tabs can overwrite each other.** The last write wins.
- **Some things are intentionally not restored** (R3.3). The Log says so when it matters.
- **The 2E-1 and 2D control names may differ from the spec at build time.** The restore touches them only through small actions (`pvWidth`, `pvMode`, `pvEntry`, `pvComponent`, `ensure`), and K2 and K5 adapt to the as-built names.
- **The restore depends on the preview being initialised.** A timer finishes the restore if it never is.
- **`scripts/traceability/*` still do not exist.** Approvals are recorded in chat.

## 15. PLAN.md nodes

Plan `P2G-SESSION`, feature `F10 — Session Restore`, with nodes F10.1 (limits, record, storage helpers, saved-data inventory), F10.2 (restore store and transitions), F10.3 (persistence subscriber), F10.4 (controller, `ingestion.restore`, reset, Back to Start, apply), F10.5 (scan on Screen 5), F10.6 (components), F10.7 (wiring), F10.8 (the Phase 2 exit tests), and the gate F10. Full text is in `traceability/PLAN.md`.
