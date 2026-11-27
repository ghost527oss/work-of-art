# Requirements: 12 Live AI in the Journal and Skeleton Crew (Phase 3, Sub-phase 3B)

Sources: steering `build-phases.md` (Phase 3 and its 3B line); spec 11 (3A, accepted by the user after a real-key check on 2026-11-26); specs 06 (Skeleton Crew) and 09 (Journal and playbook); your approved 3B Alignment Brief and answers 1 to 12.
Active product phase: **Phase 3, Sub-phase 3B**. PatchBay's own screens stay black-and-white wireframe with no animation. `AI_MODE=mock` stays the default. **No new runtime dependency.** Free tiers only. No bring-your-own-key setting.

## 1. Purpose

3B puts the live AI of 3A to work in two more places, as **explanations only**:

1. **Journal, "Explain in my project":** a button on each lesson and each flow. The AI explains it using your real project.
2. **Skeleton Crew, Screen 5:** "Review this finding" on a finding, "Ask the AI to fix it" (a hand-off to AI Chat), and one opt-in batch of AI narration for up to 8 findings.

In simple words: the fixed text you already have stays exactly as it is. Next to it, a button asks the AI to say the same thing about **your** files. The AI text is shown in its own labelled block, is never saved, never goes into the Log, and never goes into a download. Nothing here can change a file.

Everything from 3A is reused unchanged: the Model Router (light models), the Context Engine, the saved answers, the first-request notice (shared, once per page session), secret redaction, the "Live AI is not set up" state, and mock mode.

## 2. Scope

### In scope
- A reading level (Simple, Practical, Deeper) on AI requests, so the AI writes at the level the Journal is set to.
- "Explain in my project" on **lessons** and **flows** in the Journal.
- "Review this finding" on the finding detail of Screen 5.
- "Ask the AI to fix it": opens AI Chat with that finding chosen and a fix request typed in. It sends nothing by itself.
- One opt-in button for **batch AI narration** of up to 8 findings (one request).
- One shared first-request notice, one shared "Include a few redacted code lines" switch (off by default), and a disabled state with "Live AI is not set up."
- A soft note when an AI explanation breaks the writing rules of the chosen level.
- Fake-provider tests, a browser run, and a real-key checklist for you.
- `traceability/PLAN.md` nodes and README notes.

### Out of scope
- AI explanations on concept cards, on the Journal overview, or on the sorting lesson's file list (a lesson with no skill still gets the button; concept cards do not).
- Automatic AI calls of any kind (no AI on open, on scroll, or on every crew step).
- Any change to a file from 3B code. The only path to a change stays AI Chat's Approve flow from 3A.
- Putting AI text in the Journal download, the Log, the saved session, or any storage.
- Streaming, chat history, bring-your-own-key, colours, themes, animation (Phase 4).

## 3. Glossary

- **Origin:** where a request came from: `chat`, `journal_lesson`, `journal_flow`, `finding_review`, or `crew_narration`.
- **Target:** the thing being explained, with a short key: a lesson id, a flow id, a finding id, or the narration batch.
- **Explanation block:** the labelled area under a lesson, flow, or finding that shows the AI text.
- **Level:** `simple`, `practical`, or `deeper`, the Journal's saved reading level.
- **Redacted code lines:** a few lines around the point of interest, with likely secrets removed, sent only when the shared switch is on.

## 4. Functional requirements

