import { describe, expect, it } from 'vitest';
import { summarize, type Series } from '../engine/metrics';
import { answerFor } from './answer';
import { hero } from './arrival';
import { contactPlan, nextRadioChange, outageNote, outageWords, poweredContactWords, radioChangeWords, windowsCountWords, windowUse, windowUseWords } from './contact';
import { countdown } from './countdown';

/** A series with Earth in view where `earth` says so (the Sun up throughout: only Earth matters here). */
function series(earth: number[]): Series {
  const n = earth.length;
  return {
    i0: 0,
    hours: n,
    sunAz: new Float64Array(n),
    sunEl: new Float64Array(n).fill(5),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n).fill(3),
    sunFraction: new Float64Array(n).fill(1),
    earthVisible: Uint8Array.from(earth),
    sunAu: new Float64Array(n).fill(1),
  };
}

/** The lander's power hour by hour, as the battery walk gives it: only what the plan reads. */
function power(powered: number[]) {
  const first = powered.indexOf(0);
  return { powered: Uint8Array.from(powered), firstBrownoutHour: first < 0 ? null : first };
}

describe('contactPlan', () => {
  // Two windows inside the period, the second running to its end; the lander off from hour 3 to 6, back at 7.
  const s = series([0, 1, 1, 1, 0, 0, 1, 1, 1, 1]);
  const p = power([1, 1, 1, 0, 0, 0, 0, 1, 1, 1]);

  it('lists every window with its opening and closing hours and its length, from the engine’s own windows', () => {
    const plan = contactPlan(s, p);
    expect(plan.windows.map((w) => [w.start, w.end, w.hours, w.fromStart, w.toEnd])).toEqual([
      [1, 4, 3, false, false],
      [6, 10, 4, false, true],
    ]);
    expect(plan.totalHours).toBe(7);
    expect(plan.hours).toBe(10);
  });

  it('gives the hours each window has power, and those that hold only if the lander survives the cold after the first power cut', () => {
    const plan = contactPlan(s, p);
    expect(plan.windows.map((w) => [w.poweredHours, w.ifSurvivesHours])).toEqual([
      [2, 0],
      [3, 3],
    ]);
    expect(plan.ifSurvivesFrom).toBe(7);
    // Powered contact: every hour with Earth in view and power, and the part before the first power cut.
    expect(plan.poweredHours).toBe(5);
    expect(plan.sureHours).toBe(2);
  });

  it('counts the longest time without Earth across the period’s edges, and says when an edge cuts it short', () => {
    // Out of view at the start for 4 hours, which may have begun before the period: longer than the 2 hours between windows.
    const edge = contactPlan(series([0, 0, 0, 0, 1, 1, 0, 0, 1, 1]), null);
    expect(edge.longestOutage).toEqual({ start: 0, end: 4, hours: 4, fromStart: true, toEnd: false });
    const inside = contactPlan(series([1, 0, 0, 0, 0, 1, 0, 0]), null);
    expect(inside.longestOutage).toEqual({ start: 1, end: 5, hours: 4, fromStart: false, toEnd: false });
    const end = contactPlan(series([1, 1, 0, 1, 0, 0]), null);
    expect(end.longestOutage).toEqual({ start: 4, end: 6, hours: 2, fromStart: false, toEnd: true });
    // Earth never in view: the whole period, cut at both ends. Always in view: no time without it.
    expect(contactPlan(series([0, 0, 0]), null).longestOutage).toEqual({ start: 0, end: 3, hours: 3, fromStart: true, toEnd: true });
    expect(contactPlan(series([1, 1, 1]), null).longestOutage).toBeNull();
  });

  it('marks a window already open when the period starts, and one open all the way through', () => {
    const plan = contactPlan(series([1, 1, 0, 1]), null);
    expect(plan.windows.map((w) => [w.fromStart, w.toEnd])).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(contactPlan(series([1, 1, 1]), null).windows).toEqual([{ start: 0, end: 3, hours: 3, fromStart: true, toEnd: true, poweredHours: 0, ifSurvivesHours: 0 }]);
  });

  it('without a battery walk yet, gives no power to any window', () => {
    const plan = contactPlan(s, null);
    expect(plan.poweredHours).toBe(0);
    expect(plan.sureHours).toBe(0);
    expect(plan.ifSurvivesFrom).toBeNull();
  });

  it('agrees with the figures already on the page for the home page’s month: the longest time without Earth and the radio contact while it has power', () => {
    const h = hero();
    const plan = contactPlan(h.series, h.power);
    const summary = summarize(h.series);
    expect(plan.longestOutage?.hours ?? 0).toBe(summary.longestEarthGapH);
    expect(plan.totalHours / plan.hours).toBeCloseTo(summary.earthVisFraction, 12);
    const answer = answerFor({ siteName: 'x', series: h.series, summary, power: h.power, startUtc: h.startUtc, days: h.days, loadW: 200, batteryWh: 2000, best: null });
    expect(plan.sureHours).toBe(answer.contactHours);
    // The month's one window opens on 10 January and closes on 23 January; the lander, off since 4 January, has power
    // in it again from 20 January, if it lives through the night.
    expect(plan.windows.map((w) => [w.start, w.end])).toEqual([[219, 543]]);
    expect(plan.windows[0].poweredHours).toBe(77);
    expect(plan.windows[0].ifSurvivesHours).toBe(77);
  });
});

