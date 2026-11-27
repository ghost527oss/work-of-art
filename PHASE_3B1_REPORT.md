# Phase 3B-1 report: code checks, Visual Linter, sandbox, pictures

**Status:** all fourteen tasks (V1 to V14) of spec 12 are built, tested, reviewed, and committed on branch `feat/3b-1-checks-linter`.

`Current Active Phase` is still **Phase 3 (Sub-phase 3B-1)**. I did not change it. **3B-3 is not started.** Moving on is your decision.

All numbers are real command output from this workspace. **Unverified** means it was not run here, with the reason.

## 1. In simple words

- The scan now finds code mistakes: broken JavaScript, unclosed HTML tags, broken CSS. It says "may", never "valid".
- For simple typos it can offer a fix, but keeps it only if the whole file then reads cleanly.
- The preview can show small pictures from your repository and `https://` pictures from outside. Pictures are only drawn. They never go to an AI, the Journal, an export, the Log, or saved storage.
- **Look only** and **Run scripts** both load styles, fonts, and (Run scripts) scripts only from a short fixed list of CDNs. Everything blocked is listed with a reason.
- **Full check** measures the page at 375, 768, and 1024 px and reports overflow, overlaps, small tap targets, small text, low contrast, and oversize or too-wide pictures. A **Recipe fix** (plain `.html` only) is kept only if re-measuring all three widths shows it is better; otherwise it undoes itself.
- No AI request was added. No colour or animation was added (black and white only).

## 2. Evidence

| Check | Result |
|---|---|
| `npx vitest run` | **149 files, 2,491 tests, all passed** (baseline 113 files, 2,119 tests) |
| `npm run typecheck` | exit 0 |
| `npm run build` | main file `index-ZS3r-kzy.js` **786.74 kB, 246.50 kB gzip** (before 3B-1: 708.33 / 219.59). `acorn` is its own file, `acorn-DAiqQHT_.js`, 118.20 kB, 35.46 kB gzip, loaded only when a scan needs it. |
| `npm audit` | 0 vulnerabilities |
| New runtime dependency | `acorn` ^8.19.0 (MIT) only |
| Real browser run (headless Chromium 159, real server handler, stand-ins for CDN hosts) | **39 of 39 passed**, re-run on the final build. Covers the real CSS probe, pictures, three-width check, recipes kept and undone, Run scripts, 375 px with no sideways scroll, and zero unexpected console errors. |
| Mutation checks (a deliberate bug is planted; a test must fail) | **48 of 48 killed** on the final run. First run: 45, 5 survived; I added tests and removed one duplicate decision point, then all were killed. |
| Independent review (`semantic_reviewer`) | no privacy or security violation found; 9 findings, 4 fixed (below), 5 listed under known limits |

The review's output file is outside the repo at `/projects/sandbox/p3b1-tools/semantic-review/`.

### Review findings fixed
- React code in a `.js` file was reported as a high-severity syntax error. It is now "not checked (React code)".
- `<A x={1}/> (see <B/>)` made the bracket count report a false mismatch. Fixed.
- A picture inside a link (`<a><img></a>`) was reported as "wider than its box". It now measures the nearest ancestor that has a box.
- CSS line numbers drifted after a string cut short by a newline. Fixed.

Each fix has a test (`tests/reviewFixes.test.ts`); the CSS test was checked by planting the old bug.

## 3. Deviations from the spec
See "F12 as built (3B-1)" in `traceability/PLAN.md`. Main ones: skipped code checks are reported in `coverage.codeNotChecked`; automatic JavaScript fixes need the whole file to parse; findings carry tag and column so recipes target the right element (found by the browser gate); the referrer wording is exact (see below).

## 4. Known limits
- Tailwind CDN works only in Run scripts.
- An outside picture makes your browser contact that site, which can see your IP address. This is shown in the UI.
- "PatchBay's address is not sent as a referrer." A font file requested by an allowed style sheet carries that style sheet's own host, seen in the browser run. The spec text said "no referrer is sent"; the UI and README use the exact wording.
- DNS tricks (a normal-looking host name that points to a local address) cannot be ruled out from inside the browser.
- Recipes work on plain `.html` pages only.
- The IPv4 rule and the "last part must be letters" rule both reject numeric hosts, so removing only one is not detectable; the mutation check removes both together.
- Not fixed from the review (low severity): "Try a fix" and Edit controls stay enabled during a recipe (a user edit during a recipe is handled safely: the recipe is not undone and the panel says why); floated pictures beside text can be reported as overlap, and invisible 1×1 links as small tap targets; a form named `images` could shadow the page's picture list; the picture-size check builds one pattern per rule per unsized picture with no rule cap; a failed `acorn` load is not retried within the session (the panel says "not checked").

## 5. Unverified
- Real CDN hosts (stand-ins only) and a real Vercel deployment.
- Touch devices and phones (a 375 px desktop viewport was tested).
- Browsers other than Chromium.

## 6. Decisions for you
1. Do you want the five low-severity review items fixed before 3B-3, or left as listed?
2. Open a pull request for this branch? I have not opened one.
3. Advance to 3B-3 (your order: 3B-1, then 3B-3, then 3B-2).
