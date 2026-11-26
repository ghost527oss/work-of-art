// @node: F7.2
// The allowlists as data: which tags and attributes the preview may write.
const w = (s: string) => new Set(s.split(' '));

export const ALLOWED_TAGS = w('a abbr address article aside b bdi bdo big blockquote br button caption center cite code col colgroup data dd del details dfn div dl dt em fieldset figcaption figure font footer form h1 h2 h3 h4 h5 h6 header hgroup hr i input ins kbd label legend li main mark menu meter nav ol optgroup option output p pre progress q rp rt ruby s samp search section select small span strike strong sub summary sup table tbody td textarea tfoot th thead time tr tt u ul var wbr');
export const SVG_TAGS = w('svg g path circle ellipse rect line polyline polygon text tspan defs lineargradient radialgradient stop clippath title desc');
export const MEDIA_TAGS = w('img picture source video audio track canvas');
export const NEVER_TAGS = w('iframe object embed base meta frame frameset applet portal template foreignobject use image script link style noscript html head body');

export const ALLOWED_ATTRS = w('class id style lang dir title alt width height type value placeholder name for min max step rows cols colspan rowspan span role tabindex checked selected disabled readonly required open hidden');
export const SVG_ATTRS = w('viewbox d fill stroke stroke-width stroke-linecap stroke-linejoin cx cy r rx ry x y x1 x2 y1 y2 points transform offset stop-color stop-opacity opacity fill-opacity fill-rule clip-rule xmlns preserveaspectratio');
export const SVG_CASE: Record<string, string> = { viewbox: 'viewBox', preserveaspectratio: 'preserveAspectRatio', lineargradient: 'linearGradient', radialgradient: 'radialGradient', clippath: 'clipPath' };

export function attrAllowed(name: string, inSvg: boolean): boolean {
  if (ALLOWED_ATTRS.has(name)) return true;
  if (name.startsWith('aria-') && /^[a-z-]+$/.test(name)) return true;
  if (name.startsWith('data-') && /^[a-z0-9-]+$/.test(name)) return true;
  return inSvg && SVG_ATTRS.has(name);
}