describe('windowUse', () => {
  const at = (hours: number, poweredHours: number, ifSurvivesHours: number) => ({ start: 0, end: hours, hours, fromStart: false, toEnd: false, poweredHours, ifSurvivesHours });

  it('says whether the lander has power for all of a window, part of it, only if it survives the cold, or none of it', () => {
    expect(windowUse(at(10, 10, 0))).toBe('all');
    expect(windowUse(at(10, 4, 0))).toBe('part');
    expect(windowUse(at(10, 6, 2))).toBe('part');
    expect(windowUse(at(10, 10, 10))).toBe('if-survives');
    expect(windowUse(at(10, 3, 3))).toBe('if-survives');
    expect(windowUse(at(10, 0, 0))).toBe('none');
  });

  it('words each case for the list of windows, the condition always beside the power it holds for', () => {
    expect(windowUseWords(at(10, 10, 0))).toBe('power throughout');
    expect(windowUseWords(at(30, 4, 0))).toBe('power for 4 h of it');
    expect(windowUseWords(at(30, 26, 2))).toBe('power for 1 d 2 h of it, 2 h of that if the lander survives the cold');
    expect(windowUseWords(at(30, 30, 30))).toBe('power throughout, if the lander survives the cold');
    expect(windowUseWords(at(324, 77, 77))).toBe('power for 3 d 5 h of it, if the lander survives the cold');
    expect(windowUseWords(at(10, 0, 0))).toBe('no power: the lander is off');
  });
});

describe('nextRadioChange', () => {
  const s = series([0, 1, 1, 0, 0, 1, 1]);
  const plan = contactPlan(s, null);

  it('gives the next opening while Earth is out of view, and the closing of the window it is in', () => {
    expect(nextRadioChange(plan, 0)).toMatchObject({ kind: 'opens', at: 1, inHours: 1 });
    expect(nextRadioChange(plan, 1)).toMatchObject({ kind: 'closes', at: 3, inHours: 2 });
    expect(nextRadioChange(plan, 3)).toMatchObject({ kind: 'opens', at: 5, inHours: 2 });
  });

  it('gives none when the window runs to the end of the period, or no window opens before it ends', () => {
    expect(nextRadioChange(plan, 5)).toBeNull();
    expect(nextRadioChange(contactPlan(series([1, 0, 0]), null), 1)).toBeNull();
  });

  it('agrees with Earth’s countdown at every hour of the home page’s month', () => {
    const h = hero();
    const p = contactPlan(h.series, h.power);
    for (let hour = 0; hour < h.series.hours; hour++) {
      const c = countdown(h.series, 'earth', hour);
      const n = nextRadioChange(p, hour);
      expect(n?.at ?? null).toBe(c.at);
      if (n) expect(n.kind).toBe(c.up ? 'closes' : 'opens');
    }
  });

  it('words the change with its time in UTC and how far off it is, or says it does not come in the period', () => {
    const start = '2027-01-01T00:00:00';
    expect(radioChangeWords(plan, 0, start)).toBe('Next window opens 1 Jan, 01:00 UTC, in 1 h');
    expect(radioChangeWords(plan, 1, start)).toBe('This window closes 1 Jan, 03:00 UTC, in 2 h');
    expect(radioChangeWords(plan, 5, start)).toBe('This window stays open to the end of the period');
    expect(radioChangeWords(contactPlan(series([1, 0, 0]), null), 1, start)).toBe('No window opens before the period ends');
  });
});

