import type { PowerResult } from '../engine/power';
import { hoursLabel } from './format';

/** Plain-language "survive the night" verdict for a power budget. */
export function verdictFor(power: PowerResult): { tone: 'good' | 'bad'; label: string; detail: string } {
  if (power.survives) {
    return { tone: 'good', label: 'Survives the window', detail: `battery never below ${Math.round(power.socMin * 100)} %` };
  }
  return {
    tone: 'bad',
    label: `Battery empties after ${hoursLabel(power.firstBrownoutHour ?? 0)}`,
    detail: `${power.brownoutHours} h without full power`,
  };
}
