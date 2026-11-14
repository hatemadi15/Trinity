import { siteLabel, type Site } from '@/lib/data/loaders';
import { periodOutcome } from '@/lib/plan/outcome';
import { checkRequirements, type Requirements } from '@/lib/plan/requirements';
import type { Scenario } from '@/lib/scenario/scenario';
import { terrainOf } from '@/lib/store/explore';
import { siteFor, type ScenarioRun } from '@/lib/store/scenarios';
import type { Column } from '@/lib/viz/compare';

/** A scenario's site when the catalogue does not name it: its id stands for its name, so the page still says which. */
const unknownSite = (id: string): Site => ({ id, name: id, lat: 0, lon: 0, category: 'custom', polar: false, source: 'unknown' });

/**
 * The scenarios as the page reads them, each with its site and, once worked out, its figures and, with `req`, the
 * planner's requirements checked against what its lander gets from landing at its own period start (lib/plan).
 */
export function columnsOf(scenarios: Scenario[], runs: Record<string, ScenarioRun>, sites: Site[], req?: Requirements): Column[] {
  return scenarios.map((scenario) => {
    const run = runs[scenario.id];
    const site = run?.site ?? siteFor(scenario.siteId, sites) ?? unknownSite(scenario.siteId);
    const ready = run?.status === 'ready' ? run : null;
    const checks = ready?.result && req ? checkRequirements(periodOutcome(ready.result.series, ready.result.power), req) : [];
    return { scenario, site, siteName: siteLabel(site), outcome: ready ? ready.outcome : null, terrain: run?.mask ? terrainOf(run.mask) : undefined, checks };
  });
}
