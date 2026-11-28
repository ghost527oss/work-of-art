# Content draft: the 12 new skills and 12 lesson cards (3B-1, task V1)

For your review before the batch "Go". V1 copies this wording into `src/skillbook/scanSkills.ts` and `src/skillbook/playbook.ts` **without changes**. If you want a different word, tell me and I change this file first.

Every text below was checked by a script that applies the same rules as the existing tests: Simple at most 3 sentences of at most 20 words with no jargon and no code characters; Practical at most 6 sentences of at most 28 words; Deeper at most 10 sentences of at most 35 words; no banned wording; card summaries between 10 and 120 characters; skill text free of the skill-test jargon list; ids fit the existing id pattern; no "possible" skill is High. The unit tests in V1 re-check all of this.

The first seven are text checks. The last five are measured checks (run by the preview). The seven code checks are listed under Frontend and also under Backend.

## 1. `scan.frontend.js-syntax`

| Field | Value |
|---|---|
| Title | JavaScript the browser cannot read |
| Area | frontend (also backend) |
| Severity | high |
| Certainty | found |
| Fix label | auto (guided when no single repair works) |
| Kind | text |

**explain:** The JavaScript in this file has a mistake, so the browser stops reading it at this spot.

**why:** Nothing after the mistake runs, so buttons and other features may not work.

**how:**
- Look at the line shown and the line before it. A missing bracket, quote, or comma is the usual cause.

**Lesson card** `lesson.scan.frontend.js-syntax`: *JavaScript must be readable to run*

Summary: One typing mistake can make the browser stop reading a whole JavaScript file.

Tags: frontend, backend. Keywords: javascript, syntax, error. Related: concept.script.

- **Simple:** The browser reads JavaScript one piece at a time. If it meets a mistake, it stops there. Everything after that spot does not run.
- **Practical:** A JavaScript file must follow strict spelling rules. A missing bracket, quote, or comma is enough to break it. PatchBay reads the file with a checker named acorn and shows the exact line and column where reading failed. The real cause is often on that line or just before it.
- **Deeper:** The checker reads a file as a module first, then as a plain script, because the two follow slightly different rules. It reports the first mistake only, so fixing one can reveal the next. PatchBay never runs the code to find mistakes. A file that reads cleanly can still behave wrongly, because this check looks at spelling, not at meaning. An automatic fix is offered only when exactly one tiny repair makes the first mistake go away.

## 2. `scan.frontend.balance`

| Field | Value |
|---|---|
| Title | Brackets or quotes that may not match |
| Area | frontend (also backend) |
| Severity | medium |
| Certainty | possible |
| Fix label | guided |
| Kind | text |

**explain:** The opening and closing brackets or quotes in this file do not seem to pair up.

**why:** A missing closing bracket can break the whole file. This check only counts pairs, so it can be wrong.

**how:**
- Check that every opening bracket and quote has its closing partner.
- Open the file in your editor, which usually highlights matching brackets.

**Lesson card** `lesson.scan.frontend.balance`: *Brackets and quotes come in pairs*

Summary: Every opening bracket or quote needs a closing partner. A counting check can warn but cannot prove.

Tags: frontend, backend. Keywords: bracket, quote, balance. Related: lesson.scan.frontend.js-syntax.

- **Simple:** Brackets and quotes come in pairs, like a door that opens and closes. If one is missing, the code breaks. PatchBay counts them and warns when the counts differ.
- **Practical:** Every opening bracket, such as a round, square, or curly one, needs a closing partner. PatchBay counts them in files it cannot fully read, such as React and TypeScript files. A difference means a bracket may be missing or extra. The count can be fooled by unusual code, so treat it as a hint.
- **Deeper:** For React and TypeScript files PatchBay does not run a full reader. It walks through the text, skips strings and comments, and keeps a stack of open brackets. A closing bracket that does not match the top of the stack is reported. Page text with apostrophes can confuse quote tracking, so for React files the check runs twice and reports only when both runs disagree. Because of that, this check can say "may not match" but never "valid".

## 3. `scan.frontend.html-structure`

| Field | Value |
|---|---|
| Title | Page tags that do not close properly |
| Area | frontend (also backend) |
| Severity | medium |
| Certainty | found |
| Fix label | auto (guided when no single repair works) |
| Kind | text |

**explain:** This page has a tag that is never closed, a closing tag with nothing to close, or a tag closed in the wrong place.

**why:** Browsers guess how to repair this, so the page can look different from what you meant.

**how:**
- Make sure every opening tag has a matching closing tag, in the right order.

**Lesson card** `lesson.scan.frontend.html-structure`: *Tags must open and close in order*

