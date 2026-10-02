import { siteLabel } from '../data/loaders';
import { timeWithPower } from '../engine/landing';
import type { Summary } from '../engine/metrics';
import type { Audience, ExploreState, PlannerParams, WindowDays } from '../store/explore';

/** The compact, rounded picture of the app the planner sends with each question (well under 2 KB). */
export interface StateSummary {
  site: { id: string; name: string; label: string; lat: number; lon: number };
  window: { startUtc: string; days: WindowDays };
  summary: Summary;
  /** `poweredHours`: from landing on the period's first day to the first brownout, capped at the period; `contactHours`: how many of them have Earth in view. */
  power: { socMin: number; brownoutHours: number; survives: boolean; meanPowerW: number; poweredHours: number; contactHours: number };
  params: PlannerParams;
  compare: { id: string; name: string; illumFraction: number; earthVisFraction: number; survives: boolean }[];
  audience: Audience;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Null until the store is ready with a site, a summary and a power budget. */
export function summarizeState(s: ExploreState): StateSummary | null {
  if (s.status !== 'ready' || !s.site || !s.summary || !s.power) return null;
  const poweredHours = Math.min(s.days * 24, timeWithPower(s.power));
  let contactHours = 0;
  if (s.series) for (let h = 0; h < Math.min(poweredHours, s.series.hours); h++) if (s.series.earthVisible[h] === 1) contactHours++;
  return {
    site: { id: s.site.id, name: s.site.name, label: siteLabel(s.site), lat: s.site.lat, lon: s.site.lon },
    window: { startUtc: s.startUtc, days: s.days },
    summary: {
      hours: s.summary.hours,
      illumFraction: r3(s.summary.illumFraction),
      meanSunFraction: r3(s.summary.meanSunFraction),
      longestDarkH: Math.round(s.summary.longestDarkH),
      earthVisFraction: r3(s.summary.earthVisFraction),
      longestEarthGapH: Math.round(s.summary.longestEarthGapH),
      jointFraction: r3(s.summary.jointFraction),
    },
    power: {
      socMin: r3(s.power.socMin),
      brownoutHours: Math.round(s.power.brownoutHours),
      survives: s.power.survives,
      meanPowerW: r1(s.power.meanPowerW),
      poweredHours,
      contactHours,
    },
    params: { power: { ...s.params.power }, minEarthElDeg: s.params.minEarthElDeg, mastM: s.params.mastM },
    compare: s.compare.map((c) => ({
      id: c.site.id,
      name: c.site.name,
      illumFraction: r3(c.summary.illumFraction),
      earthVisFraction: r3(c.summary.earthVisFraction),
      survives: c.power.survives,
    })),
    audience: s.audience,
  };
}
