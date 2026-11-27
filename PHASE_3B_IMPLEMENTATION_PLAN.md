# Phase 3B implementation plan: Autonomous Skeleton Crew

**Status:** plan for your review. No code is written. Only the 3B-1 spec (spec 12) exists so far; the 3B-2 and 3B-3 specs are written later, one at a time, after you approve each step.

**Sources:** your `Skeleton_Crew_Autonomous_Vision.md`; your discussion answers of 2026-11-27; the real code in this repository (checked on 2026-11-27); `build-phases.md`. The Blueprint v4 file was used for the base idea only. Where the Blueprint and the built code differ, the built code wins.

"The practice copy" means PatchBay's private copy of the project you loaded. PatchBay never changes your real repository.

---

## 1. What 3B is, in plain words

3B turns Skeleton Crew from "finds problems and waits for you" into a helper that can **find, fix, and re-check problems by itself while the browser tab is open**, using as few AI requests as possible.

It does this in three layers, cheapest first:

1. **Code the app can check itself (0 AI requests):** broken JavaScript, broken HTML tags, doubtful CSS, and visual problems such as text that does not fit, buttons that are too small, or text that is hard to read.
2. **A small written library (0 AI requests to look things up):** known problems with known fixes, a short map of how the files connect, and 10 design templates. The AI only adjusts them to your project.
3. **A run that keeps going:** Review mode (you approve every change) or Autopilot (changes apply to the practice copy by themselves, each one checked, with "Undo this whole run"). If the free AI says "too many requests", the run waits and continues by itself.

## 2. The three sub-phases

| Sub-phase | Spec | Name | Goal | Needs |
|---|---|---|---|---|
| **3B-1** | 12 (written) | Code checks, Visual Linter, sandbox compatibility | Everything that needs **no AI**: `acorn` JavaScript check, HTML and CSS checks, narrow automatic syntax fixes, the Visual Linter with confidence, zero-token CSS recipes with automatic undo, CDN styles and fonts, Run-scripts CDN and `localStorage` stand-in | Phase 2, 3A |
| **3B-2** | 13 (to write) | Knowledge Library, Repo Map, 10 templates | The written knowledge the AI is given: 20 to 30 fix recipes, a compact file map, 10 visual templates | 3B-1 |
| **3B-3** | 14 (to write) | Autonomous Crew Run v2 | The run that keeps going: queue, Review and Autopilot, wait-and-resume, "Undo this whole run", saved checkpoints | 3B-1 (needs 3B-2 for the best AI answers, but works without it) |

Rules for all three:
- One sub-phase at a time. Each has its own spec, its own "Go" per task, and its own gate. I do not start the next one until you say so.
- PatchBay's own screens stay black-and-white wireframe with no animation. The 10 templates are data that change only the imported project (the Edit pad already does this).
- `AI_MODE=mock` stays the default and keeps working. Every sub-phase must pass the full existing test suite.
- **Full 3A rigor** for each sub-phase: unit and integration tests, static security checks, mutation checks, a browser run, an independent review, and a report.
- Free tiers only. No paid service. No key typed into the browser.
- Dependencies: exactly one new runtime package in all of 3B, `acorn` (approved), added in 3B-1.

## 3. What each sub-phase builds

### 3B-1 (spec 12, written, 12 tasks V1 to V12)

| Part | What you get |
|---|---|
| JavaScript check | `acorn` reads `.js`, `.mjs`, `.cjs`, and inline `<script>` blocks in HTML. First as a module, then as a plain script. Exact line and column. Plain-English messages. No `eval`. |
| JSX and TypeScript | A "brackets and quotes balance" check, labelled "balanced" and never "valid". |
| HTML check | Tags that do not close, stray closing tags, repeated ids, missing required attributes. |
| CSS check | `new CSSStyleSheet().replaceSync` finds rules the browser drops. Labelled "Possible invalid CSS". An own brace counter finds braces that do not match. |
| Automatic syntax fix | Candidate-and-verify: try a few tiny repairs at the error spot, keep one only if exactly one makes the check pass. Honest limit: this will work for a minority of mistakes (see spec 12 design 7). |
| Visual Linter | Measures the rendered preview at 375, 768, and 1024 px: overflow (already built), overlap, tap targets, small text, contrast, pictures with no size limit. Each result has a number, an element, a confidence, and a place in the code. "Can't measure" when it cannot. Labelled "static render (scripts off)". |
| Recipes and auto-undo | Fixed, zero-AI CSS fixes for objective problems on plain HTML elements. After each fix the page is measured again at all three widths. It is kept only if the problem is gone and nothing new appeared. Otherwise it is undone automatically. |
| Sandbox: Look-only | Styles and fonts from a short list of CDN hosts load, so real pages look styled. Scripts stay blocked. |
| Sandbox: Run scripts | Your scripts plus a short list of CDN script hosts. A stand-in for `localStorage` and `sessionStorage`. Scripts now run after the page content, not before it (this fixes a real problem found in the code). |
| Blocked-resources report | A plain list of what the preview did not load and why. |

