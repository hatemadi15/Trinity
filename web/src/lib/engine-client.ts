import { loadManifest } from './data/loaders';
import { FetchTileSource } from './engine/tiles.fetch';
import { handleEngineRequest, type EngineRequest, type EngineResponse, type MaskResult } from './engine/worker-handler';

/** Runs mask computations off the main thread when Workers exist; falls back to inline execution. */
export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: MaskResult) => void; reject: (e: Error) => void }>();

  constructor(private base: string) {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('../workers/engine.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<EngineResponse>) => {
        const res = event.data;
        const slot = this.pending.get(res.id);
        if (!slot) return;
        this.pending.delete(res.id);
        if (res.type === 'error') slot.reject(new Error(res.message));
        else slot.resolve(res);
      };
      this.worker.onerror = (e) => {
        for (const slot of this.pending.values()) slot.reject(new Error(e.message));
        this.pending.clear();
      };
    }
  }

  async computeMask(lat: number, lon: number, opts: { mastM?: number } = {}): Promise<MaskResult> {
    const req: EngineRequest = { id: this.nextId++, type: 'mask', lat, lon, base: this.base, mastM: opts.mastM };
    if (!this.worker) {
      const res = await handleEngineRequest(req, { manifest: loadManifest, source: (b) => new FetchTileSource(b) });
      if (res.type === 'error') throw new Error(res.message);
      return res;
    }
    return new Promise<MaskResult>((resolve, reject) => {
      this.pending.set(req.id, { resolve, reject });
      this.worker!.postMessage(req);
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}
