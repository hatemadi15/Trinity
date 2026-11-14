import type { Ephemeris } from '../engine/ephemeris';
import { searchSite, type SiteFinding, type SiteInput } from './search';
import type { MissionSpec } from './spec';

/** What the planner's worker is asked: a search (the Sun and Earth table comes once, with the first), or to stop one. */
export type PlanRequest = { type: 'search'; id: number; spec: MissionSpec; sites: SiteInput[]; stepH: number; eph?: Ephemeris } | { type: 'cancel'; id: number };

/** What it answers: progress after each site, the findings with the time taken, a stop, or an error. */
export type PlanResponse =
  | { type: 'progress'; id: number; done: number; total: number; site: string }
  | { type: 'done'; id: number; findings: SiteFinding[]; ms: number }
  | { type: 'cancelled'; id: number }
  | { type: 'error'; id: number; message: string };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The search, site by site, for the worker (or inline where there is none): it says how far it has got after each site
 * and lets a cancel in between, so the page stays responsive and a search can be stopped.
 */
export function createPlanHandler(post: (res: PlanResponse) => void): (req: PlanRequest) => Promise<void> {
  let eph: Ephemeris | null = null;
  const cancelled = new Set<number>();
  return async (req) => {
    if (req.type === 'cancel') {
      cancelled.add(req.id);
      return;
    }
    if (req.eph) eph = req.eph;
    if (!eph) {
      post({ type: 'error', id: req.id, message: 'the Sun and Earth table has not reached the planner' });
      return;
    }
    const t0 = now();
    const findings: SiteFinding[] = [];
    for (const input of req.sites) {
      // A cancel sent meanwhile is read between sites.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (cancelled.has(req.id)) {
        cancelled.delete(req.id);
        post({ type: 'cancelled', id: req.id });
        return;
      }
      findings.push(searchSite(eph, input, req.spec, req.stepH));
      post({ type: 'progress', id: req.id, done: findings.length, total: req.sites.length, site: input.site.label ?? input.site.name });
    }
    post({ type: 'done', id: req.id, findings, ms: now() - t0 });
  };
}
