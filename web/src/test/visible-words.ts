// The words a page shows before a tap, at a phone's or a wide screen's width (spec 20.1): jsdom applies no
// Tailwind, so what shows is read from the classes the pages use to hide and show by width.

/** Tailwind's breakpoints, as the app uses them (no custom screens in globals.css). */
const BREAKPOINTS: Record<string, number> = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 };

/** The display utilities that show an element again after a `hidden` at a narrower or wider width. */
const SHOWN = new Set(['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'contents', 'not-sr-only']);
const GONE = new Set(['hidden', 'sr-only']);

/** Signs that are not words: the chevrons, the dot between links, the arrows. */
const SIGNS = /^[›‹▾▴▸·↓↑→←•|/–-]+$/;

/**
 * Whether the classes hide the element at this width. Of the utilities that apply at the width (the bare ones,
 * the `max-x:` ones below x, the `x:` ones from x), the most specific wins, as the stylesheet orders them: bare,
 * then `max-` variants, then the min-width ones by size. A tie keeps the later class.
 */
export function hiddenAt(className: string, width: number): boolean {
  let best = -1;
  let gone = false;
  for (const token of className.split(/\s+/)) {
    if (!token) continue;
    const parts = token.split(':');
    const util = parts[parts.length - 1];
    if (!GONE.has(util) && !SHOWN.has(util)) continue;
    // Only plain width variants count; a state variant (hover:, print:, aria-*:) never applies to a still page.
    const variants = parts.slice(0, -1);
    let rank = 0;
    let applies = true;
    for (const v of variants) {
      // A width written out counts as a named one does: `max-[1800px]:` below 1800 px, `min-[1800px]:` from it.
      const max = v.startsWith('max-') ? v.slice(4) : null;
      const name = max ?? (v.startsWith('min-') ? v.slice(4) : v);
      const px = /^\[(\d+)px\]$/.exec(name);
      const bp = px ? Number(px[1]) : v.startsWith('min-') ? undefined : BREAKPOINTS[name];
      if (bp === undefined) {
        applies = false;
        break;
      }
      if (max !== null) {
        applies &&= width < bp;
        rank = Math.max(rank, 1);
      } else {
        applies &&= width >= bp;
        rank = Math.max(rank, 2 + bp / 10000);
      }
    }
    if (!applies || rank < best) continue;
    best = rank;
    gone = GONE.has(util);
  }
  return gone;
}

/** Whether a node shows at this width: no ancestor up to `root` is `hidden`, `aria-hidden` aside (it can be seen). */
function shown(node: Element, root: Element, width: number): boolean {
  for (let el: Element | null = node; el; el = el.parentElement) {
    if (el.hasAttribute('hidden')) return false;
    if (el instanceof HTMLElement && el.style.display === 'none') return false;
    if (hiddenAt(el.getAttribute('class') ?? '', width)) return false;
    if (el === root) break;
  }
  return true;
}

/**
 * The words under `root` that show at `width` before any tap: text in a `hidden` element, a closed disclosure's
 * unmounted content or a class that hides it at that width does not count; a number with its unit ("100 %",
 * "2.4°") counts as the words it is written as, and signs such as "›" or "·" count as none.
 */
export function visibleWords(root: Element, width: number): string[] {
  const words: string[] = [];
  const walk = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const text = walk.currentNode as Text;
    const parent = text.parentElement;
    if (!parent || parent.closest('script, style, svg title') || !shown(parent, root, width)) continue;
    // A closed list shows its chosen option only: the others appear once it is opened, a tap.
    const option = parent.closest('option');
    if (option && !option.selected) continue;
    for (const w of (text.textContent ?? '').replace(/ /g, ' ').split(/\s+/)) if (w && !SIGNS.test(w)) words.push(w);
  }
  return words;
}

/** The phone and the wide screen the caps are set for (390 × 844 and 1440 × 900). */
export const PHONE = 390;
export const WIDE = 1440;
