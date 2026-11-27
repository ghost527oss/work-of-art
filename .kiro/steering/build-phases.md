---
inclusion: always
---

# 5-Phase Product Build Strategy

Current Active Phase: Phase 3 (Sub-phase 3B)

## 1. Hard Gates & Phase Precedence (Non-Negotiable)
1. **Strict Phase Boundary:** Design, spec, and implement **ONLY** what belongs to `Current Active Phase` above. Never build features, install libraries, or write styles belonging to a later phase.
2. **Precedence Over UI Styling:** This file governs *what* is built in each product phase; `.kiro/steering/development-principles.md` and `.kiro/steering/development-workflow.md` govern *how* you operate. During **Phases 1–3**, this file overrides `.kiro/steering/ui-standards.md`—keep the UI plain black-and-white wireframe until Phase 4 while keeping 4 GB RAM, lean-dependency, and free-tier rules active at all times.
3. **Human-Controlled Phase Advancement:** Never change `Current Active Phase` yourself. Recommend advancing only after every item in the current Phase-Exit Test Gate passes with concrete verification evidence.
4. **Mock-First In-App AI Rule:** Build a single backend AI Adapter with `AI_MODE = mock | live`. Use `mock` during Phases 1–2, switch to `live` in Phase 3, and keep the `mock` toggle working in Phases 4–5 so UI work never burns free API quota.

## 2. The 5-Phase Execution Roadmap

### Phase 1: Skeleton (Black & White Wireframe + Backend)
- **Allowed Scope:**
  - Plain black-and-white wireframe UI (basic HTML/CSS structure, zero custom colors or animations).
  - Core backend endpoints, request/response schemas, and state storage.
  - **Mock AI Adapter (`AI_MODE=mock`):** Returns instant, deterministic sample payloads (fake build steps, fake error audits, fake code patches) matching the exact contract Phase 3 will use.
- **Forbidden in Phase 1:** Custom color palettes, visual themes, animations, layout polish, real LLM API keys, or external AI network calls.
- **Phase-Exit Test Gate:**
  - Frontend triggers backend endpoints and renders Mock AI payloads cleanly.
  - Zero browser console errors and zero unhandled server errors across the core request loop.

### Phase 2: Movement, Interactive Controls & Debugging Workspace
Phase 2 is built in sub-phases 2A to 2G, one at a time. Design, spec and implement ONLY the
Current Active Sub-phase. The human advances sub-phases, never the agent.
Each sub-phase has its own spec and test gate. All PatchBay screens stay black-and-white
wireframe. The Edit pad's colour tools only change the imported app's elements, never PatchBay's own screens.

- **Allowed in all of Phase 2:**
  - Interactive layout: collapsible and sliding panels, saved layout.
  - One safe action list (pause, resume, stop, step, approve, reject, undo, redo, open panel,
    edit practice copy) used by the AI Chat harness. Chat-driven control; no separate pause/resume buttons.
  - Browser storage for layout, log, and history. Never store secrets or whole repositories.
  - Offline (no AI) file sorting, connection map, skill-book scanner, and Journal content.
  - Locked-down sandbox preview and the visual Edit pad (Screen 3 only).
  - AI Chat in `AI_MODE=mock` only.
- **Forbidden in Phase 2:** real LLM calls or keys, PatchBay's own colours/themes/animations/SVG polish,
  running imported backend servers or databases, pushing to GitHub, new runtime dependencies without approval.
