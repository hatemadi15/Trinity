import type { Ephemeris } from '../engine/ephemeris';
import type { SiteFinding, SiteInput } from './search';
import { createPlanHandler, type PlanRequest, type PlanResponse } from './search-handler';
import type { MissionSpec } from './spec';

/** A search under way: its end (null when cancelled) and the way to stop it. */
export interface PlanRun {
  done: Promise<{ findings: SiteFinding[]; ms: number } | null>;
  cancel: () => void;
}

export interface PlanRunner {
  run(spec: MissionSpec, sites: SiteInput[], stepH: number, eph: Ephemeris, onProgress: (done: number, total: number, site: string) => void): PlanRun;
}

/**
 * Runs the planner's search off the main thread in its own worker, as the skyline engine does (EngineClient); where
 * there are no workers (tests), the same handler runs inline, still yielding between sites.
 */
export class PlanClient implements PlanRunner {
  private worker: Worker | null = null;
  private inline: ((req: PlanRequest) => Promise<void>) | null = null;
  private sentEph: Ephemeris | null = null;
  private next = 1;
  private listeners = new Map<number, (res: PlanResponse) => void>();

  private dispatch = (res: PlanResponse) => this.listeners.get(res.id)?.(res);

  private send(req: PlanRequest) {
    if (typeof Worker !== 'undefined') {
      if (!this.worker) {
        this.worker = new Worker(new URL('../../workers/plan.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent<PlanResponse>) => this.dispatch(e.data);
        this.worker.onerror = (e) => {
          for (const [id, on] of this.listeners) on({ type: 'error', id, message: e.message || 'the planner worker failed' });
        };
      }
      this.worker.postMessage(req);
      return;
    }
    this.inline ??= createPlanHandler(this.dispatch);
    void this.inline(req);
  }

  run(spec: MissionSpec, sites: SiteInput[], stepH: number, eph: Ephemeris, onProgress: (done: number, total: number, site: string) => void): PlanRun {
    const id = this.next++;
    const done = new Promise<{ findings: SiteFinding[]; ms: number } | null>((resolve, reject) => {
      this.listeners.set(id, (res) => {
        if (res.type === 'progress') return onProgress(res.done, res.total, res.site);
        this.listeners.delete(id);
        if (res.type === 'done') resolve({ findings: res.findings, ms: res.ms });
        else if (res.type === 'cancelled') resolve(null);
        else reject(new Error(res.message));
      });
    });
    // The table goes to the worker once; it keeps it for the searches after.
    const eph1 = this.sentEph === eph ? undefined : eph;
    this.sentEph = eph;
    this.send({ type: 'search', id, spec, sites, stepH, eph: eph1 });
    return { done, cancel: () => this.send({ type: 'cancel', id }) };
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}