Summary: Each opening tag needs its closing tag, and tags must close in the reverse order they opened.

Tags: frontend, design. Keywords: html, tag, closing. Related: concept.page.

- **Simple:** Page tags work like boxes inside boxes. Each box you open must be closed, inner box first. A missing close can shift the whole page.
- **Practical:** Most tags come in pairs, such as div and its closing tag. They must close in the reverse order they opened. A few tags, such as br and img, stand alone, and a few, such as p and li, may skip their closing tag. PatchBay reports the tag that was left open or closed in the wrong place.
- **Deeper:** Browsers never stop on broken tags. They repair them with fixed rules, and the repair may not match what the author meant. PatchBay keeps a list of open tags and checks each closing tag against it. When a closing tag matches an outer tag, every inner tag still open is reported at its own start line. An automatic fix inserts one closing tag just before the outer closing tag, and only when that is the single possible repair.

## 4. `scan.frontend.html-id-duplicate`

| Field | Value |
|---|---|
| Title | The same id used twice |
| Area | frontend (also backend) |
| Severity | medium |
| Certainty | found |
| Fix label | guided |
| Kind | text |

**explain:** The same id appears on more than one tag in this page.

**why:** An id is meant to name one thing. Labels, links, and scripts that use it may pick the wrong tag.

**how:**
- Give each tag its own id, or use a class when several tags share a style.

**Lesson card** `lesson.scan.frontend.html-id-duplicate`: *An id must be used once*

Summary: An id names one tag only. Repeating it confuses links, labels, and scripts.

Tags: frontend, design. Keywords: id, duplicate, html. Related: concept.page.

- **Simple:** An id is a name tag for one thing on the page. Two things with the same name get mixed up. Give each its own name.
- **Practical:** An id should appear once per page. Links that jump to a spot, labels tied to a field, and scripts that look up a tag all use it. With two matches, they usually pick the first. Use a class when several tags need the same style.
- **Deeper:** The rules of HTML say an id must be unique in a page. Browsers do not complain, so the mistake hides until something depends on it. A script that asks for an id gets the first match only, and a link to that id jumps to the first match only. PatchBay compares plain id values exactly and skips values built by templates.

## 5. `scan.frontend.html-attr-missing`

| Field | Value |
|---|---|
| Title | A tag is missing something it needs |
| Area | frontend (also backend) |
| Severity | low |
| Certainty | found |
| Fix label | guided |
| Kind | text |

**explain:** This tag is missing an attribute it needs to work, such as the address of an image or a stylesheet.

**why:** Without it the picture or style cannot load, and nothing tells you why.

**how:**
- Add the missing attribute, for example the file address.

**Lesson card** `lesson.scan.frontend.html-attr-missing`: *Some tags need an address*

Summary: An image needs a source and a stylesheet link needs an address, or nothing loads.

Tags: frontend, design. Keywords: attribute, src, href. Related: concept.page, concept.stylesheet.

- **Simple:** Some tags need one more piece of information to work. An image tag needs the address of its picture. Without it, nothing shows.
- **Practical:** An img tag needs a src attribute that points to the picture. A link tag for a stylesheet needs an href that points to the file. Without them the browser loads nothing and stays quiet. PatchBay checks these two cases in plain HTML pages.
- **Deeper:** Browsers ignore a tag that lacks the attribute that gives it purpose, and they report nothing to the visitor. That makes this mistake easy to miss when a page looks nearly right. PatchBay checks only attributes that are always required, in files without template syntax, because a template may fill the value in later. Other missing attributes, such as alt, have their own checks.

## 6. `scan.frontend.css-possible-invalid`

| Field | Value |
|---|---|
| Title | Possible invalid CSS |
| Area | frontend (also backend) |
| Severity | low |
| Certainty | possible |
| Fix label | guided |
| Kind | text |

**explain:** The browser dropped this CSS rule when it read it, so it may be written wrongly.

**why:** A dropped rule has no effect, so the look you expect may not appear. A newer or browser-specific rule can be dropped too.

**how:**
- Check the spelling of the selector and each property.
- If the rule uses a very new feature, test it in the browsers you care about.

**Lesson card** `lesson.scan.frontend.css-possible-invalid`: *CSS the browser ignores*

Summary: A rule the browser drops has no effect. It may be misspelled or too new for this browser.

Tags: frontend, design. Keywords: css, rule, invalid. Related: concept.stylesheet.