### R1. Reading level and the new request kinds
1. THE SYSTEM SHALL add an optional `level` (`simple`, `practical`, `deeper`) to an AI request. THE SYSTEM SHALL tell the model, in the fixed system text, which level to write at and the rules of that level (Simple: at most 3 short sentences, everyday words, no code characters; Practical: at most 6 sentences, name the file and the line; Deeper: at most 10 sentences, may say why).
2. THE SYSTEM SHALL add the task type `narrate` and the answer type `narration` (a list of 1 to 8 short lines). A `narrate` request carries a list of up to 8 findings (skill id, path, line). A valid `narration` answer has exactly one line per finding, in the same order, each at most 400 characters.
3. THE SYSTEM SHALL raise the allowed connection facts in a request from 3 to 6. Chat requests keep 3. Only flow requests use up to 6. An `act` request still carries none.
4. THE SYSTEM SHALL add the level and the findings list to the saved-answer key, so a different level or a different list never gives a stale answer.
5. THE SYSTEM SHALL keep every 3A rule: strict request schema, redaction on the browser and the server, one request at a time, 15 s per attempt and 25 s in total, no AI text in the Log.
6. A `narrate` request SHALL never carry code lines, whatever the switch says. The model sees only fixed text about each check (from the skill book), the path and the line.

### R2. Journal: "Explain in my project"
1. THE SYSTEM SHALL show an **Explain in my project** button inside each lesson (under "In your project") and an **Explain this flow in my project** button under each flow's steps.
2. WHEN pressed, THE SYSTEM SHALL ask the AI as a light-tier `explain` request with the Journal's level, built by the Context Engine:
   - **Lesson:** the lesson's skill id (the server adds that card), up to 3 of its files, and the first listed instance as the point of interest.
   - **Flow:** the flow's files (at most 5) and up to 6 one-line facts taken from its steps (paths, addresses, certainty and line; never source text).
3. THE SYSTEM SHALL show the answer in an explanation block under that lesson or flow, labelled "AI explanation. This is not part of the lesson text." with the provider line, the fallback sentence, the lighter-model warning, and the saved-answer label with **Ask again**, exactly as in AI Chat.
4. THE SYSTEM SHALL keep the fixed lesson and flow text exactly as it is, above the AI block, and SHALL NOT edit, hide, or reorder it.
5. THE SYSTEM SHALL keep each explanation until the repository changes, the mode changes, the practice copy changes, or `reset` (the same triggers as the saved answers), and SHALL keep at most 12 explanations in memory.

### R3. Skeleton Crew: "Review this finding"
1. THE SYSTEM SHALL show **Review this finding with AI** on the finding detail of Screen 5.
2. WHEN pressed, THE SYSTEM SHALL send a light-tier `review_finding` request with the finding's skill id, file, first line, the Journal level, and up to 3 connection facts for that file. It SHALL send redacted code lines only when the shared switch is on.
3. THE SYSTEM SHALL show the answer in an explanation block under the finding, with the same labels as R2.3. The AI's review is advice only. It SHALL NOT change the finding's certainty, severity, or fix label, and SHALL NOT say a problem is fixed.
4. THE SYSTEM SHALL ask nothing when a finding no longer exists (a re-scan removed it): the button is hidden with the detail.

### R4. Hand-off: "Ask the AI to fix it"
1. THE SYSTEM SHALL show **Ask the AI to fix it** next to the review button for findings of any fix label.
2. WHEN pressed, THE SYSTEM SHALL open AI Chat on the Studio screen with: the finding chosen in "About a finding", the task "Suggest a change", the instruction "Propose a fix for: <check title> in <file>, line <n>." typed in, and the contents box ticked and visible. It SHALL send nothing. You press Send.
3. THE SYSTEM SHALL then use the 3A flow unchanged: the first-request notice, the heavy-tier request, the check against the real file, an **AI-proposed change** card, Approve or Reject, the re-scan, and the cap of 3 AI proposals per finding.
4. THE SYSTEM SHALL clear the prefill after AI Chat used it, so reopening AI Chat later does not retype it. Typed text you changed is never overwritten once you start editing.

### R5. Batch AI narration (opt-in)
1. THE SYSTEM SHALL show one button, **AI narration for the top 8 findings (1 request)**, near the crew narration on Screens 4 and 5, and nowhere else. It is never pressed for you.
2. WHEN pressed, THE SYSTEM SHALL pick up to 8 findings (highest severity first, then file and line), send one light-tier `narrate` request, and show the lines in a separate block, "AI narration", under the fixed narration.
3. THE SYSTEM SHALL keep the fixed crew narration, the Log lines, the run speed, and every crew step unchanged. The AI lines are not written to the Log, are not saved, and do not replace the Log text.
4. WHEN there are more than 8 findings, THE SYSTEM SHALL say how many were left out. WHEN there are none, the button is disabled with "No findings to narrate."
5. THE SYSTEM SHALL show each AI line with its file and line so you can match it to the finding.

