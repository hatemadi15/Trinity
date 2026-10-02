/** A label as laid out on the page: its box in pixels and how much it matters (lower is more important). */
export interface PlacedLabel {
  left: number;
  top: number;
  right: number;
  bottom: number;
  priority: number;
}

/**
 * The labels to hide so that no two drawn labels overlap: taken most important first (the earlier one
 * first among equals), each label is kept unless it overlaps one already kept. A label with no size is
 * not drawn and takes no room. The estimates a chart places its labels by can fall short at some widths;
 * this is the last word, made on the measured boxes.
 */
export function labelsToHide(labels: PlacedLabel[]): boolean[] {
  const order = labels.map((l, i) => i).sort((a, b) => labels[a].priority - labels[b].priority || a - b);
  const hide = labels.map(() => false);
  const kept: PlacedLabel[] = [];
  for (const i of order) {
    const l = labels[i];
    if (l.right - l.left <= 0 || l.bottom - l.top <= 0) continue;
    if (kept.some((k) => l.left < k.right && k.left < l.right && l.top < k.bottom && k.top < l.bottom)) hide[i] = true;
    else kept.push(l);
  }
  return hide;
}