- **Sub-phases and gates:**
  - 2A Studio shell: toolbar, panels, saved layout, Screens 4 and 5 as empty pages. Gate: layout survives refresh; rapid clicks cause no desync.
  - 2B Action harness: chat commands, practice run, Log, History with Undo/Redo, Automation/Self-editing modes. Gate: every command updates state predictably, survives refresh, handles repeated commands.
  - 2C Project understanding: file sorting with confidence and reasons, user corrections, connection map. Gate: no guessed labels; low-confidence files go to Needs Review.
  - 2D Scanner and Skeleton Crew: four-area scanner, findings with proof and honest fix labels, Screens 4 and 5. Gate: every finding shows file, lines, snippet and reason; no invented scores.
  - 2E-1 Sandbox preview: three display modes (Live Static Preview that is look-only by default with an explicit run-scripts switch in a locked-down iframe, an approximate static Component Workbench, and Source Inspection), isolation, and the layout overflow check. Gate: imported code cannot read PatchBay data, cookies or secrets, or load external scripts or any other external content; messages from the preview are validated and shown only as plain text.
  - 2E-2 Edit pad: click, lasso and background selection with style tools, exact-mapped plain HTML elements become real style edits in History with Undo and Redo, everything else is Preview Only, layout re-check after edits. Gate: no edit changes anything except the in-memory practice copy; unmapped changes never reach the code; every recorded change can be undone.
  - 2F Journal and export: three reading levels, log and change export, full Phase 2 test. Gate: all earlier gates pass again, zero console errors.
  - 2G Session restore: after a refresh, reload the repository from its saved address and restore the screen, layout, edits, Log and History; Back to Start and Reset session clear saved data. Gate: refresh returns to the same screen with the same work; no secrets or file contents in storage; failed reload shows a clear error and a reset path.

### Phase 3: Automation & Auto-Fix (`AI_MODE=live`)
- **Allowed Scope:**
  - Flip backend AI Adapter to `AI_MODE=live` using a **server-side free-tier fallback chain** (never expose keys in frontend code):
    1. **Primary:** Google AI Studio (Gemini Flash free tier) for structured JSON & code diffs.
    2. **Backup 1:** Groq (free tier) for fast error parsing and lightweight fixes.
    3. **Backup 2:** OpenRouter (`:free` coding models) via OpenAI-compatible endpoint.
    4. **Optional BYOK:** User-supplied API key override in settings.
  - Wire the target application's autonomous runtime loop (`build -> catch error -> generate fix -> verify`) with a **hard 3-attempt runtime retry cap** per error that pauses and notifies the user if unresolved. *(Distinct from the AI coding agent's 2-strike debugging limit.)*
- **Forbidden in Phase 3:** Visual redesigns, CSS polishing, or unapproved feature additions.
- **Phase-Exit Test Gate:**
  - Feed a deliberate bug into the system: verify it detects the error, generates a valid patch, and verifies the fix.
  - Verify the loop halts cleanly at the 3-retry cap on an unsolvable error without infinite looping.
  - Simulate a `429` rate limit on the primary provider and verify automatic fallback to the backup provider.
