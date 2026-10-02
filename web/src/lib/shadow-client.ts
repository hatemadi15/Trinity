import type { Level } from './engine/shadow';
import { createShadowHandler, type ShadowPicture, type ShadowRequest, type ShadowResponse } from './engine/shadow-handler';

/**
 * Runs the shadow sweep off the main thread when Workers exist, inline otherwise. While the time
 * moves, requests can overtake each other: a picture is only delivered if no newer request for the
 * same levels was made since, so an older hour never replaces a newer one.
 */
export class ShadowClient {
  private worker: Worker | null = null;
  private inline: ((req: ShadowRequest) => ShadowResponse) | null = null;
  private nextId = 1;
  private latest = new Map<string, number>();
  private pending = new Map<number, (res: ShadowResponse) => void>();

  constructor() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('../workers/shadow.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<ShadowResponse>) => {
        const done = this.pending.get(event.data.id);
        if (!done) return;
        this.pending.delete(event.data.id);
        done(event.data);
      };
    } else {
      this.inline = createShadowHandler();
    }
  }

  private send(req: ShadowRequest): Promise<ShadowResponse> {
    if (this.worker) {
      return new Promise((resolve) => {
        this.pending.set(req.id, resolve);
        this.worker!.postMessage(req);
      });
    }
    // Inline, the work waits a turn, so a request made right after this one can overtake it.
    return new Promise((resolve) => setTimeout(() => resolve(req.type === 'shade' && this.latest.get(req.key) !== req.id ? { id: req.id, type: 'ok' } : this.inline!(req)), 0));
  }

  async setLevels(key: string, levels: Level[]): Promise<void> {
    const res = await this.send({ id: this.nextId++, type: 'levels', key, levels });
    if (res.type === 'error') throw new Error(res.message);
  }

  /** The picture for one Sun, or null when a newer request for the same levels has been made since. */
  async picture(key: string, bearingDeg: number, elDeg: number, half: boolean): Promise<ShadowPicture | null> {
    const id = this.nextId++;
    this.latest.set(key, id);
    const res = await this.send({ id, type: 'shade', key, bearingDeg, elDeg, half });
    if (this.latest.get(key) !== id) return null;
    if (res.type === 'error') throw new Error(res.message);
    return res.type === 'picture' ? res : null;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
