export function pct(x: number): string {
  return `${(x * 100).toFixed(1)} %`;
}

/** Hours up to 99 h stay in hours (planners count nights in hours); longer spans read as days + hours. */
export function hoursLabel(h: number): string {
  if (h < 100) return `${h} h`;
  const d = Math.floor(h / 24);
  const r = h % 24;
  return r === 0 ? `${d} d` : `${d} d ${r} h`;
}

export function utcLabel(startUtc: string, hour: number): string {
  const start = new Date(startUtc.endsWith('Z') ? startUtc : `${startUtc}Z`);
  const d = new Date(start.getTime() + hour * 3_600_000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}
