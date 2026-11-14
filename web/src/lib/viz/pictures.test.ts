import { describe, expect, it } from 'vitest';
import type { PicturesDoc, PictureRow } from '@/lib/data/validation';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { picturePasses, picturesCard, shortPlace } from './pictures';

const doc = readJson<PicturesDoc>('data', 'validation', 'images.json');
const part = (label: string, d: PicturesDoc = doc) => picturesCard(d).parts.find((p) => p.label === label)?.text ?? '';
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
/** The table with every picture made to meet the mark. */
const allMeet: PicturesDoc = { ...doc, rows: doc.rows.map((r) => ({ ...r, agree: Math.max(r.agree, 0.9), light_found: 0.9, shadow_found: 0.95 })) };

describe('picturePasses', () => {
  const rule = { min_agree: 0.85, min_found: 0.8 };
  const row = { agree: 0.9, light_found: 0.85, shadow_found: 0.95 } as PictureRow;
  it('asks for enough agreement and enough of both the lit and the dark ground found', () => {
    expect(picturePasses(row, rule)).toBe(true);
    expect(picturePasses({ ...row, agree: 0.84 }, rule)).toBe(false);
    expect(picturePasses({ ...row, light_found: 0.79 }, rule)).toBe(false);
    expect(picturePasses({ ...row, shadow_found: 0.5 }, rule)).toBe(false);
  });
  it('judges a picture without dark ground on the rest', () => {
    expect(picturePasses({ ...row, shadow_found: null }, rule)).toBe(true);
  });
});

describe('picturesCard', () => {
  it('is a check in the page’s pattern: what it shows, when it passes, what it was tested on and what it leaves out', () => {
    const c = picturesCard(doc);
    expect(c).toMatchObject({ id: 'pictures', kind: 'check', title: 'Where shadows fall in pictures from orbit' });
    expect(c.parts.map((p) => p.label)).toEqual(['What it shows', 'Passes when', 'Tested on', 'What it leaves out']);
    for (const p of c.parts) expect(p.text, p.label).toMatch(/^[A-Z0-9].{30,}\.$/);
  });

  it('works its mark out from the pictures themselves, against the rule in the table', () => {
    const failing = doc.rows.filter((r) => !picturePasses(r, doc.evidence.criteria));
    expect(failing.length).toBeGreaterThan(0);
    expect(picturesCard(doc)).toMatchObject({ pass: false, mark: `Misses: ${failing.length} of ${doc.rows.length} pictures fall short` });
    expect(picturesCard(allMeet)).toMatchObject({ pass: true, mark: 'Passes: every picture meets the mark' });
    // the pipeline's own verdict says the same
    expect(doc.evidence.meets_criteria).toBe(false);
  });

  it('gives the typical agreement as its figure, and the edges and the turned Sun as its proof of sense', () => {
    const c = picturesCard(doc);
    const typical = median(doc.rows.map((r) => r.agree));
    expect(c.figure).toBe(`${Math.round(typical * 100)} %`);
    expect(c.figureWords).toBe(`of the ground the app and the camera call alike, lit or dark, in the typical picture of ${doc.rows.length}`);
    const edges = median(doc.rows.map((r) => r.disagree_on_edges!));
    const turned = median(doc.rows.map((r) => r.agree_sun_turned_90));
    expect(c.sentence).toContain(`Where they differ, it is almost always at the edge of a shadow (${Math.round(edges * 100)} % of that ground, in the typical picture)`);
    expect(c.sentence).toContain(`with the Sun put a quarter of the way round, they would agree on only ${Math.round(turned * 100)} %`);
  });

  it('says when it passes in the rule’s own numbers, and that the mark came after a first look', () => {
    expect(part('Passes when')).toBe(
      'In every picture the app and the camera call at least 85 % of the ground alike, and the app gets at least 80 % of the ground the camera shows lit, and 80 % of the ground it shows dark, right. The mark was set after a first look at five pictures.',
    );
  });

  it('names the cameras, the dates and the places it was tested on', () => {
    expect(part('Tested on')).toBe(
      '20 pictures of 7 sites: Connecting Ridge, Peak near Shackleton, de Gerlache Rim 2, Malapert Massif, Slater Plain, IM-2 Athena and Nobile Rim 2. ' +
        "18 from the Wide Angle Camera (100 m pixels), 20 September to 10 October 2009, one for each quarter of the Sun's circle with the Sun at least 0.5° up; " +
        '2 from the Narrow Angle Camera (20 m pixels) beside Connecting Ridge on 21 September 2010. Peak near Cabeus B had no picture with the Sun 0.5° up.',
    );
  });

  it('leaves out what it cannot see, and names where the app falls short', () => {
    const t = part('What it leaves out');
    // In every picture the app draws more shadow than the camera saw.
    expect(doc.rows.every((r) => r.app_lit < r.seen_lit)).toBe(true);
    expect(t).toContain('In every picture the app draws more shadow than the camera shows.');
    expect(t).toContain(
      "The 3 pictures that fall short all had the Sun 1.1° up or less: there the app draws shadow on 22 to 26 % of the ground the camera saw lit (with NASA's newer terrain, 20 to 23 %).",
    );
    expect(t).toMatch(/within 100 m\. All but 2 come from one month, with the Sun 0\.5° to 7\.3° up; a lower Sun is not tested\.$/);
    expect(part('What it leaves out', allMeet)).not.toMatch(/fall short/);
  });

  it('uses the app’s one name for each thing: no "in shadow" for night, nothing hidden', () => {
    const c = picturesCard(doc);
    const all = [c.mark, c.figureWords, c.sentence, ...c.parts.map((p) => p.text)].join(' ');
    expect(all).not.toMatch(/\bin shadow\b|\bin the dark\b|\bhid(?:e|es|den|ing)\b/i);
  });

  it('shortens a place to its name', () => {
    expect(shortPlace('Connecting Ridge (Shackleton–de Gerlache ridge)')).toBe('Connecting Ridge');
    expect(shortPlace('IM-2 Athena landing site (Mons Mouton)')).toBe('IM-2 Athena');
  });
});
