import type { Landing } from '../engine/landing';
import type { Series, Summary } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { clockUtc, dateLong, isoAt, pct0, spanWords } from './format';

export type AnswerKind = 'all' | 'night' | 'low-sun' | 'no-sun';

/** The verdict of Explore in words: what happens to the power, why, and what to do about it. */
export interface Answer {
  tone: 'good' | 'bad';
  kind: AnswerKind;
  title: string;
  /** One or two sentences that give the reason. */
  sentences: string[];
  /** A landing hour inside the period that gives more power, when there is one. */
  better: { hour: number; startUtc: string; label: string; note: string } | null;
  /** What to try when the answer is bad and no landing date in the period does better. */
  hint: string | null;
}

export interface AnswerInput {
  /** The chosen period, hour by hour, with its summary and battery walk. */
  series: Series;
  summary: Summary;
  power: PowerResult;
  startUtc: string;
  days: number;
  loadW: number;
  /** The battery's capacity: a battery below it when the Sun sets covers less of the night than a full one. */
  batteryWh: number;
  /** The best landing hour inside the period (hours from the period start), or null when no hour is sunlit. */
  best: Landing | null;
}

export function answerFor({ series, summary, power, startUtc, days, loadW, batteryWh, best }: AnswerInput): Answer {
  const hours = series.hours;
  const first = power.firstBrownoutHour;
  // Every answer is for a lander that lands at the start of the period; the title says when that is.
  const landing = `Landing on ${dateLong(startUtc, 0)}`;

  if (first === null) {
    const sentence =
      summary.illumFraction === 0
        ? `There is no sunlight in these ${days} days: the battery alone carries the lander.`
        : summary.longestDarkH === 0
          ? `The Sun never sets in these ${days} days.`
          : `The Sun is up ${pct0(summary.illumFraction)} of the time. The longest night lasts ${spanWords(summary.longestDarkH)}, and the battery covers it.`;
    return { tone: 'good', kind: 'all', title: `${landing}: power for all ${days} days`, sentences: [sentence], better: null, hint: null };
  }

  if (summary.illumFraction === 0) {
    return {
      tone: 'bad',
      kind: 'no-sun',
      title: `No sunlight in these ${days} days`,
      sentences: ['This spot stays in shadow for the whole period. A solar lander cannot work here.'],
      better: null,
      hint: 'Try another site, or another month.',
    };
  }

  // The lander is back at the first hour with power after the brownout.
  let back = first;
  while (back < hours && power.powered[back] === 0) back++;
  const backPart = back < hours ? `; the lander is back on ${dateLong(startUtc, back)}.` : ', and the lander stays off for the rest of the period.';
  const lead = `power for ${spanWords(first)}`;

  let kind: AnswerKind;
  let title: string;
  let sentences: string[];
  if (series.sunFraction[first] > 0) {
    kind = 'low-sun';
    title = first === 0 ? `${landing}: too little sunlight from the first hour` : `${landing}: ${lead}, then too little sunlight`;
    sentences = [`The Sun is up, but the panel makes about ${Math.round(power.powerW[first])} W and the lander uses ${loadW} W.`];
    sentences.push(back < hours ? `The lander is back on ${dateLong(startUtc, back)}.` : 'The lander stays off for the rest of the period.');
  } else {
    kind = 'night';
    title = first === 0 ? `${landing}: no power, it is night` : `${landing}: ${lead}, then night`;
    let sunset = first;
    while (sunset > 0 && series.sunFraction[sunset - 1] === 0) sunset--;
    let sunrise = first;
    while (sunrise < hours && series.sunFraction[sunrise] === 0) sunrise++;
    // Far from the pole the Sun simply goes below the horizon; near it, the hills hide a Sun that is still up.
    let below = true;
    for (let h = sunset; h < Math.min(sunrise, hours); h++) {
      if (series.sunEl[h] >= 0) {
        below = false;
        break;
      }
    }
    const where = below ? 'below the horizon' : 'behind the hills';
    const dark =
      sunset === 0
        ? `The period starts in the dark: the Sun stays ${where} until ${dateLong(startUtc, sunrise)}.`
        : sunrise >= hours
          ? `The Sun sets on ${dateLong(startUtc, sunset)} and stays ${where} for the rest of the period.`
          : `The Sun sets on ${dateLong(startUtc, sunset)} and stays ${where} for ${spanWords(sunrise - sunset)}.`;
    const covered = first - sunset;
    // A low Sun in the last sunlit hours can give less than the lander uses, so the night may start on a battery that is no longer full.
    const full = sunset === 0 || power.energyWh[sunset - 1] >= batteryWh - 1e-6;
    const battery =
      covered > 0
        ? `The battery${full ? '' : ', not quite full when the Sun set,'} covers the first ${spanWords(covered)} of the night`
        : sunset === 0
          ? 'The battery is empty at the start'
          : 'The battery is empty when the Sun sets';
    sentences = [dark, `${battery}${backPart}`];
  }

  let better: Answer['better'] = null;
  if (best && best.poweredHours > first) {
    const clock = clockUtc(startUtc, best.hour);
    const when = `${dateLong(startUtc, best.hour)}${clock === '00:00' ? '' : `, ${clock} UTC`}`;
    better = {
      hour: best.hour,
      startUtc: isoAt(startUtc, best.hour),
      label: `Land on ${dateLong(startUtc, best.hour)} instead`,
      note: best.poweredHours >= hours ? `From ${when}, the lander keeps power for all ${days} days.` : `From ${when}: power for ${spanWords(best.poweredHours)} in a row.`,
    };
  }
  const hint = better ? null : `No landing date in these ${days} days gives more power here. A shorter stay or a bigger battery may.`;
  return { tone: 'bad', kind, title, sentences, better, hint };
}
