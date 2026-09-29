import type { Series } from '../engine/metrics';

export function binSeries(
  series: Series,
  bins: number,
): { sunMax: Float64Array; sunMean: Float64Array; earthFrac: Float64Array; hoursPerBin: number } {
  const hoursPerBin = series.hours / bins;
  const sunMax = new Float64Array(bins);
  const sunMean = new Float64Array(bins);
  const earthFrac = new Float64Array(bins);
  for (let b = 0; b < bins; b++) {
    const start = Math.floor(b * hoursPerBin);
    const end = Math.floor((b + 1) * hoursPerBin);
    let max = 0;
    let sum = 0;
    let vis = 0;
    for (let h = start; h < end; h++) {
      const f = series.sunFraction[h];
      if (f > max) max = f;
      sum += f;
      vis += series.earthVisible[h];
    }
    const n = Math.max(1, end - start);
    sunMax[b] = max;
    sunMean[b] = sum / n;
    earthFrac[b] = vis / n;
  }
  return { sunMax, sunMean, earthFrac, hoursPerBin };
}

export function hourAtX(x: number, width: number, hours: number): number {
  return Math.max(0, Math.min(hours - 1, Math.floor((x / width) * hours)));
}

export function xAtHour(hour: number, width: number, hours: number): number {
  return ((hour + 0.5) / hours) * width;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One tick per UTC day at x = day start, thinned so ticks are at least minPx apart. */
export function dayTicks(startUtc: string, hours: number, width: number, minPx = 56): { x: number; label: string }[] {
  const start = new Date(startUtc.endsWith('Z') ? startUtc : `${startUtc}Z`);
  const ticks: { x: number; label: string }[] = [];
  let lastX = -Infinity;
  for (let h = 0; h < hours; h += 24) {
    const d = new Date(start.getTime() + h * 3_600_000);
    const x = (h / hours) * width;
    if (x - lastX < minPx) continue;
    ticks.push({ x, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` });
    lastX = x;
  }
  return ticks;
}
