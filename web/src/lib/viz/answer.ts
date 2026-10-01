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
  /** The best landing hour inside the period (hours from the period start), or null when no hour is sunlit. */
  best: Landing | null;
}

export function answerFor({ series, summary, power, startUtc, days, loadW, best }: AnswerInput): Answer {
  const hours = series.hours;
  const first = power.firstBrownoutHour;

  if (first === null) {
    const sentence =
      summary.illumFraction === 0
        ? `There is no sunlight in these ${days} days: the battery alone carries the lander.`
        : summary.longestDarkH === 0
          ? `The Sun never sets in these ${days} days.`
          : `The Sun is up ${pct0(summary.illumFraction)} of the time. The longest night lasts ${spanWords(summary.longestDarkH)}, and the battery covers it.`;
    return { tone: 'good', kind: 'all', title: `Keeps power for all ${days} days`, sentences: [sentence], better: null, hint: null };
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
  const lead = first === 0 ? 'No power from the first hour' : `Power for ${spanWords(first)}`;

  let kind: AnswerKind;
  let title: string;
  let sentences: string[];
  if (series.sunFraction[first] > 0) {
    kind = 'low-sun';
    title = first === 0 ? 'Too little sunlight from the first hour' : `${lead}, then too little sunlight`;
    sentences = [`The Sun is up, but the panel makes about ${Math.round(power.powerW[first])} W and the lander uses ${loadW} W.`];
    sentences.push(back < hours ? `The lander is back on ${dateLong(startUtc, back)}.` : 'The lander stays off for the rest of the period.');
  } else {
    kind = 'night';
    title = first === 0 ? `${lead}: it is night` : `${lead}, then night`;
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
    const battery = covered > 0 ? `The battery covers the first ${spanWords(covered)}` : sunset === 0 ? 'The battery is empty at the start' : 'The battery is empty when the Sun sets';
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
