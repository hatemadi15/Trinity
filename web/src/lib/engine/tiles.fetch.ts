import { tilePath, type TileLevel, type TileSource } from './tiles';

/** Reads tiles over HTTP from `${base}/tiles/<level path>`; a 404 means "no tile" (null). */
export class FetchTileSource implements TileSource {
  constructor(private base: string) {}
  async getTileBytes(level: TileLevel, ty: number, tx: number): Promise<Uint8Array | null> {
    const res = await fetch(`${this.base}/tiles/${tilePath(level, ty, tx)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`tile ${level.id} ${ty}_${tx}: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
