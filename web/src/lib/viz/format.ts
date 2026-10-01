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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A span of hours in words, for sentences: "16 days 15 hours", "1 day 1 hour", "7 hours". */
export function spanWords(hours: number): string {
  const h = Math.max(0, Math.round(hours));
  const d = Math.floor(h / 24);
  const r = h % 24;
  if (d === 0) return plural(r, 'hour');
  return r === 0 ? plural(d, 'day') : `${plural(d, 'day')} ${plural(r, 'hour')}`;
}

/** The same span for cards and tables: "16 d 15 h", "7 h". */
export function spanShort(hours: number): string {
  const h = Math.max(0, Math.round(hours));
  const d = Math.floor(h / 24);
  const r = h % 24;
  if (d === 0) return `${r} h`;
  return r === 0 ? `${d} d` : `${d} d ${r} h`;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The UTC date `hour` hours after the start, as "3 Jan". */
export function dayMonth(startUtc: string, hour: number): string {
  const start = new Date(startUtc.endsWith('Z') ? startUtc : `${startUtc}Z`);
  const d = new Date(start.getTime() + hour * 3_600_000);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}
