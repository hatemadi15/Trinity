import { DAYS_RANGE } from '../planner-ranges';

/**
 * The period rules a scenario follows are the app's own (lib/period): a landing on a whole UTC hour, a length of 2 to
 * 90 whole days, a shift that keeps the length and stops at the ends of the Sun and Earth table, and the landing in
 * words. Every scenario module reads them through here.
 */
export { FIRST_START, lastStart, periodDays, periodProblem, shiftPeriod, snapToHour, startWords } from '../period';

/** A period's length in whole days, as the period controls bound it. */
export const DAYS = { min: DAYS_RANGE.min, max: DAYS_RANGE.max };
