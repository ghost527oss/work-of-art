# Requirements: 07 Sandbox Preview (Phase 2, Sub-phase 2E-1)

Sources: steering `build-phases.md` (Phase 2 text, sub-phase 2E-1 and its gate); the approved Phase 2 blueprint (section 5: the safe left Sandbox and the three honest display modes); specs 01 to 06 (what is built or specified); your answers for 2E (look-only by default with an explicit run-scripts switch, external content blocked, a static approximate Component Workbench, everything from the preview treated as untrusted plain text, layout overflow as the 17th finding).
Active product phase: **Phase 2, Sub-phase 2E-1**. PatchBay's own screens stay black-and-white wireframe, with no animation. `AI_MODE=mock` only. **No new runtime dependency.** No AI call and no network call from PatchBay's code. **This spec assumes 2A, 2B, 2C, and 2D are built and approved.**

## 1. Purpose

2E-1 fills the **Sandbox** on the left of the Studio with a safe preview of the loaded project, in one of three honest modes, and adds the **layout overflow check** that needs a real preview to measure. 2E-2 (the Edit pad) builds on this.

In simple words: PatchBay shows you what the imported website looks like inside a locked box. By default the page cannot run any of its own code, so it cannot do anything to PatchBay. If you want to try the page's own scripts, you turn them on yourself, and even then the box has no way out and no way to the internet. If the project is a React or similar app that cannot run here, PatchBay shows an approximate picture that is clearly labelled as approximate. If it is a backend, it shows the code instead.

## 2. Scope

### In scope
- **The Sandbox panel** in the left area of Screens 3, 4, and 5 (replacing the 2A placeholder), with a toolbar for mode, width, reload, and the scripts switch.
- **Three modes:** Live Static Preview, Component Workbench, and Source Inspection, chosen automatically with a visible reason and a manual override.
- **Look-only** (default) and **Run scripts** (explicit switch) for the Live Static Preview.
- **Isolation:** a locked-down iframe, a content security policy, removal of risky tags and external references, and validated messages from the preview.
- **Component Workbench:** a static, approximate picture of React (JSX and TSX) components, with basic Vue and Svelte templates. Nothing is run.
- **Source Inspection:** a read-only file viewer with line numbers and hidden secrets, also used from finding details.
- **The layout overflow check** as the 17th finding, measured in look-only mode at three widths.
- Tests, an isolation browser test with an adversarial page, and `traceability/PLAN.md` entries.

### Out of scope (later sub-phases or phases)
- The Edit pad, selection, style tools, drag handles, and any change to code (2E-2). The preview is **read only** in 2E-1.
- Journal lessons and export (2F). Session restore (2G).
- Running framework code (React, Vue, and so on) or any compiler. Running backend servers or databases (never in the MVP).
- Loading images, fonts, or anything else from the internet or from GitHub at preview time.
- A Content Security Policy for PatchBay's own pages (Phase 5 hardening).
- Colors, themes, and animation in PatchBay's own screens (Phase 4). Live AI (Phase 3).

## 3. Glossary

- **Sandbox:** the left area box that shows the preview.
- **Preview document:** the safe copy of the page that PatchBay builds from the loaded files. The imported files themselves are never changed.
- **Look-only:** no script of the imported project can run. This is the default.
- **Run scripts:** the imported project's own JavaScript runs inside a locked iframe with no network and no way to reach PatchBay.
- **Bridge:** the small message channel from a script-running preview to PatchBay. Everything on it is untrusted.
- **Risky tags:** tags removed from the preview document (`iframe`, `object`, `embed`, `base`, `meta http-equiv`, non-stylesheet `link`, and similar).
- **Placeholder:** a labelled box shown instead of an image, font, or media file that was not loaded.
- **Element table:** the list that links each element in the preview to its place in the source file (file, line, column).
- **Measured finding:** a finding produced by measuring the preview (the layout overflow check), not by reading text.

