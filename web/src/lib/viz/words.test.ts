// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { lightWords } from '@/components/home/ArrivalCanvas';
import { pathMarks } from '@/components/stand/StandView';
import { pointerWords } from '@/components/stand/StandCanvas';
import { SkyRow } from '@/components/SkyRow';
import { EXPLANATIONS } from '@/lib/ai/explanations';
import { summarize } from '@/lib/engine/metrics';
import { DEFAULT_POWER } from '@/lib/engine/power';
import { HOME } from '@/lib/data/home';
import { answerFor } from './answer';
import { arrivalWords, hero } from './arrival';
import { heightWords } from './shadowmap';
import { statusSentence } from './status';
import { keyMoments, liveSentence, momentCaption, poleLine, skyLabel, statusLine, viewCaption, watchNext, whyLines, type MomentKind } from './stand';

/** Other names for an event or stretch that already has one (the plan's vocabulary): each event is named one way. */
const OTHER_NAMES: [RegExp, string][] = [
  [/\bhid(?:e|es|den|ing)\b/i, 'sets'],
  [/\bSun (?:is )?back\b|\bSun comes back\b/i, 'rises, sunrise'],
  [/\bin the dark\b|\bin shadow\b/i, 'night'],
  [/\bcomes into view\b|\bin view, \d/i, 'Earth rises'],
  [/(?<!\bset |\bsets |\bSunset )behind (?:the )?hills\b/i, 'set behind the hills'],
];

function check(where: string, text: string) {
  for (const [re, use] of OTHER_NAMES) expect(re.test(text), `${where}: "${text}" (say "${use}")`).toBe(false);
}

describe('one name for each event (spec 13.3, 14.3)', () => {
  const h = hero(), s = h.series, p = h.power, start = h.startUtc;
  const moments = keyMoments(s, p, start);

  it('names the key moments on the flags and the paths in one way each', () => {
    const flags = new Set(['Sunset', 'Sunset and power off', 'Sunrise', 'Battery runs out', 'Power back', 'Earth rises', 'Earth sets']);
    for (const m of moments) expect(flags.has(m.label), m.label).toBe(true);
    for (const mark of pathMarks(moments)) expect(mark.text).toMatch(/^(Sunset|Sunrise|Earth rises|Earth sets), \d{1,2} [A-Z][a-z]{2}$/);
  });

  it('words the captions, the live line, what to watch next and the lander’s state with the same names, at every hour of the month', () => {
    const kinds: MomentKind[] = ['sunset', 'sun-back', 'battery-out', 'power-back', 'earth-in', 'earth-out', 'sunset-power-off', 'sun-power-back'];
    for (const m of moments) check(`caption ${m.kind}`, momentCaption(m.kind, s, m.hour, h.site.lat));
    for (const k of kinds) for (const lat of [-88.28, -30]) for (const hour of [67, 76, 219, 466]) check(`caption ${k} at ${hour}, ${lat}°`, momentCaption(k, s, hour, lat));
    for (let hour = 0; hour < s.hours; hour += 6) {
      check(`sky label ${hour}`, skyLabel('sun', s, hour));
      check(`sky label ${hour}`, skyLabel('earth', s, hour));
      check(`pointer ${hour}`, pointerWords(skyLabel('sun', s, hour)));
      check(`live ${hour}`, liveSentence(s, hour, p.powered[hour] === 1));
      check(`watch ${hour}`, watchNext(s, p, start, hour));
      check(`status ${hour}`, statusLine(s, p, start, hour).text);
      check(`date bar ${hour}`, lightWords(s, hour));
      for (const line of whyLines(h.site.lat, s, hour)) check(`why ${hour}`, line);
    }
    for (const kind of ['earth', 'up', 'earthlight', 'lander', 'dark'] as const) check(`view ${kind}`, viewCaption(kind, -88.28));
    check('pole', poleLine(-88.28) ?? '');
  });

  it('words Explore’s time bar, the shadow map, the chart’s spoken summary and the glossary the same way', () => {
    for (let hour = 0; hour < s.hours; hour += 3) check(`time bar ${hour}`, statusSentence(s, p, hour, DEFAULT_POWER.batteryWh));
    for (const name of ['Sun', 'Earth'] as const) for (const hidden of ['no', 'yes', 'partly'] as const) check(`map ${name} ${hidden}`, heightWords(name, 1.4, hidden));
    const { sky } = HOME;
    for (const [body, el, hill, visible] of [['sun', sky.sun_el, sky.hill_el, sky.lit], ['earth', sky.earth_el, sky.earth_hill_el, sky.earth_visible]] as const) {
      const { container, unmount } = render(createElement(SkyRow, { el, hill, visible, startUtc: sky.start_utc, body, caption: 'c' }));
      check(`chart ${body}`, container.textContent ?? '');
      unmount();
    }
    for (const [topic, text] of Object.entries(EXPLANATIONS)) check(`glossary ${topic}`, text);
  });

  it('words the arrival and the forecast’s answer the same way', () => {
    for (const beat of arrivalWords().beats) check('beat', beat);
    const b = HOME.battery, best = b.best_hour !== null && b.best_hours !== null ? { hour: b.best_hour, poweredHours: b.best_hours, earthFraction: b.best_earth_fraction ?? 0 } : null;
    const answer = answerFor({ siteName: 'de Gerlache Rim 2', series: s, summary: summarize(s), power: p, startUtc: start, days: h.days, loadW: DEFAULT_POWER.loadW, batteryWh: DEFAULT_POWER.batteryWh, best });
    for (const line of [answer.title, ...answer.sentences]) check('answer', line);
  });
});