### R6. One shared notice, one shared switch, plain states
1. THE SYSTEM SHALL use the 3A first-request notice for these buttons too. It is shown once per page session wherever the first live request is made. WHILE the notice is open, THE SYSTEM SHALL hold exactly one request, and show the notice in the place where its button is (the Journal, Screen 5, or AI Chat), with **OK** and **Cancel**.
2. THE SYSTEM SHALL discard a held request when you press Cancel, leave that screen or panel, press Stop or `reset`, change the repository, or the mode changes. It SHALL send a held request only on **OK**, once, as in 3A.
3. THE SYSTEM SHALL show one switch, "Include a few redacted code lines when asking the AI", off by default, in the Journal and on Screen 5. The setting is shared, kept in memory only, and ignored by narration (R1.6).
4. THE SYSTEM SHALL disable the 3B buttons, with the plain line "Live AI is not set up.", when the server says live mode has no usable key, and with "Checking the AI mode..." while the mode is being checked. WHEN the mode could not be checked, the buttons stay enabled and the notice comes first.
5. IN mock mode THE SYSTEM SHALL keep the buttons enabled and show the canned example clearly labelled "Mock mode: this is a canned example. No AI model was used." (no provider line).

### R7. What is shown, kept, and never kept
1. THE SYSTEM SHALL show AI text only as plain React text inside the explanation blocks.
2. THE SYSTEM SHALL NOT write AI text, the question, or code lines to the Log, the saved session, the Journal download, the patch export, the Log download, or browser storage. Log lines for these requests hold only the task type, the origin word (`journal_lesson`, `journal_flow`, `finding_review`, `crew_narration`), counts, the provider, the tier, and whether a saved answer was reused.
3. THE SYSTEM SHALL leave the Journal download and the Log download byte-for-byte what they are without any AI explanation (a test proves it).
4. THE SYSTEM SHALL end every AI explanation and saved answer when the repository changes, `reset`, a mode change, or any change to the practice copy (Approve, Undo, Redo, an Edit pad change).

### R8. Soft check of the writing level
1. WHEN an explanation for the Journal or a review comes back, THE SYSTEM SHALL run the existing level rules (`checkLessonText`) on its summary. IF it breaks them, THE SYSTEM SHALL still show the answer, with the small note "This wording may not follow the <Level> rules: <reasons>."
2. THE SYSTEM SHALL NOT retry, change models, or count a bad answer because of this check. Narration lines are not checked.

### R9. Safety carried over from 3A
1. THE SYSTEM SHALL treat all AI output as untrusted, as in 3A. File names, flow titles, and facts taken from the repository are data (inside data blocks), never instructions.
2. THE SYSTEM SHALL refuse any `action`, `patch`, or `plan` answer to these requests (they are not allowed kinds for `explain`, `review_finding`, or `narrate`).
3. THE SYSTEM SHALL keep: one request at a time across AI Chat, the Journal, and Screen 5 (a second press while one runs is ignored), Cancel, Stop, and stale-id rules.
4. THE SYSTEM SHALL keep the server stateless and its log to codes only.

### R10. Wireframe UI rules
1. Black and white only, no transition, no animation, buttons at least 44 px tall, keyboard and touch use, no sideways scrolling at 375 px.
2. Each explanation block has explicit empty (not asked yet), pending (with Cancel), error (with Retry), and answered states.

### R11. Tests and honesty
1. THE SYSTEM SHALL be tested with fake providers only, plus a browser run on the built app. THE SYSTEM SHALL label real-provider behaviour **Unverified** until you run the real-key checklist for 3B (design section 13).