## 4. Functional requirements

### R1. Display modes
1. THE SYSTEM SHALL offer three modes: **Live Static Preview** (`static`), **Component Workbench** (`workbench`), and **Source Inspection** (`source`).
2. THE SYSTEM SHALL choose a mode automatically and SHALL show, always, "Mode: <name>. Why: <reason>." in plain words. Rules, in this order:
   - Find an **entry page**: root `index.html`, else `public/index.html`, else the shallowest `index.html`, else the first `.html` by path.
   - **Framework signals** are: `package.json` lists `react`, `react-dom`, `vue`, `svelte`, `@angular/core`, `solid-js`, `preact`, `next`, or `nuxt`; or the entry page loads a module script whose file is `.tsx`, `.jsx`, `.ts`, `.vue`, or `.svelte`; or the entry page body holds only an empty app shell (an element with id `root` or `app` and no other text).
   - Framework signals and at least one component can be extracted: **workbench**. Framework signals and none can be extracted: **source** with the reason.
   - No framework signals and an entry page exists: **static**.
   - No entry page: **source** with the reason "No web page was found. This looks like a backend or a library."
3. THE user MAY override the mode with a selector that lists only the modes that are possible for this project. The override is kept until the snapshot changes.
4. THE mode SHALL NOT be saved.

