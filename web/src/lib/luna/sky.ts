import type { ExploreState } from '../store/explore';
import { contactPlan, nextRadioChange, windowAt } from '../viz/contact';
import { countdown } from '../viz/countdown';
import { clockUtc, dateLong, spanWords } from '../viz/format';

/**
 * Luna's questions on the sky at the time bar's hour (spec 22): how long until the Sun sets or rises ("sun"), when Earth
 * sets or rises ("earth"), and when the next radio window is ("contact"). She answers them from the same countdown and
 * radio windows the pages show, never from the model.
 */
export type SkyQuestion = 'sun' | 'earth' | 'contact';

const QUESTIONS: [RegExp, SkyQuestion][] = [
  [/^(?:how long (?:until|till|to|before) (?:the )?(?:sunset|sunrise|sundown|sun (?:sets|rises|goes down|comes up))|when (?:does|will|is) the sun (?:set|rise|go down|come up)|when is (?:the )?(?:next )?(?:sunset|sunrise))$/, 'sun'],
  [/^(?:how long (?:until|till|to|before) (?:the )?earth (?:sets|rises)|when (?:does|will|is) (?:the )?earth (?:set|rise|setting|rising))$/, 'earth'],
  [/^(?:(?:when is )?(?:the )?next (?:contact|radio contact|radio window|window)|when can (?:it|the lander|we) (?:talk to|radio|call|contact) (?:the )?(?:earth|home))$/, 'contact'],
];

/** The question in what was said, its words already lower case and tidied as Luna's commands are; null when there is none. */
export function skyQuestion(t: string): SkyQuestion | null {
  for (const [re, q] of QUESTIONS) if (re.test(t)) return q;
  return null;
}

/** An hour of the period for speech: "on 3 January at 19:00 UTC". */
const on = (startUtc: string, hour: number) => `on ${dateLong(startUtc, hour)} at ${clockUtc(startUtc, hour)} UTC`;

/**
 * Her answer, in whole words for speech, from the time bar's hour: the Sun's next sunset or sunrise, Earth's next rising or
 * setting, or the radio window the hour is in and when it closes (whether the lander has power for it now, the condition
 * beside the power when it holds only if the lander survived the cold), else when the next opens and whether the lander
 * has power then. What does not come before the period ends she says so, with no date.
 */
export function skyAnswer(q: SkyQuestion, s: Pick<ExploreState, 'series' | 'power' | 'cursorHour' | 'startUtc'>): string {
  const { series, power, startUtc } = s;
  if (!series || !power) return 'Open a forecast first: say "open the forecast".';
  const hour = Math.min(series.hours - 1, Math.max(0, s.cursorHour));
  if (q === 'sun') {
    const c = countdown(series, 'sun', hour);
    if (c.at === null || c.inHours === null) return c.up ? 'No sunset before the end of the period.' : 'The Sun is set now, and does not rise before the end of the period.';
    const when = `in ${spanWords(c.inHours)}, ${on(startUtc, c.at)}.`;
    return c.up ? `Sunset ${when}` : `The Sun is set now. Sunrise ${when}`;
  }
  if (q === 'earth') {
    const c = countdown(series, 'earth', hour);
    if (c.at === null || c.inHours === null) return c.up ? 'Earth is in view now, and does not set before the end of the period.' : 'Earth is out of view now, and does not rise before the end of the period.';
    const when = `in ${spanWords(c.inHours)}, ${on(startUtc, c.at)}.`;
    return c.up ? `Earth sets ${when}` : `Earth is out of view now. It rises ${when}`;
  }
  const plan = contactPlan(series, power);
  // The lander's power at an hour, the condition beside it after the first power cut.
  const has = (h: number) => power.powered[h] === 1;
  const ifSurvived = (h: number) => plan.ifSurvivesFrom !== null && h >= plan.ifSurvivesFrom;
  const next = nextRadioChange(plan, hour);
  if (windowAt(plan, hour)) {
    const now = `Earth is in view now, so a radio link is geometrically possible, ${has(hour) ? `and the lander has power${ifSurvived(hour) ? ', if it survived the cold' : ''}` : 'but the lander has no power'}.`;
    return next ? `${now} This window closes in ${spanWords(next.inHours)}, ${on(startUtc, next.at)}.` : `${now} This window stays open to the end of the period.`;
  }
  if (!next) return 'No radio window opens before the end of the period.';
  const then = has(next.at) ? `The lander has power then${ifSurvived(next.at) ? ', if it survives the cold' : ''}.` : 'The lander has no power then.';
  return `The next radio window opens in ${spanWords(next.inHours)}, ${on(startUtc, next.at)}. ${then}`;
}
