import { siteLabel, type Site } from '@/lib/data/loaders';
import type { Scenario } from '@/lib/scenario/scenario';
import { siteFor, type ScenarioRun } from '@/lib/store/scenarios';
import type { Column } from '@/lib/viz/compare';

/** A scenario's site when the catalogue does not name it: its id stands for its name, so the page still says which. */
const unknownSite = (id: string): Site => ({ id, name: id, lat: 0, lon: 0, category: 'custom', polar: false, source: 'unknown' });

/** The scenarios as the page reads them, each with its site and, once worked out, its figures. */
export function columnsOf(scenarios: Scenario[], runs: Record<string, ScenarioRun>, sites: Site[]): Column[] {
  return scenarios.map((scenario) => {
    const run = runs[scenario.id];
    const site = run?.site ?? siteFor(scenario.siteId, sites) ?? unknownSite(scenario.siteId);
    return { scenario, site, siteName: siteLabel(site), outcome: run?.status === 'ready' ? run.outcome : null };
  });
}
