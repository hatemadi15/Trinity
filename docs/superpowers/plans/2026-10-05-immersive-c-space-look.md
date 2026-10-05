# Part C: The Space Look Across the Pages, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page of Earthrise in the space look of spec section 6: a near-black page in the dark theme by default, faint real stars behind each page's header band, dark plates with a hairline edge and no blur, gradients or glow, motion only in the arrival, Explore's period on one line on a phone. The plan also covers the page-level asks that sections 13.3 and 14.3 carry to part C.

**Architecture:** The look lives in the theme tokens of `web/src/app/globals.css`, which every page already uses; dark becomes the default in `web/src/lib/theme.ts`. The stars are drawn once on a 2D canvas by a new `StarBand` component in the app frame. It uses a pure projection (`web/src/lib/sky/starBand.ts`) of the catalogue the stand view already loads. The asks are copy and layout changes in the components that own them, and one new key moment ("earth-out") in `web/src/lib/viz/stand.ts`. No computed number changes (spec 11).

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, vitest with jsdom and Testing Library, three.js 0.186 (untouched here), Playwright MCP for the measurements and the blind read's frames.

**Spec:** `docs/superpowers/specs/2026-10-02-immersive-space-design.md`: section 6 (part C), sections 7 to 9 (performance, accessibility, testing), the asks for part C in 13.3 and 14.3, and the readers' named items in the part B ledger (`docs/superpowers/plans/2026-10-04-immersive-b-arrival.ledger.md`, the "Read B5" to "Read B7" lines). The user approved the look's mockup on 5 October 2026 ("continue"). The mockup's sources are in the job folder `.claude/jobs/a9458886/tmp/mock_c/` (`mock.js`, `stars_band.py`).

## Scope

This plan covers spec section 6 and the page-level asks:
- **From 13.3:** one name for the dark stretch; the stand view's phone card; a classroom setting. Here the classroom setting is brighter grey text in the dark palette (`--ink-3`), and How it works says how to zoom for a projector, checked at 150 %. Ruling: no separate mode. Browser zoom scales everything, the 3D labels too, and the pages already reflow at 960 px. Cost if wrong: a teacher who does not know the zoom keys sees the normal size.
- **From 14.3:** say what the site answers (a browser of landing sites and dates, with more than two landers); the lander is an example; the teacher's route nearer the top, and the cause; the date bar's marks and Earth setting; the phone's last screen; one name for each event; Earth's loop explained where it first shows; labels joined to their marks, with the date bar's key no smaller than the labels.

These asks from 14.3 are about the 3D scenes, not the pages. They move to their own plan after this one, part D, "the scenes":
- the descent's middle (900 to 90 km), and a sharper patch round the site seen from the cap;
- rocks that read as boxes, and a plain lander;
- the stand view crowded for a first look, the lander out of frame at most hours, and the level horizon through the hill at night;
- the ground at night (a flat grey plane, then blue in Earthlight).

Task 13 records this split in spec section 15. Ruling: the scenes are an independent subsystem (shaders and models, not pages), and the writing-plans scope rule gives each subsystem its own plan. Cost if wrong: part C's blind read may again name the scene asks, and its immersion score may stay at 3 for them.

## Global Constraints

- Gates from `web/`: `npx vitest run --maxWorkers=2` (the development laptop has 8 GB), `npx tsc --noEmit`, `npm run lint`, `npm run build`. The pipeline is untouched (`uv run pytest -q` only if a pipeline file changes).
- Spec 6: "Dark by default. The page is near-black, the stages true black; the light theme stays for print and classrooms (the brief always prints light). The theme switch keeps its place."
- Spec 6: "Faint real stars (the same catalogue, a fixed hour) behind each page's header band only; never behind running text."
- Spec 6: "Panels become dark plates with a hairline edge; no blur, no gradients, no glow except the Sun's glare and Earth's atmosphere, which are physical."
- Spec 6: "Type. Unchanged faces and sizes; contrast rechecked for the dark palette (body text at least 7:1 on the page, secondary text at least 4.5:1)."
- Spec 6: "Motion. One orchestrated moment on the home page (the arrival); elsewhere, nothing moves unless the visitor moves it."
- Spec 6: "Phone. The period band folds into one line ("de Gerlache Rim 2, 30 days from 1 January, small lander: change") so the answer is on the first screen."
- Spec 6, done when: "Every page passes the size and contrast measurements in both themes and the blind read of the whole app passes."
- Spec 11: no change to a computed number.
- Copy: plain words, no instrument or programme names in the main copy (`web/src/app/page.test.tsx`: no LOLA, DE440, CLPS, Horizons, ephemeris, skyline); "programme" and other British spellings as in the rest of the app.
- Sizes (user's rule, Oct 1): body 16 px, nothing under 13 px, controls 40 px tall or more (44 px for the main buttons, `.btn-sm` and up), no sideways scroll at 390 px.
- Screens are checked on a fresh loopback host (`127.0.0.x:3000`, never `localhost` or `127.0.0.1`, which carry 75 to 80 % zoom in the Playwright browser), on the production build (`npm run build`, then `npx next start --port 3000 --hostname 0.0.0.0`).
- Secrets: never read, print or copy `web/.env.local`; no calls to OpenRouter or any paid API in tests, reads or reviews.
- Commits end with the attribution lines given in the session; one pull request for the part, merged after GitGuardian passes (`gh pr merge N --merge`).

## Review Focus

1. **A returning visitor who chose the light theme** (stored in `localStorage`, or `?theme=light` in the address) still gets light: the new dark default never overrides a choice. Test in Task 1.
2. **The star data fails to load** (offline, data host down) or the browser has no 2D canvas: the page draws as before with no stars, no error and no layout shift. Test in Task 2.
3. **The page title wraps to more lines** (a narrow window, a web font arriving late): the band is measured again, so the stars never run behind the paragraph under the title. Test in Task 2.
4. **Printing a page from the dark theme:** no stars, and the page prints on white as the brief does. Test in Task 2.
5. **A phone visitor opens the folded period band:** they change the length, the line under it says the new length, and "done" folds it again. A custom lander reads "custom lander". Test in Task 5.

## File map

| File | Task | What changes |
|---|---|---|
| `web/src/app/globals.css` | 1, 2, 4 | dark tokens; the star band's rules; the home chart's self-playing reveal removed |
| `web/src/app/globals.test.ts` | 1, 4 | the new palette's contrast; no self-playing motion |
| `web/src/lib/theme.ts`, `theme.test.ts` | 1 | dark by default |
| `web/src/lib/sky/starBand.ts` (new), `starBand.test.ts` (new) | 2 | the band's projection |
| `web/src/components/StarBand.tsx` (new), `StarBand.test.tsx` (new) | 2 | the canvas |
| `web/src/components/AppFrame.tsx`, `AppFrame.test.tsx` | 2 | the band in the frame |
| `web/src/components/sites/SitesView.tsx`, `CompareView.tsx`, `ValidateView.tsx`, `web/src/app/learn/page.tsx` | 2 | `data-band-end` on each title |
| `web/src/app/look.test.ts` (new) | 3, 4 | no blur, gradients, glow or self-playing motion in any source |
| `web/src/components/home/Arrival.tsx` | 3, 6, 9 | plates; the opening words; the last screen |
| `web/src/components/stand/StandView.tsx` | 3, 7, 8, 10 | plate; event words; Earth setting; the phone card |
| `web/src/components/SkyRow.tsx`, `SkyRow.test.tsx`, `web/src/app/page.tsx` | 4, 6 | no reveal; the forecast's lander an example |
| `web/src/components/explore/PeriodBand.tsx`, `PeriodBand.test.tsx` | 5 | the one-line fold; `data-band-end` |
| `web/src/components/home/WhySection.tsx`, `web/src/lib/viz/arrival.ts` | 6 | the cause, the teacher's route, the beats' words |
| `web/src/lib/viz/stand.ts`, `stand.test.ts` | 7, 8 | event words; "earth-out" |
| `web/src/lib/viz/answer.ts`, `web/src/components/explore/NumbersCard.tsx`, `TimeBar.tsx` | 7, 10 | event words; the time bar's keys on a phone |
| `web/src/lib/viz/words.test.ts` (new) | 7 | one name for each event, over every hour of the hero month |
| `web/src/components/home/ArrivalCanvas.tsx`, `ArrivalCanvas.test.tsx` | 7, 8, 9 | date bar words, lanes, Earth setting; labels joined; Earth's loop |
| `web/src/components/stand/StandCanvas.tsx` | 7, 9, 10 | pointer words; Earth's loop; Earth's angle on a phone |
| `web/src/app/learn/page.tsx` | 11 | how to show it on a projector |
| `README.md`, `web/README.md`, `docs/pitch.md`, spec section 15 | 13 | docs |

Tasks 1 to 6 share no file except where the map says so. Tasks 7 to 10 touch the arrival's canvas and the stand view in that order: run them one after another.

---

### Task 1: Dark palette, dark by default

**Files:**
- Modify: `web/src/app/globals.css:1-72` (the top comment and the dark block)
- Modify: `web/src/lib/theme.ts:7,14`
- Test: `web/src/app/globals.test.ts`, `web/src/lib/theme.test.ts`

**Interfaces:**
- Produces: `DEFAULT_THEME: Theme = 'dark'`; dark tokens `--page #07080a`, `--surface #0f1013`, `--surface-2 #17181c`, `--line #2a2b30`, `--line-strong #6b6c71`, `--stage-edge #48494e` and `--ink-3 #aeada8`, a brighter grey for secondary text (13.3, the teacher's classroom ask); `--ink` and `--ink-2` stay `#f3f2ee` and `#c6c5c0`. Every later task's screenshots assume these.

- [ ] **Step 1: Write the failing tests**

In `web/src/app/globals.test.ts`, replace the test `'matches the approved values for the page, ink, the stage and the two identity colours'`, the test `'keeps the stage darker than the dark page and gives it an edge that shows on both, so a picture panel never melts into the page'`, and the test `'meets AA contrast for text in both themes and on the stage'` with:

```ts
  it('matches the approved values: the light page, the near-black dark page and its plates, ink, the stage and the two identity colours', () => {
    expect(light['--page']).toBe('#dedcd6');
    expect(dark['--page']).toBe('#07080a');
    expect(dark['--surface']).toBe('#0f1013');
    expect(dark['--surface-2']).toBe('#17181c');
    expect(dark['--ink-3']).toBe('#aeada8');
    expect(light['--surface']).toBe('#ffffff');
    expect(light['--ink']).toBe('#000000');
    expect(dark['--ink']).toBe('#f3f2ee');
    expect(light['--stage']).toBe('#000000');
    expect(light['--sun']).toBe('#f2b134');
    expect(dark['--earth']).toBe('#6aa9ff');
  });

  it('makes the dark page near-black but not the stage’s true black, and gives a picture panel an edge that shows on both (spec 6)', () => {
    expect(luminance(dark['--page'])).toBeLessThan(0.005);
    expect(dark['--page']).not.toBe(light['--stage']);
    expect(contrast(dark['--stage-edge'], dark['--page'])).toBeGreaterThanOrEqual(2);
    expect(contrast(dark['--stage-edge'], light['--stage'])).toBeGreaterThanOrEqual(2);
    expect(contrast(light['--stage-edge'], light['--stage'])).toBeGreaterThanOrEqual(1.5);
    expect(css).toMatch(/\.stage \{[^}]*border: 1px solid var\(--stage-edge\)/);
  });

  it('draws plates with a hairline that shows, and gives controls an edge of 3:1 on the dark page', () => {
    expect(contrast(dark['--line'], dark['--surface'])).toBeGreaterThanOrEqual(1.3);
    expect(contrast(light['--line'], light['--surface'])).toBeGreaterThanOrEqual(1.3);
    expect(contrast(dark['--line-strong'], dark['--surface'])).toBeGreaterThanOrEqual(3);
    expect(contrast(dark['--line-strong'], dark['--page'])).toBeGreaterThanOrEqual(3);
  });

  it('gives body text 7:1 and secondary text 4.5:1 on the page and its plates, in both themes (spec 6)', () => {
    for (const [name, t] of [['light', light], ['dark', dark]] as const) {
      for (const bg of ['--page', '--surface', '--surface-2']) {
        for (const fg of ['--ink', '--ink-2']) expect(contrast(t[fg], t[bg]), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(7);
        expect(contrast(t['--ink-3'], t[bg]), `${name} --ink-3 on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      const coloured: [string, string][] = [
        ['--sun-ink', '--surface'], ['--earth-ink', '--surface'], ['--good', '--surface'], ['--bad', '--surface'], ['--warn', '--surface'],
        ['--sun-ink', '--page'], ['--earth-ink', '--page'], ['--good', '--page'], ['--bad', '--page'],
      ];
      for (const [fg, bg] of coloured) expect(contrast(t[fg], t[bg]), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light['--sun-on'], t['--sun']), `${name} text on the Sun fill`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(light['--stage-ink'], light['--stage'])).toBeGreaterThanOrEqual(7);
    expect(contrast(light['--stage-ink-2'], light['--stage'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light['--stage-ink'], light['--hill'])).toBeGreaterThanOrEqual(4.5);
  });
```

In `web/src/lib/theme.test.ts`, replace the first two `describe('resolveTheme')` tests with:

```ts
  it('prefers the URL, then the visit, then the stored choice, then dark (spec 6: dark by default)', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(resolveTheme('', null, null)).toBe('dark');
    expect(resolveTheme('', null, 'dark')).toBe('dark');
    expect(resolveTheme('', 'light', 'dark')).toBe('light');
    expect(resolveTheme('?theme=dark', 'light', 'light')).toBe('dark');
  });

  it('keeps a returning visitor’s light theme: a stored choice or the address wins over the new default', () => {
    expect(resolveTheme('', null, 'light')).toBe('light');
    expect(resolveTheme('?theme=light', null, null)).toBe('light');
    expect(resolveTheme('', 'light', null)).toBe('light');
  });

  it('ignores anything that is not light or dark', () => {
    expect(parseTheme('banana')).toBeNull();
    expect(parseTheme(null)).toBeNull();
    expect(resolveTheme('?theme=banana', 'purple', 'DARK')).toBe('dark');
    expect(resolveTheme('?theme=banana', null, 'light')).toBe('light');
  });
