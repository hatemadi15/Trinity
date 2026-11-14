import type { VersionsInput, VersionsResult } from './figures';
import { handleVersions, type VersionsRequest, type VersionsResponse } from './handler';

export interface VersionsRunner {
  run(input: VersionsInput): Promise<{ result: VersionsResult; ms: number }>;
}

/**
 * Works out a landing under every terrain version off the main thread, in its own worker, as the planner's search does;
 * where there are no workers (tests), the same handler runs inline, a turn later so the page has drawn its waiting state.
 */
export class VersionsClient implements VersionsRunner {
  private worker: Worker | null = null;
  private next = 1;
  private listeners = new Map<number, (res: VersionsResponse) => void>();

  run(input: VersionsInput): Promise<{ result: VersionsResult; ms: number }> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.listeners.set(id, (res) => {
        this.listeners.delete(id);
        if (res.type === 'done') resolve({ result: res.result, ms: res.ms });
        else reject(new Error(res.message));
      });
      this.send({ type: 'versions', id, input });
    });
  }

  private dispatch = (res: VersionsResponse) => this.listeners.get(res.id)?.(res);

  private send(req: VersionsRequest) {
    if (typeof Worker !== 'undefined') {
      if (!this.worker) {
        this.worker = new Worker(new URL('../../workers/ensemble.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent<VersionsResponse>) => this.dispatch(e.data);
        this.worker.onerror = (e) => {
          for (const [id, on] of this.listeners) on({ type: 'error', id, message: e.message || 'the terrain versions’ worker failed' });
        };
      }
      this.worker.postMessage(req);
      return;
    }
    setTimeout(() => this.dispatch(handleVersions(req)), 0);
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}

/** The app's one runner, made on first use. */
let shared: VersionsClient | null = null;
export function versionsRunner(): VersionsRunner {
  shared ??= new VersionsClient();
  return shared;
}
