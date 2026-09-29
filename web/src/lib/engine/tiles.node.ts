import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { tilePath, type TileLevel, type TileManifest, type TileSource } from './tiles';

export function readManifest(dir: string): TileManifest {
  return JSON.parse(fsSync.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as TileManifest;
}

/** Reads tiles from a local `data_out/tiles`-style directory (tests and scripts). */
export class FsTileSource implements TileSource {
  constructor(private dir: string) {}
  async getTileBytes(level: TileLevel, ty: number, tx: number): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await fs.readFile(path.join(this.dir, tilePath(level, ty, tx))));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
}
