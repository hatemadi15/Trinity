/**
 * Where everything sits on the "Choose a site" map (spec 23): the relief picture of the south pole as wide as the
 * window, the inset of the whole Moon, and one marker per site, with close markers moved apart so each can be picked.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapLayout {
  /** `fill`: the map is the window under the header. `stack`: on a narrow screen, the relief square with the inset under it. */
  mode: 'fill' | 'stack';
  width: number;
  height: number;
  /** The square relief picture, which may hang over the box's top and bottom. */
  relief: Rect;
  /** The whole Moon, plate carrée, 0° at the centre. */
  inset: Rect;
}

/** The rows of the relief picture that hold its sites, as shares of its height: the crop keeps them in view. */
export const RELIEF_BAND = { top: 0.211, bottom: 0.597 };
/** Room over the inset for its caption. */
export const INSET_CAPTION_PX = 30;
const EDGE = 16;

/**
 * The layout for a box of `width` × `height` pixels. In `fill` mode the height is the window's; in `stack` mode
 * the height is worked out here, and the box takes it.
 */
export function layoutSiteMap(width: number, height: number, mode: 'fill' | 'stack'): MapLayout {
  if (mode === 'stack') {
    const side = width;
    const insetW = Math.min(width - 2 * EDGE, 560);
    const inset = { x: Math.round((width - insetW) / 2), y: side + INSET_CAPTION_PX + 4, w: insetW, h: Math.round(insetW / 2) };
    return { mode, width, height: inset.y + inset.h + EDGE, relief: { x: 0, y: 0, w: side, h: side }, inset };
  }
  const side = width;
  // The band of sites is centred in the box; a picture taller than the box never shows an edge.
  const centred = height / 2 - ((RELIEF_BAND.top + RELIEF_BAND.bottom) / 2) * side;
  const y = side >= height ? Math.min(0, Math.max(height - side, centred)) : Math.max(0, (height - side) / 2);
  const insetW = Math.round(Math.min(440, Math.max(280, width * 0.28)));
  const inset = { x: width - insetW - 24, y: height - Math.round(insetW / 2) - 24, w: insetW, h: Math.round(insetW / 2) };
  return { mode, width, height, relief: { x: 0, y: Math.round(y), w: side, h: side }, inset };
}

/** A point of the relief picture (fractions from its top left) in the box. */
export function onRelief(layout: MapLayout, u: number, v: number): { x: number; y: number } {
  return { x: layout.relief.x + u * layout.relief.w, y: layout.relief.y + v * layout.relief.h };
}

/** A latitude and longitude on the inset of the whole Moon. */
export function onInset(layout: MapLayout, lat: number, lon: number): { x: number; y: number } {
  const east = ((((lon + 180) % 360) + 360) % 360) / 360;
  return { x: layout.inset.x + east * layout.inset.w, y: layout.inset.y + ((90 - lat) / 180) * layout.inset.h };
}

export interface Spot {
  id: string;
  /** Where the site is. */
  x: number;
  y: number;
  /** The box its marker stays in. */
  within: Rect;
}

/**
 * Moves markers that sit closer than `gap` pixels apart, a little at a time and as little as it takes, so that
 * each has room to be pointed at. A marker stays inside its own map; the result is the same for the same input.
 */
export function spreadMarkers(spots: Spot[], gap: number, rounds = 80): Map<string, { x: number; y: number }> {
  const at = spots.map((s) => ({ x: s.x, y: s.y }));
  const pad = gap / 2;
  for (let round = 0; round < rounds; round++) {
    let moved = false;
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        let dx = at[j].x - at[i].x;
        let dy = at[j].y - at[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= gap) continue;
        if (d < 1e-6) {
          // Two sites on the same pixel part along a direction that depends only on their order.
          const a = (i * 7 + j * 13) % 12;
          dx = Math.cos((a * Math.PI) / 6);
          dy = Math.sin((a * Math.PI) / 6);
          d = 1;
        }
        const push = (gap - d) / 2 + 0.01;
        at[i].x -= (dx / d) * push;
        at[i].y -= (dy / d) * push;
        at[j].x += (dx / d) * push;
        at[j].y += (dy / d) * push;
        moved = true;
      }
    }
    for (let i = 0; i < at.length; i++) {
      const b = spots[i].within;
      // A box too small for the margin keeps the marker on its centre line.
      at[i].x = b.w > 2 * pad ? Math.min(b.x + b.w - pad, Math.max(b.x + pad, at[i].x)) : b.x + b.w / 2;
      at[i].y = b.h > 2 * pad ? Math.min(b.y + b.h - pad, Math.max(b.y + pad, at[i].y)) : b.y + b.h / 2;
    }
    if (!moved) break;
  }
  return new Map(spots.map((s, i) => [s.id, { x: Math.round(at[i].x * 10) / 10, y: Math.round(at[i].y * 10) / 10 }]));
}