describe('poweredContactWords', () => {
  it('gives the powered contact from landing, as the answer counts it, and apart from it the hours that need the lander to survive the cold', () => {
    // The home page's month: none before the battery runs out; 3 d 5 h after the power comes back, if it does.
    const h = hero();
    expect(poweredContactWords(contactPlan(h.series, h.power))).toEqual({ value: 'none', note: 'until the battery runs out; 3 d 5 h after, if the lander survives the cold' });
    // Some before the cut and some after.
    const s = series([0, 1, 1, 1, 0, 0, 1, 1, 1, 1]);
    expect(poweredContactWords(contactPlan(s, power([1, 1, 1, 0, 0, 0, 0, 1, 1, 1])))).toEqual({ value: '2 h', note: 'until the battery runs out; 3 h more after, if the lander survives the cold' });
    // A cut with no power back in the period.
    expect(poweredContactWords(contactPlan(s, power([1, 1, 0, 0, 0, 0, 0, 0, 0, 0])))).toEqual({ value: '1 h', note: 'until the battery runs out' });
  });

  it('says when the power never fails, and when Earth is never in view while the lander has power', () => {
    const s = series([0, 1, 1, 0]);
    expect(poweredContactWords(contactPlan(s, power([1, 1, 1, 1])))).toEqual({ value: '2 h', note: 'every hour Earth is in view' });
    expect(poweredContactWords(contactPlan(series([0, 0, 0]), power([1, 1, 1])))).toEqual({ value: 'none', note: 'Earth is never in view' });
    expect(poweredContactWords(contactPlan(s, power([1, 0, 0, 0])))).toEqual({ value: 'none', note: 'until the battery runs out' });
  });
});

describe('windowsCountWords', () => {
  it('counts the windows; which of them the lander has power in, and on what condition, the list of windows says', () => {
    expect(windowsCountWords(contactPlan(series([1, 0, 1, 0, 1]), null))).toBe('in 3 windows');
    expect(windowsCountWords(contactPlan(series([0, 1, 0]), null))).toBe('in 1 window');
    expect(windowsCountWords(contactPlan(series([0, 0]), null))).toBe('in no window');
  });
});

describe('outageNote', () => {
  it('says where the longest time without Earth lies, and when an edge of the period cuts it short', () => {
    const start = '2027-01-01T00:00:00';
    expect(outageNote(contactPlan(series([1, ...new Array<number>(48).fill(0), 1]), null).longestOutage, start)).toBe('1 Jan to 3 Jan');
    expect(outageNote(contactPlan(series([0, 0, 1]), null).longestOutage, start)).toBe('from the start of the period');
    expect(outageNote(contactPlan(series([1, 0, 0]), null).longestOutage, start)).toBe('to the end of the period');
    expect(outageNote(contactPlan(series([0, 0]), null).longestOutage, start)).toBe('the whole period');
    expect(outageNote(null, start)).toBe('Earth never leaves the view');
  });
});

describe('outageWords', () => {
  it('gives the longest time without Earth, at least as long when an edge of the period cuts it', () => {
    expect(outageWords(contactPlan(series([1, 0, 0, 0, 1]), null).longestOutage)).toBe('3 h');
    expect(outageWords(contactPlan(series([0, 0, 1]), null).longestOutage)).toBe('at least 2 h');
    expect(outageWords(contactPlan(series([1, 0, 0]), null).longestOutage)).toBe('at least 2 h');
    expect(outageWords(contactPlan(series([1, 1]), null).longestOutage)).toBe('none');
  });
});
