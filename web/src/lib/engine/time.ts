import { J2000_UNIX_S, TDB_MINUS_UTC_S } from './constants';

const HAS_ZONE = /(Z|[+-]\d\d:?\d\d)$/;

/** UTC (ISO string or Date) -> TDB seconds past J2000, matching SPICE str2et to a few ms. */
export function utcToEt(utc: string | Date): number {
  const ms = utc instanceof Date ? utc.getTime() : Date.parse(HAS_ZONE.test(utc) ? utc : `${utc}Z`);
  if (Number.isNaN(ms)) throw new Error(`invalid UTC time: ${String(utc)}`);
  return ms / 1000 - J2000_UNIX_S + TDB_MINUS_UTC_S;
}

export function etToUtcDate(et: number): Date {
  return new Date((et - TDB_MINUS_UTC_S + J2000_UNIX_S) * 1000);
}

/** `YYYY-MM-DDTHH:MM:SS` in UTC (no fractional seconds). */
export function etToIso(et: number): string {
  return etToUtcDate(Math.round(et * 1000) / 1000).toISOString().slice(0, 19);
}