### R2. Isolation (the security rules)
1. THE preview SHALL be an `<iframe>` with a `srcdoc` document built by PatchBay. It SHALL NOT load any URL.
2. THE iframe `sandbox` attribute SHALL be exactly `allow-same-origin` in look-only mode and exactly `allow-scripts` in Run scripts mode. **No other token SHALL ever be present.** In particular `allow-same-origin` and `allow-scripts` SHALL NEVER appear together, and `allow-top-navigation`, `allow-popups`, `allow-forms`, `allow-modals`, `allow-downloads`, `allow-pointer-lock`, and `allow-presentation` SHALL NEVER appear.
3. THE iframe SHALL also set `referrerpolicy="no-referrer"`, an empty `allow=""`, and a `title`. It MAY also set a `csp` attribute equal to the policy in R2.4, which only some browsers use. THE security SHALL NOT depend on that attribute.
4. THE preview document SHALL begin with a `<meta http-equiv="Content-Security-Policy">` that is the first element in `<head>`. THE policy SHALL be exactly one of two strings. **Look-only:** `default-src 'none'; img-src data:; font-src data:; media-src data:; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'`. **Run scripts:** the same string with `script-src 'unsafe-inline'` added.
5. THE preview document builder SHALL be an **allowlist re-serializer**. It reads the page into tokens and writes a new document containing only allowed tags and allowed attributes, with every text and attribute value fully escaped. Anything not on the list is dropped (its text children are kept as escaped text where that is harmless) and counted. Specifically:
   - **Never emitted:** `iframe`, `object`, `embed`, `base`, `meta` (other than PatchBay's own), `link` that is not a stylesheet, `frame`, `frameset`, `applet`, `portal`, `template`, `foreignObject`, SVG `use` and `image` and `script`, and any unknown or custom tag (written as a plain `span` with the note "unknown tag").
   - **Attributes:** only a fixed list is kept (layout, text, accessibility, and form-state attributes such as `class`, `id`, `style`, `alt`, `title`, `width`, `height`, `type`, `value`, `placeholder`, `colspan`, `rowspan`, `role`, `aria-*`, `lang`, `dir`). `integrity`, `crossorigin`, `srcset`, `action`, `formaction`, `ping`, `target`, and `rel` are dropped. Event-handler attributes (`on...`) and `javascript:` addresses are dropped **in look-only mode** and kept (escaped) in Run scripts mode.
   - **Addresses:** every `src` and `href` that points outside the loaded files (`http:`, `https:`, `//`, `data:` other than images) SHALL be replaced and counted. `<a href>` SHALL be written as `#`, with the original address shown only as tooltip text. `@import` and non-`data:` `url(...)` in CSS SHALL be removed.
   - **Raw text:** a `<style>` body SHALL have `<` escaped. A script body (Run scripts mode only) SHALL have `</script` written as `<\/script` and `<!--` written as `<\!--`.
6. THE security boundary SHALL be the iframe sandbox flags and the policy. THE allowlist re-serializer SHALL be a second layer that matters for one thing the sandbox and policy cannot block: a **navigation of the preview frame itself** (a `<meta http-equiv="refresh">`, or in Run scripts mode a script setting `location`). Tests SHALL prove both layers: the builder against hostile pages (including markup that tries to smuggle a `<meta>`), and the sandbox and policy with the builder's removals switched off, except that the navigation case is covered by R2.8.
7. THE preview SHALL have no access to PatchBay's cookies, storage, page, or secrets. In Run scripts mode the preview has an opaque origin, so reading `parent`, `window.top`, `localStorage`, `sessionStorage`, `indexedDB`, or `document.cookie` SHALL fail. In look-only mode no script runs at all.
8. THE preview SHALL NOT make any network request of any kind **that the browser lets a policy block**: scripts, images, fonts, styles, frames, connections, and forms are all blocked. ONE thing cannot be blocked by any policy: a script in Run scripts mode setting its own frame's address. In look-only mode this cannot happen (no script runs and no `<meta>` is emitted). In Run scripts mode, WHEN the iframe loads a second document, THE SYSTEM SHALL remove it, rebuild a fresh preview in look-only mode, and say "The preview tried to leave the page and was reset." The request to that address may already have been made by the browser. The preview holds no PatchBay data, so only what the project's own scripts put into the address could be sent. THE confirmation text (R4.2) SHALL say that the preview cannot be stopped from contacting an address its own scripts choose.
9. THE Sandbox panel SHALL NOT pass PatchBay data (snapshot, store values, secrets) into the preview document. Only the loaded project files that make up the page go in.
10. IN look-only mode PatchBay MAY read the preview's document directly (the iframe is same-origin and no script runs) to measure elements. PatchBay SHALL only read, SHALL never run code inside the preview, and SHALL treat every value it reads as untrusted data: numbers are range-checked and text is shown only as React text.

### R3. The preview document
1. THE builder SHALL start from the **effective content** (the practice copy from 2B, or the loaded file) of the entry page and the files it uses, so approved changes show up.
2. THE builder SHALL inline: stylesheets (`<link rel="stylesheet" href>` to a loaded file) as `<style>`; in Run scripts mode only, scripts (`<script src>` to a loaded file) as inline scripts with `</script` escaped. A reference to a file that was not loaded, or to anything outside the project, SHALL be removed and listed in the report.
3. IMAGES: an `<img>` whose file is a loaded SVG SHALL be shown as a `data:image/svg+xml` image. Every other image, and every video, audio, and font that was not loaded, SHALL be replaced by a **placeholder**: a bordered box with the text "image not loaded: <path>" (or "media not loaded", "font not loaded"), sized from the `width` and `height` attributes or inline style when they exist, else 120 by 80 pixels. A placeholder keeps the original element's id, class, and inline style.
4. THE builder SHALL, in look-only mode, add a `data-pb` attribute (a whole number) to every element start tag in the body, and SHALL return an **element table** linking each number to the source file, tag name, line, column, and the offsets of the start tag.
5. THE builder SHALL return a **report**: removed tags with counts, blocked external references (host names only, at most 20), placeholders (paths, at most 20), the number of inlined files, and any "truncated" flag. THE Sandbox panel SHALL show the report as short plain notes ("3 risky tags removed.", "2 external references blocked: example.com.", "1 image not loaded.").
6. THE builder SHALL be bounded: at most 30 inlined files, at most 1 MB of output, at most 5,000 elements annotated. WHEN a bound is exceeded, THE builder SHALL stop, return a failure with a plain reason, and THE mode SHALL fall back to Source Inspection with that reason.
7. THE builder SHALL be a pure function of its inputs and SHALL NOT use the DOM, the network, or the clock. Its output SHALL be deterministic.
8. THE builder SHALL NEVER include in the output any PatchBay value, any file that is not part of the page, or any text from outside the loaded files except its own fixed strings.

### R4. Look-only and Run scripts
1. THE Live Static Preview SHALL open in look-only mode every time (after loading, after a snapshot change, after a mode change, after a screen change that remounts the panel, and after a reload).
2. THE panel SHALL show a switch **Run this project's scripts** (off by default). Turning it on SHALL first show the text: "This runs the project's own JavaScript inside a locked box. The box cannot reach PatchBay and cannot load anything from the internet. Two limits remain: an endless loop can slow or freeze this tab, and a script can send its own box to another web address, which no setting can stop. PatchBay would reset the preview, and the box holds none of PatchBay's data." with **Turn on** and **Cancel**.
3. WHEN scripts are on, THE preview document SHALL be rebuilt for scripts, the iframe SHALL be remounted with the sandbox value `allow-scripts`, the bridge SHALL be active, and a **Stop scripts** button SHALL return to look-only at any time.
4. THE scripts switch SHALL NEVER be saved or restored, and SHALL be off after a reload.
5. THE preview in Run scripts mode SHALL include one PatchBay-written helper script (the **inspector**) as the first script in the document. The inspector SHALL only report script errors and console lines through the bridge and signal "ready". The page's own scripts MAY tamper with it. Nothing PatchBay does depends on the inspector's honesty.
6. THE bridge SHALL accept only messages that satisfy all of these: sent by the iframe's own window, the origin string `null`, a strict schema (R4.7), at most 8 KB, and under a rate of 20 messages per second. Anything else SHALL be dropped and counted ("N invalid messages ignored.").
7. BRIDGE message types: `ready`, `error` (a message of at most 200 characters and an optional line number), and `console` (a level of `log`, `warn`, or `error` and a text of at most 200 characters). Control characters SHALL be removed. Unknown types and extra fields SHALL be rejected.
8. THE panel SHALL show up to 50 console lines as plain text in a **Preview console** block, and SHALL show nothing from the bridge as anything but text. A message SHALL NEVER cause PatchBay to do anything except add a line to the console, count a ready signal, or count an invalid message.
9. WHEN the second-document rule (R2.8) fires in Run scripts mode, THE panel SHALL return to look-only.
10. THE Edit pad (2E-2) and the layout check (R8) work in look-only mode only. WHEN scripts are on, the layout check button SHALL be disabled with "Turn off scripts to check the layout."

### R5. Component Workbench
1. THE workbench SHALL build an **approximate, static picture** from source and SHALL label it everywhere it appears: "Approximate: read from the source, not run."
2. FOR `.jsx` and `.tsx` files THE extractor SHALL find components (a function or a `const` arrow function whose name starts with a capital letter and whose body returns JSX), convert the returned JSX to HTML, and list them (name, file, exported or not).
3. THE conversion SHALL: rename `className` to `class` and `htmlFor` to `for`; drop event handlers (`onClick` and the like) and `ref`, `key`, and spread attributes; turn `{expression}` in the text or in an attribute value into a visible dashed placeholder "{...}" (it SHALL NOT evaluate anything); keep `style={{ ... }}` only when every value is a string or number literal, else drop it; turn a capitalised tag into the extracted markup of that component when it can be found (same file, or an import that 2C resolved), up to 3 levels deep and with cycle protection, else into a dashed box labelled `<Name />`.
4. FOR `.vue` files THE extractor SHALL use the `<template>` section (with `{{ ... }}` shown as the dashed placeholder, and `v-`, `:`, and `@` attributes dropped) and the `<style>` section. FOR `.svelte` files it SHALL use the markup outside `<script>` and `<style>` (with `{...}` shown as the dashed placeholder, and `on:` attributes and `{#if}` style blocks reduced to their inner markup).
5. THE styles SHALL come from CSS files that the shown component and the entry chain import (2C `imports` edges, up to 3 levels), inlined and sanitised like R2.5.
6. THE workbench SHALL list the components found and let the user pick one. The default is `App` when it exists, else the first exported component by path.
7. THE workbench picture SHALL be shown in the same locked iframe in look-only mode with no scripts. There SHALL be no Run scripts switch for the workbench.
8. THE workbench SHALL NOT annotate elements for the layout check or for editing: it is approximate, so nothing measured or edited there is treated as real.
9. THE extractor SHALL be bounded: at most 200 components, 100 KB of JSX per component, 3 inlining levels. A parse problem in one component SHALL show that component as "could not be read" and SHALL NOT stop the others.

### R6. Source Inspection
1. THE source mode SHALL show a read-only list of the project's loaded files, grouped by 2C label or helper group, with a filter box, and a viewer for the chosen file.
2. THE viewer SHALL show the effective content (so approved changes show up) with line numbers, in a preformatted block, at most 2,000 lines (with "Show more"), and each line passed through `redact()` so secret values show as `[REDACTED:<kind>]`.
3. A file that was not read SHALL show "This file was not read: <reason>."
4. FROM a finding's detail (2D), an **Open in viewer** button SHALL switch the Sandbox panel to the viewer at that file and scroll to the first line of the finding (the line is highlighted with a border, not a color).
5. THE viewer SHALL render all text as React text.

### R7. The Sandbox panel
1. THE Sandbox panel SHALL replace the 2A "Sandbox (coming in sub-phase 2E)" placeholder on Screens 3, 4, and 5. It SHALL keep the same position (top of the left area) and SHALL have a fixed height of about 28 rem with its own scroll, so Project info and the other left-area sections stay reachable.
2. THE panel SHALL show: the mode line with the reason; a mode selector; for the static mode a width selector (**375**, **768**, **1024**, and **Fit**), **Reload**, the scripts switch with its confirmation, and **Stop scripts** when scripts are on; the preview notes from R3.5; and the Preview console when scripts are on.
3. THE panel SHALL show clear states: "Building the preview..." while building, a failure message with **Try again**, and "No preview for this project: <reason>".
4. THE iframe SHALL be remounted (a new `key`) whenever the document, the mode, or the scripts switch changes.
5. THE panel SHALL be usable by keyboard and touch, with controls at least 44 px tall, and SHALL not cause horizontal page scrolling at 375 px (the preview scrolls inside its own box).
6. THE panel's own controls SHALL be black and white and static. The preview content inside the iframe shows the project's own styles.
7. ON Screens 4 and 5 the panel SHALL be the same component. Moving between screens remounts it, so scripts are off again.

### R8. The layout overflow check (the 17th finding)
1. THE SYSTEM SHALL add one skill to the skill-book: `scan.frontend.layout-overflow`, primary area Frontend, severity Medium, certainty **Found**, fix label **Guided**, a **measured** skill (it is not run by the 2D text scan).
2. THE check SHALL run only on a Live Static Preview in look-only mode, from a **Check layout** button (and automatically once after the preview first becomes ready), at the selected width. A **Check at all widths** button SHALL measure at 375, 768, and 1024.
3. FOR every element with a `data-pb` number THE check SHALL measure, from the preview document: client and scroll width and height, and the computed overflow values. It SHALL report:
   - **Text wider than its box:** the element has its own text, `scrollWidth` is more than `clientWidth` plus 1, and the overflow is `visible` (text spills out) or `hidden` or `clip` (text is cut off).
   - **Text cut off at the bottom:** the element has its own text, its vertical overflow is `hidden` or `clip`, and `scrollHeight` is more than `clientHeight` plus 1.
   - **Page wider than the screen:** the document's scroll width is more than the preview width plus 1 (reported on the widest element, with the word "page").
   Elements whose overflow is `auto` or `scroll` SHALL NOT be reported.
4. EACH finding SHALL have: the file and the start-tag line range from the element table, the snippet (the tag's lines, redacted, bounded as in 2D R3.4), the measured numbers and the width in `extra` ("content 312 px in a box 240 px wide, measured at a 375 px wide preview"), an explanation, why it matters, and plan steps, in plain English.
5. THE same element and the same kind measured at several widths SHALL be one finding that lists the widths. At most 100 measured findings are kept, and a limit sets the Partial line "Layout check limit (100) reached: later findings are missing."
6. MEASURED findings SHALL be merged into the 2D counts, tables, and Screen 5 views next to the text findings, and SHALL be shown with the word "Measured" and the width. They SHALL NOT be narrated or fixed by the Skeleton Crew (the crew works on the saved scan only), and Screen 4 SHALL say so.
7. THE results SHALL be discarded when the effective content of the entry page or its files changes, when the snapshot changes, and when the preview is rebuilt for another mode. They SHALL NOT be saved.
8. THE 2D "what was and was not checked" block SHALL list this check as "Layout overflow: measured in the preview (look-only mode, static pages only)" and SHALL no longer say it is "sub-phase 2E". The count of checks SHALL read 17.
9. THE check SHALL finish in under 3 seconds for 5,000 elements. WHEN it takes longer, it SHALL stop and say "The layout check took too long and was stopped."
10. THE check SHALL only read the preview and SHALL change nothing.

### R9. State and wiring
1. THE preview state (mode, reason, scripts switch, width, entry path, picked component, status, notes, console lines, invalid-message count, and layout check results) SHALL live in the studio store in a `preview` slice, changed only by pure actions, and cleared when the snapshot is replaced or cleared.
2. THE preview document itself (a string of up to 1 MB) SHALL NOT be stored in the store. It is built in the panel from the store state and the effective content, and kept only in memory for the panel.
3. THE existing ingestion, AI, shell, harness, understanding, and scanner behavior and tests SHALL stay unchanged, except the 2D items named in R8.8 and the 2A placeholder replacement. The tests that must change are named in the task list.
4. THE app SHALL add no network call and no runtime dependency.

### R10. Safety, privacy, and resources
1. THE SYSTEM SHALL render every string from the project, the preview, and the bridge as React text (never as HTML) outside the iframe.
2. THE SYSTEM SHALL NEVER save the scripts switch, the console lines, the preview document, or any measurement.
3. THE SYSTEM SHALL release the iframe, its message listener, and every timer on unmount, on remount, and when scripts are turned off.
4. THE builder and extractors SHALL use anchored, length-bounded patterns and SHALL finish within 1 second on 200 KB of hostile input.
5. MEMORY SHALL be bounded: the preview document at most 1 MB, the console at most 50 lines of 200 characters, at most 100 measured findings, at most 5,000 annotated elements.

## 5. Error and empty states

| Condition | Required behavior |
|---|---|
| No snapshot | No Sandbox (as before). |
| No entry page and no components | Source Inspection with the reason. |
| Entry page too large or too many files | Source Inspection with the reason. |
| Building | "Building the preview..." |
| Build fails | Message and Try again. The rest of the Studio works. |
| An image, font, or media file is not loaded | A labelled placeholder and a note. |
| An external reference | Removed, counted, host named in the notes. |
| A risky tag | Removed, counted in the notes. |
| Scripts turned on | Confirmation text first, then Preview console and Stop scripts. |
| A script error | One console line with the message text. |
| Bridge message invalid | Dropped, counted: "N invalid messages ignored." |
| Preview tries to navigate | Reset to look-only with the notice in R2.8. |
| Layout check while scripts are on | Button disabled with the reason. |
| Layout check too slow | Stopped with the message. |
| Component cannot be read | That component shows "could not be read". Others work. |
| Workbench picture | Always labelled "Approximate: read from the source, not run." |

## 6. Acceptance and verification gate

The spec is satisfied when all of the following hold:

1. **Mode detection tests:** each rule of R1.2 on fixtures (the three bundled samples give `static`, `workbench`, and `static`; a Python-only project gives `source`; a Vite app with an empty root gives `workbench`; a Vue and a Svelte project; a project with no HTML), the manual override list, and the reason text.
2. **Sandbox flag tests:** the exact strings for look-only and scripts, a test that fails if any other token, or both `allow-same-origin` and `allow-scripts`, can be produced by any code path (checked by enumerating all inputs of the flag function); the exact policy string; the iframe attribute set.
3. **Document builder tests:** every removal and replacement in R2.5 and R3 on fixtures (each risky tag, each external reference form, `@import`, `url(...)`, inline handlers, `javascript:`, `<meta refresh>`, `<base>`, `srcset`); inlining of local CSS and (scripts only) local JS with `</script` escaped; SVG data images; placeholders with sizes; `data-pb` numbering and the element table (lines and columns checked by hand); the report; every bound and its failure; determinism (same input, same output; input reversed, same output); the builder never includes a sentinel PatchBay value.
4. **Hostile markup tests:** pages that try to smuggle a `<meta http-equiv=refresh>`, `<iframe>`, `<object>`, `<embed>`, `<base>`, a script, and an event handler through odd markup (`<<meta`, upper case, null bytes, comments, CDATA, `<svg>` and `<math>` and `<template>` and `<noscript>` wrappers, unclosed quotes, `</style>` and `</script>` inside text, attribute values with quotes) go through the builder. In every case the output contains exactly PatchBay's own `<meta>` tags and no tag outside the allowlist (checked by an independent tag scan of the output, not by the builder's own code), every `<` and `&` from the page appears escaped, and the policy string and sandbox flags are identical for all inputs.
5. **Bridge tests:** every valid type; every rejection (wrong source, origin not `null`, bad schema, extra field, too large, over the rate, control characters); invalid count; the console cap of 50 lines; no message ever causes anything but a console line, a ready signal, or a count; the inspector snippet text is fixed and contains no PatchBay data.
6. **Workbench tests:** component discovery and JSX conversion on fixtures (the React sample's `App` and `LoginForm` give the expected markup including placeholders for `{error && ...}`, `{email}`, and the event handlers dropped), nested components inlined to 3 levels with a cycle, a Vue template, a Svelte file, CSS collection from imports, the label text, and every bound; a component that cannot be parsed is isolated.
7. **Source view tests:** grouping, filter, the viewer with line numbers, secrets redacted (sentinel), the 2,000-line cap, unread files, and "Open in viewer" scrolling to the first line.
8. **Layout check tests:** `evaluateOverflow` on hand-written measurement tables for each of the three problems, the `overflow: auto` exclusion, the one-finding-for-several-widths rule, the 100 cap and its reason, and a finding's file, lines, snippet, and extra text; the 17th skill's data (Frontend, Medium, Found, Guided, measured); the merge into the 2D counts (Frontend 4 skills, the unique total, "Measured" label); the crew script ignores measured findings.
9. **State tests:** the pure actions; stale updates ignored; clearing on snapshot change; the scripts switch resets on mode change and snapshot change; nothing from the preview state is saved (the 2B record is unchanged).
10. **Component tests (server render):** the panel in each mode and state; the notes; the mode selector's choices; the scripts switch text and confirmation; the console as text; the workbench label; the source viewer; Screens 4 and 5 show the same panel; no PatchBay value in the iframe `srcdoc`; the sandbox attribute value in the markup; no color other than `#000` and `#fff` in PatchBay's own CSS; no `transition` or `animation`; no `dangerouslySetInnerHTML`.
11. **Static checks:** no network, `fetch`, AI, or `mockAssistant` import in any 2E-1 file; no new dependency; every new file tagged; no `eval` or `new Function` in PatchBay's own code, and no `postMessage` call that uses `'*'` as the target (the inspector posts to the exact parent origin).
12. **Regression:** the full existing suite passes, with only the tests named in the tasks changed: the 2A tests that look for the placeholder text, and the 2D tests that assert 16 checks, three Frontend skills, and the old "not checked" line.
13. **Isolation browser test (headless Chromium, built app):** load a fixture repository whose page tries, in both modes, every escape in the design (reading `parent.document`, `parent.localStorage`, `localStorage`, `document.cookie`, `window.top.location`, `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, `new Image().src` to an external host, a dynamic `import()` of an external URL, `window.open`, a form submit, `@import url(https://...)`, a stylesheet and script `link` to an external host, markup that tries to smuggle `<meta http-equiv=refresh>`, `eval`). The test records every network request and asserts that **in look-only mode no request goes anywhere except to the app's own origin for its own assets**, and that the preview document contains exactly one `meta[http-equiv]` (PatchBay's policy). In Run scripts mode it asserts the same for every probe except one: a script that sets `location` to an external address is **detected and the preview reset** (the single request the browser may make is recorded and reported as the known limit, not hidden). It also asserts that every other probe reports failure through the bridge, that PatchBay's storage and cookie values are unchanged, and that zero console errors come from PatchBay's own code.
14. **Browser run (headless Chromium, built app):** load each sample; see the right mode and reason; switch widths; the static sample's page shows with its placeholder for the unloaded logo; the scripts switch with its confirmation, the sample's button click works with scripts on and does nothing with them off; Stop scripts; the React sample shows the approximate workbench with the label; the full-stack sample's client page previews and its server code opens in the viewer; the layout check finds an overflow in a fixture page and shows a measured finding on Screen 5; **Check layout** is disabled with scripts on; 375 px width of the whole page; refresh and see scripts off; zero console errors; AI Chat, the 2B commands, 2C, and 2D features still work.
15. **Phase 2E-1 gate (build-phases.md):** imported code cannot read PatchBay data, cookies, or secrets, or load external scripts or any other external content, and messages from the preview are validated and shown only as plain text.

## 7. Open questions for approval

1. **The Edit pad and the layout check work in look-only mode only (R4.10).** With scripts on you can interact with the page, but cannot edit or measure it, because script-built pages cannot be mapped to the source and their numbers cannot be trusted. Approve?
2. **The Skeleton Crew does not go through measured layout findings (R8.6).** They appear in counts and tables but the crew works from the saved text scan, because they need a live preview. Approve?
3. **The preview is on Screens 3, 4, and 5, and scripts turn off when you change screens (R7.7).** Safer and simpler than keeping a running page alive. Approve?
4. **Component Workbench covers React, plus basic Vue and Svelte templates (R5).** Angular and others show Source Inspection. Approve?
5. **Placeholders for images that were not loaded (R3.3).** Because ingestion does not download images and the preview may not use the internet. Only SVG images that were loaded are drawn. Approve?
6. **Limits (R3.6, R4.6, R8.5, R8.9):** 1 MB document, 30 inlined files, 5,000 elements, 50 console lines, 20 bridge messages per second, 100 measured findings, 3 seconds for a layout check, 28 rem panel height. Approve as placeholders?
7. **Two honest limits in Run scripts mode (R4.2, R2.8).** (a) A script with an endless loop can slow or freeze the tab, because the browser may run the frame in the same process. (b) A script can set its own frame's address, and no browser policy can stop that request; PatchBay detects it and resets the preview, and the box holds no PatchBay data. The confirmation text says both, and **Stop scripts** or a reload is the way out. Approve this honest warning?