### 3B-2 (spec 13, to write, about 7 tasks R1 to R7)

| Part | What you get |
|---|---|
| Knowledge Library | A data file of **20 to 30 entries**, organised as project type, pattern, bug category, fix. Basic-to-intermediate HTML, CSS, and JavaScript only. Each entry has the problem, how to recognise it, the fix template, and how to check the fix. Strict schema and tests. Zero-token lookup next to the existing playbook lookup. |
| Repo Map | A compact text map of the project (files, imports, routes, function and component names), at most about 3 KB, built from the connection map PatchBay already has plus a small name extractor. Core idea of Aider's repo map, no heavy parser, no WASM. Sent to the AI instead of whole files. |
| 10 visual templates | Ten templates as data: palette, gradient, font stack (system fonts), button shapes and placement for phone and desktop, plus CSS variables. Every colour pair must pass the 4.5:1 contrast test from 3B-1. The AI picks and adjusts one; the change goes through Approve like any other. |
| AI request changes | The request and prompt gain optional "library entry", "repo map", and "template" blocks (strict schema change, so it needs updated contract tests). |

### 3B-3 (spec 14, to write, about 11 tasks A1 to A11)

| Part | What you get |
|---|---|
| Crew Run v2 | A run over many findings. Order: code checks first, then visual recipes, then AI work, so the AI is used last. Raises the old Phase 2 limits (see section 6). |
| Review and Autopilot | Review is the default: you approve each change, exactly like today. One Autopilot button per run: changes apply to the practice copy by themselves, **only** after a re-check passes, up to a change cap. Any failed re-check reverts that change. |
| Undo this whole run | One button reverts every change made by the run, in reverse order. |
| Wait-and-resume | If every free provider is busy, the run pauses with a live countdown and continues by itself. Waits use saved absolute times, so a sleeping background tab cannot cause a wrong wait. |
| Quota states | Per-minute limit: route to another provider, or wait. Daily limit used up everywhere: the run stops safely as `paused_quota`, with no half-applied change. |
| Checkpoints | After every step a small checkpoint is saved (job id, step, finished and waiting ids, repository address, history diffs and file hashes, provider status). Never file contents, never secrets, never AI text. After a refresh, the repository is loaded again and the diffs are replayed **only if the file hashes match**. Otherwise PatchBay refuses and says why. This reuses the 2G restore flow. |
| Provider wait time | `api/assistant.ts` tells the browser how long a busy provider asked to wait, and whether it looks like a per-minute or a daily limit. (A 3A file changes here, by your approval.) |
| Task-based routing | The Model Router already sends light work to fast models and heavy work to strong ones. 3B-3 adds the crew's job types to that choice. |

## 4. Order, time, and honest risk

Today is Friday 2026-11-27. You want 3B frozen on **Tuesday 2026-12-01**, leaving 2026-12-02 to 12-04 for Phase 4 and the demo video.

That is about 4.5 working days. 3A was 12 tasks with about 4,000 lines of new tests. 3B-1 alone is about the same size as 3A. All of 3B at full rigor is roughly three times 3A.

**I can't promise all three sub-phases at full rigor by Dec 1.** I would rather say that now than discover it on Dec 1. Proposed way to handle it:

| Step | Target | What decides what happens next |
|---|---|---|
| 3B-1 | done by end of 2026-11-29 | After the 3B-1 report you decide whether to continue. |
| 3B-3 core | done by end of 2026-11-30 (queue, Review, Autopilot, Undo run, wait-and-resume, checkpoints) | This is the part that makes the product "autonomous", so it has priority over 3B-2. |
| 3B-2 | 2026-11-30 to 12-01, as much as fits | The Library and Repo Map are useful but the run works without them. Templates can shrink to what fits. |
| Freeze | 2026-12-01 | Whatever is unfinished is listed in the final 3B report as **not built**. |

**My recommendation:** build 3B-1, then **3B-3, then 3B-2**. Same three sub-phases, only the order of the last two changes. The spec numbers stay (13 = Library, 14 = Run). If you prefer 3B-2 before 3B-3, say so; the risk is that the autonomous run is the part that gets cut.

**Cut line if time runs out (in this order, last cut first):** templates 6 to 10, Repo Map function names, Library entries 21 to 30, recipes for overlap and media size, Run-scripts CDN hosts, the daily-quota detail in 3B-3. I will not cut tests, mutation checks, or privacy checks to save time. If those would have to go, I will stop and ask you.

