// @node: F9.1
// THE PLAYBOOK: every lesson and concept card PatchBay teaches, as plain data in one file.
//
// Shape of a card:
//   { id, kind: 'concept' | 'check' | 'sorting' | 'edge_case', title, summary (one line, at most 120 characters),
//     tags (areas and topics), keywords (for search), skillId (check cards only),
//     levels: { simple, practical, deeper }, related: [other card ids] }
//
// To add a card, add one entry below. The tests check every card: the schema, unique ids, the writing rules for
// each level (Simple: at most 3 sentences of at most 20 words, no jargon, no code characters), the summary length,
// and that related ids exist. Phase 3 reads these cards through the lookups in playbookLookup.ts.
import type { Playbook } from './playbookSchema';

export const PLAYBOOK: Playbook = {
  version: 1,
  cards: [
    // ---------------------------------------------------------------- concepts
    {
      id: 'concept.page', kind: 'concept', title: 'A web page', summary: 'An HTML file that a browser shows: text, pictures, buttons, and links.',
      tags: ['frontend', 'design'], keywords: ['html', 'page', 'browser'], related: ['concept.stylesheet', 'concept.script'],
      levels: {
        simple: 'A web page is a file that a browser shows. It holds the words, pictures, and buttons you see.',
        practical: 'A web page is an HTML file. Tags such as h1, p, and button describe what appears and in what order. The browser reads the file and draws it on the screen.',
        deeper: 'A web page is an HTML document. The browser turns its tags into a tree of elements, then applies styles and runs scripts on that tree. Pages can load other files, such as stylesheets, scripts, and images, by their addresses. PatchBay reads the tags and the addresses it can find in the loaded files.',
      },
    },
    {
      id: 'concept.stylesheet', kind: 'concept', title: 'A stylesheet', summary: 'A CSS file that decides how a page looks: colours, sizes, and spacing.',
      tags: ['frontend', 'design'], keywords: ['css', 'style', 'stylesheet'], related: ['concept.page', 'concept.layout'],
      levels: {
        simple: 'A stylesheet decides how a page looks. It sets colours, sizes, and the space between things.',
        practical: 'A stylesheet is a CSS file. It holds rules that pick elements and set how they look, such as width, colour, and padding. A page loads it with a link tag.',
        deeper: 'A stylesheet is a CSS file of rules. Each rule has a selector that picks elements and declarations that set properties. When several rules match one element, the more specific rule wins, and an inline style attribute wins over both. The Edit pad writes inline styles, which is why its changes always show.',
      },
    },
    {
      id: 'concept.script', kind: 'concept', title: 'A script', summary: 'A JavaScript or TypeScript file that makes a page or a server do things.',
      tags: ['frontend', 'backend'], keywords: ['javascript', 'typescript', 'script'], related: ['concept.import', 'concept.api-call'],
      levels: {
        simple: 'A script is a file of instructions. It makes buttons react and pages change while you use them.',
        practical: 'A script is a JavaScript or TypeScript file. In a browser it reacts to clicks and changes the page. On a server it answers requests. PatchBay reads scripts but never runs them.',
        deeper: 'A script is JavaScript or TypeScript code. The same language runs in browsers and on servers, so the file extension alone does not say which side a script belongs to. PatchBay looks at what a script imports and what it uses to decide. It never runs the code it reads.',
      },
    },
    {
      id: 'concept.import', kind: 'concept', title: 'An import', summary: 'One file asking to use code from another file or from a package.',
      tags: ['frontend', 'backend'], keywords: ['import', 'require', 'module', 'package'], related: ['concept.script', 'concept.request-flow'],
      levels: {
        simple: 'An import is one file asking to use another file. It is how a project is joined together.',
        practical: 'An import line asks for code from another file, such as ./routes/profile, or from a package, such as express. PatchBay follows imports between loaded files and lists packages by name.',
        deeper: 'An import names a module. A relative name such as ./routes/profile points at a file in the project, which PatchBay tries to find with common extensions and index files. A bare name such as express is a package from outside the project. Shortcut names such as @/ depend on project settings, so PatchBay counts them and does not follow them.',
      },
    },
    {
      id: 'concept.route', kind: 'concept', title: 'A route', summary: 'An address a server listens to, paired with the code that answers it.',
      tags: ['backend', 'api'], keywords: ['route', 'server', 'address', 'method'], related: ['concept.api-call', 'concept.request-flow'],
      levels: {
        simple: 'A route is an address that a server listens to. When a page asks that address for something, the server answers.',
        practical: 'A route pairs a web address, such as /api/profile, and a method, such as PUT, with code that answers requests. A script on the page sends the request, and the route\'s code sends back a reply.',
        deeper: 'A route pairs a path and a method with a handler. It can be written in code, such as router.put, or come from where the file sits, such as a file inside an api folder. Routers are often mounted under a prefix, so the full address is the prefix plus the route\'s own path. PatchBay joins a prefix only when it can see the line that mounts the router.',
      },
    },
    {
      id: 'concept.api-call', kind: 'concept', title: 'A request to a server', summary: 'Code that asks a server address for data or sends data to it.',
      tags: ['frontend', 'api'], keywords: ['fetch', 'axios', 'request', 'call'], related: ['concept.route', 'concept.request-flow'],
      levels: {
        simple: 'A request is a page asking a server for something. The server sends an answer back.',
        practical: 'A request is code such as fetch that asks an address for data, or sends data to it. It has a method, such as GET or PUT. PatchBay matches requests to routes when both are in the loaded files.',
        deeper: 'A request names an address and a method. When the address is written out in full, PatchBay can match it against the routes it found and mark the link Confirmed. When part of the address is only known while the code runs, the match is Inferred. When routes exist but none fits, the link is Broken.',
      },
    },
    {
      id: 'concept.env-var', kind: 'concept', title: 'A setting read at run time', summary: 'A named value, such as PORT, that a program reads from its surroundings.',
      tags: ['backend', 'security'], keywords: ['env', 'environment', 'setting', 'config'], related: ['concept.secret'],
      levels: {
        simple: 'A setting is a named value a program reads when it starts. Keeping values outside the code is a good habit.',
        practical: 'A setting such as PORT or DATABASE_URL is read from the environment, often through process.env. The value lives outside the code, so it can change without editing files. PatchBay shows the names only, never the values.',
        deeper: 'Environment settings keep changing or private values out of the source code. A program reads them by name, for example process.env.PORT or os.getenv in Python. Real values often sit in a .env file that should stay out of the repository. PatchBay lists the names it sees read and never shows a value.',
      },
    },
    {
      id: 'concept.request-flow', kind: 'concept', title: 'A request flow', summary: 'The path a request takes: from the page, to the route, to the files it uses.',
      tags: ['api', 'backend', 'frontend'], keywords: ['flow', 'trace', 'request'], related: ['concept.api-call', 'concept.route', 'concept.import'],
      levels: {
        simple: 'A request flow follows one request step by step. It starts on the page and ends in the server files.',
        practical: 'A request flow starts at a call in a page script, finds the route that answers it, and follows the files that route uses. It stops honestly when a file was not loaded or no route matches.',
        deeper: 'A request flow joins three kinds of links that PatchBay read: the call, the route that matches it, and the imports of the route\'s file. Each step keeps its certainty word. The trace goes at most three files deep and stops with a plain reason whenever it cannot see further.',
      },
    },
    {
      id: 'concept.validation', kind: 'concept', title: 'Checking incoming data', summary: 'Making sure data sent by a visitor has the right shape before using it.',
      tags: ['backend', 'security'], keywords: ['validation', 'input', 'check'], related: ['concept.route', 'lesson.scan.backend.input-validation'],
      levels: {
        simple: 'Data sent by a visitor can be wrong or harmful. Checking it first keeps the server from using bad data.',
        practical: 'A server should check incoming data before using it: is a name text, is a number in range, is every needed field there. Small checks such as typeof work, and libraries such as zod check whole shapes.',
        deeper: 'Every value that arrives in a request comes from outside the program, so its type and content cannot be trusted. Checking it at the edge, right where it arrives, turns many failures into clear error replies. A schema library describes the expected shape once and checks every request against it.',
      },
    },
    {
      id: 'concept.secret', kind: 'concept', title: 'A secret', summary: 'A password, key, or token that gives access and must stay private.',
      tags: ['security'], keywords: ['secret', 'token', 'key', 'password'], related: ['concept.env-var', 'lesson.scan.security.hardcoded-secret'],
      levels: {
        simple: 'A secret is a password or key that unlocks something. It should never be written inside the project files.',
        practical: 'A secret, such as an API key or a token, gives access to a service. If it is written in a file, anyone who can read the repository can use it. Keep secrets in settings and change any that leaked.',
        deeper: 'A secret written in a file stays in the repository history even after it is deleted, so removing it is not enough. The usual fix is to move it to a setting read at run time, add the file that holds it to .gitignore, and replace the secret with a new one. PatchBay hides secret values everywhere it shows text.',
      },
    },
    {
      id: 'concept.layout', kind: 'concept', title: 'Layout', summary: 'How boxes on a page are sized and placed, and what happens when content does not fit.',
      tags: ['frontend', 'design', 'layout'], keywords: ['layout', 'overflow', 'width', 'responsive'], related: ['concept.stylesheet', 'lesson.scan.frontend.layout-overflow'],
      levels: {
        simple: 'Layout is how things are placed on a page. Text that does not fit its box can spill out or be cut off.',
        practical: 'Every element is a box with a width and a height. When the text inside is wider than the box, it spills out or is hidden, depending on the overflow setting. Narrow phone screens make this more likely.',
        deeper: 'The browser sizes each box from its styles and its content. Fixed widths, long words, and hidden overflow are the usual reasons text does not fit. PatchBay measures this in the preview at the widths you choose, so a measured finding depends on the browser and the fonts it used.',
      },
    },
    {
      id: 'concept.label', kind: 'concept', title: 'File labels', summary: 'The groups PatchBay sorts files into, such as Frontend, Backend, and Settings.',
      tags: ['sorting'], keywords: ['label', 'sort', 'group', 'area'], related: ['lesson.sorting.unsure'],
      levels: {
        simple: 'PatchBay puts each file in a group, such as Frontend or Backend. Each group comes with the clue that put it there.',
        practical: 'Labels come from clues in the skill-book: the file name, the folder, what the file imports, and what it does. A file can have several labels. Each label comes with a confidence and the reason.',
        deeper: 'Labels are evidence, not guesses. A strong clue, such as an image extension, gives high confidence on its own, while weak clues need company. When nothing points anywhere, the file goes to Needs Review. Your corrections replace the automatic labels and are saved for that repository.',
      },
    },
    // ---------------------------------------------------------------- checks (one per scan skill)
    {
      id: 'lesson.scan.frontend.img-alt', kind: 'check', skillId: 'scan.frontend.img-alt', title: 'Images need a text description', summary: 'An image without alt text says nothing to people using screen readers.',
      tags: ['frontend', 'design'], keywords: ['image', 'alt', 'accessibility'], related: ['concept.page'],
      levels: {
        simple: 'Some people use a screen reader that reads pages aloud. An image with no description says nothing to them.',
        practical: 'An img tag should have an alt attribute that says what the image shows. Screen readers read it aloud, and it shows when the image cannot load. Use alt="" for images that are only decoration.',
        deeper: 'The alt attribute is the text version of an image. Without it, assistive tools may read the file name instead, which helps no one. Decorative images should still have an empty alt so they are skipped. Good alt text describes the purpose of the image in its context, not every detail.',
      },
    },
    {
      id: 'lesson.scan.frontend.button-name', kind: 'check', skillId: 'scan.frontend.button-name', title: 'Buttons need a name', summary: 'A button with no text or label leaves screen reader users guessing.',
      tags: ['frontend', 'design'], keywords: ['button', 'label', 'accessibility'], related: ['concept.page'],
      levels: {
        simple: 'A button with no words leaves some people guessing. Give every button a short name.',
        practical: 'A button should contain text, or have an aria-label that says what it does. Icon-only buttons are a common cause. Screen readers announce the name when the button gets focus.',
        deeper: 'Assistive tools build a name for every button from its text, its aria-label, or the element it points to with aria-labelledby. An empty button has no name, so it is announced only as a button. Adding visible text helps everyone, and a label is the fallback when space is tight.',
      },
    },
    {
      id: 'lesson.scan.frontend.listener-cleanup', kind: 'check', skillId: 'scan.frontend.listener-cleanup', title: 'Remove listeners you add', summary: 'A listener added to the window and never removed can pile up and slow a page.',
      tags: ['frontend'], keywords: ['listener', 'event', 'cleanup', 'react'], related: ['concept.script'],
      levels: {
        simple: 'Some code keeps listening after its part of the page is gone. Over time this can slow the page down.',
        practical: 'Code that calls window.addEventListener inside a React piece should remove the listener when the piece goes away. Do it in the cleanup function of useEffect. Otherwise each new copy adds one more listener.',
        deeper: 'A listener added to window or document lives as long as the page, not as long as the screen piece that added it. In React, the function returned from useEffect runs when the piece goes away, which is the place to call removeEventListener. This check only sees that no removal exists in the file, so the cleanup may live somewhere else.',
      },
    },
    {
      id: 'lesson.scan.backend.input-validation', kind: 'check', skillId: 'scan.backend.input-validation', title: 'Check data before using it', summary: 'Request data used with no checking step in the same file.',
      tags: ['backend', 'security'], keywords: ['validation', 'input', 'request', 'body'], related: ['concept.validation'],
      levels: {
        simple: 'Visitors can send any data they like. Checking it before use stops many mistakes and attacks.',
        practical: 'This file reads req.body, req.query, or req.params and no checking step was seen in the same file. Check the type and shape of each value first, with simple tests or a library such as zod.',
        deeper: 'Request data is the main way outside input reaches a server. This check is a Possible finding: it only looked at one file, so checking may happen in a shared step elsewhere. When it does not, a small schema that rejects wrong types early prevents crashes and blocks inputs crafted to misuse the code.',
      },
    },
    {
      id: 'lesson.scan.backend.error-leak', kind: 'check', skillId: 'scan.backend.error-leak', title: 'Keep error details on the server', summary: 'Error messages or stacks sent to visitors can reveal how the server works.',
      tags: ['backend', 'security'], keywords: ['error', 'stack', 'message'], related: ['concept.route'],
      levels: {
        simple: 'Detailed error messages can tell strangers how the server is built. Show a short message instead.',
        practical: 'Sending err.stack or err.message in a reply can reveal file names, libraries, and data. Send a short general message, and write the details to your own logs where only you can read them.',
        deeper: 'Error details are useful while building and risky in a live service. A stack lists file paths and library versions, which helps an attacker plan. A common pattern is one error handler that logs the full error on the server and sends a fixed message with a reference number to the visitor.',
      },
    },
    {
      id: 'lesson.scan.backend.sql-concat', kind: 'check', skillId: 'scan.backend.sql-concat', title: 'Do not build database commands from text', summary: 'A database command joined from pieces of text can be changed by a visitor.',
      tags: ['backend', 'security', 'api'], keywords: ['sql', 'database', 'query', 'placeholder'], related: ['concept.validation'],
      levels: {
        simple: 'Joining text into a database command lets a visitor change the command. Use the safer form with placeholders.',
        practical: 'This command is built with + or a template, so text from a visitor becomes part of the command itself. Use placeholders such as $1 or ?, and pass the values separately. The database then treats them only as values.',
        deeper: 'When a query is built by joining strings, a value that contains quote marks can end the intended command and start a new one, which is called SQL injection. Placeholders send the command and the values to the database separately, so the database reads the values as data, not as part of the command. Most database libraries support placeholders directly.',
      },
    },
    {
      id: 'lesson.scan.backend.no-auth-limit', kind: 'check', skillId: 'scan.backend.no-auth-limit', title: 'Protect routes that change data', summary: 'Routes that change data, with no sign-in or rate limit seen in any loaded file.',
      tags: ['backend', 'security'], keywords: ['auth', 'login', 'rate limit', 'session'], related: ['concept.route'],
      levels: {
        simple: 'Some routes change data. They usually need a sign-in step, and a limit on how often they can be used.',
        practical: 'The project has routes that change data, such as PUT or POST, and no sign-in, session, or rate-limit code was seen. This is a Possible finding because protection may live outside the loaded files. Check who can call these routes.',
        deeper: 'A route that changes data should know who is calling and should refuse callers who are not allowed. A rate limit also stops one caller from sending thousands of requests. This check looks for common words such as auth, session, or limiter in every loaded server file, so it can miss protection added by a hosting service or a gateway.',
      },
    },
    {
      id: 'lesson.scan.api.route-mismatch', kind: 'check', skillId: 'scan.api.route-mismatch', title: 'Calls must match a real route', summary: 'Code that calls an address no route in the repository answers.',
      tags: ['api', 'frontend', 'backend'], keywords: ['route', 'mismatch', 'broken', 'address'], related: ['concept.api-call', 'concept.route'],
      levels: {
        simple: 'This code asks an address that the server does not answer. The request will fail when it runs.',
        practical: 'A call was found whose address and method match no route in the loaded files. Check the spelling of the address, the method, and any prefix the router is mounted under.',
        deeper: 'PatchBay compares each call with every route, treating named parts such as :id as any one segment. A call is marked Broken only when routes exist, every backend file was read, and none matches. Common causes are a renamed route, a missing prefix, or a method such as POST used where the route expects PUT.',
      },
    },
    {
      id: 'lesson.scan.security.hardcoded-secret', kind: 'check', skillId: 'scan.security.hardcoded-secret', title: 'Secrets do not belong in files', summary: 'A password, key, or token written directly in a project file.',
      tags: ['security'], keywords: ['secret', 'token', 'key', 'password'], related: ['concept.secret', 'concept.env-var'],
      levels: {
        simple: 'A password or key is written inside a file. Anyone who can read the files can use it.',
        practical: 'A value that looks like a token or key is written in the file. Move it to a setting read at run time, remove it from the file, and replace the key with a new one. PatchBay never shows the value.',
        deeper: 'A secret in a repository is visible to everyone with access, and it stays in the history after it is deleted. Treat it as already known: replace it with a new value from the service that issued it. Then read it from a setting, and keep the file that holds settings out of the repository with .gitignore.',
      },
    },
    {
      id: 'lesson.scan.security.dangerous-html', kind: 'check', skillId: 'scan.security.dangerous-html', title: 'Put text in as text', summary: 'Code that puts text into the page as HTML instead of as plain text.',
      tags: ['security', 'frontend'], keywords: ['html', 'innerhtml', 'xss'], related: ['concept.page'],
      levels: {
        simple: 'This code puts words into the page in a way that can run hidden code. Showing them as plain words avoids that.',
        practical: 'Setting innerHTML or using dangerouslySetInnerHTML turns text into page code. If the text comes from a visitor, it can include a script that runs for other people. Use textContent, or clean the text first.',
        deeper: 'When text is inserted as HTML, the browser builds elements from it, including scripts and event handlers. If any part of that text came from outside, an attacker can make code run in other visitors\' browsers, which is called cross-site scripting. Plain text insertion avoids the problem, and a well-tested cleaning library is the fallback when HTML is truly needed.',
      },
    },
    {
      id: 'lesson.scan.security.eval', kind: 'check', skillId: 'scan.security.eval', title: 'Do not run text as code', summary: 'Code that runs a piece of text as a program.',
      tags: ['security'], keywords: ['eval', 'exec', 'function'], related: ['concept.script'],
      levels: {
        simple: 'This code runs a piece of text as a program. If a stranger controls that text, they control the program.',
        practical: 'eval, new Function, and Python exec run text as code. If any part of the text comes from outside, someone else can run their code. Replace it with normal code, or read the data with JSON.parse.',
        deeper: 'Running text as code gives that text every power the program has. There is almost always a narrower tool: a lookup table instead of building function names, JSON.parse instead of evaluating data, or a small interpreter for a fixed set of commands. Removing eval also makes the code easier to read and to check.',
      },
    },
    {
      id: 'lesson.scan.security.target-blank', kind: 'check', skillId: 'scan.security.target-blank', title: 'Protect links that open a new tab', summary: 'A link that opens a new tab without saying the new page must not control this one.',
      tags: ['security', 'frontend'], keywords: ['link', 'target', 'blank', 'noopener'], related: ['concept.page'],
      levels: {
        simple: 'Some links open a new tab. A page opened that way can sometimes change the page that opened it. A small note on the link stops that.',
        practical: 'A link with target="_blank" opens a new tab. Without a rel="noopener" note, the new page can reach back and change the page that opened it. That can be used to send your visitors to a fake page. Adding rel="noopener noreferrer" to the link blocks it.',
        deeper: 'A link with target="_blank" opens a new tab. Older browsers let the new page reach back through a browser object and change the page that opened it, which can be used to send visitors to a fake page. Newer browsers already act as if the link had rel="noopener", but adding it keeps the behaviour the same everywhere. The noreferrer part also keeps your page\'s address from being passed to the new site. PatchBay can add both words for you because the change is small and easy to check.',
      },
    },
    {
      id: 'lesson.scan.security.cors-wildcard', kind: 'check', skillId: 'scan.security.cors-wildcard', title: 'Choose which sites may call the server', summary: 'A server that allows requests from any website.',
      tags: ['security', 'backend'], keywords: ['cors', 'origin', 'wildcard'], related: ['concept.route'],
      levels: {
        simple: 'This server lets any website call it from a visitor\'s browser. Allowing only your own sites is usually better.',
        practical: 'An allowed origin of * lets every website call this server from a visitor\'s browser. List only the sites that need access, such as your own front end, in the cors options.',
        deeper: 'Browsers block a page from reading replies from other sites unless the server allows it with CORS headers. A star allows every site, which is fine for public read-only data but risky for anything personal. Listing exact origins keeps other sites from using your visitors\' browsers to talk to your server.',
      },
    },
    {
      id: 'lesson.scan.security.env-file', kind: 'check', skillId: 'scan.security.env-file', title: 'Keep real settings files out of the repository', summary: 'A real .env settings file stored in the repository.',
      tags: ['security'], keywords: ['env', 'dotenv', 'gitignore', 'settings'], related: ['concept.env-var', 'concept.secret'],
      levels: {
        simple: 'A settings file that usually holds secrets is stored with the project. Everyone who can read the project can read it.',
        practical: 'A .env file is in the repository. These files usually hold keys and passwords. Remove it, add .env to .gitignore, keep a .env.example with empty values, and change any secrets that were in it.',
        deeper: 'Settings files are meant to differ per computer and to stay private. Once committed, a .env file stays in the history, so every value in it should be treated as known. A .env.example with names but no values tells other developers what to set without sharing anything.',
      },
    },
    {
      id: 'lesson.scan.api.fetch-no-ok-check', kind: 'check', skillId: 'scan.api.fetch-no-ok-check', title: 'Check that a request worked', summary: 'Code that reads a reply without checking whether the request succeeded.',
      tags: ['api', 'frontend'], keywords: ['fetch', 'ok', 'status', 'error'], related: ['concept.api-call'],
      levels: {
        simple: 'This code reads an answer without checking that the request worked. An error answer could be treated as good data.',
        practical: 'fetch does not fail when the server replies with an error such as 404 or 500. Check response.ok or response.status before reading the reply with .json, and show a clear message when it failed.',
        deeper: 'A fetch promise only rejects when the network fails. A server error still resolves, with ok set to false. Reading the body without that check can turn an error page into wrong data. This is a Possible finding because the check may happen in a shared helper elsewhere.',
      },
    },
    {
      id: 'lesson.scan.api.insecure-url', kind: 'check', skillId: 'scan.api.insecure-url', title: 'Use encrypted addresses', summary: 'A request sent to an http address, which is not encrypted.',
      tags: ['api', 'security'], keywords: ['http', 'https', 'encryption'], related: ['concept.api-call'],
      levels: {
        simple: 'This code talks to a server without encryption. Others on the same network could read or change what is sent.',
        practical: 'An http address sends data in the clear. Anyone on the network path can read or change it. Use the https version of the address, which most services offer.',
        deeper: 'Plain http has no encryption and no proof of who answers. On shared networks, someone in the middle can read requests or change replies. https solves both with certificates. Local addresses such as localhost are skipped by this check because the traffic does not leave the computer.',
      },
    },
    {
      id: 'lesson.scan.frontend.layout-overflow', kind: 'check', skillId: 'scan.frontend.layout-overflow', title: 'Text that does not fit its box', summary: 'Measured in the preview: text wider than its box, cut off, or a page wider than the screen.',
      tags: ['frontend', 'design', 'layout'], keywords: ['overflow', 'layout', 'width', 'responsive'], related: ['concept.layout'],
      levels: {
        simple: 'At this screen width, some text does not fit its box. People may not see all of it.',
        practical: 'The preview measured text wider than its box, text cut off at the bottom, or a page wider than the screen. Common fixes are letting long words wrap, removing a fixed height, or keeping a box no wider than the screen.',
        deeper: 'This finding was measured, not read from the code: PatchBay compared each element\'s content size with its box size in the look-only preview. Fixed widths, fixed heights with hidden overflow, and long unbroken words are the usual causes. The numbers depend on the browser and fonts used, so check the page on real devices too.',
      },
    },
    // ---------------------------------------------------------------- sorting
    {
      id: 'lesson.sorting.unsure', kind: 'sorting', title: 'Why PatchBay was unsure about some files', summary: 'Files with no clear clue go to Needs Review instead of being guessed.',
      tags: ['sorting'], keywords: ['needs review', 'unsure', 'label', 'sort'], related: ['concept.label'],
      levels: {
        simple: 'PatchBay found no clear clue for some files. It asks you to sort them instead of guessing.',
        practical: 'A plain .js or .ts file can run in a browser or on a server, so its extension says nothing. With no folder, import, or code clue, PatchBay puts the file in Needs Review. Set its labels once and they are saved.',
        deeper: 'Sorting uses only evidence from the skill-book. Weak clues on their own give low confidence, and low confidence goes to Needs Review rather than becoming a label. Your corrections are saved for this repository, change the counts and the checks that run, and never change the connection map.',
      },
    },
    // ---------------------------------------------------------------- 3B-1 checks (F12.1)
    {
      id: 'lesson.scan.frontend.js-syntax', kind: 'check', skillId: 'scan.frontend.js-syntax', title: 'JavaScript must be readable to run', summary: 'One typing mistake can make the browser stop reading a whole JavaScript file.',
      tags: ['frontend', 'backend'], keywords: ['javascript', 'syntax', 'error'], related: ['concept.script'],
      levels: {
        simple: 'The browser reads JavaScript one piece at a time. If it meets a mistake, it stops there. Everything after that spot does not run.',
        practical: 'A JavaScript file must follow strict spelling rules. A missing bracket, quote, or comma is enough to break it. PatchBay reads the file with a checker named acorn and shows the exact line and column where reading failed. The real cause is often on that line or just before it.',
        deeper: 'The checker reads a file as a module first, then as a plain script, because the two follow slightly different rules. It reports the first mistake only, so fixing one can reveal the next. PatchBay never runs the code to find mistakes. A file that reads cleanly can still behave wrongly, because this check looks at spelling, not at meaning. An automatic fix is offered only when exactly one tiny repair makes the first mistake go away.',
      },
    },
    {
      id: 'lesson.scan.frontend.balance', kind: 'check', skillId: 'scan.frontend.balance', title: 'Brackets and quotes come in pairs', summary: 'Every opening bracket or quote needs a closing partner. A counting check can warn but cannot prove.',
      tags: ['frontend', 'backend'], keywords: ['bracket', 'quote', 'balance'], related: ['lesson.scan.frontend.js-syntax'],
      levels: {
        simple: 'Brackets and quotes come in pairs, like a door that opens and closes. If one is missing, the code breaks. PatchBay counts them and warns when the counts differ.',
        practical: 'Every opening bracket, such as a round, square, or curly one, needs a closing partner. PatchBay counts them in files it cannot fully read, such as React and TypeScript files. A difference means a bracket may be missing or extra. The count can be fooled by unusual code, so treat it as a hint.',
        deeper: 'For React and TypeScript files PatchBay does not run a full reader. It walks through the text, skips strings and comments, and keeps a stack of open brackets. A closing bracket that does not match the top of the stack is reported. Page text with apostrophes can confuse quote tracking, so for React files the check runs twice and reports only when both runs disagree. Because of that, this check can say "may not match" but never "valid".',
      },
    },
    {
      id: 'lesson.scan.frontend.html-structure', kind: 'check', skillId: 'scan.frontend.html-structure', title: 'Tags must open and close in order', summary: 'Each opening tag needs its closing tag, and tags must close in the reverse order they opened.',
      tags: ['frontend', 'design'], keywords: ['html', 'tag', 'closing'], related: ['concept.page'],
      levels: {
        simple: 'Page tags work like boxes inside boxes. Each box you open must be closed, inner box first. A missing close can shift the whole page.',
        practical: 'Most tags come in pairs, such as div and its closing tag. They must close in the reverse order they opened. A few tags, such as br and img, stand alone, and a few, such as p and li, may skip their closing tag. PatchBay reports the tag that was left open or closed in the wrong place.',
        deeper: 'Browsers never stop on broken tags. They repair them with fixed rules, and the repair may not match what the author meant. PatchBay keeps a list of open tags and checks each closing tag against it. When a closing tag matches an outer tag, every inner tag still open is reported at its own start line. An automatic fix inserts one closing tag just before the outer closing tag, and only when that is the single possible repair.',
      },
    },
    {
      id: 'lesson.scan.frontend.html-id-duplicate', kind: 'check', skillId: 'scan.frontend.html-id-duplicate', title: 'An id must be used once', summary: 'An id names one tag only. Repeating it confuses links, labels, and scripts.',
      tags: ['frontend', 'design'], keywords: ['id', 'duplicate', 'html'], related: ['concept.page'],
      levels: {
        simple: 'An id is a name tag for one thing on the page. Two things with the same name get mixed up. Give each its own name.',
        practical: 'An id should appear once per page. Links that jump to a spot, labels tied to a field, and scripts that look up a tag all use it. With two matches, they usually pick the first. Use a class when several tags need the same style.',
        deeper: 'The rules of HTML say an id must be unique in a page. Browsers do not complain, so the mistake hides until something depends on it. A script that asks for an id gets the first match only, and a link to that id jumps to the first match only. PatchBay compares plain id values exactly and skips values built by templates.',
      },
    },
    {
      id: 'lesson.scan.frontend.html-attr-missing', kind: 'check', skillId: 'scan.frontend.html-attr-missing', title: 'Some tags need an address', summary: 'An image needs a source and a stylesheet link needs an address, or nothing loads.',
      tags: ['frontend', 'design'], keywords: ['attribute', 'src', 'href'], related: ['concept.page', 'concept.stylesheet'],
      levels: {
        simple: 'Some tags need one more piece of information to work. An image tag needs the address of its picture. Without it, nothing shows.',
        practical: 'An img tag needs a src attribute that points to the picture. A link tag for a stylesheet needs an href that points to the file. Without them the browser loads nothing and stays quiet. PatchBay checks these two cases in plain HTML pages.',
        deeper: 'Browsers ignore a tag that lacks the attribute that gives it purpose, and they report nothing to the visitor. That makes this mistake easy to miss when a page looks nearly right. PatchBay checks only attributes that are always required, in files without template syntax, because a template may fill the value in later. Other missing attributes, such as alt, have their own checks.',
      },
    },
    {
      id: 'lesson.scan.frontend.css-possible-invalid', kind: 'check', skillId: 'scan.frontend.css-possible-invalid', title: 'CSS the browser ignores', summary: 'A rule the browser drops has no effect. It may be misspelled or too new for this browser.',
      tags: ['frontend', 'design'], keywords: ['css', 'rule', 'invalid'], related: ['concept.stylesheet'],
      levels: {
        simple: 'A style rule is like an instruction. If the browser cannot understand it, the browser skips it. Then the look you wanted does not appear.',
        practical: 'PatchBay gives each style rule to the browser and sees whether it was kept. A dropped rule often has a spelling mistake or a missing bracket. It can also be a new feature that this browser does not know yet. That is why the label says possible.',
        deeper: 'Browsers throw away style rules they cannot read and carry on, so a typing mistake leaves no error message. PatchBay uses a style sheet object that is never shown on the page, so nothing loads and nothing changes. A rule can also be dropped because it is newer than the browser or meant for a different browser, which is why this finding is only possible. Import rules are ignored by this check.',
      },
    },
    {
      id: 'lesson.scan.frontend.css-braces', kind: 'check', skillId: 'scan.frontend.css-braces', title: 'Style rules need matching braces', summary: 'Every opening curly bracket in CSS needs a closing one, or later rules can be lost.',
      tags: ['frontend', 'design'], keywords: ['css', 'brace', 'bracket'], related: ['concept.stylesheet'],
      levels: {
        simple: 'Each style rule is wrapped in curly brackets. If one is missing, the browser gets confused. Later styles may stop working.',
        practical: 'A style rule starts with a curly bracket and ends with a closing one. A missing closing bracket can swallow the rules after it. An extra one can end a block too early. PatchBay counts the brackets and reports the line where they stop matching.',
        deeper: 'The counter walks through the file once and skips comments and quoted text, so a bracket inside a comment is not counted. Grouped rules, such as those inside a media query, nest brackets, and each level must close. The reported line is where the count first goes wrong, which is not always where the mistake was typed. Automatic fixes are not offered because the right place for a missing bracket cannot be known.',
      },
    },
    {
      id: 'lesson.scan.frontend.layout-overlap', kind: 'check', skillId: 'scan.frontend.layout-overlap', title: 'Boxes should not hide each other', summary: 'Two neighbouring boxes that overlap can hide text or buttons, unless the overlap is on purpose.',
      tags: ['frontend', 'design'], keywords: ['overlap', 'layout', 'boxes'], related: ['concept.layout'],
      levels: {
        simple: 'Boxes on a page normally sit next to each other. Sometimes two boxes land on top of each other. Then one can hide the other.',
        practical: 'PatchBay measures the boxes in the preview at three screen widths. It reports neighbouring boxes whose areas overlap by a clear amount. Menus, pop-ups, and fixed bars are skipped on purpose. Because PatchBay cannot know what the designer wanted, the confidence is never high.',
        deeper: 'Only neighbours in the normal page flow are compared, and hidden boxes are skipped. A box moved by a transform or a negative margin gets low confidence, because designers often overlap things on purpose. An overlap smaller than 16 square pixels, or smaller than 15 percent of the smaller box, is ignored.',
      },
    },
    {
      id: 'lesson.scan.frontend.tap-target', kind: 'check', skillId: 'scan.frontend.tap-target', title: 'Buttons need room for a finger', summary: 'Buttons and links under 44 pixels are hard to tap on a phone.',
      tags: ['frontend', 'design'], keywords: ['tap', 'button', 'size', 'phone'], related: ['concept.layout', 'lesson.scan.frontend.button-name'],
      levels: {
        simple: 'Fingers are bigger than mouse arrows. A tiny button is hard to press on a phone. Make buttons big enough to tap.',
        practical: 'A common guide is that buttons and links should be at least 44 pixels high and wide on phones. PatchBay measures them at 375 and 768 pixels wide. Links inside a sentence are skipped, because they are allowed to be small. A fix adds a minimum height and width.',
        deeper: 'Touch screens are less exact than a mouse, so small targets cause missed taps. The measured size is the box the browser draws, so padding counts. Hidden and disabled controls are skipped, and a tag marked as a button by role is reported with medium confidence. The recipe adds a minimum size, and PatchBay measures again at all three widths and undoes the change if anything gets worse.',
      },
    },
    {
      id: 'lesson.scan.frontend.text-small', kind: 'check', skillId: 'scan.frontend.text-small', title: 'Text must be big enough to read', summary: 'Text under 12 pixels is hard to read on a phone.',
      tags: ['frontend', 'design'], keywords: ['text', 'font', 'size', 'phone'], related: ['concept.stylesheet', 'concept.layout'],
      levels: {
        simple: 'Tiny words are hard to read on a small screen. Make the text a little bigger. Your visitors will thank you.',
        practical: 'PatchBay measures the text size in the preview at phone and tablet widths. Text under 12 pixels is reported. Notes written in small, sub, or sup tags get medium confidence, because small text is often meant there. A fix raises the size to 14 pixels.',
        deeper: 'Size is measured as the browser works it out, after all style rules and inherited values. Sizes written in relative units are therefore measured in real pixels. Raising the size can make text wrap onto more lines, so PatchBay measures the page again after the fix and undoes it if it caused a new problem.',
      },
    },
    {
      id: 'lesson.scan.frontend.contrast', kind: 'check', skillId: 'scan.frontend.contrast', title: 'Text needs contrast', summary: 'Text colour must differ enough from its background. 4.5 to 1 is the common minimum.',
      tags: ['frontend', 'design'], keywords: ['contrast', 'colour', 'readability'], related: ['concept.stylesheet', 'concept.layout'],
      levels: {
        simple: 'Light grey words on a white page are hard to read. The words and the background need to look very different. Dark on light, or light on dark, works well.',
        practical: 'Contrast is a number that compares two colours. Normal text should reach 4.5 to 1, and large text should reach 3 to 1. PatchBay measures it only when the background is one plain colour. Over a gradient or a picture it says it cannot measure.',
        deeper: 'The number comes from the brightness of each colour, as the web accessibility guidelines define it. Large text is 24 pixels, or 18.66 pixels and bold. A see-through text colour is mixed with the background first, and the result gets medium confidence. The fix moves the text colour toward black or white in small steps and stops at the first colour that reaches the minimum.',
      },
    },
    {
      id: 'lesson.scan.frontend.media-unsized', kind: 'check', skillId: 'scan.frontend.media-unsized', title: 'Pictures need a size limit', summary: 'A picture with no size limit can overflow its box or make the page jump as it loads.',
      tags: ['frontend', 'design'], keywords: ['image', 'picture', 'size', 'width'], related: ['lesson.scan.frontend.img-alt', 'concept.layout'],
      levels: {
        simple: 'A big picture can spill out of its box. It can push the page wider than the phone screen. Give pictures a size limit.',
        practical: 'PatchBay measures real pictures in the preview and reports one that is wider than its container. It also reports a picture with no written width, height, or maximum width when the picture could not be measured. A fix adds a maximum width of 100 percent and a height of auto. The second kind of report has low confidence, because it is read from the page text.',
        deeper: 'A picture is measured only after it has loaded, so slow outside pictures may still be waiting when the check runs, and PatchBay says so. Pictures PatchBay could not load, such as ones that are too large or from a blocked address, appear as boxes and cannot be measured. For those, the check reads the page and style text and reports a picture that has no size limit anywhere. That reading can be wrong, so it always has low confidence.',
      },
    },
  ],
};
