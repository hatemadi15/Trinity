import type { Level } from './engine/shadow';
import { createShadowHandler, type ShadowPicture, type ShadowRequest, type ShadowResponse } from './engine/shadow-handler';

/** Sets of levels kept to hand to the inline sweep if the worker fails: as many as the worker holds (the handler's HELD). */
const KEPT = 2;

/**
 * Runs the shadow sweep off the main thread when Workers exist, inline otherwise. While the time
 * moves, requests can overtake each other: a picture is only delivered if no newer request for the
 * same levels was made since, so an older hour never replaces a newer one. A worker that cannot start
 * or fails later is replaced by the inline sweep for good: it gets the levels the worker had accepted,
 * then answers every request still waiting, in order, so none waits forever.
 */
export class ShadowClient {
  private worker: Worker | null = null;
  private inline: ((req: ShadowRequest) => ShadowResponse) | null = null;
  private nextId = 1;
  private latest = new Map<string, number>();
  private pending = new Map<number, { req: ShadowRequest; done: (res: ShadowResponse) => void }>();
  /** The levels accepted last, per key, oldest first: what the worker holds. */
  private accepted = new Map<string, Level[]>();

  constructor() {
    if (typeof Worker !== 'undefined') {
      try {
        const worker = new Worker(new URL('../workers/shadow.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<ShadowResponse>) => {
          const waiting = this.pending.get(event.data.id);
          if (!waiting) return;
          this.pending.delete(event.data.id);
          waiting.done(event.data);
        };
        worker.onerror = () => this.fallBack();
        worker.onmessageerror = () => this.fallBack();
        this.worker = worker;
      } catch {
        // A browser that refuses the worker (a page policy, no module workers) gets the sweep on this thread.
      }
    }
    if (!this.worker) this.inline = createShadowHandler();
  }

  /** The inline answer: nothing for a picture a newer request for the same levels has overtaken. */
  private runInline(req: ShadowRequest): ShadowResponse {
    return req.type === 'shade' && this.latest.get(req.key) !== req.id ? { id: req.id, type: 'ok' } : this.inline!(req);
  }

  /** The worker failed: the inline sweep takes over with the levels the worker held, then the requests still waiting. */
  private fallBack() {
    const worker = this.worker;
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    this.worker = null;
    const inline = createShadowHandler();
    for (const [key, levels] of this.accepted) inline({ id: 0, type: 'levels', key, levels });
    this.inline = inline;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    // Each waits a turn, as inline requests do, in the order they were made.
    for (const { req, done } of waiting) setTimeout(() => done(this.runInline(req)), 0);
  }

  private send(req: ShadowRequest): Promise<ShadowResponse> {
    if (this.worker) {
      return new Promise((resolve) => {
        this.pending.set(req.id, { req, done: resolve });
        this.worker!.postMessage(req);
      });
    }
    // Inline, the work waits a turn, so a request made right after this one can overtake it.
    return new Promise((resolve) => setTimeout(() => resolve(this.runInline(req)), 0));
  }

  async setLevels(key: string, levels: Level[]): Promise<void> {
    const res = await this.send({ id: this.nextId++, type: 'levels', key, levels });
    if (res.type === 'error') throw new Error(res.message);
    this.accepted.delete(key);
    this.accepted.set(key, levels);
    while (this.accepted.size > KEPT) this.accepted.delete(this.accepted.keys().next().value!);
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
