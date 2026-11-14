import { timeWithPower, type Landing } from '../engine/landing';
import { batteryHours } from '../lander';
import type { SiteResult } from '../store/explore';
import { answerFor, type Answer } from '../viz/answer';
import { contactPlan, firstSetAfter, type Change, type Outage } from './contact';
import type { Scenario } from './scenario';

/**
 * What one scenario gives, as numbers: each figure of a comparison, for a lander that lands at the scenario's landing
 * time and stays the scenario's number of days, by the app's model (the Sun and Earth from the JPL DE440 table, the hills
 * from NASA LOLA elevation grids, the battery walked hour by hour).
 */
export interface Outcome {
  days: number;
  hours: number;
  /** Hours with power from landing until the battery first runs out, capped at the period. */
  poweredH: number;
  allPeriod: boolean;
  /** Share of the period's hours with any part of the Sun over the hills. */
  sunFraction: number;
  /** Share of the period's hours with Earth's centre over the hills by the clearance set: geometric direct-to-Earth visibility. */
  earthFraction: number;
  /** Hours with Earth in view and the lander powered, before the first power cut. */
  poweredContactH: number;
  /** The longest stretch without Earth in view; null when Earth never leaves it. */
  outage: Outage | null;
  firstSunset: Change;
  firstEarthset: Change;
  sunAtLanding: boolean;
  earthAtLanding: boolean;
  /** The longest run of hours with no Sun in the period. */
  longestNightH: number;
  /** How long a full battery carries the lander with no Sun. */
  batteryH: number;
  /** Explore's verdict for the same settings, with its reasons. */
  answer: Answer;
  /** The verdict in a few words: "power for 3 days 4 hours, then night". */
  verdict: string;
  /** The site's own best landing hour inside the period (hours from the landing), or null when no hour is sunlit. */
  best: Landing | null;
}

/** The verdict without the place and date it starts with: what is left after "Landing at X on 1 January: ". */
function verdictWords(title: string): string {
  const at = title.indexOf(': ');
  return at >= 0 ? title.slice(at + 2) : title;
}

export function outcomeOf(r: SiteResult, s: Scenario, siteName: string): Outcome {
  const hours = r.series.hours;
  const poweredH = Math.min(hours, timeWithPower(r.power));
  const plan = contactPlan(r.series, r.power);
  const answer = answerFor({ siteName, series: r.series, summary: r.summary, power: r.power, startUtc: s.startUtc, days: s.days, loadW: s.power.loadW, batteryWh: s.power.batteryWh, best: r.best });
  return {
    days: s.days,
    hours,
    poweredH,
    allPeriod: poweredH >= hours,
    sunFraction: r.summary.illumFraction,
    earthFraction: r.summary.earthVisFraction,
    poweredContactH: plan.sureHours,
    outage: plan.longestOutage,
    firstSunset: firstSetAfter(r.series, 'sun', 0),
    firstEarthset: firstSetAfter(r.series, 'earth', 0),
    sunAtLanding: r.series.sunFraction[0] > 0,
    earthAtLanding: r.series.earthVisible[0] === 1,
    longestNightH: r.summary.longestDarkH,
    batteryH: batteryHours(s.power),
    answer,
    verdict: verdictWords(answer.title),
    best: r.best,
  };
}