```

In the same file, in `'still sets the default when storage throws'`, change the expected attribute from `'light'` to `'dark'`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/app/globals.test.ts src/lib/theme.test.ts --maxWorkers=2`
Expected: FAIL. `expected '#222220' to be '#07080a'` (globals), `expected 'light' to be 'dark'` (theme).

- [ ] **Step 3: Change the tokens and the default**

In `web/src/app/globals.css`, replace the top comment's first sentence and the dark block's opening:

```css
/*
 * Dark is the default theme (spec 6); data-theme="light" on <html> swaps the values (set before paint by the
 * inline script in layout.tsx), and the light theme stays for print and classrooms. The palette is the Moon's own
 * three tones: shadow black (the stage), regolith grey (the light page) and sunlit white (panels). Colour is kept
 * for the Sun and Earth, and green and red for the power verdict. Picture panels ("stages": charts, shadow map,
 * 3D, relief maps) keep the same colours in both themes; the sky above an airless world is true black.
 */
```

and in the block `:root[data-theme="dark"], .theme-dark { … }` replace the comment and these seven values (the other tokens of the block stay as they are):

```css
  /* Near-black, one step above the stages' true black; plates one step above the page, with a hairline edge. */
  --page: #07080a;
  --surface: #0f1013;
  --surface-2: #17181c;
  --line: #2a2b30;
  --line-strong: #6b6c71;
  --stage-edge: #48494e;
  /* Secondary text a step brighter than before, for a classroom's projector (13.3): 8:1 on the plates. */
  --ink-3: #aeada8;
```

In `web/src/lib/theme.ts`, set `export const DEFAULT_THEME: Theme = 'dark';` and change the comment on `resolveTheme` to `/** URL, then the visit, then the stored choice, then dark. The system preference is not followed (spec 4.1). */`.

- [ ] **Step 4: Run them to see them pass, then the whole suite**

Run: `cd web && npx vitest run src/app/globals.test.ts src/lib/theme.test.ts --maxWorkers=2`
Expected: PASS.

Run: `cd web && npx vitest run --maxWorkers=2 > ../.superpowers/sdd/2026-10-05-immersive-c-space-look/task-1-full.log 2>&1; tail -5 ../.superpowers/sdd/2026-10-05-immersive-c-space-look/task-1-full.log`
Expected: all pass. A test that read the light default from the document (for example, one asserting `data-theme="light"` with nothing stored) now sees dark. Change only that test's expected theme, and say so in the ledger.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/globals.css web/src/app/globals.test.ts web/src/lib/theme.ts web/src/lib/theme.test.ts
git commit -m "feat(web): dark by default, on a near-black page with plates one step above it and body text at 7:1"
```

---

### Task 2: Stars behind the header band

**Files:**
- Create: `web/src/lib/sky/starBand.ts`, `web/src/lib/sky/starBand.test.ts`
- Create: `web/src/components/StarBand.tsx`, `web/src/components/StarBand.test.tsx`
- Modify: `web/src/components/AppFrame.tsx:20-46`, `web/src/components/AppFrame.test.tsx`
- Modify: `web/src/app/globals.css` (two rules at the end of the components layer and in `@media print`)
- Modify: `web/src/components/sites/SitesView.tsx:252`, `web/src/components/CompareView.tsx:66`, `web/src/components/ValidateView.tsx:168`, `web/src/app/learn/page.tsx:12` (add `data-band-end=""` to each `<h1>`)

**Interfaces:**
- Consumes: `Stars` and `starColour(bv): Vec3` from `web/src/lib/sky/stars.ts`; `parseStars(bytes: ArrayBuffer, count: number): Stars`; `fetchBytes(url): Promise<Uint8Array>` and `dataBase(): string` from `web/src/lib/data/loaders.ts`.
- Produces: `bandStars(stars, widthPx, heightPx, pxPerDeg = 16, centreLonDeg = 255): BandStar[]`; `bandHeight(frame: HTMLElement): number`; `<StarBand />`; the `data-band-end` attribute. Task 5 puts `data-band-end` on Explore's period band.

- [ ] **Step 1: Write the projection's failing tests**

`web/src/lib/sky/starBand.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bandStars } from './starBand';
import type { Stars } from './stars';

/** A catalogue of stars given by ecliptic longitude and latitude (degrees), magnitude and B−V colour. */
function catalogue(list: [number, number, number, number][]): Stars {
  const e = (23.4393 * Math.PI) / 180;
  const j2000 = new Float32Array(list.length * 3), vmag = new Float32Array(list.length), bv = new Float32Array(list.length);
  list.forEach(([lonDeg, latDeg, m, b], i) => {
    const lon = (lonDeg * Math.PI) / 180, lat = (latDeg * Math.PI) / 180;
    const xe = Math.cos(lat) * Math.cos(lon), ye = Math.cos(lat) * Math.sin(lon), ze = Math.sin(lat);
    // Ecliptic to J2000 equatorial: a turn about x by the obliquity.
    j2000.set([xe, ye * Math.cos(e) - ze * Math.sin(e), ye * Math.sin(e) + ze * Math.cos(e)], i * 3);
    vmag[i] = m;
    bv[i] = b;
  });
  return { count: list.length, j2000, vmag, bv };
}

