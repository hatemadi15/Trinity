import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';

/**
 * One sentence for the hour under the time cursor: where the Sun and Earth are, whether the lander is
 * on, and how full the battery is. `power` is null until the budget is known.
 */
export function statusSentence(series: Series, power: PowerResult | null, hour: number, batteryWh: number): string {
  const f = series.sunFraction[hour];
  let sun: string;
  if (f <= 0) sun = series.sunEl[hour] < 0 ? 'Sun below the horizon' : 'Sun set behind the hills';
  else if (f >= 0.999) sun = 'Sun up';
  else {
    const before = hour > 0 ? series.sunFraction[hour - 1] : f;
    const after = hour + 1 < series.hours ? series.sunFraction[hour + 1] : f;
    sun = after > before ? 'Sun rising' : after < before ? 'Sun setting' : 'Sun partly set behind the hills';
  }
  const inView = series.earthVisible[hour] === 1;
  const off = power !== null && power.powered[hour] === 0;
  const hidden = series.earthEl[hour] < 0 ? 'Earth below the horizon' : 'Earth set behind the hills';
  const earth = inView ? (off ? 'Earth in view but the lander is off' : 'Earth in view') : off ? `${hidden}, lander off` : hidden;
  const parts = [sun, earth];
  if (power) {
    if (batteryWh <= 0) parts.push('no battery');
    else parts.push(off ? 'battery empty' : `battery ${Math.round((100 * power.energyWh[hour]) / batteryWh)} %`);
  }
  return parts.join(', ');
}
