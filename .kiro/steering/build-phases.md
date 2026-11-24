---
inclusion: always
---

# 5-Phase Product Build Strategy

Current Active Phase: Phase 2

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

### Phase 2: Movement & Interactive Controls
- **Allowed Scope:**
  - Interactive frontend mechanics and layout movement (repositioning/sliding panels, moving elements, collapsible workspaces).
  - Execution controls: pause/resume loop, step-by-step inspection, manual edit, and approve/reject actions synced with backend state.
- **Forbidden in Phase 2:** Visual theming, decorative styling, custom SVG polishing, or real LLM API calls.
- **Phase-Exit Test Gate:**
  - Every interactive control (move, pause, resume, inspect, approve/reject) updates state predictably.
  - State survives a page refresh and handles rapid repeated clicks without desyncing or crashing.

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