- **Simple:** A style rule is like an instruction. If the browser cannot understand it, the browser skips it. Then the look you wanted does not appear.
- **Practical:** PatchBay gives each style rule to the browser and sees whether it was kept. A dropped rule often has a spelling mistake or a missing bracket. It can also be a new feature that this browser does not know yet. That is why the label says possible.
- **Deeper:** Browsers throw away style rules they cannot read and carry on, so a typing mistake leaves no error message. PatchBay uses a style sheet object that is never shown on the page, so nothing loads and nothing changes. A rule can also be dropped because it is newer than the browser or meant for a different browser, which is why this finding is only possible. Import rules are ignored by this check.

## 7. `scan.frontend.css-braces`

| Field | Value |
|---|---|
| Title | CSS braces that do not match |
| Area | frontend (also backend) |
| Severity | medium |
| Certainty | found |
| Fix label | guided |
| Kind | text |

**explain:** This CSS has a curly bracket that is opened and never closed, or closed with nothing to close.

**why:** Rules after the mistake may be read wrongly or ignored, so parts of the page lose their style.

**how:**
- Go to the line shown and check that each opening curly bracket has a closing one.

**Lesson card** `lesson.scan.frontend.css-braces`: *Style rules need matching braces*

Summary: Every opening curly bracket in CSS needs a closing one, or later rules can be lost.

Tags: frontend, design. Keywords: css, brace, bracket. Related: concept.stylesheet.

- **Simple:** Each style rule is wrapped in curly brackets. If one is missing, the browser gets confused. Later styles may stop working.
- **Practical:** A style rule starts with a curly bracket and ends with a closing one. A missing closing bracket can swallow the rules after it. An extra one can end a block too early. PatchBay counts the brackets and reports the line where they stop matching.
- **Deeper:** The counter walks through the file once and skips comments and quoted text, so a bracket inside a comment is not counted. Grouped rules, such as those inside a media query, nest brackets, and each level must close. The reported line is where the count first goes wrong, which is not always where the mistake was typed. Automatic fixes are not offered because the right place for a missing bracket cannot be known.

## 8. `scan.frontend.layout-overlap`

| Field | Value |
|---|---|
| Title | Boxes that overlap |
| Area | frontend |
| Severity | low |
| Certainty | possible |
| Fix label | guided |
| Kind | measured |

**explain:** In the preview, two boxes that sit side by side in the page flow overlap each other.

**why:** Overlapping text or buttons can hide each other and make parts of the page hard to read or press. Some overlaps are on purpose, so check the design.

**how:**
- Look at the two boxes in the preview and decide whether the overlap is on purpose.
- If not, give them more space with margin or padding, or let them wrap onto the next line.

**Lesson card** `lesson.scan.frontend.layout-overlap`: *Boxes should not hide each other*

Summary: Two neighbouring boxes that overlap can hide text or buttons, unless the overlap is on purpose.

Tags: frontend, design. Keywords: overlap, layout, boxes. Related: concept.layout.

- **Simple:** Boxes on a page normally sit next to each other. Sometimes two boxes land on top of each other. Then one can hide the other.
- **Practical:** PatchBay measures the boxes in the preview at three screen widths. It reports neighbouring boxes whose areas overlap by a clear amount. Menus, pop-ups, and fixed bars are skipped on purpose. Because PatchBay cannot know what the designer wanted, the confidence is never high.
- **Deeper:** Only neighbours in the normal page flow are compared, and hidden boxes are skipped. A box moved by a transform or a negative margin gets low confidence, because designers often overlap things on purpose. An overlap smaller than 16 square pixels, or smaller than 15 percent of the smaller box, is ignored.

## 9. `scan.frontend.tap-target`

| Field | Value |
|---|---|
| Title | Button or link too small to tap |
| Area | frontend |
| Severity | medium |
| Certainty | found |
| Fix label | guided (a recipe button is offered in the Edit panel) |
| Kind | measured |

**explain:** This button or link is smaller than 44 pixels, which is hard to tap with a finger.

**why:** On a phone, small targets are easy to miss, so people press the wrong thing.

**how:**
- Make it at least 44 pixels high and wide, or add padding around it.

**Lesson card** `lesson.scan.frontend.tap-target`: *Buttons need room for a finger*

Summary: Buttons and links under 44 pixels are hard to tap on a phone.

Tags: frontend, design. Keywords: tap, button, size, phone. Related: concept.layout, lesson.scan.frontend.button-name.

- **Simple:** Fingers are bigger than mouse arrows. A tiny button is hard to press on a phone. Make buttons big enough to tap.
- **Practical:** A common guide is that buttons and links should be at least 44 pixels high and wide on phones. PatchBay measures them at 375 and 768 pixels wide. Links inside a sentence are skipped, because they are allowed to be small. A fix adds a minimum height and width.
- **Deeper:** Touch screens are less exact than a mouse, so small targets cause missed taps. The measured size is the box the browser draws, so padding counts. Hidden and disabled controls are skipped, and a tag marked as a button by role is reported with medium confidence. The recipe adds a minimum size, and PatchBay measures again at all three widths and undoes the change if anything gets worse.

