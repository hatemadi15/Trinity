/**
 * Names written on a map next to their pins, without covering each other or other pins. Everything is in
 * fractions of the map's side (0 to 1 from the top left), measured for a map `sizePx` pixels wide.
 */

export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LabelSide = 'below' | 'above' | 'right' | 'left' | 'below-right' | 'below-left' | 'above-right' | 'above-left';

/** Where a name went: its side of the pin, its box, and whether it sits far enough out to need a line to the pin. */
export interface Placement {
  side: LabelSide;
  box: LabelBox;
  leader: boolean;
}

/** The width of one character of a 15 px name, the padding of its plate, the plate's height. */
const CHAR_PX = 8.2;
const PAD_PX = 16;
const HEIGHT_PX = 26;
/** How far a name sits from its pin's centre: next to it, or a short line away. */
const NEAR_PX = 14;
const FAR_PX = 40;
/** Half the side of the square kept clear around each pin, and the space kept between two boxes. */
const PIN_PX = 7;
const MARGIN_PX = 2;
const SIDES: LabelSide[] = ['below', 'above', 'right', 'left', 'below-right', 'below-left', 'above-right', 'above-left'];
/** A diagonal side puts the corner of the box this far along each axis, for the same distance from the pin. */
const DIAGONAL = Math.SQRT1_2;

/** The size of a 15 px name on its plate, in fractions of a map `sizePx` pixels wide. */
export function plateSize(text: string, sizePx: number): { w: number; h: number } {
  return { w: (text.length * CHAR_PX + PAD_PX) / sizePx, h: HEIGHT_PX / sizePx };
}

/** The box a name takes on one side of its pin, `distancePx` from its centre. */
export function labelBox(u: number, v: number, text: string, side: LabelSide, sizePx: number, distancePx = NEAR_PX): LabelBox {
  const { w, h } = plateSize(text, sizePx);
  const d = distancePx / sizePx;
  const k = d * DIAGONAL;
  switch (side) {
    case 'below':
      return { x: u - w / 2, y: v + d, w, h };
    case 'above':
      return { x: u - w / 2, y: v - d - h, w, h };
    case 'right':
      return { x: u + d, y: v - h / 2, w, h };
    case 'left':
      return { x: u - d - w, y: v - h / 2, w, h };
    case 'below-right':
      return { x: u + k, y: v + k, w, h };
    case 'below-left':
      return { x: u - k - w, y: v + k, w, h };
    case 'above-right':
      return { x: u + k, y: v - k - h, w, h };
    case 'above-left':
      return { x: u - k - w, y: v - k - h, w, h };
  }
}

const overlaps = (a: LabelBox, b: LabelBox, m: number) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

/**
 * Which pins get their name written on the map, and where: in the order given (most important first),
 * each name goes next to its pin (below, above, right, left, then the corners), or failing that a short
 * line away in the same order, at the first place that stays on the map and clear of the names already
 * placed, of every other pin and of the `keepOut` boxes. A name that fits nowhere is left for the
 * pointer to show.
 */
export function placeMapLabels(pins: { id: string; u: number; v: number; text: string }[], sizePx: number, keepOut: LabelBox[] = []): Map<string, Placement> {
  const m = MARGIN_PX / sizePx;
  const r = PIN_PX / sizePx;
  const dots = pins.map((p) => ({ id: p.id, box: { x: p.u - r, y: p.v - r, w: 2 * r, h: 2 * r } }));
  const taken: LabelBox[] = [...keepOut];
  const out = new Map<string, Placement>();
  for (const p of pins) {
    search: for (const distance of [NEAR_PX, FAR_PX]) {
      for (const side of SIDES) {
        const b = labelBox(p.u, p.v, p.text, side, sizePx, distance);
        if (b.x < 0 || b.y < 0 || b.x + b.w > 1 || b.y + b.h > 1) continue;
        if (taken.some((t) => overlaps(b, t, m))) continue;
        if (dots.some((d) => d.id !== p.id && overlaps(b, d.box, m))) continue;
        taken.push(b);
        out.set(p.id, { side, box: b, leader: distance > NEAR_PX });
        break search;
      }
    }
  }
  return out;
}
