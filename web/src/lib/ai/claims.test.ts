import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER } from '../engine/power';
import { checkClaims } from './claims';
import type { StateSummary } from './state-summary';

/** de Gerlache Rim 2 over the 30 days from 1 January 2027, as the engine gives it, with Nobile Rim 2 in the comparison. */
const DG: StateSummary = {
  site: { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (Artemis III region)', label: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31 },
  window: { startUtc: '2027-01-01T00:00:00', days: 30 },
  summary: { hours: 720, illumFraction: 0.446, meanSunFraction: 0.421, longestDarkH: 399, earthVisFraction: 0.45, longestEarthGapH: 219, jointFraction: 0.107 },
  power: { socMin: 0, brownoutHours: 390, survives: false, meanPowerW: 708.3, poweredHours: 76, contactHours: 0 },
  params: { power: DEFAULT_POWER, minEarthElDeg: 0, mastM: 2 },
  compare: [{ id: 'nobile_rim_2', name: 'Nobile Rim 2 (Artemis III region)', illumFraction: 0.712, earthVisFraction: 0.384, survives: false }],
};

/** Shackleton rim summit over the same days: the Sun never sets and the lander keeps power throughout. */
const SR: StateSummary = {
  site: { id: 'shackleton_center_rim_high', name: 'Shackleton crater rim, highest point 8.5–12.0 km', label: 'Shackleton rim summit', lat: -89.78131, lon: -156.25683 },
  window: { startUtc: '2027-01-01T00:00:00', days: 30 },
  summary: { hours: 720, illumFraction: 1, meanSunFraction: 0.999, longestDarkH: 0, earthVisFraction: 0.447, longestEarthGapH: 225, jointFraction: 0.447 },
  power: { socMin: 1, brownoutHours: 0, survives: true, meanPowerW: 1685.7, poweredHours: 720, contactHours: 322 },
  params: { power: DEFAULT_POWER, minEarthElDeg: 0, mastM: 2 },
  compare: [],
};

const CATALOGUE = ['Malapert Massif (Artemis III region)', 'Malapert Massif', 'Nobile Rim 2 (Artemis III region)', 'Nobile Rim 2', 'de Gerlache Rim 2 (Artemis III region)', 'de Gerlache Rim 2'];
const narration = (text: string, s: StateSummary) => checkClaims(text, s, { siteNames: CATALOGUE });
const passes = (text: string, s: StateSummary) => {
  const r = narration(text, s);
  expect(r.problems, text).toEqual([]);
  expect(r.ok, text).toBe(true);
};
const fails = (text: string, s: StateSummary, why?: RegExp) => {
  const r = narration(text, s);
  expect(r.ok, text).toBe(false);
  if (why) expect(r.problems.join(' | '), text).toMatch(why);
};

describe('checkClaims: correct narrations pass', () => {
  it('passes a paragraph whose every number sits on its own figure, unit and site', () => {
    passes(
      'de Gerlache Rim 2 (88.28°S, 64.31°W) is studied over the 30 days from 1 January 2027. It sees the Sun 44.6 % of the time, with a longest night of 16 days 15 hours. ' +
        'Earth is in view 45 % of the time, and the longest gap without Earth is 219 hours. ' +
        'A lander with a 4 m² panel at 30 % efficiency, a 200 W load and a 2 kWh battery starting 100 % full has power for 3 days 4 hours, then night, with no radio contact in that time. ' +
        'Nobile Rim 2, in the comparison, sees the Sun 71.2 % of the time.',
      DG,
    );
    passes('Shackleton rim summit sees the Sun 100 % of the time and has no night; Earth is in view 44.7 % of the time, with a longest gap of 9 days 9 hours. The lander keeps power for all 30 days.', SR);
  });

  it('passes paragraphs written the way models write them', () => {
    passes(
      'Shackleton rim summit (89.781°S, 156.257°W) is assessed over a 30-day window starting 1 January 2027. The site is sunlit 100.0% of the time, with a mean sun fraction of 99.9% and no night. ' +
        'Earth is visible 44.7% of the time, with a longest gap of 225 hours (9 days 9 hours). The Sun and Earth are both in view 44.7% of the time. ' +
        'A lander with a 4 m² vertical tracking panel at 30% efficiency, a 200 W load and a 2000 Wh battery keeps power for all 30 days, never dropping below 100% charge, with a mean power of 1685.7 W and 322 hours of Earth contact while powered.',
      SR,
    );
    passes('The site enjoys continuous sunlight for the entire 720-hour window, meaning no night at all. Radio contact with Earth is possible 44.7 percent of the time; the longest communications gap is 225 h.', SR);
    passes(
      'de Gerlache Rim 2 (Artemis III region), at 88.28°S, 64.31°W, is examined over a 30-day window beginning 1 January 2027. The Sun is above the horizon 44.6% of the time, on average 42.1% of its disk is visible, and the longest night lasts 399 hours, or 16 days 15 hours. ' +
        'Earth is visible 45.0% of the time, with the longest gap in visibility lasting 219 hours; the Sun and Earth are visible together only 10.7% of the time. ' +
        'With a 4 m² vertical tracking panel, 30% efficiency, a 200 W load and a 2,000 Wh battery starting fully charged, the lander does not keep power for the whole period: it has power for 76 hours (3 days 4 hours) before the battery runs out, and is without power for 390 hours in total. ' +
        'Mean panel output is 708.3 W.',
      DG,
    );
    passes('A lander that lands on 1 January 2027 has power for 3 days 4 hours, then night: the longest night lasts 16 days 15 hours, far longer than the 10 hours the battery can carry the 200 W load.', DG);
  });

  it('accepts the usual forms: fractions, kilo units, signed coordinates, rounding, whole days and ranges of dates', () => {
    passes('Earth is in view 45.0 % (0.45) of the 720 hours; the mean panel power is about 0.7 kW.', DG);
    passes('The site lies at -88.28°, -64.31°, and the longest night lasts about 17 days.', DG);
    passes('From 1 to 31 January 2027 the longest night lasts more than 16 days, nearly 17 days.', DG);
    passes('The battery runs out after 76 hours.', DG);
    passes('Mean power is 708.3 W, and the battery alone lasts 10 hours at 200 W.', DG);
  });
});

describe('checkClaims: wrong claims fail', () => {
  it('rejects a right number on the wrong metric', () => {
    fails('The longest night lasts 219 hours.', DG, /219 hours.*longest night/); // 219 h is the longest gap without Earth
    fails('Earth is in view 10.7 % of the time.', DG, /Earth in view/); // 10.7 % is Sun and Earth together
    fails('It has power for 16 days 15 hours.', DG, /time with power/); // the length of the longest night
    fails('The Sun is up 45 % of the time and Earth 44.6 % of the time.', { ...DG, summary: { ...DG.summary, illumFraction: 0.3 } });
    fails('The mean power is 200 W.', DG, /mean panel power/); // 200 W is the load
    fails('Earth and the Sun are both up 44.6 % of the time.', DG, /together/); // the share of sunlight alone
  });

  it('rejects a right number on the wrong site', () => {
    fails('Nobile Rim 2 sees the Sun 44.6 % of the time.', DG, /Nobile Rim 2/); // de Gerlache Rim 2's figure
    fails('de Gerlache Rim 2 sees the Sun 71.2 % of the time.', DG, /de Gerlache Rim 2/); // Nobile Rim 2's figure
    fails('Malapert Massif nearby sees the Sun 44.6 % of the time.', DG, /Malapert Massif/); // a site the figures do not cover
  });

  it('rejects a flipped sign or hemisphere', () => {
    fails('de Gerlache Rim 2 lies at 88.28°N, 64.31°W.', DG, /88\.28°N/);
    fails('de Gerlache Rim 2 lies at 88.28°S, 64.31°E.', DG, /64\.31°E/);
    fails('The site lies at latitude 88.28°.', DG, /latitude/);
    fails('Earth counts as in view when it is at least -3° above the hills.', { ...DG, params: { ...DG.params, minEarthElDeg: 3 } }, /-3°/);
  });

  it('rejects a wrong unit', () => {
    fails('The longest night lasts 399 days.', DG, /399 days/); // 399 hours
    fails('A 200 Wh load.', DG, /200 Wh/);
    fails('A 2 kW battery.', DG, /2 kW/);
    fails('Earth is in view 45 hours.', DG, /45 hours/);
  });

  it('rejects a wrong direction, state or relationship', () => {
    fails('The Sun never sets over these 30 days.', DG, /never sets/i);
    fails('The lander survives the 30 days.', DG, /surviv/i);
    fails('The lander keeps power for all 30 days.', DG);
    fails('Earth is always in view.', DG, /always in view/i);
    fails('The battery never runs out.', DG);
    fails('The Sun rises and sets.', SR, /sets/i);
    fails('The lander runs out of power.', SR, /runs out/i);
    fails('Earth is in view more than half the time.', DG, /half/);
    fails('The longest night lasts more than 20 days.', DG, /20 days/);
    fails('de Gerlache Rim 2 sees more sunlight than Nobile Rim 2.', DG, /more sunlight/);
    fails('There is radio contact while the lander has power.', DG, /radio contact/);
    fails('The battery covers the longest night of 16 days 15 hours.', DG, /battery covers/);
    fails('The longest night lasts 16 days 15 hours, shorter than the battery can carry the load.', DG, /shorter than/);
  });

  it('rejects dates and numbers the figures do not give, and numbers tied to nothing', () => {
    fails('The Sun sets on 5 January 2027.', DG, /5 January/);
    fails('Over the 30 days from 1 January 2028.', DG, /2028/);
    fails('Over the next 90 days.', DG, /90 days/);
    fails('Five days later the battery is empty.', SR);
    fails('The value is 45.', DG, /45/);
    fails('Nine of the regions get 45 % of something.', DG);
  });

  it('rejects causes the figures do not give', () => {
    fails('Earth is in view 45 % of the time because the site sits high on the crater rim.', DG, /because/);
    fails('The lander runs out of power after 3 days 4 hours because the panel is too small.', DG, /because/);
    fails('The Sun is up 44.6 % of the time due to its location near the pole.', DG, /due to/);
    fails('The lander keeps power for all 30 days, which means it is an excellent landing site.', SR, /which means/);
    fails('The lander keeps power for all 30 days because the battery is large.', SR, /because/);
  });

  it('reads a leading "As" and a trailing ", making" as causes', () => {
    fails('As the site sits high on the crater rim, Earth is in view 45 % of the time.', DG, /As/);
    fails('The Sun never sets, making the summit an ideal landing site.', SR, /making/);
    passes('As the Sun never sets, the lander keeps power for all 30 days.', SR);
  });

  it('rejects judgements and times the figures do not give', () => {
    fails('Shackleton rim summit is an ideal landing site.', SR, /ideal/);
    fails('The Sun sets in the second week.', DG, /second week/);
    fails('Earth rises late in the period.', DG, /late in the period/);
  });

  it('reads coordinates without degree signs after the site, with their signs, and survival in other words', () => {
    passes('de Gerlache Rim 2 (-88.28, -64.31) sees the Sun 44.6 % of the time.', DG);
    fails('de Gerlache Rim 2 (88.28, -64.31) sees the Sun 44.6 % of the time.', DG, /88\.28/);
    fails('The lander lasts the whole period.', DG, /lasts the whole period/);
    passes('The lander lasts the whole period.', SR);
    fails('The lander keeps power for the entire 30-day window.', DG, /keeps power for the entire/);
    passes('The lander keeps power for the entire 30-day window.', SR);
    fails('Earth is in view for the whole period.', SR, /in view for the whole/);
  });

  it('reads a word between a number and its unit, solar power as sunlight, and the share of time Earth is out of view', () => {
    passes('It has Earth in view for 322 of its 720 powered hours.', SR);
    fails('It has Earth in view for 322 of its 700 powered hours.', SR, /700 powered hours/);
    passes('Solar power is available 100 % of the time.', SR);
    passes('Earth is below the horizon 55.3 % of the time.', SR);
    fails('Earth is below the horizon 44.7 % of the time.', SR, /44\.7 %/);
  });

  it('reads "while it has power" as the hours with power, and an empty battery as time without power', () => {
    passes('Earth is never in view while it has power.', DG);
    fails('Earth is never in view while it has power.', SR, /never in view/);
    passes('The battery is empty for 390 hours in all.', DG);
    fails('The battery is empty for 76 hours in all.', DG, /hours without power/);
  });

  it('accepts only the causes the figures give', () => {
    passes('The lander keeps power for all 30 days because the Sun never sets.', SR);
    passes('The lander runs out of power after 3 days 4 hours because the night is longer than the battery lasts.', DG);
    passes('Earth is out of view for up to 219 hours, so there are gaps in radio contact.', DG);
    fails('The lander keeps power for all 30 days because the Sun never sets.', DG); // there is a night, and power ends
  });
});

describe('checkClaims: energy, not survival', () => {
  it('rejects any claim that the lander or its battery survives, lives or dies, even where power lasts: the figures count electrical energy only', () => {
    for (const text of [
      'The battery survives the night.',
      'The lander survives the 30 days.',
      'Survival looks likely at this site.',
      'The lander lives through each night on its battery.',
      'The lander makes it through the night.',
      'The lander stays alive for all 30 days.',
    ])
      fails(text, SR, /electrical energy only/);
    fails('The lander dies on the first night.', DG, /electrical energy only/);
    passes('The lander keeps power for all 30 days.', SR);
  });

  it('drops a survival claim from a planner reply too', () => {
    const r = checkClaims('Yes. The lander survives here.', SR, { mode: 'reply' });
    expect(r.sentences.map((x) => x.ok)).toEqual([true, false]);
    expect(r.sentences[1].problems.join(' ')).toMatch(/electrical energy only/);
  });
});

describe('checkClaims: planner replies', () => {
  const reply = (text: string, vouched: string[] = []) => checkClaims(text, DG, { mode: 'reply', vouched, siteNames: CATALOGUE });

  it("lets the user's own numbers stand for a setting they asked for, never for a computed figure", () => {
    expect(reply('Load set to 350 W for the next 90 days.', ['350', '90']).ok).toBe(true);
    expect(reply('Yes, it is sunlit 90 % of the time.', ['90']).ok).toBe(false);
    expect(reply('It is sunlit 90 % of the time.').ok).toBe(false);
  });

  it('lets a reply name another site without figures, but not give figures for it', () => {
    expect(reply('Selected Malapert Massif.').ok).toBe(true);
    expect(reply('Malapert Massif is sunlit 44.6 % of the time.').ok).toBe(false);
  });

  it('reads "the site" as the site the sentences are about, not always the one in the figures', () => {
    // After the planner selects another site, "the site" is that one, which the figures do not cover yet.
    expect(reply('Selected Malapert Massif. The site is sunlit 44.6 % of the time.').sentences.map((x) => x.ok)).toEqual([true, false]);
    expect(reply('The site is sunlit 44.6 % of the time.').ok).toBe(true);
  });

  it('keeps the sentences that pass and says which failed', () => {
    const r = reply('Selected de Gerlache Rim 2. It is sunlit 45 % of the time. Earth is in view 71.2 % of the time.');
    expect(r.sentences.map((x) => x.ok)).toEqual([true, true, false]);
    expect(r.sentences[2].problems.join(' ')).toMatch(/71\.2 %.*Earth in view.*45 %/);
  });
});