Other real limits (also in each spec):
- **Free AI quota** is small (3A found about 20 Gemini requests a day and about 8,000 Groq tokens a minute). An autonomous run will hit it. The zero-token layers (3B-1) are what keep a run useful. This is why 3B-1 comes first.
- **Browser-only checks** (CSS reader, contrast, tap size, overlap) can't run in the node test environment. They are proven in a real-browser run, as in 3A, and by pure functions that take measurements as plain data.
- **Plain HTML only for recipes.** Recipes write to elements in plain `.html` files that PatchBay can map exactly. React, Vue, and component-picture elements stay "guided".
- **Tailwind via `cdn.tailwindcss.com`** is a script, so it works only in Run-scripts mode, not in Look-only mode.
- **Real images** (PNG, JPG) are not fetched, so they stay placeholders in the preview. The Visual Linter cannot know a real picture's size. It says so.
- **Mutation checks and real-browser runs take time.** They stay.

## 5. Safety rules that do not change in 3B

- No `eval`, no `new Function`, no running imported code in PatchBay's own page.
- The preview iframe keeps its sandbox: no forms, popups, downloads, or top navigation. Run-scripts mode keeps an opaque origin (no `allow-same-origin`). `connect-src` stays `'none'` in both modes.
- Allowed outside hosts are fixed lists in one config file. Host matching is exact (see spec 12 design 6).
- No AI text, no question text, no file contents, no secret, and no key in the Log, in browser storage, in the saved checkpoint, or in errors. Tests use sentinel values to prove it.
- The AI never approves, rejects, or resets. In Autopilot, the **app** applies a change after its own re-check passes. The AI cannot do it. You choose Autopilot per run, and can stop it any time.
- At most 3 AI fix attempts per finding (the 3A cap stays).
- Nothing is pushed to GitHub. Only the practice copy changes.

## 6. Limits I will change (you authorised this)

| Limit | Today | Where | Planned change | When |
|---|---|---|---|---|
| Steps per run (`maxSteps`) | 8 | `workLimits.ts` | raised for Crew Run v2 (proposal: 60) | 3B-3 |
| Practice files (`maxPracticeFiles`) | 2 | `workLimits.ts` | proposal: 10 | 3B-3 |
| Practice file size | 20 KB | `workLimits.ts` | unchanged unless needed | 3B-3 |
| Diff size (`maxDiffChars`) | 2,000 | `workLimits.ts`, `scanFix.ts` | unchanged in 3B-1 (all new fixes are tiny); proposal 4,000 for AI patches in 3B-3 | 3B-3 |
| History entries | 50 | `workLimits.ts` | proposal: 120 | 3B-3 |
| Layout check time | 3 s | `previewLimits.ts` | 6 s (three widths, more checks) | 3B-1 |
| Runtime dependencies | 3 | `aiStatic.test.ts` | 4 (`acorn`) | 3B-1 |

Each number is provisional and lives in one config file, like every other limit.

## 7. What changed from the old draft of spec 12

The old draft (from PR #6) was "AI explanations in the Journal and review/narration in Skeleton Crew". Your vision replaces it. These old ideas are **not** part of 3B any more:
- "Explain in my project" buttons in the Journal.
- "Review this finding" and batch narration in Skeleton Crew.

They can come back later if you want them. I removed them rather than carry two plans. The old spec files were renamed and rewritten in place (git history keeps them).

## 8. Steering change

`.kiro/steering/build-phases.md` gets a rewritten 3B block with the three sub-phases (authorised by you). I did **not** change the `Current Active Phase:` line (it already says `Phase 3 (Sub-phase 3B)`). When you approve this plan, tell me if you want it to say `Sub-phase 3B-1`.

## 9. Files and numbering

| Item | 3B-1 | 3B-2 | 3B-3 |
|---|---|---|---|
| Spec folder | `.kiro/specs/12-code-checks-visual-linter/` | `.kiro/specs/13-knowledge-library-repo-map/` | `.kiro/specs/14-autonomous-crew-run/` |
| `plan_id` | `P3B1-CHECKS-LINTER` | `P3B2-LIBRARY-MAP` | `P3B3-AUTONOMOUS-RUN` |
| PLAN nodes | F12.1 to F12.11, F12 gate | F13.x | F14.x |
| Task ids | V1 to V12 | R1 to R7 | A1 to A11 |
| Branch | `feat/3b-1-checks-linter` | `feat/3b-2-library-map` | `feat/3b-3-autonomous-run` |

Task ids V, R, and A are not used by earlier specs (those use T, M, S, B, C, D, E, P, J, K, L).

## 10. What I need from you next

1. Review this plan and spec 12 (`requirements.md`, `design.md`, `tasks.md`) and `traceability/PLAN.md` (F12 section).
2. Answer the decisions listed at the end of spec 12 `requirements.md` (section 7).
3. Say whether the order should be 3B-1, 3B-3, 3B-2 (my recommendation) or 3B-1, 3B-2, 3B-3.
4. Say "Go V1" (or another task) when you want code to start. Nothing is built until then.