describe('the band of stars behind the header', () => {
  it('places a star by its height over the south pole (minus its ecliptic latitude) and its longitude from the band’s middle', () => {
    const [s] = bandStars(catalogue([[255, -10, 2, 0.6]]), 1440, 300);
    expect(s.x).toBeCloseTo(0, 2);
    expect(s.y).toBeCloseTo(160, 2);
    const [t] = bandStars(catalogue([[265, -5, 2, 0.6]]), 1440, 300);
    expect(t.x).toBeCloseTo(160, 2);
    expect(t.y).toBeCloseTo(80, 2);
  });

  it('leaves out stars below the horizon, above the band and beyond its ends', () => {
    expect(bandStars(catalogue([[255, 5, 2, 0], [255, -30, 2, 0], [0, -10, 2, 0]]), 1440, 300)).toHaveLength(0);
  });

  it('draws bright stars larger and more opaque, the faint ones first so the bright sit on top, and fades the lowest third', () => {
    const list = bandStars(catalogue([[250, -15, 0.5, 0.6], [260, -15, 5.5, 0.6], [255, -1, 0.5, 0.6]]), 1440, 300);
    expect(list.map((s) => Math.round(s.r * 100) / 100)).toEqual([1.09, 3.19, 3.19]);
    const [faint, bright, low] = list;
    expect(bright.alpha).toBeGreaterThan(faint.alpha);
    expect(faint.alpha).toBeCloseTo(0.16, 3);
    expect(low.alpha).toBeLessThan(bright.alpha / 3);
  });

  it('colours each star by its B−V, blue-white to orange', () => {
    const [hot, cool] = bandStars(catalogue([[250, -15, 2, -0.3], [260, -15, 2, 1.6]]), 1440, 300);
    expect(hot.rgb[2]).toBeGreaterThan(hot.rgb[0]);
    expect(cool.rgb[0]).toBeGreaterThan(cool.rgb[2]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/sky/starBand.test.ts --maxWorkers=2`
Expected: FAIL, "Failed to resolve import "./starBand"".

- [ ] **Step 3: Write the projection**

`web/src/lib/sky/starBand.ts`:

```ts
import { starColour, type Stars } from './stars';

/** The ecliptic's tilt to the Earth's equator (J2000), radians. */
const OBLIQUITY = (23.4393 * Math.PI) / 180;

/** A star of the header band: where it sits (CSS pixels from the band's bottom middle, y up), its radius, opacity and colour. */
export interface BandStar {
  x: number;
  y: number;
  r: number;
  alpha: number;
  rgb: [number, number, number];
}

/**
 * The low sky over the Moon's south pole, for the band of stars behind each page's header (spec 6): the
 * catalogue's stars from the horizon up, at a fixed hour. The Moon's axis stands within 1.6° of the ecliptic's,
 * so at its south pole a star's height is close to minus its ecliptic latitude, and the hour only turns the sky
 * about the zenith. The band is centred on ecliptic longitude `centreLonDeg`: 255° is Scorpius and Sagittarius,
 * the brightest stretch of the Milky Way. It runs `pxPerDeg` CSS pixels to the degree both ways. Only the stars
 * inside `widthPx` × `heightPx` are returned, faintest first, so the bright ones are drawn on top. They are faint,
 * 0.16 to 0.85 opaque by magnitude, and fade out over the band's lowest third, so they never end in a hard line
 * just above the words.
 */
export function bandStars(stars: Stars, widthPx: number, heightPx: number, pxPerDeg = 16, centreLonDeg = 255): BandStar[] {
  const cosE = Math.cos(OBLIQUITY), sinE = Math.sin(OBLIQUITY);
  const out: BandStar[] = [], mags: number[] = [];
  for (let i = 0; i < stars.count; i++) {
    const x = stars.j2000[i * 3], y = stars.j2000[i * 3 + 1], z = stars.j2000[i * 3 + 2];
    const ye = y * cosE + z * sinE, ze = -y * sinE + z * cosE;
    const up = (Math.asin(Math.max(-1, Math.min(1, -ze))) * 180) / Math.PI;
    if (up < 0) continue;
    const lon = ((((Math.atan2(ye, x) * 180) / Math.PI) % 360) + 360) % 360;
    const d = ((lon - centreLonDeg + 540) % 360) - 180;
    const px = d * pxPerDeg, py = up * pxPerDeg;
    if (Math.abs(px) > widthPx / 2 || py > heightPx) continue;
    const m = stars.vmag[i];
    const fade = Math.min(1, py / (heightPx / 3));
    const c = starColour(stars.bv[i]);
    out.push({
      x: px,
      y: py,
      r: Math.max(0.9, 3.4 - 0.42 * m),
      alpha: Math.min(0.85, Math.max(0.16, 0.9 * 10 ** (-0.4 * (m - 1)))) * fade,
      rgb: [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)],
    });
    mags.push(m);
  }
  return out.map((s, k) => [s, mags[k]] as const).sort((a, b) => b[1] - a[1]).map(([s]) => s);
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd web && npx vitest run src/lib/sky/starBand.test.ts --maxWorkers=2`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the component's failing tests**

`web/src/components/StarBand.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bandHeight, StarBand } from './StarBand';

const box = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 1440, width: 1440, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

/** Two stars in the band (ecliptic latitude −10° at longitudes 255° and 260°) as the catalogue file stores them. */
function starBytes(): ArrayBuffer {
  const e = (23.4393 * Math.PI) / 180, rows: number[] = [];
  for (const lonDeg of [255, 260]) {
    const lon = (lonDeg * Math.PI) / 180, lat = (-10 * Math.PI) / 180;
    const xe = Math.cos(lat) * Math.cos(lon), ye = Math.cos(lat) * Math.sin(lon), ze = Math.sin(lat);
    rows.push(xe, ye * Math.cos(e) - ze * Math.sin(e), ye * Math.sin(e) + ze * Math.cos(e), 2, 0.6);
  }
  return new Float32Array(rows).buffer;
}

afterEach(() => vi.restoreAllMocks());

describe('bandHeight', () => {
  it('runs to the header’s foot on a page without a marked title, as the home page, where the arrival starts under it', () => {
    const frame = document.createElement('div');
    frame.innerHTML = '<header></header><div></div>';
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(box(0, 2000));
    vi.spyOn(frame.querySelector('header')!, 'getBoundingClientRect').mockReturnValue(box(0, 68));
    expect(bandHeight(frame)).toBe(68);
  });

  it('runs just past the marked title, stopping short of the running text under it, however the title wraps', () => {
    const frame = document.createElement('div');
    frame.innerHTML = '<header></header><main><h1 data-band-end="">Choose a landing site</h1><p>19 places</p></main>';
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(box(0, 2000));
    const h1 = frame.querySelector('h1')!, p = frame.querySelector('p')!;
    vi.spyOn(h1, 'getBoundingClientRect').mockReturnValue(box(110, 158));
    vi.spyOn(p, 'getBoundingClientRect').mockReturnValue(box(170, 200));
    // 12 px to the paragraph: the band ends 4 px short of it.
    expect(bandHeight(frame)).toBe(166);
    // The title on two lines pushes the paragraph down: the band follows.
    vi.spyOn(h1, 'getBoundingClientRect').mockReturnValue(box(110, 206));
    vi.spyOn(p, 'getBoundingClientRect').mockReturnValue(box(250, 280));
    expect(bandHeight(frame)).toBe(230);
  });
});

describe('StarBand', () => {
  it('draws the catalogue’s stars on a canvas the screen reader skips, once they arrive', async () => {
    const fill = vi.fn();
    const g = { setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill, fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(g as unknown as CanvasRenderingContext2D);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(starBytes()));
    const { container } = render(
      <div>
        <StarBand />
        <header />
      </div>,
    );
    const canvas = container.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(canvas.className).toMatch(/\bstar-band\b/);
    await waitFor(() => expect(fill).toHaveBeenCalled());
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toMatch(/\/sky\/stars\.bin$/);
  });

  it('leaves the page as it is, with no stars and no error, when the catalogue cannot be fetched', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const { container } = render(
      <div>
        <StarBand />
        <header />
      </div>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(getContext).not.toHaveBeenCalled();
    expect(container.querySelector('canvas')!.style.height).toBe('');
  });
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `cd web && npx vitest run src/components/StarBand.test.tsx --maxWorkers=2`
Expected: FAIL, "Failed to resolve import "./StarBand"".

- [ ] **Step 7: Write the component**

`web/src/components/StarBand.tsx`:

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { dataBase, fetchBytes } from '@/lib/data/loaders';
import { bandStars } from '@/lib/sky/starBand';
import { parseStars, type Stars } from '@/lib/sky/stars';

/** How far the band runs past the marked title, in pixels, kept 4 px short of the next block. */
const BAND_PAD_PX = 24;

/**
 * How tall the band is, in pixels from the frame's top: to just past the element marked `data-band-end` (the
 * page's title, or Explore's period band), stopping 4 px short of the running text after it; with no mark, to the
 * header's foot.
 */
export function bandHeight(frame: HTMLElement): number {
  const top = frame.getBoundingClientRect().top;
  const end = frame.querySelector<HTMLElement>('[data-band-end]');
  if (!end) {
    const header = frame.querySelector('header');
    return header ? Math.round(header.getBoundingClientRect().bottom - top) : 0;
  }
  const box = end.getBoundingClientRect();
  const next = end.nextElementSibling?.getBoundingClientRect();
  const pad = next ? Math.max(0, Math.min(BAND_PAD_PX, next.top - box.bottom - 4)) : BAND_PAD_PX;
  return Math.round(box.bottom + pad - top);
}

let catalogue: Promise<Stars> | null = null;
/** The catalogue, fetched once for the page's life (the stand view loads the same file, from the cache); a failure is tried again on the next page. */
function loadStars(): Promise<Stars> {
  catalogue ??= fetchBytes(`${dataBase()}/sky/stars.bin`).then(
    (b) => parseStars(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, Math.floor(b.byteLength / 20)),
    (err: unknown) => {
      catalogue = null;
      throw err;
    },
  );
  return catalogue;
}

/**
 * Faint real stars behind the page's header band (spec 6): the site's header and the page's title, never the
 * running text under it. Drawn on a canvas, again whenever the page's size changes; the stylesheet shows it in
 * the dark theme only and never prints it. Without the catalogue, or a 2D canvas, there are no stars.
 */
export function StarBand() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, frame = canvas?.parentElement;
    if (!canvas || !frame) return;
    let stars: Stars | null = null, gone = false;
    const draw = () => {
      if (!stars || gone) return;
      const w = frame.clientWidth, h = bandHeight(frame), ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, w, h);
      for (const s of bandStars(stars, w, h)) {
        g.fillStyle = `rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},${s.alpha.toFixed(3)})`;
        g.beginPath();
        g.arc(w / 2 + s.x, h - s.y, s.r, 0, Math.PI * 2);
        g.fill();
      }
    };
    loadStars().then(
      (s) => {
        stars = s;
        draw();
      },
      () => {},
    );
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
    watch?.observe(frame);
    return () => {
      gone = true;
      watch?.disconnect();
    };
  }, []);
  return <canvas ref={ref} aria-hidden="true" data-star-band="" className="star-band pointer-events-none absolute inset-x-0 top-0 w-full" />;
}
```

- [ ] **Step 8: Put it in the frame, and mark the titles**

In `web/src/components/AppFrame.tsx`, import `{ StarBand } from './StarBand'`. Make the frame's root `className="relative flex min-h-screen flex-col"`, with `<StarBand />` as its first child. The header becomes `className="relative border-b border-line"`: transparent, so the stars show through, and in the light theme the body's page colour is the same as before. The content becomes `<div className="relative flex-1">` and the footer `className="relative border-t border-line"`. Positioned, they paint over the band, which comes first. Extend the component's comment with: "Faint stars from the catalogue run behind the header and the page's title (StarBand), in the dark theme."

Add `data-band-end=""` to the `<h1>` of `SitesView.tsx` (line 252), `CompareView.tsx` (line 66), `ValidateView.tsx` (line 168) and `web/src/app/learn/page.tsx` (line 12).

In `web/src/app/globals.css`, at the end of the `@layer components` block, add:

```css
  /* The stars behind the header band (spec 6): the dark theme's only. */
  :root:not([data-theme="dark"]) .star-band {
    display: none;
  }
```

and inside `@media print`, add `.star-band { display: none !important; }`.

In `web/src/components/AppFrame.test.tsx`, add:

```tsx
  it('puts faint stars behind the header, first in the frame so the header and the page paint over them', () => {
    const { container } = render(<AppFrame>page</AppFrame>);
    const frame = container.firstElementChild as HTMLElement;
    const band = frame.firstElementChild as HTMLElement;
    expect(band.tagName).toBe('CANVAS');
    expect(band.getAttribute('aria-hidden')).toBe('true');
    expect(frame.className).toMatch(/\brelative\b/);
    expect(frame.querySelector('header')!.className).toMatch(/\brelative\b/);
    expect(frame.querySelector('header')!.className).not.toMatch(/\bbg-page\b/);
  });
```

(Use the file's existing `render` import. If its tests render `AppFrame` under another name, follow them.)

In `web/src/app/globals.test.ts`, add to `describe('globals.css layering')`:

```ts
  it('shows the stars behind the header band in the dark theme only, and never prints them', () => {
    expect(css).toMatch(/:root:not\(\[data-theme="dark"\]\) \.star-band \{\s*display: none;/);
    expect(css).toMatch(/@media print \{[\s\S]*\.star-band \{ display: none !important; \}/);
  });
```

- [ ] **Step 9: Run the tests, then the whole suite**

Run: `cd web && npx vitest run src/lib/sky/starBand.test.ts src/components/StarBand.test.tsx src/components/AppFrame.test.tsx src/app/globals.test.ts --maxWorkers=2`
Expected: PASS.

Run the whole suite as in Task 1, Step 4. Expected: all pass. A page test that counted `fetch` calls exactly now sees one more, for `stars.bin`. Make that test's mock answer `stars.bin` (any bytes, or a rejection), and ledger it.

- [ ] **Step 10: Check it in the browser**

Build (`cd web && npm run build`) and serve (`npx next start --port 3000 --hostname 0.0.0.0`). On a fresh loopback host, screenshot `/sites` and `/compare` at 1440 × 900 in the dark theme: stars behind the header and the title, none behind the paragraph under it, and none in the light theme (`?theme=light`). Compare with the mockup (`.claude/jobs/a9458886/tmp/mock_c/part-c-mockup.jpg`).

- [ ] **Step 11: Commit**

```bash
git add web/src/lib/sky/starBand.ts web/src/lib/sky/starBand.test.ts web/src/components/StarBand.tsx web/src/components/StarBand.test.tsx web/src/components/AppFrame.tsx web/src/components/AppFrame.test.tsx web/src/app/globals.css web/src/app/globals.test.ts web/src/components/sites/SitesView.tsx web/src/components/CompareView.tsx web/src/components/ValidateView.tsx web/src/app/learn/page.tsx
git commit -m "feat(web): faint real stars behind each page's header and title, from the stand view's catalogue, in the dark theme"
```

---

### Task 3: Plates without blur or gradients

**Files:**
- Create: `web/src/app/look.test.ts`
- Modify: `web/src/components/home/Arrival.tsx:14` (PLATE) and `:171` (the phone's shade behind the opening words)
- Modify: `web/src/components/stand/StandView.tsx:22-23` (PLATE)

**Interfaces:**
- Produces: `PLATE` in both files as `'rounded-lg border border-white/15 bg-[#060607]/92'`. Tasks 6 and 9 edit `Arrival.tsx` after this one.

- [ ] **Step 1: Write the failing test**

`web/src/app/look.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every source under web/src (components, pages, styles), tests left out, with its path from web/. */
function sources(dir = path.resolve(process.cwd(), 'src')): [string, string][] {
  const out: [string, string][] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(p));
    else if (/\.(tsx|ts|css)$/.test(e.name) && !/\.test\./.test(e.name)) out.push([path.relative(process.cwd(), p).replace(/\\/g, '/'), fs.readFileSync(p, 'utf8')]);
  }
  return out;
}

describe('the space look (spec 6)', () => {
  const all = sources();

  it('blurs nothing behind a plate', () => {
    for (const [file, text] of all) expect(text, file).not.toMatch(/backdrop-blur|backdrop-filter|filter:\s*blur/);
  });

  it('paints no gradients; the compass strip fades its ends with a mask and the radio band is striped, both kept', () => {
    const kept = new Map([
      ['src/components/stand/StandCanvas.tsx', 1],
      ['src/components/explore/TimeBar.tsx', 1],
    ]);
    for (const [file, text] of all) {
      const found = text.match(/bg-linear|bg-gradient|bg-radial|bg-conic|linear-gradient|radial-gradient|conic-gradient/g) ?? [];
      expect(found.length, file).toBe(kept.get(file) ?? 0);
    }
  });

  it('casts no glow or shadow on the page: the Sun’s glare and Earth’s air are drawn in the scenes', () => {
    // The stand view's star names and its hint keep a black halo for legibility over the sky: an outline, not a glow.
    for (const [file, text] of all) expect(text, file).not.toMatch(/\bshadow-(?:sm|md|lg|xl|2xl|inner|\[)|drop-shadow|box-shadow|text-shadow:(?!0_0_4px_#000\])/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run src/app/look.test.ts --maxWorkers=2`
Expected: FAIL in "blurs nothing behind a plate" (`src/components/home/Arrival.tsx`, `src/components/stand/StandView.tsx`) and in "paints no gradients" (`src/components/home/Arrival.tsx`, `bg-linear`).

- [ ] **Step 3: Make the plates opaque enough to need no blur, and the phone's shade a plate**

In `web/src/components/home/Arrival.tsx`, set `const PLATE = 'rounded-lg border border-white/15 bg-[#060607]/92';`. In the first beat's wrapper, replace the comment and the classes `max-sm:bg-linear-to-b max-sm:from-black/85 max-sm:from-60% max-sm:to-transparent max-sm:pb-16` with:

```tsx
          {/* On a phone the words stand over the Moon: a dark plate behind them, edge to edge, keeps them easy to read. */}
          <div className="wrap w-full max-sm:border-b max-sm:border-white/15 max-sm:bg-[#060607]/92 max-sm:pb-6">
```

In `web/src/components/stand/StandView.tsx`, replace the PLATE line and its comment with:

```tsx
// The plates are near opaque, so no thin line of the sky shows through the words, and nothing is blurred.
const PLATE = 'rounded-lg border border-white/15 bg-[#060607]/92';
```

- [ ] **Step 4: Run it to see it pass, then the home and stand suites**

Run: `cd web && npx vitest run src/app/look.test.ts src/components/home src/components/stand --maxWorkers=2`
Expected: PASS. A test that matched `backdrop-blur` in a class now matches the plate's `/92`. Change only that expectation, and ledger it.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/look.test.ts web/src/components/home/Arrival.tsx web/src/components/stand/StandView.tsx
git commit -m "feat(web): plates near opaque with a hairline edge, nothing blurred behind them and no gradient anywhere on the pages"
```

---

### Task 4: Nothing moves by itself outside the arrival

**Files:**
- Modify: `web/src/components/SkyRow.tsx` (the `reveal` option and every use of its class)
- Modify: `web/src/app/page.tsx:78-79` (drop ` reveal`)
- Modify: `web/src/app/page.test.tsx` (its reveal expectation)
- Modify: `web/src/app/globals.css:227-233,282-297` (the reveal rules and their keyframes)
- Test: `web/src/components/SkyRow.test.tsx`, `web/src/app/globals.test.ts`, `web/src/app/look.test.ts`

**Interfaces:**
- Produces: `SkyRow` without the `reveal` prop (its type no longer accepts it). Task 6 edits `page.tsx` after this task.

- [ ] **Step 1: Write the failing tests**

In `web/src/app/look.test.ts`, add inside the `describe`:

```ts
  it('plays nothing by itself outside the arrival: no keyframes, no animation classes (spec 6)', () => {
    for (const [file, text] of all) {
      expect(text, file).not.toMatch(/@keyframes|\banimate-[a-z]|\breveal-(?:line|after)\b/);
    }
  });
```

In `web/src/components/SkyRow.test.tsx`, replace the test `'draws the line once and then shows the words when asked to reveal, and stays still otherwise'` with:

```tsx
  it('draws the line and its words at once: nothing plays by itself (spec 6)', () => {
    const { container } = render(<SkyRow el={el} hill={hill} visible={lit} startUtc={START} body="sun" caption="c" />);
    expect(container.querySelector('.reveal-line, .reveal-after')).toBeNull();
    expect(container.textContent).toMatch(/Sun sets/);
  });
```

In `web/src/app/page.test.tsx`, in `'opens on a real forecast…'`, change `expect(earth.querySelector('.reveal-line')).toBeTruthy();` to `expect(earth.querySelector('.reveal-line')).toBeNull();`.

In `web/src/app/globals.test.ts`:
- Remove `'.reveal-line', '.reveal-after'` from the class list of `'declares the shared classes inside @layer components…'`.
- Replace the test `'declares the one page-load motion and switches every animation off under reduced motion'` with:

```ts
  it('declares no motion of its own, and switches every transition off under reduced motion', () => {
    expect(css).not.toMatch(/@keyframes|\.reveal-/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\* \{[^}]*animation: none !important/);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/app/look.test.ts src/app/globals.test.ts src/components/SkyRow.test.tsx --maxWorkers=2`
Expected: FAIL on `@keyframes` in `src/app/globals.css` and on `reveal-line` in `src/components/SkyRow.tsx`.

- [ ] **Step 3: Remove the reveal**

From `web/src/app/globals.css`, delete the comment "The one motion that plays by itself…" with the `.reveal-line` and `.reveal-after` rules after it, and both `@keyframes` blocks (`reveal-wipe`, `reveal-show`). In `web/src/app/page.tsx`, delete ` reveal` at the end of both `<SkyRow … />` elements (lines 78 and 79). Then run this script from `web/`, which removes the option from `SkyRow.tsx` and stops if any expected text is missing:

```python
from pathlib import Path
p = Path('src/components/SkyRow.tsx'); s = p.read_text(encoding='utf-8')
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (a, s.count(a))
    s = s.replace(a, b)
rep(" `ticks` writes the days along the bottom; `reveal` draws the line once from left to right\n * when the page opens and then shows the words about it. `fitHills`", " `ticks` writes the days along the bottom. `fitHills`")
rep("  reveal = false,\n", "")
rep("}: RowProps & { caption: string; reveal?: boolean }) {", "}: RowProps & { caption: string }) {")
rep("  const after = reveal ? 'reveal-after' : '';\n", "")
rep("function Band({ band, shown, color, after }: { band: NarrowBand; shown: string; color: string; after: string }) {", "function Band({ band, shown, color }: { band: NarrowBand; shown: string; color: string }) {")
rep("function NarrowLabel({ word, color, after }: { word: NarrowWord; color: string; after: string }) {", "function NarrowLabel({ word, color }: { word: NarrowWord; color: string }) {")
rep(" className={after}", "")
rep(" after={after}", "", 2)
rep("className={`${after} ${p.long ? '' : '@max-[900px]:hidden'}`}", "className={p.long ? '' : '@max-[900px]:hidden'}")
rep(" ${after}", "", 7)
rep(" ${reveal ? 'reveal-line' : ''}", "")
rep("{/* The body's line is its own layer, so that it can be drawn from left to right when the page opens. */}", "{/* The body's line is its own layer, over the hills. */}")
p.write_text(s, encoding='utf-8')
print('ok')
```

Expected: `ok`. If a count differs, read the lines it names, and adjust only that replacement's count to the occurrences that belong to the reveal. The placement code's own `after` (a sunset's hidden stretch lies after its mark, `place.after`) must stay.

- [ ] **Step 4: Run the tests, the types and the whole suite**

Run: `cd web && npx vitest run src/app/look.test.ts src/app/globals.test.ts src/components/SkyRow.test.tsx --maxWorkers=2 && npx tsc --noEmit`
Expected: PASS, and tsc prints nothing.

Run the whole suite as in Task 1, Step 4. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/SkyRow.tsx web/src/components/SkyRow.test.tsx web/src/app/page.tsx web/src/app/page.test.tsx web/src/app/globals.css web/src/app/globals.test.ts web/src/app/look.test.ts
git commit -m "feat(web): the home chart drawn at once: the arrival is the one motion that plays by itself"
```

The stand view's opening turn (4 s, off under reduced motion) stays. It answers the visitor's click on "Stand at the site", as spec 6 allows ("unless the visitor moves it"). Ledger this as a ruling.

---
### Task 5: Explore's period on one line on a phone

**Files:**
- Modify: `web/src/components/explore/PeriodBand.tsx`
- Test: `web/src/components/explore/PeriodBand.test.tsx`

**Interfaces:**
- Consumes: `presetOf(power): LanderPreset | null` (`web/src/lib/lander.ts`), `dateLong(startUtc, hour)` (`web/src/lib/viz/format.ts`).
- Produces: `periodLine(label: string, startUtc: string, days: number, power: PowerConfig): string`, exported from `PeriodBand.tsx`; the band's `<section>` carries `data-band-end` (Task 2's band ends under it).

- [ ] **Step 1: Write the failing tests**

Add to `web/src/components/explore/PeriodBand.test.tsx` (the file's `site` and imports stay; add `periodLine` to the import from `./PeriodBand`):

```tsx
  it('folds the four fields into one line on a phone, so the answer is on the first screen, and opens them on "change" (spec 6)', () => {
    render(<PeriodBand site={site} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    expect(screen.getByText('de Gerlache Rim 2, 30 days from 1 January 2027, small lander:')).toBeTruthy();
    const change = screen.getByRole('button', { name: 'change' });
    expect(change.getAttribute('aria-expanded')).toBe('false');
    const fields = document.getElementById(change.getAttribute('aria-controls')!)!;
    expect(fields.className).toMatch(/\bmax-sm:hidden\b/);
    // The line itself shows on a phone only; from sm up the fields are always there.
    expect(change.closest('p')!.className).toMatch(/\bsm:hidden\b/);
    fireEvent.click(change);
    expect(screen.getByRole('button', { name: 'done' }).getAttribute('aria-expanded')).toBe('true');
    expect(fields.className).not.toMatch(/\bmax-sm:hidden\b/);
    fireEvent.click(screen.getByRole('button', { name: 'done' }));
    expect(fields.className).toMatch(/\bmax-sm:hidden\b/);
  });

  it('says the new length in the folded line after a change, and a lander that is no ready-made one is a custom lander', () => {
    const { rerender } = render(<PeriodBand site={site} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={{ ...DEFAULT_POWER, loadW: 250 }} onLander={() => {}} />);
    expect(screen.getByText('de Gerlache Rim 2, 30 days from 1 January 2027, custom lander:')).toBeTruthy();
    rerender(<PeriodBand site={site} startUtc="2027-03-05T00:00:00" days={14} onWindow={() => {}} power={{ ...DEFAULT_POWER, loadW: 250 }} onLander={() => {}} />);
    expect(screen.getByText('de Gerlache Rim 2, 14 days from 5 March 2027, custom lander:')).toBeTruthy();
  });

  it('marks the band as the end of the header band, so the stars behind the header stop under it', () => {
    render(<PeriodBand site={site} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    expect(screen.getByRole('region', { name: 'What this forecast is for' }).hasAttribute('data-band-end')).toBe(true);
  });

  it('words the folded line from the preset’s size', () => {
    expect(periodLine('Shackleton rim summit', '2026-06-01T00:00:00', 90, { ...DEFAULT_POWER, areaM2: 20, loadW: 500, batteryWh: 50000 })).toBe('Shackleton rim summit, 90 days from 1 June 2026, large lander');
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/components/explore/PeriodBand.test.tsx --maxWorkers=2`
Expected: FAIL, "Unable to find an element with the text: de Gerlache Rim 2, 30 days from 1 January 2027, small lander:", and `periodLine` is not a function.

- [ ] **Step 3: Fold the band**

In `web/src/components/explore/PeriodBand.tsx`:
- Import `useId, useState` from `react` (with the existing `RefObject` type import), `presetOf` from `@/lib/lander` (beside `landerName`), and `dateLong` from `@/lib/viz/format`.
- Add above the component:

```tsx
/**
 * The band on one line, as a phone shows it (spec 6): "de Gerlache Rim 2, 30 days from 1 January 2027, small
 * lander". A ready-made lander by its size; any other is a custom lander.
 */
export function periodLine(label: string, startUtc: string, days: number, power: PowerConfig): string {
  const preset = presetOf(power);
  return `${label}, ${days} days from ${dateLong(startUtc, 0)} ${startUtc.slice(0, 4)}, ${preset ? `${preset.id} lander` : 'custom lander'}`;
}
```

- In the component, after `const lander = landerName(power);`, add `const [open, setOpen] = useState(false);` and `const fieldsId = useId();`. Then change the `return` to:

```tsx
  return (
    <section aria-label="What this forecast is for" data-band-end="" className="flex min-w-0 flex-wrap items-end gap-4">
      {/* On a phone the four fields fold into this one line, so the answer is on the first screen (spec 6). */}
      <p className="flex w-full flex-wrap items-baseline gap-x-2 text-base text-ink-2 sm:hidden">
        <span>{periodLine(label, startUtc, days, power)}:</span>
        <button type="button" aria-expanded={open} aria-controls={fieldsId} onClick={() => setOpen((o) => !o)} className="min-h-11 font-semibold text-ink underline underline-offset-4">
          {open ? 'done' : 'change'}
        </button>
      </p>
      <div id={fieldsId} className={`contents ${open ? '' : 'max-sm:hidden'}`}>
        {/* the three existing children, unchanged: the landing site, PeriodControls, the lander */}
      </div>
    </section>
  );
```

The comment line stands for the three existing children (`<div …>Landing site…</div>`, `<PeriodControls … />`, `<div …>Lander…</div>`). Move them inside the new `<div>` without changing a character, and do not keep the comment. `contents` keeps them in the section's flex row from sm up, and `max-sm:hidden` folds them away on a phone.

- [ ] **Step 4: Run them to see them pass, then Explore's suite**

Run: `cd web && npx vitest run src/components/explore src/components/ExploreView.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/explore/PeriodBand.tsx web/src/components/explore/PeriodBand.test.tsx
git commit -m "feat(web): on a phone Explore's period folds to one line with a change button, so the answer is on the first screen"
```

---

### Task 6: The home page says what Earthrise is for, why the pole is hard, and where teachers start

**Files:**
- Modify: `web/src/components/home/Arrival.tsx:175-189` (the opening paragraph and the audience line)
- Modify: `web/src/lib/viz/arrival.ts:51-56` (the beats' words)
- Modify: `web/src/app/page.tsx:82-86` (the forecast's lander)
- Modify: `web/src/components/home/WhySection.tsx` (the cause, the event words, the teacher's route moved up)
- Test: `web/src/app/page.test.tsx`, `web/src/components/home/Arrival.test.tsx`, `web/src/lib/viz/arrival.test.ts`

**Interfaces:**
- Produces: the beats' sentences (Task 7's word test reads them through `arrivalWords()`); these sentences use Task 7's vocabulary ("sets", "rises", "night").

- [ ] **Step 1: Write the failing tests**

In `web/src/app/page.test.tsx`:
- In `'says what the product does in the headline…'`, replace the audience-line and promise expectations (`getByText("For planners…")` and `toMatch(/how long a solar lander keeps power there\./)`) with:

```tsx
    // The challenge in plain words on the first screen: a browser of landing sites and dates, for more than two landers.
    expect(hero.textContent).toMatch(/Earthrise is a browser of landing sites and dates: pick a place and a day from 2024 to 2036/);
    expect(hero.textContent).toMatch(/for three ready-made landers or your own\./);
    // Who it is for, with the teachers' way in on the same line.
    const audience = within(hero).getByText(/^For planners of NASA's commercial Moon landers, teachers/);
    expect(audience.textContent).toBe("For planners of NASA's commercial Moon landers, teachers (start with How it works) and anyone curious.");
    expect(within(audience).getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('/learn');
```

- Replace the expected sentence in `'says under the forecast what the battery does there, and the better landing day'` with:

```tsx
      'An example lander, not a planned mission: 4 m² of solar panels and a 2 kWh battery. Landing on 1 January, it keeps power for 3 days 4 hours; landing on 20 January, for 12 days 15 hours.',
```

- Replace `'sends a teacher to the science behind the three facts'` with:

```tsx
  it('sends a teacher to the science at the top of the three facts, and gives the cause: the Moon’s small tilt and its month-long day', () => {
    render(<Home />);
    const why = screen.getByRole('region', { name: 'Why the south pole is hard' });
    const teach = within(why).getByText(/^Teaching this\?/);
    expect(teach.textContent).toBe('Teaching this? How it works gives the science behind these three facts, with sums a class can check.');
    // Before the three facts, not after them.
    expect(teach.compareDocumentPosition(within(why).getByText('The Sun never climbs')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(why.textContent).toMatch(/The Moon’s axis is tilted only 1\.5°, and the Moon turns once a month: a day there lasts a month/);
  });
```

(If `WhySection`'s `<section>` has no accessible name in the test environment, use `document.getElementById('why')!` instead of the role query.)

- In `'opens on a real forecast…'`, the expectation `expect(earth.querySelector('.reveal-line')).toBeTruthy()` was changed by Task 4; leave it as Task 4 left it.

In `web/src/components/home/Arrival.test.tsx`, replace `expect(screen.getByText("For planners of NASA's commercial Moon landers, educators and anyone curious.")).toBeTruthy();` with:

```tsx
    expect(screen.getByText(/^For planners of NASA's commercial Moon landers, teachers/).textContent).toBe("For planners of NASA's commercial Moon landers, teachers (start with How it works) and anyone curious.");
```

In `web/src/lib/viz/arrival.test.ts`, replace the three expected beats (lines 51 to 53) with:

```ts
      'Land a small uncrewed solar lander here on 1 January, as an example: the Sun stands just above the hills.',
      'One hill can keep the Sun set for weeks. Here is January at this spot, sped up.',
      "Earth rises on 10 January, but the lander's battery ran out on 4 January.",
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/app/page.test.tsx src/components/home/Arrival.test.tsx src/lib/viz/arrival.test.ts --maxWorkers=2`
Expected: FAIL on each changed expectation (for example "Unable to find an element with the text: /^For planners of NASA's commercial Moon landers, teachers/").

- [ ] **Step 3: Write the words**

In `web/src/components/home/Arrival.tsx`, the opening paragraph becomes:

```tsx
              At the Moon&apos;s south pole the Sun and Earth skim the horizon, and one hill can keep them set for weeks. Earthrise is a browser of landing sites and dates: pick a
              place and a day from 2024 to 2036, and see its hours of sunlight and of radio contact with Earth, and how long a lander keeps power, for three ready-made landers
              or your own.
```

and the audience line becomes:

```tsx
            <p data-words="" className="mt-3 w-fit text-base text-[#c6c5c0]">
              For planners of NASA&apos;s commercial Moon landers, teachers (start with{' '}
              <Link href="/learn" className="font-semibold text-[#f2f0ea] underline underline-offset-4">
                How it works
              </Link>
              ) and anyone curious.
            </p>
```

In `web/src/lib/viz/arrival.ts`, the three built beats become:

```ts
      `Land a small uncrewed solar lander here on ${landing}, as an example: the Sun stands just above the hills.`,
      `One hill can keep the Sun set for weeks. Here is ${month} at this spot, sped up.`,
      earthIn && out
        ? `Earth rises on ${dateLong(h.startUtc, earthIn.hour)}, but the lander's battery ran out on ${dateLong(h.startUtc, out.hour)}.`
        : 'The month runs on: when the lander has power, and when it can see Earth.',
```

In `web/src/app/page.tsx`, the sentence under the forecast becomes:

```tsx
          <p className="wrap pt-4 text-[17px] font-medium text-stage-ink">
            An example lander, not a planned mission: {battery.lander.area_m2} m² of solar panels and a {battery.lander.battery_wh / 1000} kWh battery. Landing on{' '}
            {dateLong(sky.start_utc, 0)}, it keeps power for {spanWords(battery.now_hours)}
            {battery.best_hour !== null && battery.best_hours !== null && battery.best_hours > battery.now_hours
              ? `; landing on ${dateLong(sky.start_utc, battery.best_hour)}, for ${spanWords(battery.best_hours)}.`
              : '.'}
          </p>
```

In `web/src/components/home/WhySection.tsx`:
- Move the `{teaching && (<p …>Teaching this? …</p>)}` block from the end of the section to right after the intro paragraph ("The Moon's water ice is there…"). Change its class from `mt-8 text-lg text-ink-2` to `mt-3 text-lg text-ink-2`.
- The first fact's text becomes `The Moon’s axis is tilted only 1.5°, and the Moon turns once a month: a day there lasts a month, and near the pole the Sun circles the horizon instead of rising overhead, never more than a few degrees up.` (typographic apostrophe, as the test expects).
- In the second fact, `A ridge can hide the Sun for weeks while a peak nearby stays lit.` becomes `The Sun can set behind a ridge for weeks while a peak nearby stays lit.`
- In the third fact, `When it dips behind the hills, the lander cannot talk to Earth directly.` becomes `When it sets behind the hills, the lander cannot talk to Earth directly.`

- [ ] **Step 4: Run them to see them pass, then the home suites**

Run: `cd web && npx vitest run src/app/page.test.tsx src/components/home src/lib/viz/arrival.test.ts --maxWorkers=2`
Expected: PASS. `page.test.tsx`'s rule against instrument and programme names in the main copy still passes, as the new words name none.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/home/Arrival.tsx web/src/lib/viz/arrival.ts web/src/app/page.tsx web/src/components/home/WhySection.tsx web/src/app/page.test.tsx web/src/components/home/Arrival.test.tsx web/src/lib/viz/arrival.test.ts
git commit -m "feat(web): the home page says it is a browser of landing sites and dates, gives the pole's cause, and sends teachers to How it works first"
```

---

### Task 7: One name for each event

The vocabulary, used in every sentence, flag and label about the Sun, Earth and the dark stretch (13.3; 14.3, teacher, read 7: "one event with four names: sets, hides, behind the hills, 1.4° up"):

| Event or stretch | Its one name | Not |
|---|---|---|
| The Sun leaves the sky at the site | **sunset**, "the Sun sets" (+ "behind the hills" or "below the horizon" for the reason) | hides, goes behind the hills, sinks (alone), "Sun behind hills" |
| The Sun returns | **sunrise**, "the Sun rises" | comes back, is back, "Sun back" |
| A hidden Sun or Earth still above level | "Sun 1.4° up, set behind the hills" | "behind the hills" alone, hidden |
| The stretch without the Sun | **night** | in the dark, in shadow |
| Earth returns / leaves | "Earth rises" / "Earth sets" | comes into view, "Earth in view" (as a flag) |
| The power | "the battery runs out", "power comes back" | (unchanged) |

"Earth in view" stays where it names a state (a lander with Earth in view can radio home), and "in shadow" stays for ground in shadow on the shadow map, which is a place, not a stretch of time.

**Files:**
- Create: `web/src/lib/viz/words.test.ts`
- Modify: `web/src/lib/viz/stand.ts` (skyLabel, watchNext, LABELS, keyMoments' labels, momentCaption, poleLine, whyLines, statusLine, offWords)
- Modify: `web/src/components/stand/StandView.tsx:35-48` (pathMarks)
- Modify: `web/src/components/stand/StandCanvas.tsx:98-100` (pointerWords)
- Modify: `web/src/lib/viz/answer.ts:114-120`
- Modify: `web/src/components/explore/NumbersCard.tsx:70,72`
- Modify: `web/src/components/explore/TimeBar.tsx:425` (the key "in shadow")
- Modify: `web/src/components/home/ArrivalCanvas.tsx:132-142` (lightWords, TICK_KEY)
- Test: every test whose expected words change (`stand.test.ts`, `StandView.test.tsx`, `StandCanvas.test.ts`, `answer.test.ts`, `VerdictPanel.test.tsx`, `NumbersCard.test.tsx`, `TimeBar.test.tsx`, `ArrivalCanvas.test.tsx`)

**Interfaces:**
- Consumes: the beats from Task 6 (already in this vocabulary).
- Produces: the flags' labels `'Sunset' | 'Sunset and power off' | 'Sunrise' | 'Battery runs out' | 'Power back' | 'Earth rises'` (Task 8 adds `'Earth sets'`); `skyLabel` for a hidden body: `"Sun 1.4° up, set behind the hills"`; `pointerWords` → `"Sun 1.4° up, set"`; `lightWords` → `'in sunlight' | 'night, lit only by Earthlight (picture brightened)' | 'night (picture brightened)'`.

- [ ] **Step 1: Write the failing test**

`web/src/lib/viz/words.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { lightWords } from '@/components/home/ArrivalCanvas';
import { pathMarks } from '@/components/stand/StandView';
import { pointerWords } from '@/components/stand/StandCanvas';
import { summarize } from '@/lib/engine/metrics';
import { DEFAULT_POWER } from '@/lib/engine/power';
import { HOME } from '@/lib/data/home';
import { answerFor } from './answer';
import { arrivalWords, hero } from './arrival';
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
    const kinds: MomentKind[] = ['sunset', 'sun-back', 'battery-out', 'power-back', 'earth-in', 'sunset-power-off', 'sun-power-back'];
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

  it('words the arrival and the forecast’s answer the same way', () => {
    for (const beat of arrivalWords().beats) check('beat', beat);
    const b = HOME.battery, best = b.best_hour !== null && b.best_hours !== null ? { hour: b.best_hour, poweredHours: b.best_hours, earthFraction: b.best_earth_fraction ?? 0 } : null;
    const answer = answerFor({ siteName: 'de Gerlache Rim 2', series: s, summary: summarize(s), power: p, startUtc: start, days: h.days, loadW: DEFAULT_POWER.loadW, batteryWh: DEFAULT_POWER.batteryWh, best });
    for (const line of [answer.title, ...answer.sentences]) check('answer', line);
  });
});
```

(Read `answerFor`'s return type in `answer.ts` before running. If its lines are not `title` and `sentences`, use the fields it has; spell the change in the ledger.)

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run src/lib/viz/words.test.ts --maxWorkers=2`
Expected: FAIL. The first failures are the flags ("Sun back", "Earth in view", "Sun behind the hills") and captions such as `"A hill hides the Sun…"` (say "sets").

- [ ] **Step 3: Change the words**

Run from `web/` (each replacement must be found exactly as many times as given; the script stops otherwise):

```python
from pathlib import Path
def edit(f, pairs):
    p = Path(f); s = p.read_text(encoding='utf-8')
    for a, b, *n in pairs:
        k = n[0] if n else 1
        assert s.count(a) == k, (f, a[:60], s.count(a))
        s = s.replace(a, b)
    p.write_text(s, encoding='utf-8')
edit('src/lib/viz/stand.ts', [
  ("return el >= 0.05 ? `${name} ${degrees(el)} up, behind the hills` : `${name}, on the horizon, behind the hills`;",
   "return el >= 0.05 ? `${name} ${degrees(el)} up, set behind the hills` : `${name}, on the horizon, set behind the hills`;"),
  ("what: lit(h) ? 'the Sun comes back' : s.sunEl[h] < 0 ? 'the Sun sets below the horizon' : 'the Sun goes behind the hills' }",
   "what: lit(h) ? 'the Sun rises' : s.sunEl[h] < 0 ? 'the Sun sets below the horizon' : 'the Sun sets behind the hills' }"),
  ("  'sun-back': 'Sun back',\n", "  'sun-back': 'Sunrise',\n"),
  ("  'earth-in': 'Earth in view',\n", "  'earth-in': 'Earth rises',\n"),
  ("  'sun-power-back': 'Sun back',\n", "  'sun-power-back': 'Sunrise',\n"),
  ("  const label = (kind: MomentKind, h: number): string => {\n    // A Sun at or above the level horizon has not set: the hills hide it.\n    const up = s.sunEl[h] >= 0;\n    if (kind === 'sunset') return up ? 'Sun behind the hills' : 'Sunset';\n    if (kind === 'sunset-power-off') return up ? 'Sun behind the hills, power off' : 'Sunset and power off';\n    return LABELS[kind];\n  };",
   "  // One name for the Sun leaving the sky, whether it sets below the horizon or behind the hills (part C).\n  const label = (kind: MomentKind): string => (kind === 'sunset' ? 'Sunset' : kind === 'sunset-power-off' ? 'Sunset and power off' : LABELS[kind]);"),
  ("({ kind, label: label(kind, hour), hour, day: dayMonth(startUtc, hour) })", "({ kind, label: label(kind), hour, day: dayMonth(startUtc, hour) })"),
  ("only the Moon's slight rocking lifts it over the horizon or hides it.", "only the Moon's slight rocking makes it rise or set."),
  ("const NO_TWILIGHT = 'With no air there is no twilight: once the Sun is hidden, it is dark.';", "const NO_TWILIGHT = 'With no air there is no twilight: once the Sun has set, it is night.';"),
  ("so a low hill can hide it for days.`;", "so behind a low hill it can stay set for days.`;"),
  ("      return `${up ? (pole ? 'A hill hides the Sun: this close to the pole it never climbs more than a few degrees.' : 'The Sun has not set: a hill hides it.') : pole ? 'The Sun sinks below the horizon: this close to the pole it never climbs high.' : 'The Sun sinks below the horizon.'} ${NO_TWILIGHT_SHORT}`;",
   "      return `${up ? (pole ? 'Sunset behind the hills: near the pole the Sun never climbs more than a few degrees.' : 'Sunset behind the hills: the Sun is still above the horizon.') : pole ? 'Sunset: the Sun sinks below the horizon; near the pole it never climbs high.' : 'Sunset: the Sun sinks below the horizon.'} ${NO_TWILIGHT_SHORT}`;"),
  ("      return `${up ? 'A hill hides the Sun' : 'The Sun sinks below the horizon'}, and the lander's power goes with it. ${NO_TWILIGHT_SHORT}`;",
   "      return `${up ? 'Sunset behind the hills' : 'Sunset below the horizon'}, and the lander's power goes with it. ${NO_TWILIGHT_SHORT}`;"),
  ("'The battery runs out in the dark. Only Earthlight lights the ground here, brightened like a long exposure.'",
   "'The battery runs out at night. Only Earthlight lights the ground here, brightened like a long exposure.'"),
  ("'The battery runs out in the dark. With no Sun or Earth in sight, the view is brightened like a long exposure.'",
   "'The battery runs out at night. With no Sun or Earth in sight, the view is brightened like a long exposure.'"),
  ("      return `The Sun is back over the hills.${earth ? ' With Earth in view, a working lander could radio home.' : ''}`;",
   "      return `Sunrise over the hills.${earth ? ' With Earth in view, a working lander could radio home.' : ''}`;"),
  ("      return `The Sun is back, and with it the power, if the lander survived the cold.${earth ? ' Earth is in view: it could radio home.' : ''}`;",
   "      return `Sunrise, and with it the power, if the lander survived the cold.${earth ? ' Earth is in view: it could radio home.' : ''}`;"),
  ("    if (el >= 0) lines.push('The Sun is still up, hidden behind the hills: higher ground farther off still catches its light.');",
   "    if (el >= 0) lines.push('The Sun has set behind the hills but is still above the horizon: higher ground farther off still catches its light.');"),
  ("but Earth is ${s.earthEl[hour] < 0 ? 'below the horizon' : 'behind the hills'}, so it cannot radio home.",
   "but Earth has set ${s.earthEl[hour] < 0 ? 'below the horizon' : 'behind the hills'}, so it cannot radio home."),
  ("return s.sunFraction[from] === 0 ? `${off} in the dark, colder than −170 °C` : off;",
   "return s.sunFraction[from] === 0 ? `${off} at night, colder than −170 °C` : off;"),
])
edit('src/components/stand/StandView.tsx', [
  ("    if (m.kind === 'earth-in') return [{ hour: m.hour, body: 'earth', text: `Earth in view, ${m.day}` }];\n    if (m.kind === 'sun-back' || m.kind === 'sun-power-back') return [{ hour: m.hour, body: 'sun', text: `Sun back, ${m.day}` }];\n    if (m.kind === 'sunset' || m.kind === 'sunset-power-off') return [{ hour: m.hour, body: 'sun', text: `${m.label.startsWith('Sunset') ? 'Sunset' : 'Sun behind hills'}, ${m.day}` }];",
   "    if (m.kind === 'earth-in') return [{ hour: m.hour, body: 'earth', text: `Earth rises, ${m.day}` }];\n    if (m.kind === 'sun-back' || m.kind === 'sun-power-back') return [{ hour: m.hour, body: 'sun', text: `Sunrise, ${m.day}` }];\n    if (m.kind === 'sunset' || m.kind === 'sunset-power-off') return [{ hour: m.hour, body: 'sun', text: `Sunset, ${m.day}` }];"),
])
edit('src/components/stand/StandCanvas.tsx', [
  ("  return label.replace(', behind the hills', ', hidden');", "  return label.replace(', set behind the hills', ', set');"),
])
edit('src/lib/viz/answer.ts', [
  ("        ? `The period starts in the dark: the Sun stays ${where} until ${dateLong(startUtc, sunrise)}.`",
   "        ? `The period starts at night: the Sun is set ${where} until it rises on ${dateLong(startUtc, sunrise)}.`"),
  ("          ? `The Sun sets on ${dateLong(startUtc, sunset)} and stays ${where} for the rest of the period.`",
   "          ? `The Sun sets ${where} on ${dateLong(startUtc, sunset)}, and the night lasts the rest of the period.`"),
  ("          : `The Sun sets on ${dateLong(startUtc, sunset)} and stays ${where} for ${spanWords(sunrise - sunset)}.`;",
   "          : `The Sun sets ${where} on ${dateLong(startUtc, sunset)}, and the night lasts ${spanWords(sunrise - sunset)}.`;"),
])
edit('src/components/explore/NumbersCard.tsx', [
  ("'the longest stretch with the Sun behind the hills'", "'the longest stretch with the Sun set'"),
  ("'the longest stretch with Earth behind the hills'", "'the longest stretch with Earth set'"),
])
edit('src/components/explore/TimeBar.tsx', [
  ("                    in shadow\n", "                    night\n"),
])
edit('src/components/home/ArrivalCanvas.tsx', [
  ("  return series.earthVisible[hour] === 1 ? 'lit only by Earthlight (picture brightened)' : 'in the dark (picture brightened)';",
   "  return series.earthVisible[hour] === 1 ? 'night, lit only by Earthlight (picture brightened)' : 'night (picture brightened)';"),
  ("  ['#f6b646', 'The Sun hides or comes back'],", "  ['#f6b646', 'Sunset or sunrise'],"),
  ("  ['#74adff', 'Earth comes into view'],", "  ['#74adff', 'Earth rises'],"),
])
print('ok')
```

Expected: `ok`. Then run the word test. For each failure it names, change that sentence in its source to the vocabulary (as above, keeping the meaning), and keep every caption within its existing 112-character test. Update the doc comments that quote the old words (`keyMoments`, `momentCaption`, `pathMarks`, `watchNext`, `pointerWords`), so a comment never says what the code no longer does.

- [ ] **Step 4: Run the word test to see it pass, then bring the other tests to the new words**

Run: `cd web && npx vitest run src/lib/viz/words.test.ts --maxWorkers=2`
Expected: PASS.

Run: `cd web && npx vitest run --maxWorkers=2 > ../.superpowers/sdd/2026-10-05-immersive-c-space-look/task-7-full.log 2>&1; grep -E "FAIL|×" ../.superpowers/sdd/2026-10-05-immersive-c-space-look/task-7-full.log | head -40`
Expected: failures only where a test expects the old words, for example `'Sun back, 20 Jan'`, `'The Sun sets on 3 January and stays behind the hills for 16 days 15 hours.'` or `'in shadow'`. Change each expectation to the new words only, never a test's logic. Then run the whole suite again. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/viz web/src/components/stand web/src/components/explore web/src/components/home/ArrivalCanvas.tsx web/src/components/home/ArrivalCanvas.test.tsx
git commit -m "feat(web): one name for each event across the chart, the story, the flags and the labels: sunset, sunrise, night, Earth rises"
```

---

### Task 8: The date bar in lanes, and Earth setting

**Files:**
- Modify: `web/src/lib/viz/stand.ts` (`MomentKind`, `LABELS`, `keyMoments`, `momentCaption`)
- Modify: `web/src/components/stand/StandView.tsx` (`pathMarks`)
- Modify: `web/src/components/home/ArrivalCanvas.tsx` (the date bar's ticks, key and spacing)
- Test: `web/src/lib/viz/stand.test.ts`, `web/src/components/home/ArrivalCanvas.test.tsx`, `web/src/lib/viz/words.test.ts`

**Interfaces:**
- Consumes: Task 7's vocabulary.
- Produces: `MomentKind` gains `'earth-out'` (label `'Earth sets'`); `laneOf(kind: MomentKind): 'sun' | 'power' | 'earth'`, exported from `ArrivalCanvas.tsx`. Each tick carries `data-lane`. The key reads `'Sunset or sunrise'`, `'The battery runs out'`, `'Earth rises or sets'` at 15 px.

- [ ] **Step 1: Write the failing tests**

In `web/src/lib/viz/stand.test.ts`, add (beside the other `keyMoments` tests; import `hero` from `./arrival` if the file does not have the hero month already):

```ts
  it('marks Earth setting too, the first time Earth leaves the view after the landing: the hero month’s 23 January', () => {
    const h = hero();
    const out = keyMoments(h.series, h.power, h.startUtc).find((m) => m.kind === 'earth-out');
    expect(out).toEqual({ kind: 'earth-out', label: 'Earth sets', hour: 543, day: '23 Jan' });
    expect(momentCaption('earth-out', h.series, 543, h.site.lat)).toMatch(/^Earth sets (behind the hills|below the horizon): the Moon's slight rocking lowers it\. No radio until it rises again\.$/);
    expect(momentCaption('earth-out', h.series, 543, h.site.lat).length).toBeLessThanOrEqual(112);
  });
```

In `web/src/components/home/ArrivalCanvas.test.tsx`, add (with the file's existing render helpers for a landed frame; follow the test `'says where the Sun and Earth stand at the hour shown…'` for how it renders and waits for the bar):

```tsx
  it('marks the month’s moments in lanes, the Sun’s over the line, the battery’s across it, Earth’s under it, with Earth setting marked too', async () => {
    // Render landed (progress 4.5) as the date bar's other tests do, then:
    const bar = await waitFor(() => {
      const b = document.querySelector('[data-date-bar]') as HTMLElement;
      expect(b.hidden).toBe(false);
      return b;
    });
    const lanes = [...bar.querySelectorAll('[data-tick]')].map((t) => t.getAttribute('data-lane'));
    // Sunset 3 Jan, the battery 4 Jan, Earth rises 10 Jan, sunrise and power 20 Jan, Earth sets 23 Jan.
    expect(lanes).toEqual(['sun', 'power', 'earth', 'sun', 'earth']);
    const sun = bar.querySelector('[data-lane="sun"]')!.className, power = bar.querySelector('[data-lane="power"]')!.className;
    expect(sun).not.toBe(power);
    expect(bar.textContent).toContain('Sunset or sunrise');
    expect(bar.textContent).toContain('The battery runs out');
    expect(bar.textContent).toContain('Earth rises or sets');
    expect(bar.querySelector('p:last-of-type')!.className).toMatch(/\btext-\[15px\]/);
  });

  it('puts each kind of moment in its lane', () => {
    expect(laneOf('sunset')).toBe('sun');
    expect(laneOf('sunset-power-off')).toBe('sun');
    expect(laneOf('sun-power-back')).toBe('sun');
    expect(laneOf('battery-out')).toBe('power');
    expect(laneOf('power-back')).toBe('power');
    expect(laneOf('earth-in')).toBe('earth');
    expect(laneOf('earth-out')).toBe('earth');
  });
```

(Add `laneOf` to the file's import from `./ArrivalCanvas`. The moments' order follows the hero month; if `keyMoments` joins the 20 January sunrise with the power, as `'sun-power-back'`, the lanes above hold. If not, the fourth entry is `'sun'` and a `'power'` follows it: write the order the hero month gives, and ledger it.)

In `web/src/lib/viz/words.test.ts`, add `'earth-out'` to the list `kinds`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/lib/viz/stand.test.ts src/components/home/ArrivalCanvas.test.tsx src/lib/viz/words.test.ts --maxWorkers=2`
Expected: FAIL: `expected undefined to deeply equal { kind: 'earth-out', … }`, `laneOf is not a function`, and the TypeScript error on `'earth-out'` (it is not a `MomentKind` yet).

- [ ] **Step 3: Add the moment and the lanes**

In `web/src/lib/viz/stand.ts`:
- `export type MomentKind = 'sunset' | 'sun-back' | 'battery-out' | 'power-back' | 'earth-in' | 'earth-out' | 'sunset-power-off' | 'sun-power-back';`
- In `LABELS`, add `'earth-out': 'Earth sets',`.
- In `keyMoments`'s loop, after the `'earth-in'` line, add `if (s.earthVisible[h - 1] === 1 && s.earthVisible[h] === 0) mark('earth-out', h);`.
- In `momentCaption`, after the `'earth-in'` case, add:

```ts
    case 'earth-out':
      return `Earth sets ${s.earthEl[hour] < 0 ? 'below the horizon' : 'behind the hills'}: the Moon's slight rocking lowers it. No radio until it rises again.`;
```

- Update the comments on `MomentKind` and `keyMoments` to name "earth-out", Earth leaving the view ("Earth sets").

In `web/src/components/stand/StandView.tsx`'s `pathMarks`, add as its first line inside the `flatMap`:

```ts
    if (m.kind === 'earth-out') return [{ hour: m.hour, body: 'earth', text: `Earth sets, ${m.day}` }];
```

In `web/src/components/home/ArrivalCanvas.tsx`:
- Import `type MomentKind` from `@/lib/viz/stand`.
- Replace `TICK_KEY` and `tickColour` with:

```tsx
/** The date bar's key: what each colour of mark stands for, in the order of its lanes. */
const TICK_KEY = [
  ['#f6b646', 'Sunset or sunrise'],
  ['#e5e3dc', 'The battery runs out'],
  ['#74adff', 'Earth rises or sets'],
] as const;
/** The lane of a moment's mark on the date bar: the Sun's over the line, Earth's under it, the battery's across it. */
export function laneOf(kind: MomentKind): 'sun' | 'power' | 'earth' {
  return kind.startsWith('earth') ? 'earth' : kind.startsWith('sun') ? 'sun' : 'power';
}
const LANE_COLOUR = { sun: '#f6b646', power: '#e5e3dc', earth: '#74adff' } as const;
/** Where a lane's mark sits against the 3 px line: two marks a few hours apart in two lanes never cover each other. */
const LANE_PLACE = { sun: 'bottom-[calc(50%+3px)] h-2', power: 'top-1/2 h-3 -translate-y-1/2', earth: 'top-[calc(50%+3px)] h-2' } as const;
```

- In the bar's JSX, the track's wrapper `className="relative mx-1.5 mt-2.5 h-[3px] rounded-full bg-white/25"` becomes `className="relative mx-1.5 mt-3.5 h-[3px] rounded-full bg-white/25"`. Each tick becomes:

```tsx
            {moments.map((m) => (
              <i key={m.kind} data-tick="" data-lane={laneOf(m.kind)} className={`absolute w-[3px] -translate-x-1/2 rounded-full ${LANE_PLACE[laneOf(m.kind)]}`} style={{ left: `${(m.hour / (h.series.hours - 1)) * 100}%`, background: LANE_COLOUR[laneOf(m.kind)] }} />
            ))}
```

- The key's `<p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[14px] text-[#c6c5c0]">` becomes `<p className="mt-3.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[15px] text-[#c6c5c0]">`. The key is no smaller than the labels (teacher, read 7: "the key smallest").

- [ ] **Step 4: Run them to see them pass, then the whole suite**

Run: `cd web && npx vitest run src/lib/viz src/components/home src/components/stand --maxWorkers=2`
Expected: PASS. A stand view test that counted the flags or the path marks of a month in which Earth sets now finds one more ("Earth sets, …"). Add it to that test's expected list, and ledger it.

Run the whole suite as in Task 1, Step 4. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/viz/stand.ts web/src/lib/viz/stand.test.ts web/src/lib/viz/words.test.ts web/src/components/stand/StandView.tsx web/src/components/stand/StandView.test.tsx web/src/components/home/ArrivalCanvas.tsx web/src/components/home/ArrivalCanvas.test.tsx
git commit -m "feat(web): Earth setting is a key moment, and the date bar marks the Sun, the battery and Earth in lanes of their own"
```

---

### Task 9: The arrival's last screen on a phone, labels joined to their marks, Earth's loop explained

**Files:**
- Modify: `web/src/components/home/Arrival.tsx` (the last beat's wrapper)
- Modify: `web/src/components/home/ArrivalCanvas.tsx` (stems; Earth's path name)
- Modify: `web/src/lib/viz/stand.ts` (`EARTH_LOOP`)
- Modify: `web/src/components/stand/StandCanvas.tsx` (`pathNameText`, the path names' class)
- Test: `web/src/components/home/Arrival.test.tsx`, `web/src/components/home/ArrivalCanvas.test.tsx`, `web/src/components/stand/StandCanvas.test.ts`

**Interfaces:**
- Produces: `EARTH_LOOP = 'a loop: the Moon rocks a little each month'` (stand.ts); `pathNameText(body: 'sun' | 'earth', text: string): string` (StandCanvas.tsx).

- [ ] **Step 1: Write the failing tests**

In `web/src/components/home/Arrival.test.tsx`:

```tsx
  it('starts the answer’s card under the date bar where the two would meet, so the date and the sky stay in view (teacher, read 6)', () => {
    render(<Arrival words={words} Stage={Stage} />);
    const last = document.querySelector(`[data-beat="${BEAT_STOPS.length - 1}"]`)!;
    expect(last.className).toMatch(/\bpt-\[168px\]/);
    expect(last.className).toMatch(/\bmin-\[1400px\]:pt-6\b/);
  });
```

(Use the file's existing names for the words, the stage stub and `BEAT_STOPS`.)

In `web/src/components/home/ArrivalCanvas.test.tsx`:

```tsx
  it('joins each label to its mark with a short line, and names Earth’s loop where its path first shows', () => {
    // Render the stage as the file's other tests do (any progress), then read the markup.
    for (const dot of document.querySelectorAll('i[class*="top-[130%]"]')) expect(dot.nextElementSibling?.getAttribute('data-stem')).toBe('');
    const names = [...document.querySelectorAll('[data-path-name]')];
    expect(names).toHaveLength(2);
    for (const n of names) expect(n.querySelector('[data-stem]')).toBeTruthy();
    expect(names[1].textContent).toContain(EARTH_LOOP);
  });
```

(Import `EARTH_LOOP` from `@/lib/viz/stand`.)

In `web/src/components/stand/StandCanvas.test.ts`:

```ts
  it('names Earth’s path with why it loops, on a second line, and the Sun’s path as it is', () => {
    expect(pathNameText('earth', "Earth's path this month")).toBe(`Earth's path this month\n${EARTH_LOOP}`);
    expect(pathNameText('sun', "Sun's path this month")).toBe("Sun's path this month");
  });
```

(Import `pathNameText` from `./StandCanvas` and `EARTH_LOOP` from `@/lib/viz/stand`.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/components/home/Arrival.test.tsx src/components/home/ArrivalCanvas.test.tsx src/components/stand/StandCanvas.test.ts --maxWorkers=2`
Expected: FAIL, the class, the missing stems, `EARTH_LOOP` and `pathNameText` undefined.

- [ ] **Step 3: Write it**

In `web/src/lib/viz/stand.ts`, add next to `skyLabel`:

```ts
/** Why Earth's path makes a loop, on the path's name where it first shows (teacher, read 7). */
export const EARTH_LOOP = 'a loop: the Moon rocks a little each month';
```

In `web/src/components/home/Arrival.tsx`, the last beat's wrapper becomes:

```tsx
        {/* Under the date bar (16 px from the top, about 140 px tall) wherever the two would meet, as on a phone; from
            1400 px wide the bar stands clear of the card's column, and the card starts at the top. */}
        <div data-beat={BEATS - 1} className="flex h-[100svh] items-start pt-[168px] min-[1400px]:pt-6">
```

In `web/src/components/home/ArrivalCanvas.tsx`:
- Add the stem classes after `SIDE_DOT`:

```tsx
/** The line from a label to its dot below it: the 30 % of the label's height between them. */
const STEM = 'absolute left-1/2 top-full h-[30%] w-px -translate-x-1/2 bg-current opacity-60';
/** The line from a path's name down to its path, 8 px. */
const STEM_DOWN = 'absolute left-1/2 top-full h-2 w-px -translate-x-1/2 bg-current opacity-60';
/** The line from a label beside its point to the dot, either side; above or below the point the dot is close enough alone. */
const SIDE_STEM = 'absolute right-full top-1/2 h-px w-[9px] -translate-y-1/2 bg-current opacity-60 group-data-[side=left]:left-full group-data-[side=left]:right-auto group-data-[side=below]:hidden group-data-[side=up]:hidden';
```

- After each `<i aria-hidden="true" className={`${DOT} left-1/2 top-[130%]`} />` (three places), add `<i aria-hidden="true" data-stem="" className={STEM} />`. After `<i aria-hidden="true" className={SIDE_DOT} />`, add `<i aria-hidden="true" data-stem="" className={SIDE_STEM} />`.
- The two path names become:

```tsx
        <span ref={(n) => { pathNameRefs.current.sun = n; }} hidden data-path-name="" className={`${CHIP} -translate-x-1/2 -translate-y-[calc(100%+8px)] text-[#f6d48a]`}>
          Sun&apos;s path this month
          <i aria-hidden="true" data-stem="" className={STEM_DOWN} />
        </span>
        <span ref={(n) => { pathNameRefs.current.earth = n; }} hidden data-path-name="" className={`${CHIP} -translate-x-1/2 -translate-y-[calc(100%+8px)] text-[#a9c8ff]`}>
          Earth&apos;s path this month
          <span className="block text-[14px] text-[#c6c5c0]">{EARTH_LOOP}</span>
          <i aria-hidden="true" data-stem="" className={STEM_DOWN} />
        </span>
```

(Import `EARTH_LOOP` with `skyLabel` from `@/lib/viz/stand`.)

In `web/src/components/stand/StandCanvas.tsx`:
- Add:

```tsx
/** A path's name as the view shows it: Earth's with why it loops, on a second line (teacher, read 7). */
export function pathNameText(body: 'sun' | 'earth', text: string): string {
  return body === 'earth' ? `${text}\n${EARTH_LOOP}` : text;
}
```

- In the label pass, `if (node && n && node.textContent !== n.text) node.textContent = n.text;` becomes:

```tsx
        const text = n ? pathNameText(k, n.text) : '';
        if (node && n && node.textContent !== text) node.textContent = text;
```

- The path names' class `${LABEL} -translate-x-1/2 translate-y-1/4 ${colour}` becomes `${LABEL.replace('whitespace-nowrap', 'whitespace-pre')} -translate-x-1/2 translate-y-1/4 ${colour}`, so the second line keeps its break.

- [ ] **Step 4: Run them to see them pass, then the whole suite**

Run: `cd web && npx vitest run src/components/home src/components/stand --maxWorkers=2`
Expected: PASS.

Run the whole suite as in Task 1, Step 4. Expected: all pass.

- [ ] **Step 5: Look at it**

On the production build, screenshot the arrival at progress 4.5 and 5 (`?arrival=4.5&bare=1`, `?arrival=5`) at 1440 × 900 and 390 × 844, and at 1280 × 800. Check: on the phone and at 1280 px, the date bar shows above the answer's card at progress 5; the stems touch both the label and its dot; Earth's path name has two lines.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/home/Arrival.tsx web/src/components/home/Arrival.test.tsx web/src/components/home/ArrivalCanvas.tsx web/src/components/home/ArrivalCanvas.test.tsx web/src/lib/viz/stand.ts web/src/components/stand/StandCanvas.tsx web/src/components/stand/StandCanvas.test.ts
git commit -m "feat(web): labels joined to their marks, Earth's loop explained on its path, and the last card under the date bar"
```

---
### Task 10: The stand view on a phone

From 13.3 (both readers, part A read 12): on a phone, the lander's line and the better day are shown without "More", Earth's angle is back on its pointer, the key's colours are named without "Key", and button words stay on one line. Read 11 asked for the opposite on the first two, so the card still folds the rest.

**Files:**
- Modify: `web/src/components/stand/StandView.tsx` (the card's folded rows, `LOOK`, the card's two links)
- Modify: `web/src/components/stand/StandCanvas.tsx` (the phone's pointer words)
- Modify: `web/src/components/explore/TimeBar.tsx` (no Key button)
- Test: `web/src/components/stand/StandView.test.tsx`, `web/src/components/stand/StandCanvas.test.ts`, `web/src/components/explore/TimeBar.test.tsx`

**Interfaces:**
- Produces: `pointerShort(label: string): string`, exported from `StandCanvas.tsx`.

- [ ] **Step 1: Write the failing tests**

In `web/src/components/stand/StandCanvas.test.ts`:

```ts
  it('keeps Earth’s angle on its pointer on a phone, short: the body and how high it stands', () => {
    expect(pointerShort('Earth 4.4° up')).toBe('Earth 4.4° up');
    expect(pointerShort('Earth 4.4° up, set behind the hills')).toBe('Earth 4.4° up');
    expect(pointerShort('Earth, 1.2° below the horizon')).toBe('Earth 1.2° below');
    expect(pointerShort('Earth, on the horizon, set behind the hills')).toBe('Earth on the horizon');
    expect(pointerShort('Earth, just below the horizon')).toBe('Earth just below');
  });
```

In `web/src/components/stand/StandView.test.tsx`, add a test that renders the view as the file's card tests do (with a better day available, for example the hero month from 1 January), then:

```tsx
    // Folded on a phone: the headline, the lander's line and the better day; the rest waits behind "More".
    const card = screen.getByRole('region', { name: 'The answer for this site' });
    const landerLine = card.querySelector('[data-tone]')!.closest('p')!;
    expect(landerLine.className).not.toMatch(/max-md:hidden/);
    const better = within(card).getByRole('link', { name: /instead/ });
    expect(better.closest('div')!.className).not.toMatch(/max-md:hidden/);
    for (const name of ['Why this happens', 'Back to the forecast']) {
      const el = within(card).getByRole(name === 'Why this happens' ? 'button' : 'link', { name: new RegExp(name) });
      expect(el.className, name).toMatch(/\bwhitespace-nowrap\b/);
    }
```

(Match the better day's link name to the label the card shows: read `betterLabel` in `stand.ts`. If it does not contain "instead", query by its first words.)

In `web/src/components/explore/TimeBar.test.tsx`, replace the three tests about the Key button (`'on a phone when compact, puts the key behind a Key button…'`, `'opens the key on a phone with the Key button…'`, `'on a phone when compact, keeps to the same rule behind the Key button…'`) with one. It renders as the first of them did, and checks:

```tsx
    expect(screen.queryByRole('button', { name: 'Key' })).toBeNull();
    const keys = container.querySelector('[data-part="key-no-sun"], [data-part="key-off"], [data-part="key-earth"]')!.parentElement!;
    // Named on a phone too, under the date, at 14 px with shorter swatches (13.3: no Key button).
    expect(keys.className).not.toMatch(/max-sm:hidden/);
    expect(keys.className).toMatch(/max-sm:\[&>span\]:text-\[14px\]/);
```

In the test whose comment says "after the Key button that stands for them on a phone" (around line 713), change the expected previous sibling to the date's own words (`screen.getByTestId('when')`, or its wrapper with the clock note), as the bar now has no button there.

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run src/components/stand src/components/explore/TimeBar.test.tsx --maxWorkers=2`
Expected: FAIL: `pointerShort` is not a function, the card's rows carry `max-md:hidden`, and a Key button is found.

- [ ] **Step 3: Change the card, the pointer and the time bar**

In `web/src/components/stand/StandView.tsx`:
- The lander's line `<p className={`flex items-baseline gap-2 text-[15px] md:text-base ${cardOpen ? '' : 'max-md:hidden'}`}>` becomes `<p className="flex items-baseline gap-2 text-[15px] md:text-base">`.
- The better day's row `<div className={cardOpen ? '' : 'max-md:hidden'}>` becomes `<div>`.
- Add `whitespace-nowrap` to `LOOK`, to the "Why this happens" button's class (`flex min-h-10 items-center gap-1.5 whitespace-nowrap text-[15px] underline underline-offset-4`) and to the "Back to the forecast" link's class.
- Change the card's comment ("On a phone the card folds to the headline until "More"…") to "On a phone the card folds to the headline, the lander's line and the better day until "More"."

In `web/src/components/stand/StandCanvas.tsx`, add next to `pointerWords`:

```tsx
/** A pointer's words on a phone: the body and how high it stands, short ("Earth 4.4° up", "Earth 1.2° below"). */
export function pointerShort(label: string): string {
  return label.replace(/, set behind the hills$/, '').replace(/^(\w+), /, '$1 ').replace(/ below the horizon$/, ' below');
}
```

and the phone's words on the pointer, `<span className="md:hidden">{name}</span>`, become `<span className="md:hidden">{k === 'earth' ? pointerShort(earthLabel) : name}</span>`. Update the comment above it: "On a phone the Sun's name alone, and Earth's with its angle (13.3), so the pointer stays short."

In `web/src/components/explore/TimeBar.tsx`, run from `web/`:

```python
from pathlib import Path
p = Path('src/components/explore/TimeBar.tsx'); s = p.read_text(encoding='utf-8')
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)
rep("import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';", "import { useEffect, useRef, useState, type CSSProperties } from 'react';")
rep("  // On a phone when compact, the keys stay shut until the Key button opens them.\n  const [keyOpen, setKeyOpen] = useState(false);\n  const keysId = useId();\n", "")
rep("  // The keys beyond the Sun's; on a phone when compact they wait behind a Key button.\n  const keys = !bare && (sunless || off.length > 0 || earth.length > 0);\n  const keyed = compact && keys;\n",
    "  // The keys beyond the Sun's: named on a phone too, compact at 14 px with shorter swatches (13.3: no Key button).\n  const keys = !bare && (sunless || off.length > 0 || earth.length > 0);\n")
rep("  // With the Key button beside it on a phone, the date takes the room the button leaves rather than send it to a\n  // line of its own, which would make the bar taller; short of room, it breaks after its comma, never inside the\n  // date or the hour. The class names that change with it are written out whole: Tailwind finds no class written\n  // right before a `${`, so `a b${c}` would leave `b` without its rule.\n  const comma = keyed ? whenText.indexOf(', ') : -1;\n", "")
rep("className={keyed && !noted ? 'text-[17px] font-semibold max-sm:min-w-0 max-sm:flex-1' : 'text-[17px] font-semibold'}", 'className="text-[17px] font-semibold"')
rep("      {comma < 0 ? (\n        whenText\n      ) : (\n        <>\n          <span className=\"whitespace-nowrap\">{whenText.slice(0, comma + 1)}</span> <span className=\"whitespace-nowrap\">{whenText.slice(comma + 2)}</span>\n        </>\n      )}\n", "      {whenText}\n")
rep("          {/* With the Key button on a phone, the date and the button are centred on each other in the one line. */}\n          <p className={keyed ? 'flex flex-wrap items-baseline gap-x-3 leading-snug max-sm:items-center' : 'flex flex-wrap items-baseline gap-x-3 leading-snug'}>",
    '          <p className="flex flex-wrap items-baseline gap-x-3 leading-snug">')
rep("<span className={keyed ? 'md:whitespace-nowrap max-sm:min-w-0 max-sm:flex-1' : 'md:whitespace-nowrap'}>", '<span className="md:whitespace-nowrap">')
start = s.index("            {keyed && (\n")
end = s.index("            )}\n", start) + len("            )}\n")
assert 'Key\n' in s[start:end] and 'setKeyOpen' in s[start:end]
s = s[:start] + s[end:]
rep("                id={keyed ? keysId : undefined}\n", "")
rep(", !keyOpen && 'max-sm:hidden'", "")
p.write_text(s, encoding='utf-8')
print('ok')
```

Expected: `ok`. Then update the comment above the keys' `<span>` ("On a phone they are shut behind the Key button until it opens them…") to "On a phone, compact, they stand under the date at 14 px with shorter swatches."

- [ ] **Step 4: Run them to see them pass, the types, then the whole suite**

Run: `cd web && npx vitest run src/components/stand src/components/explore --maxWorkers=2 && npx tsc --noEmit && npx eslint src/components/explore/TimeBar.tsx src/components/stand`
Expected: PASS, tsc and lint print nothing.

Run the whole suite as in Task 1, Step 4. Expected: all pass.

- [ ] **Step 5: Look at it**

On the production build, screenshot the stand view at 390 × 844 (`/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10`, and `&hour=300`). Check: the card folded shows the headline, the lander's line and the better day; the time bar names its keys under the date; Earth's pointer, when Earth is out of view, says its angle; no button's words wrap. The view keeps at least the lower half of the screen.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/stand/StandView.tsx web/src/components/stand/StandView.test.tsx web/src/components/stand/StandCanvas.tsx web/src/components/stand/StandCanvas.test.ts web/src/components/explore/TimeBar.tsx web/src/components/explore/TimeBar.test.tsx
git commit -m "feat(web): on a phone the stand view shows the lander's line and the better day, Earth's angle on its pointer and the keys by name"
```

---

### Task 11: Measure every page in both themes, and say how to show it on a projector

**Files:**
- Modify: `web/src/app/learn/page.tsx` (a paragraph for a class; the event word in the intro)
- Test: `web/src/app/learn/page.test.tsx`
- Record: the ledger (`.superpowers/sdd/2026-10-05-immersive-c-space-look/progress.md`)

- [ ] **Step 1: Write the failing test**

In `web/src/app/learn/page.test.tsx`, add:

```tsx
  it('tells a teacher how to show it on a projector, right under the title', () => {
    render(<LearnPage />);
    const note = screen.getByText(/^Showing it to a class\?/);
    expect(note.textContent).toBe('Showing it to a class? On a projector, zoom the page to 150 % (Ctrl and +, or ⌘ and + on a Mac): the words, the charts and the views all grow, and nothing runs off the side.');
    expect(screen.getByRole('heading', { level: 1 }).compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body.textContent).toMatch(/whether they have set behind the hills/);
  });
```

(Use the file's existing import name for the page component.)

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run src/app/learn/page.test.tsx --maxWorkers=2`
Expected: FAIL, "Unable to find an element with the text: /^Showing it to a class\?/".

- [ ] **Step 3: Write it**

In `web/src/app/learn/page.tsx`, in the intro paragraph replace `whether the hills hide them` with `whether they have set behind the hills`, and add after the intro paragraph:

```tsx
          <p className="mt-3 max-w-[42em] text-lg leading-relaxed text-ink-2">
            Showing it to a class? On a projector, zoom the page to 150 % (Ctrl and +, or ⌘ and + on a Mac): the words, the charts and the views all grow, and nothing runs off
            the side.
          </p>
```

Run the test: PASS. Commit:

```bash
git add web/src/app/learn/page.tsx web/src/app/learn/page.test.tsx
git commit -m "feat(web): How it works tells a teacher how to show the app on a projector"
```

- [ ] **Step 4: Measure every page in both themes**

Build and serve the production build. In the Playwright MCP browser (`browser_run_code_unsafe`), run on a fresh loopback host:

```js
async (page) => {
  const base = 'http://127.0.0.71:3000';
  const pages = ['/', '/sites', '/explore?site=de_gerlache_rim_2', '/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', '/compare', '/learn', '/validate'];
  const sizes = [[1440, 900], [390, 844], [960, 600]];
  const MEASURE = () => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v[3] ?? 1]; };
    const lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const under = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] >= 0.5) return c; } return parse(getComputedStyle(document.documentElement).backgroundColor) ?? [255, 255, 255, 1]; };
    const small = [], low = [], tiny = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement, text = n.textContent.trim();
      if (!el || !text || el.closest('[hidden], [aria-hidden="true"] svg')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const size = parseFloat(cs.fontSize);
      if (size < 13) small.push(`${size}px "${text.slice(0, 40)}"`);
      const fg = parse(cs.color), bg = under(el);
      if (!fg) continue;
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x), ratio = (a + 0.05) / (b + 0.05);
      if (ratio < 4.5) low.push(`${ratio.toFixed(2)} "${text.slice(0, 40)}"`);
    }
    for (const c of document.querySelectorAll('button, a.btn, input, select, [role="radio"]')) {
      const r = c.getBoundingClientRect();
      if (r.width && r.height && r.top < innerHeight && r.bottom > 0 && r.height < 40 && !c.closest('[hidden]')) tiny.push(`${Math.round(r.height)}px "${(c.textContent || c.getAttribute('aria-label') || '').trim().slice(0, 30)}"`);
    }
    return { sideways: document.documentElement.scrollWidth > innerWidth + 1, small, low, tiny };
  };
  const out = [];
  for (const theme of ['dark', 'light']) for (const [w, h] of sizes) for (const p of pages) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${base}${p}${p.includes('?') ? '&' : '?'}theme=${theme}`);
    await page.waitForTimeout(p.startsWith('/explore') ? 7000 : 2500);
    const m = await page.evaluate(MEASURE);
    if (m.sideways || m.small.length || m.low.length || m.tiny.length) out.push({ theme, size: `${w}x${h}`, page: p, ...m, small: m.small.slice(0, 5), low: m.low.slice(0, 5), tiny: m.tiny.slice(0, 5) });
  }
  return JSON.stringify(out, null, 1);
}
```

Restart the Playwright browser between the dark and the light runs if a shader fails to compile (the development laptop's GPU runs out after many page loads; spec 14.1). If so, run the loop once per theme.

Expected: `[]`. For each line it prints: a text under 13 px gets 13 px or more; a contrast under 4.5:1 gets the token that passes (the palette's tokens pass by Task 1, so a failure is a hard-coded colour: use the token); a sideways scroll is fixed at the element that overflows; a control under 40 px gets `min-h-10` or more. Each fix is a test first where a unit test can hold it (a class in a component test), then the change. Record the final `[]` and every fix in the ledger as `Task 11: measured …`.

- [ ] **Step 5: Commit the fixes, if any**

```bash
git add -A web/src
git commit -m "fix(web): every page passes the size and contrast measurements in both themes"
```

---

### Task 12: Blind read of the whole app

**Files:**
- Frames: `.playwright-mcp/readC<n>/` (gitignored)
- Record: the ledger

- [ ] **Step 1: Take the frames**

On the production build, on fresh loopback hosts, in the dark theme (the default), take full-viewport screenshots:
- At 1440 × 900:
  - the home page's first screen;
  - the arrival at quarter screens (scroll 0, 0.25 … 6 screens, as part B's reads did; 25 frames);
  - the home page below the arrival (three frames);
  - `/sites`, `/explore?site=de_gerlache_rim_2`, `/compare`, `/learn`, `/validate`;
  - the stand view at hours 10, 70, 220, 300 and 460.
- At 390 × 844: the home page's first screen, each beat's screen, `/sites`, `/explore?site=de_gerlache_rim_2` (folded period) and the stand view at hours 10 and 300.
- In the light theme at 1440 × 900: `/explore?site=de_gerlache_rim_2` and `/learn` (the classroom theme).

Restart the Playwright browser between the wide, the phone and the light sets. Name the frames in order (`01-home.png` …) and write `index.txt` with one line per frame: what page, what size, what scroll.

- [ ] **Step 2: Send two fresh readers**

Dispatch two subagents in parallel (no conversation context; they read only the frames and `index.txt`), one with each persona. Neither reads code, the spec or `web/.env.local`, and neither calls any outside service. The prompt, with the persona line filled in:

```
You are {a judge at a NASA Space Apps hackathon who has two minutes per entry | a secondary-school science teacher who might use this in class}. You see only these screenshots of a web app, in this order: {path}/index.txt lists them. Read them as a first-time visitor.

Score each from 1 to 5, with one sentence of reason each:
1. Purpose: can you tell what this is for and who it is for?
2. Next step: is it clear what to click next on each page?
3. Look: does it look professional and finished?
4. Room: is the content given room, or crowded?
5. Readability: can you read every word at this size?
6. Immersion: does it feel like being on the Moon, in space?

Then name, by frame number, everything that confused you, looked wrong, or that you could not read. Last, the one change that would help most.
```

- [ ] **Step 3: Gate**

The gate (as in 13.2): purpose, next step and look at 4 or more, room and readability at 3 or more, and immersion at 4, for both readers. Record both readers' scores and named items in the ledger, as `Read C<n> (judge): …` and `Read C<n> (teacher): …`.

- If both pass: go to Task 13.
- If either fails: fix what both readers name (or what one names and the frames confirm), each change test first, as a bounded pass `Fix C<n>`, then repeat from Step 1 with a new frame folder. An ask about the 3D scenes (rocks, the lander, the descent's middle, the night ground, the stand view's framing) goes to part D's list in the ledger, not into this part.
- As parts A and B ruled: if three reads in a row each fall one score short from one reader, within the reads' own scatter, close the part on a ruling. Make one bounded pass on what both readers of the last read named, and do no further read. The ruling goes in the ledger and spec 15.

---

### Task 13: Docs, spec section 15, final review, pull request

**Files:**
- Modify: `README.md`, `web/README.md` (the dark default, the star band, the vocabulary), `docs/pitch.md`, `docs/demo-checklist.md` (where they name the theme or quote the changed words)
- Modify: `docs/superpowers/specs/2026-10-02-immersive-space-design.md` (append section 15)
- Create: `docs/superpowers/plans/2026-10-05-immersive-c-space-look.ledger.md` (the ledger's copy)
- Modify: `web/public/validation/tests.json` (the badge)

- [ ] **Step 1: Docs**

Update every doc that names the default theme ("light by default"), the home chart's reveal, a changed word ("Sun back", "Earth in view", "hides", "in the dark") or the arrival's beats. Search them: `grep -rn "light theme\|reveal\|Sun back\|Earth in view\|hides\|in the dark\|comes into view" README.md web/README.md docs/*.md`.

- [ ] **Step 2: Spec section 15**

Append `## 15. Amendment: Part C as built (<date>)` to the spec, following section 14's form:
- 15.1, where it differs from section 6: the palette's values; how the band's height is set (the `data-band-end` marks); the stars' sky (the ecliptic band, 255°); the classroom setting as brighter grey and zooming; the vocabulary table; the date bar's lanes; the stand view's phone card.
- 15.2, the blind reads: a table as in 14.2, and the ruling if one closed the part.
- 15.3, the asks carried to part D: the scenes, with the readers who named them.

- [ ] **Step 3: The badge and the gates**

Run: `cd web && npx vitest run --maxWorkers=2 && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass. Write the counts to `web/public/validation/tests.json` (`web.files`, `web.tests`; the pipeline's count is unchanged at 131), with `generated_utc` set to now.

- [ ] **Step 4: Final review**

Copy the ledger to `docs/superpowers/plans/2026-10-05-immersive-c-space-look.ledger.md` and commit the docs, the spec, the badge and the ledger copy. Then run `review-package` for the branch against its merge base with `main`. Dispatch the final reviewer on opus, with this plan, the spec, the package and the ledger's `Ruling:` lines (superpowers:requesting-code-review's `code-reviewer.md`). Grade its findings by effect. Fix the Critical and Important ones in one pass, each test first, and run the suite green after the pass. Ledger the Minor ones as deferred.

- [ ] **Step 5: Pull request**

Scan the branch's diff for secrets (keys, tokens, `.env` files). Then push `feat/immersive-c`, open the pull request against `main` (summary, the reads, the fix pass, the test plan, then the attribution lines), and merge after GitGuardian passes (`gh pr merge N --merge`). Delete this plan's workspace directory after the ledger's copy is committed.

---

## Execution notes

- Waves, from the file map:
  - **Wave A, in parallel:**
    - Tasks 1 and 4, one agent (both touch `globals.css`); Task 2 after them, by the same agent (also `globals.css` and `AppFrame.tsx`).
    - Task 5, one agent.
    - Task 6, one agent (it touches `page.tsx` after Task 4: start it after Task 4's commit, or let the controller merge the two edits of `page.tsx`).
  - **Wave B, one after another:**
    - Task 3 (the plates in `Arrival.tsx` and `StandView.tsx`), after Task 6;
    - then Task 7 (`stand.ts`, `ArrivalCanvas.tsx`, `StandView.tsx`, `TimeBar.tsx`, `answer.ts`);
    - then Tasks 8, 9 and 10.
  - **Then Tasks 11, 12 and 13.**
- Subagents commit only their own files; the controller runs the whole suite after each wave.
- The production build serves only the files that were in `public/` at build time: rebuild after anything is added there.
- After stopping a background `npx next start`, stop the node process still listening on port 3000 before starting another.
- Disk on the development laptop is short (a few hundred MB). Delete regenerable files only: `web/.next/cache`, frames already read, and the Playwright browser's `Default/Cache` and `Code Cache`.