## 10. `scan.frontend.text-small`

| Field | Value |
|---|---|
| Title | Text too small to read on a phone |
| Area | frontend |
| Severity | low |
| Certainty | found |
| Fix label | guided (a recipe button is offered in the Edit panel) |
| Kind | measured |

**explain:** This text is smaller than 12 pixels at a phone or tablet width.

**why:** Small text is hard to read on a small screen, especially for people with weak eyesight.

**how:**
- Raise the font size to at least 14 pixels for normal reading text.

**Lesson card** `lesson.scan.frontend.text-small`: *Text must be big enough to read*

Summary: Text under 12 pixels is hard to read on a phone.

Tags: frontend, design. Keywords: text, font, size, phone. Related: concept.stylesheet, concept.layout.

- **Simple:** Tiny words are hard to read on a small screen. Make the text a little bigger. Your visitors will thank you.
- **Practical:** PatchBay measures the text size in the preview at phone and tablet widths. Text under 12 pixels is reported. Notes written in small, sub, or sup tags get medium confidence, because small text is often meant there. A fix raises the size to 14 pixels.
- **Deeper:** Size is measured as the browser works it out, after all style rules and inherited values. Sizes written in relative units are therefore measured in real pixels. Raising the size can make text wrap onto more lines, so PatchBay measures the page again after the fix and undoes it if it caused a new problem.

## 11. `scan.frontend.contrast`

| Field | Value |
|---|---|
| Title | Text that is hard to read against its background |
| Area | frontend |
| Severity | medium |
| Certainty | found |
| Fix label | guided (a recipe button is offered in the Edit panel) |
| Kind | measured |

**explain:** The text colour is too close to the colour behind it, so it is hard to read.

**why:** People with weak eyesight, or anyone in bright light, may not be able to read this text.

**how:**
- Make the text darker or the background lighter, or the other way round, until the contrast reaches 4.5 to 1.

**Lesson card** `lesson.scan.frontend.contrast`: *Text needs contrast*

Summary: Text colour must differ enough from its background. 4.5 to 1 is the common minimum.

Tags: frontend, design. Keywords: contrast, colour, readability. Related: concept.stylesheet, concept.layout.

- **Simple:** Light grey words on a white page are hard to read. The words and the background need to look very different. Dark on light, or light on dark, works well.
- **Practical:** Contrast is a number that compares two colours. Normal text should reach 4.5 to 1, and large text should reach 3 to 1. PatchBay measures it only when the background is one plain colour. Over a gradient or a picture it says it cannot measure.
- **Deeper:** The number comes from the brightness of each colour, as the web accessibility guidelines define it. Large text is 24 pixels, or 18.66 pixels and bold. A see-through text colour is mixed with the background first, and the result gets medium confidence. The fix moves the text colour toward black or white in small steps and stops at the first colour that reaches the minimum.

## 12. `scan.frontend.media-unsized`

| Field | Value |
|---|---|
| Title | Picture with no size limit |
| Area | frontend |
| Severity | low |
| Certainty | possible |
| Fix label | guided (a recipe button is offered in the Edit panel) |
| Kind | measured |

**explain:** This picture is wider than the space it sits in, or it has no width, height, or size limit written down.

**why:** A large picture can push the page wider than the screen, and a picture with no set size can make the page jump while it loads.

**how:**
- Add a maximum width of 100 percent and a height of auto, or write a width and height on the picture.

**Lesson card** `lesson.scan.frontend.media-unsized`: *Pictures need a size limit*

Summary: A picture with no size limit can overflow its box or make the page jump as it loads.

Tags: frontend, design. Keywords: image, picture, size, width. Related: lesson.scan.frontend.img-alt, concept.layout.

- **Simple:** A big picture can spill out of its box. It can push the page wider than the phone screen. Give pictures a size limit.
- **Practical:** PatchBay measures real pictures in the preview and reports one that is wider than its container. It also reports a picture with no written width, height, or maximum width when the picture could not be measured. A fix adds a maximum width of 100 percent and a height of auto. The second kind of report has low confidence, because it is read from the page text.
- **Deeper:** A picture is measured only after it has loaded, so slow outside pictures may still be waiting when the check runs, and PatchBay says so. Pictures PatchBay could not load, such as ones that are too large or from a blocked address, appear as boxes and cannot be measured. For those, the check reads the page and style text and reports a picture that has no size limit anywhere. That reading can be wrong, so it always has low confidence.