## 5. Non-functional requirements
1. No runtime dependency is added.
2. Memory is bounded: at most 12 explanations, the 30-entry saved-answer cache from 3A, one request in flight.
3. No file in `src/engine/live/` is imported by browser code (3A rule stays).
4. Every new file carries an `@node: F12.x` tag.

## 6. Acceptance and verification gate

3B is done when all of these hold. Each is measured, not assumed.

1. **3A unchanged:** every 3A and Phase 2 test that is not on the changed list (design 4.3) passes without edits. AI Chat behaves as in 3A.
2. **Contracts:** `level`, `findings`, `narrate`, `narration`, and the 6-fact limit accept valid input and reject invalid input (extra fields, bad skill id, more than 8 findings, a finding path not in the selected files, 7 facts).
3. **Server:** the prompt has the LEVEL section and the findings section in data blocks; a narration answer with the wrong number of lines, a patch, an action, or a plan is a bad answer; every reason code word is shown in plain words.
4. **Context Engine:** the lesson, flow, finding, and narration request builders (sizes, focus per file, 6 facts, no snippets without the switch, never any for narration, no connection facts for `act`).
5. **Cache:** the level and the findings list are part of the key; ending triggers clear the explanations too.
6. **Explainer:** pending, answered, failed, cancelled, saved-answer, and ask-again states; one request at a time across AI Chat, Journal, and Screen 5; at most 12 entries; the soft level note.
7. **Notice:** shared across the three places, shown where the button is, held request never fires late (every discard event tested), shown once per session.
8. **UI (server render):** buttons present only when a binding is given (existing screens unchanged without it); disabled, mock, checking, and answered states; explanation labels; the narration block; the hand-off prefill in AI Chat.
9. **Privacy (sentinels):** secrets, keys, questions, code lines, and AI text never appear in the Log, storage, exports, errors, or server logs; the Journal download and Log download are byte-identical with and without explanations.
10. **Injection:** instructions inside a file, a file name, a flow title, or a fact change nothing.
11. **Hand-off:** it opens AI Chat with the prefill and sends nothing; the cap of 3 still applies; Approve is still required.
12. **Static checks:** same as 3A plus: no AI-explanation code touches storage or any export module; new CSS only `#000` and `#fff`, no motion; no new dependency.
13. **Full suite:** `npm run typecheck && npx vitest run && npm run build` passes. File and test counts and the build size are reported.
14. **Browser run** (built app, fake provider server): Journal lesson and flow explanations, Screen 5 review, hand-off to AI Chat, batch narration, shared notice once, disabled and mock states, saved answers, level note, 375 px, blocked storage, zero unexpected console errors.
15. **Mutation checks** and an **independent review**, as in 3A.
16. **Real-key check:** written steps for you. Until you run them, real-provider behaviour is **Unverified**.

## 7. Decisions for your approval

These go slightly beyond or clarify your answers. Each has my recommendation.

1. **"Opt-in switch" for narration is a button, not a switch.** Pressing it sends one request. A switch that stays on could spend your free quota without you pressing anything. (R5.1)
2. **AI narration is shown in its own block below the fixed narration, not in place of it.** Replacing would put AI text into the Log lines, which stay fixed text. (R5.3)
3. **The hand-off ticks the "Include contents" box for you, visibly,** because a patch needs the lines. You can untick it before Send. (R4.2)
4. **Narration never sends code lines.** One batch of 8 findings with code would be large. The model gets the fixed text of each check plus path and line. (R1.6)
5. **New contract items:** the task `narrate`, the answer `narration`, `level`, `findings`, and up to 6 connection facts (chat stays at 3). (R1)
6. **The reading level used is the Journal's saved level** for the Journal, the review, and the narration. (R1.1)
7. **Lessons about the sorting step (no skill) still get the button;** concept cards, the overview, and the file list do not. (Scope)
8. **Mock mode shows canned examples** on these buttons, labelled, so the toggle keeps working. (R6.5)
9. **Number of the plan:** spec `12`, tasks `N1` to `N9`, nodes `F12.1` to `F12.8` (you asked for `N` because `M` was used in spec 02).