- **Sub-phases (added by the user's approval, 2026-11-26).** Phase 3 is built in sub-phases 3A and 3B, one at a time. Design, spec, and implement ONLY the Current Active Sub-phase. The human advances sub-phases, never the agent. PatchBay's own screens stay black-and-white wireframe. `AI_MODE=mock` stays the default and keeps working.
  - **3A Live AI in AI Chat** (spec `11-live-ai-chat`): live providers behind `api/assistant.ts` with the Gemini, Groq, OpenRouter fallback; a Context Engine (smallest useful redacted context, playbook cards, session cache); a Model Router (light and heavy tiers); a notice before the first live request; the AI starting safe actions; AI-proposed changes through Approve, Reject, and Undo; at most 3 AI fix attempts per finding. Gate: the three Phase 3 exit-gate items above pass with fake providers, plus no secret, key, or AI text in the Log, storage, or errors. A real-key check is run by the user and stays Unverified until then.
  - **3B Autonomous Skeleton Crew** (user-approved 2026-11-27, replaces the earlier "Live AI in the Journal and Skeleton Crew" draft; overall plan `PHASE_3B_IMPLEMENTATION_PLAN.md`). Built in three steps, one at a time, each with its own spec, "Go" per task, and gate. Every 3A rule stays: PatchBay's own screens stay black-and-white wireframe, `AI_MODE=mock` stays the default, free tiers only, no key in the browser, no AI text in the Log, storage, or errors, only the practice copy changes. 3B adds exactly one runtime dependency, `acorn` (approved), in 3B-1. The user authorised raising the old Phase 2 practice limits (8 steps, 2 files, 2,000 characters) as needed in 3B-3.
    - **3B-1 Code checks, Visual Linter, sandbox compatibility** (spec `12-code-checks-visual-linter`): `acorn` JavaScript check (module then script, inline `<script>` blocks), balance check for JSX and TypeScript, HTML structure and CSS checks (`replaceSync`, labelled "Possible invalid CSS"), narrow candidate-and-verify syntax fixes, a Visual Linter at 375, 768, and 1024 px ("static render (scripts off)", confidence, "can't measure", overlap with a false-alarm filter), zero-AI CSS recipes with re-measure and automatic undo, Look-only CDN styles and fonts, Run-scripts CDN hosts and a `localStorage` stand-in. **No AI request in 3B-1.** Gate: all Phase 2 and 3A tests pass again; the new checks and recipes pass their tests, the real-browser run, the mutation checks, and an independent review; the bundled samples show no unexplained new finding.
    - **3B-2 Knowledge Library, Repo Map, 10 visual templates** (spec `13`, not started): 20 to 30 scoped library entries for basic-to-intermediate HTML, CSS, and JavaScript with zero-token lookup; a lightweight JavaScript repo map (core idea of Aider's repo map, no heavy parser); 10 curated visual templates as data that change only the imported project. Gate: 3B-1 gates pass again; every template passes the contrast check; the same privacy rules hold.
    - **3B-3 Autonomous Crew Run v2** (spec `14`, not started): a run over many findings (code checks, then recipes, then AI work), Review mode by default with one Autopilot toggle per run (a change cap, each change applied only after its own re-check, "Undo this whole run"), wait-and-resume on provider limits with absolute timestamps, a safe `paused_quota` stop, and refresh-safe checkpoints that reuse the 2G restore and replay diffs only when file hashes match. Gate: 3B-1 and 3B-2 gates pass again; the 3-attempt cap per finding holds; the AI never approves; no half-applied change after a stop.

### Phase 4: Visual UI & UX
- **Allowed Scope:**
  - Apply `.kiro/steering/ui-standards.md` (minimalist, high-contrast CAD-style grayish-white or disciplined dark theme, crisp spacing, clear visual hierarchy).
  - Replace placeholder controls with custom inline SVGs (no emojis in production UI).
  - Implement clear loading, streaming, empty, and error states plus responsive layouts for narrow laptop and mobile viewports.
- **Forbidden in Phase 4:** Modifying core backend API schemas or altering the automation/auto-fix loop logic.
- **Phase-Exit Test Gate:**
  - Re-run Phase 2 and Phase 3 verification tests to prove styling introduced zero functional regressions.
  - Verify layout integrity on narrow screens and confirm all loading/empty/error states render cleanly.

### Phase 5: Polish & Hardening
- **Allowed Scope:**
  - Edge-case hardening (empty inputs, malformed payloads, network timeouts/offline recovery, oversized logs).
  - Resource cleanup for 4 GB RAM environments (dispose WebGL/canvas contexts, clear timers/event listeners, bound in-memory logs).
  - Final end-to-end smoke test and documentation/write-up verification.
- **Forbidden in Phase 5:** Adding new unapproved features or refactoring working architecture.
- **Phase-Exit Test Gate:**
  - Fresh run from clean initial state completes every core flow end-to-end with zero blockers and low memory footprint.

## 3. Anti-Rationalization Rules
- Never add colors or themes early in Phases 1–3; stay strictly wireframe until Phase 4.
- Never wire live LLM API keys in Phases 1–2; debug contracts with `AI_MODE=mock` first.
- Never bypass the Phase 3 in-app 3-attempt retry cap.
- Never advance to the next phase automatically—present verification proof via `verification-and-review` and ask the human to update `Current Active Phase` in `.kiro/steering/build-phases.md`.
