/**
 * A small in-memory store of recent things, the least recently used let go first once it holds more than `maxEntries`
 * or, with a weight, more than `maxWeight` in all. For the recent phrases Luna says (the speech route's recordings, her
 * browser's copies of them).
 */
export class RecentCache<V> {
  private readonly items = new Map<string, V>();
  private total = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly weight: (v: V) => number = () => 0,
    private readonly maxWeight = Infinity,
  ) {}

  get(key: string): V | undefined {
    const v = this.items.get(key);
    if (v === undefined) return undefined;
    // Used again: now the most recent.
    this.items.delete(key);
    this.items.set(key, v);
    return v;
  }

  set(key: string, v: V): void {
    const old = this.items.get(key);
    if (old !== undefined) {
      this.total -= this.weight(old);
      this.items.delete(key);
    }
    // Something heavier than the whole store is not kept.
    if (this.weight(v) > this.maxWeight) return;
    this.items.set(key, v);
    this.total += this.weight(v);
    for (const [k, x] of this.items) {
      if (this.items.size <= this.maxEntries && this.total <= this.maxWeight) break;
      this.items.delete(k);
      this.total -= this.weight(x);
    }
  }

  get size(): number {
    return this.items.size;
  }
}
