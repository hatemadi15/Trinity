import { describe, expect, it } from 'vitest';
import { HOME } from '../data/home';
import { groundPath, skylineAt, trackPaths, whyDrawings, xOf, yOf, type Chart } from './why';

const d = whyDrawings();
const chart: Chart = { x0: 0, x1: 360, y0: 0, y1: 100, az0: 0, az1: 360, el0: -5, el1: 5 };

describe('the drawings’ geometry', () => {
  it('maps a direction across and a height up, the horizon of a chart from −5° to 5° half way down', () => {
    expect(xOf(chart, 90)).toBe(90);
    expect(yOf(chart, 0)).toBe(50);
    expect(yOf(chart, 5)).toBe(0);
  });

  it('splits a track where it wraps past north and where it goes from in view to hidden', () => {
    const az = [350, 355, 0, 5, 10, 15];
    const el = [1, 1, 1, -1, -1, 1];
    const t = trackPaths(chart, az, el, (h) => el[h] > 0, 1);
    // 350 → 355 in view; the wrap to 0 is left out; 0 → 5 and on are hidden until 15, where it shows again.
    expect(t.shown).toBe('M350 40L355 40');
    expect(t.hidden).toBe('M0 40L5 60L10 60L15 40');
  });

  it('fills the ground under a skyline to the chart’s foot, and reads the skyline in any direction', () => {
    const mask = { az0: 0, step: 90, el: [0, 1, 2, 1] };
    expect(groundPath(chart, mask)).toBe('M0 100L0 50L90 40L180 30L270 40L360 50L360 100Z');
    expect(skylineAt(mask, 185)).toBe(2);
    expect(skylineAt(mask, -90)).toBe(1);
  });
});

describe('the three drawings, from the month at de Gerlache Rim 2', () => {
  it('draws the Sun’s month once round the horizon, never higher than 2.5°, with each day marked and a Sun of middle latitudes for contrast', () => {
    expect(d.sun.highest.el).toBe(Math.max(...HOME.sky.sun_el));
    expect(d.sun.highest.date).toBe('1 Jan');
    expect(d.sun.days).toHaveLength(30);
    expect(d.sun.days.filter((p) => p.label).map((p) => p.label)).toEqual(['8 Jan', '15 Jan', '22 Jan', '29 Jan']);
    expect(d.sun.contrast).toMatchObject({ site: 'Apollo 15', lat: 26, peak: 64 });
    expect(d.sun.notice).toBe('The Sun circles the horizon once a month and never stands higher than 2.5°.');
    expect(d.sun.xTicks.map((t) => t.label)).toEqual(['N', 'E', 'S', 'W', 'N']);
  });

  it('sets the ridge’s skyline beside the summit’s, the Sun against each: hidden 16 days 15 hours at the ridge, never at the summit', () => {
    const [site, rim] = d.hills.panels;
    expect(site.summary).toBe('sunlit 45 % of the month');
    expect(site.hidden).toMatchObject({ span: '16 days 15 hours', when: '3 Jan to 20 Jan' });
    expect(site.hidden!.x1).toBeGreaterThan(site.hidden!.x0);
    expect(site.track.hidden.length).toBeGreaterThan(0);
    expect(rim.summary).toBe('sunlit all month');
    expect(rim.hidden).toBeNull();
    expect(rim.track.hidden).toBe('');
    expect(d.hills.km).toBe(12);
    expect(d.hills.notice).toBe('The same Sun, 12 km apart: the hills hide it from de Gerlache Rim 2 for 16 days 15 hours, never from the summit.');
  });

  it('draws Earth’s small loop, in view above the hills and set below them, 45 % of the month in view', () => {
    expect(d.earth.inViewPct).toBe('45 %');
    expect(d.earth.track.shown.length).toBeGreaterThan(0);
    expect(d.earth.track.hidden.length).toBeGreaterThan(0);
    expect(d.earth.highest).toMatchObject({ el: 7.43, date: '17 Jan' });
    expect(d.earth.chart.az0).toBeLessThan(Math.min(...HOME.sky.earth_az));
    expect(d.earth.chart.az1).toBeGreaterThan(Math.max(...HOME.sky.earth_az));
  });

  it('plays each month in stops of three hours, dated, the last on 30 January', () => {
    for (const frames of [d.sun.frames, d.hills.panels[0].frames, d.hills.panels[1].frames, d.earth.frames]) {
      expect(frames).toHaveLength(240);
      expect(frames[0].date).toBe('1 Jan');
      expect(frames.at(-1)!.date).toBe('30 Jan');
    }
    // On 10 January the hills hide the Sun at the ridge and not at the summit.
    const tenth = (9 * 24) / 3;
    expect(d.hills.panels[0].frames[tenth].shown).toBe(false);
    expect(d.hills.panels[1].frames[tenth].shown).toBe(true);
  });

  it('says nothing of a lander living or surviving: the drawings are about light and line of sight', () => {
    const text = JSON.stringify([d.sun.alt, d.sun.notice, d.hills.alt, d.hills.notice, d.earth.alt, d.earth.notice]);
    expect(text).not.toMatch(/surviv|\blives?\b|alive|dies|dead/i);
  });
});
