// @node: F12.1
// The only place the outside host lists appear. Matching is by exact host name (see hostMatch.ts).
/** Stylesheets (Look-only and Run-scripts modes). */
export const STYLE_HOSTS: readonly string[] = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com'];
/** Font files used by an allowed stylesheet. */
export const FONT_HOSTS: readonly string[] = ['fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'];
/** Scripts (Run-scripts mode only). */
export const SCRIPT_HOSTS: readonly string[] = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'code.jquery.com', 'cdn.tailwindcss.com'];
