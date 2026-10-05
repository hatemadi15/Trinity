# Part D1: The Stand View Gives the Moon the Screen, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The stand view of spec section 16: a one-line status with More holding today's card, only the Sun, Earth and the lander named until "Guides", a compact row of buttons, the opening that keeps the lander in frame, the level horizon behind the hills, Earth's labels apart, compass letters that fade whole, Earthlight that says why the ground is blue, and the arrival's labels that stop blinking.

**Architecture:** The words live in `web/src/lib/viz/stand.ts` (the status line) and `standOpening.ts` (where the lander stands). The renderer (`web/src/lib/sky/standRenderer.ts`) splits the rings on hidden bodies from the guides, tests the level horizon against depth, and says where its name goes. The canvas (`web/src/components/stand/StandCanvas.tsx`) learns a `guides` prop and the label rules. The page (`StandView.tsx`) holds the status, the card under More, and the row. The arrival (`web/src/components/home/ArrivalCanvas.tsx`) lets plated words pass over its labels. No computed number changes (spec 11).

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, vitest with jsdom and Testing Library, three.js 0.186, Playwright MCP for the frames and the measurements.

**Spec:** `docs/superpowers/specs/2026-10-02-immersive-space-design.md`, section 16 (part D, D1), with sections 7 to 9 (performance, accessibility, testing), 13.2 (the gate) and 15.1 (the measurements). The user approved the mockup on 5 October 2026 ("yes go ahead"). Its sources are in the job folder `.claude/jobs/a9458886/tmp/mock_d/` (`mock.js`, `sheet.py`, `part-d-mockup-wide.jpg`, `part-d-mockup-phone.jpg`).

## Scope

This plan covers D1 only (16.1). D2 (rocks, the lander model, the descent's middle, the night ground) gets its own plan. Of 15.3:

- **Built here:**
  - the stand view crowded;
  - the lander out of frame;
  - the level horizon through the hill;
  - the facing chip meeting Earth's label;
  - one-line status, labels and "Show guides" (named "Guides", as the mockup has it);
  - the phone's scene a third of the screen;
  - the labels blinking in the arrival;
  - Earth's labels piling up;
  - "Earth sets, 23 Jan" beside a rising Earth;
  - the compass letters cut;
  - the blue ground with no word on its colour.
- **Answered by the default, not built:** the Sun's path drawn solid at night. With Guides off when the view opens, no path shows by default; with Guides on, the path is the month's path as its name says. Ruling recorded in Task 5.
- **Left to D2 or the deferred list:** the descent's middle, rocks, the lander model, the night ground's flat grey, and the five page items of 15.3 "for a later pass".

## Global Constraints

- Gates from `web/`: `npx vitest run --maxWorkers=2` (8 GB laptop), `npx tsc --noEmit`, `npm run lint`, `npm run build`. The pipeline is untouched.
- Spec 2: "One gold action per screen; gold is the Sun, blue is Earth, green and red are the power verdict." The better day stays the gold action, in the card.
- Spec 2: "No text under 14 px, controls at least 40 px tall, standalone links underlined, reduced motion respected." (15.1's measurements allow 13 px; the stand view's own text stays 14 px and up.)
- Spec 8: "Everything the sky shows is also said in words … Keyboard: arrows look, `+`/`-` zoom, space plays, the look buttons are buttons; focus is always visible … No information by colour alone: Sun and Earth are named on the sky."
- Spec 16.2: the status words, exactly as listed there; "The headline stays the page's level-one heading at all times, for screen readers, and shows in the card when it is open."
- Spec 16.2: "Guides is a toggle (`aria-pressed`), off when the view opens."
- Spec 16.3: "It stands 40° left of the Sun (20° on a tall screen), as before, when the view opens by day or in the dark. When it opens at night on Earth, it stands 22° left of Earth (10° on a tall screen)."
- Spec 16.5: no sideways scroll, no text under 13 px, no text under 4.5:1; the phone's scene band at least 55 % of the screen's height; the blind read's gate of 13.2.
- Spec 11: no change to a computed number.
- Screens are checked on a fresh loopback host (`127.0.0.51:3000` and up; never `localhost` or `127.0.0.1`), on the production build. Stop the server with TaskStop, then kill the port's owner (PowerShell `Get-NetTCPConnection -LocalPort 3000`).
- Disk: C: has about 300 MB free. Before `npm run build`, delete `web/.next/cache` if under 400 MB is free; never download anything over 100 MB.
- Secrets: never read, print or copy `web/.env.local`; no calls to OpenRouter or any paid API in tests, reads or reviews.
- Subagents work in this checkout on their own files only, run only their own test files (`npx vitest run <files> --maxWorkers=1`), and commit with `git add <their files>`. If `git commit` reports `index.lock`, wait two seconds and try again.
- Commits end with the attribution lines given in the session; one pull request for D1, merged after GitGuardian passes (`gh pr merge N --merge`).

## Review Focus

1. **A visitor who opens the card, then turns Guides on, then hides and shows the words** gets back exactly what they had: the card's state and Guides survive "Hide words". Test in Task 5.
2. **A period that starts at night with Earth in view** (the lander placed by hour 0 for the arrival, by the opening hour for the stand view): the lander is in the opening frame at every hour on both screen shapes. Test in Task 2.
3. **A site in a crater, with the skyline above level all round:** the level horizon draws nowhere and its name is left out, never pointing at a hill. Test in Task 3.
4. **The status line in its longest state** ("Power on again since …, if the lander survived … without power; battery … %. No radio: Earth is below the horizon."): two lines at most at 1440 px, the More button never pushed off the plate. Measured in Task 7; the words tested in Task 1.
5. **A phone visitor who opens More:** the card scrolls inside itself when the reasons are long, and the row and the time bar stay where they are. Measured in Task 7; the card's classes tested in Task 5.

## File map

| File | Task | What changes |
|---|---|---|
| `web/src/lib/viz/stand.ts`, `stand.test.ts` | 1 | `statusLine` words; the Earthlight caption |
| `web/src/components/stand/StandView.test.tsx` | 1, 5 | three status strings (Task 1); the page's tests (Task 5) |
| `web/src/lib/viz/standOpening.ts`, `standOpening.test.ts` | 2 | `standLander(series, power, tall, hour = 0)` |
| `web/src/lib/sky/standRenderer.ts`, `standRenderer.test.ts` | 3 | rings apart from the guides; the level band depth-tested; `labels().level` |
| `web/src/components/stand/StandCanvas.tsx`, `StandCanvas.test.ts` | 4 | `guides` prop, the label rules, the compass letters, the facing chip |
| `web/src/components/stand/StandView.tsx` | 5 | the status, the card under More, Guides, the row |
| `web/src/components/home/ArrivalCanvas.tsx`, `ArrivalCanvas.test.tsx` | 6 | labels under plated words; two phrases |
| `docs/superpowers/specs/2026-10-02-immersive-space-design.md` | 8 | 16.6 as built, the read |
| `web/public/validation/tests.json` | 8 | the test badge |

## Order and who does it

- Tasks 3 (renderer) and 6 (arrival) share no file with the others: two subagents run them in parallel, while the session runs Tasks 1 and 2.
- Task 4 consumes Task 3's `setGuides(on, level, rings)` and `labels().level`.
- Task 5 consumes Tasks 1, 2 and 4.
- Tasks 7 and 8 close the part.

---

### Task 1: The status line's words and the Earthlight caption

**Files:**
- Modify: `web/src/lib/viz/stand.ts` (`statusLine`, `viewCaption`)
- Test: `web/src/lib/viz/stand.test.ts` (the `statusLine` tests near lines 163-200, 897-912 and 1075-1080; the Earthlight caption test near line 837)
- Modify: `web/src/components/stand/StandView.test.tsx` (three expectations that quote the old words: near lines 125, 412 and 419)

**Interfaces:**
- Produces: `statusLine(s: Series, p: PowerResult | null, startUtc: string, hour: number, batteryWh?: number): { on: boolean; tone: 'radio' | 'power' | 'off'; text: string }`, the same signature with the words of 16.2. `viewCaption('earthlight', lat)` returns the new caption.

- [ ] **Step 1: Write the failing tests**

In `stand.test.ts`, replace the expectations of the `statusLine` tests (the describe that starts "Power until hour 76") with:

```ts
  it('says the lander can radio Earth while it has power and Earth is in view', () => {
    expect(statusLine(s, p, start, 10)).toEqual({ on: true, tone: 'radio', text: 'Power on. Radio contact: Earth is in view.' });
  });
  it('says why the lander cannot radio home while Earth is out of view', () => {
    expect(statusLine(s, p, start, 20)).toEqual({ on: true, tone: 'power', text: 'Power on. No radio: Earth is below the horizon.' });
    // Hidden while above the horizon: "behind a hill", one name for it (15.1).
    expect(statusLine(s, p, start, 30)).toEqual({ on: true, tone: 'power', text: 'Power on. No radio: Earth is behind a hill.' });
  });
  it('says since when the lander has had power again after a power cut, and only if it survived', () => {
    expect(statusLine(s, p, start, 500)).toEqual({ on: true, tone: 'radio', text: 'Power on again since 20 January, if the lander survived 16 days 6 hours without power. Radio contact: Earth is in view.' });
    expect(statusLine(s, p, start, 600)).toEqual({ on: true, tone: 'power', text: 'Power on again since 20 January, if the lander survived 16 days 6 hours without power. No radio: Earth is below the horizon.' });
  });
  it('does not promise radio contact while the lander is off, even with Earth in view', () => {
    expect(statusLine(s, p, start, 100)).toEqual({ on: false, tone: 'off', text: 'Power off: the battery ran out on 4 January. Earth is in view, but the radio has no power.' });
  });
  // The flags on the time bar say when the power comes back; this line says so only when it never does.
  it('stops at the battery running out when the power comes back in the period, and says so when it never does', () => {
    expect(statusLine(s, p, start, 200)).toEqual({ on: false, tone: 'off', text: 'Power off: the battery ran out on 4 January.' });
    const never = { powered: Uint8Array.from([1, 1, 0, 0]), firstBrownoutHour: 2 } as unknown as PowerResult;
    expect(statusLine(series({ sunEl: [1, 1, 1, 1] }), never, start, 3)).toEqual({ on: false, tone: 'off', text: 'Power off: the battery ran out on 1 January. Power does not come back in this period.' });
    expect(statusLine(series({ sunEl: [1, 1, 1, 1], earthEl: [4, 4, 4, 4], earthVisible: [1, 1, 1, 1] }), never, start, 3)).toEqual({
      on: false,
      tone: 'off',
      text: 'Power off: the battery ran out on 1 January. Earth is in view, but the radio has no power. Power does not come back in this period.',
    });
  });
```

Keep the three tests after them ("says the power is being worked out", "agrees with the line on the power alone", "gives the dot its tone") as they are.

Replace the two battery tests (near line 897) with:

```ts
  it('gives the battery’s level while the lander has power', () => {
    const p = power(); // a walk that runs from full to empty over the test series
    expect(statusLine(series(), p, START, 0, 2000).text).toMatch(/^Power on, battery 100 %\./);
  });
  it('sets the level after the power, and gives none while the lander is off or without the battery’s size', () => {
    const s = series({ sunEl: [1, 1, 1, 1, 1] });
    expect(statusLine(s, power(), START, 1, 2000)).toEqual({ on: true, tone: 'power', text: 'Power on, battery 75 %. No radio: Earth is behind a hill.' });
    const seen = series({ sunEl: [1, 1, 1, 1, 1], earthEl: [4, 4, 4, 4, 4], earthVisible: [1, 1, 1, 1, 1] });
    expect(statusLine(seen, power(), START, 3, 2000)).toEqual({ on: true, tone: 'radio', text: 'Power on, battery 25 %. Radio contact: Earth is in view.' });
    expect(statusLine(s, power(), START, 4, 2000).text).toBe('Power off: the battery ran out on 1 January. Power does not come back in this period.');
    expect(statusLine(s, power(), START, 1).text).toBe('Power on. No radio: Earth is behind a hill.');
    expect(statusLine(s, power(), START, 1, 0).text).toBe('Power on. No radio: Earth is behind a hill.');
  });
  it('gives the level after a power cut beside the condition', () => {
    const back = { powered: Uint8Array.from([1, 0, 0, 1]), energyWh: Float64Array.from([2000, 0, 0, 800]), firstBrownoutHour: 1 } as unknown as PowerResult;
    expect(statusLine(series({ sunEl: [1, 1, 1, 1] }), back, START, 3, 2000).text).toBe('Power on again since 1 January, if the lander survived 2 hours without power; battery 40 %. No radio: Earth is behind a hill.');
  });
```

In the hero-month test (near line 1075), replace the five `statusLine` expectations with:

```ts
    expect(statusLine(s, p, start, 10)).toEqual({ on: true, tone: 'power', text: 'Power on. No radio: Earth is below the horizon.' });
    // With the battery's size, as the page gives it: still full at hour 10, with the Sun up.
    expect(statusLine(s, p, start, 10, DEFAULT_POWER.batteryWh).text).toBe('Power on, battery 100 %. No radio: Earth is below the horizon.');
    expect(statusLine(s, p, start, 219)).toEqual({ on: false, tone: 'off', text: 'Power off: the battery ran out on 4 January. Earth is in view, but the radio has no power.' });
    // Off with Earth out of view: the flags say when the power comes back.
    expect(statusLine(s, p, start, 200)).toEqual({ on: false, tone: 'off', text: 'Power off: the battery ran out on 4 January.' });
```

Replace the Earthlight caption test (near line 837) with:

```ts
  it('says what lights the ground when night falls with Earth in view, and why it is blue', () => {
    expect(viewCaption('earthlight', -88.28)).toBe('Earthlight, sunlight bounced off Earth, lights this ground and tints it blue; brightened like a long exposure.');
    expect(viewCaption('earthlight', 18.56)).toBe(viewCaption('earthlight', -88.28));
  });
```

In `StandView.test.tsx`:
- near line 125, change the regex to `/^Power on, battery 100 %\. No radio: Earth is (below the horizon|behind a hill)\.$/`;
- near line 412, change the text to `/^Power off: the battery ran out on 4 January\. Earth is in view, but the radio has no power\.$/`;
- near line 419, change the test body to `expect(screen.getByText(/^Power on, battery 100 %\./).textContent).toMatch(/^Power on, battery 100 %\./);`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/lib/viz/stand.test.ts src/components/stand/StandView.test.tsx --maxWorkers=2`
Expected: FAIL, the new status words and the Earthlight caption differ ("The lander has power…", "Lit only by Earthlight…").

- [ ] **Step 3: Write the implementation**

In `stand.ts`, replace `statusLine` and its comment with:

```ts
/**
 * The stand view's status line for the hour (spec 16.2), short, for the one line at the top: the lander's power and
 * its radio. With power from the landing: "Power on, battery 87 %." (the battery's level after the hour, as the
 * forecast page gives it, a whole percentage that keeps its sign on its line), or "Power on." without a battery size;
 * after a power cut, the date of the hour's own stretch and the condition, as the forecast counts energy only: "Power
 * on again since 20 January, if the lander survived 16 days 6 hours without power; battery 40 %.". Then the radio:
 * "Radio contact: Earth is in view.", "No radio: Earth is below the horizon." or "No radio: Earth is behind a hill."
 * Without power: "Power off: the battery ran out on 4 January.", then "Earth is in view, but the radio has no
 * power." with Earth in view, and "Power does not come back in this period." when it does not; when it does, the
 * flags on the time bar say when. `on` is whether it has power; true until that is worked out. `tone` is for the
 * page's dot: "radio" with power and Earth in view, "power" with power alone or while the power is being worked
 * out, and "off" without power.
 */
export function statusLine(s: Series, p: PowerResult | null, startUtc: string, hour: number, batteryWh?: number): { on: boolean; tone: 'radio' | 'power' | 'off'; text: string } {
  if (!p) return { on: true, tone: 'power', text: WORKING };
  const seen = s.earthVisible[hour] === 1;
  const from = stretchStart(p.powered, hour);
  if (p.powered[hour] !== 1) {
    const back = stretchEnd(p.powered, hour) < p.powered.length;
    return { on: false, tone: 'off', text: `Power off: the battery ran out on ${dateLong(startUtc, from)}.${seen ? ' Earth is in view, but the radio has no power.' : ''}${back ? '' : ' Power does not come back in this period.'}` };
  }
  // Without a battery there is no level to give.
  const level = batteryWh !== undefined && batteryWh > 0 ? `battery ${pct0(p.energyWh[hour] / batteryWh)}` : '';
  const power =
    from === 0
      ? `Power on${level ? `, ${level}` : ''}.`
      : `Power on again since ${dateLong(startUtc, from)}, if the lander survived ${spanWords(from - stretchStart(p.powered, from - 1))} without power${level ? `; ${level}` : ''}.`;
  const radio = seen ? 'Radio contact: Earth is in view.' : `No radio: Earth is ${s.earthEl[hour] < 0 ? 'below the horizon' : 'behind a hill'}.`;
  return { on: true, tone: seen ? 'radio' : 'power', text: `${power} ${radio}` };
}
```

In `viewCaption`, replace the last line with:

```ts
  return 'Earthlight, sunlight bounced off Earth, lights this ground and tints it blue; brightened like a long exposure.';
```

and in its comment replace "that only Earthlight lights the ground, brightened like a long exposure" with "that Earthlight lights the ground and tints it blue, brightened like a long exposure (both readers of part B read 7 found the blue unexplained)".

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/lib/viz/stand.test.ts src/lib/viz/words.test.ts src/components/stand/StandView.test.tsx --maxWorkers=2`
Expected: PASS. The words test sweeps `statusLine` at every sixth hour of the hero month for other names; "behind a hill" is the name 15.1 keeps.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/viz/stand.ts web/src/lib/viz/stand.test.ts web/src/components/stand/StandView.test.tsx
git commit -m "feat(web): the stand view's status line in short words, and Earthlight that says why the ground is blue"
```

### Task 2: The lander placed by the opening hour

**Files:**
- Modify: `web/src/lib/viz/standOpening.ts`
- Test: `web/src/lib/viz/standOpening.test.ts`

**Interfaces:**
- Produces: `standLander(series: Series, power: PowerResult, tall: boolean, hour = 0): NonNullable<StandScene['lander']>`. Its `azDeg` is placed by `hour`; `faceAzDeg`, `earthAzDeg` and `earthElDeg` stay those of hour 0. Callers that pass no hour (the arrival) get what they had for a period that opens by day.

- [ ] **Step 1: Write the failing tests**

Add to `standOpening.test.ts`, inside the describe:

```ts
  it('stands the lander by the hour the view opens on: 40° left of that hour’s Sun (20° on a tall screen), 22° left of Earth at night (10° on a tall screen)', () => {
    // Hour 5: the Sun up at 315°.
    expect(standLander(series, power, false, 5).azDeg).toBe(275);
    expect(standLander(series, power, true, 5).azDeg).toBe(295);
    // Hour 11: night, Earth in view at 70°.
    expect(standLander(series, power, false, 11).azDeg).toBe(48);
    expect(standLander(series, power, true, 11).azDeg).toBe(60);
    // Its panel and dish still face the Sun and Earth of the landing hour.
    const night = standLander(series, power, false, 11);
    expect(night.faceAzDeg).toBe(245);
    expect([night.earthAzDeg, night.earthElDeg]).toEqual([70, 3]);
    // An hour past the period's end stands it by the last hour.
    expect(standLander(series, power, false, 99).azDeg).toBe(48);
  });

  it('keeps the lander in the opening view at every hour, on a wide screen and a tall one', () => {
    // Half the view's width in degrees, for its height in degrees and its shape (the page's: 60° or 80°, 36° or 50° on Earth at night).
    const half = (fov: number, aspect: number) => (Math.atan(Math.tan((fov * Math.PI) / 360) * aspect) * 180) / Math.PI;
    for (let h = 0; h < 12; h++)
      for (const tall of [false, true]) {
        const onEarth = series.sunFraction[h] === 0 && series.earthVisible[h] === 1;
        const fov = onEarth ? (tall ? 50 : 36) : tall ? 80 : 60;
        const rel = Math.abs(((standLander(series, power, tall, h).azDeg - openingYaw(series, h, tall, true) + 540) % 360) - 180);
        // With 5° to spare for the lander's own width.
        expect(rel, `hour ${h}, ${tall ? 'tall' : 'wide'}`).toBeLessThan(half(fov, tall ? 390 / 844 : 16 / 10) - 5);
      }
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/lib/viz/standOpening.test.ts --maxWorkers=2`
Expected: FAIL. `standLander` ignores the hour (hour 5 gives 280, not 275; hour 11 gives 280, not 48).

- [ ] **Step 3: Write the implementation**

In `standOpening.ts`, replace the top comment's first sentence and `landerFromSun` and `standLander` with:

```ts
/**
 * The lander stands 16 m away, placed by the hour the view opens on, so the opening view holds it and what the view
 * faces (spec 16.3): 40° to the left of the Sun then (20° on a tall screen, whose view is narrower), or, when the
 * view opens at night on Earth, 22° to the left of Earth (10° on a tall screen), as that view is narrower still. Its
 * solar panel faces the Sun of the period's first hour, its +x face 75° left of it, and its dish that hour's Earth,
 * as a lander that landed then would. The view opens 35° left of the Sun, so the Sun stands near the view's right
 * edge and the lander just left of the middle, and the ground before you is lit from the side, not from behind; on
 * a tall screen 15° left of the Sun, so the lander stands near the middle, 5° left of it, and the Sun towards the
 * right edge. The home page's arrival lands beside it at the period's first hour.
 */
export const LANDER_DIST_M = 16;
const LANDER_FACE_LEFT_DEG = 75;
/** How far left of what the first view faces the lander stands: of the Sun (or where it is, in the dark), or of Earth at night. */
const landerFrom = (onEarth: boolean, tall: boolean) => (onEarth ? (tall ? -10 : -22) : tall ? -20 : -40);
const openFromSun = (tall: boolean) => (tall ? landerFrom(false, true) + 5 : -35);
```

```ts
/** The lander beside the site, placed by the hour the view opens on (`hour`, the period's first by default). */
export function standLander(series: Series, power: PowerResult, tall: boolean, hour = 0): NonNullable<StandScene['lander']> {
  const h = Math.min(series.hours - 1, Math.max(0, Math.round(hour)));
  const onEarth = series.sunFraction[h] === 0 && series.earthVisible[h] === 1;
  return {
    azDeg: (openingAnchor(series, h) + landerFrom(onEarth, tall) + 360) % 360,
    distM: LANDER_DIST_M,
    powered: power.powered,
    faceAzDeg: (series.sunAz[0] - LANDER_FACE_LEFT_DEG + 360) % 360,
    earthAzDeg: series.earthAz[0],
    earthElDeg: series.earthEl[0],
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/lib/viz/standOpening.test.ts src/components/home/ArrivalCanvas.test.tsx --maxWorkers=2`
Expected: PASS (the arrival passes no hour).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/viz/standOpening.ts web/src/lib/viz/standOpening.test.ts
git commit -m "feat(web): the lander stands by the hour the stand view opens on, so the opening view holds it"
```

### Task 3: The renderer: rings with the labels, the level horizon behind the hills, its name's place

**Files:**
- Modify: `web/src/lib/sky/standRenderer.ts`
- Test: `web/src/lib/sky/standRenderer.test.ts`

**Interfaces:**
- Produces:
  - `buildScene(...).setGuides(on: boolean, level = true, rings = on)`; `StandRenderer.setGuides(on: boolean, level = true, rings = on)`;
  - `parts.rings: THREE.Group` (the two ring sprites, `parts.markers`, now hang in it, not in `parts.guides`);
  - `SkyLabels.level?: Spot | null`, from `labels()`: where the level horizon's name goes, or null.
- Consumers: Task 4 (`StandCanvas` calls `setGuides(guides && !clean, true, !clean)` and places "Level horizon" at `labels().level`). The arrival keeps calling `setGuides(p > LANDED, false)`, so its rings still go with its guides.

- [ ] **Step 1: Write the failing tests**

In `standRenderer.test.ts`, in the test "draws the faint bands, the level horizon and the rings through the near ground and the hills alike…", rename it to "draws the faint bands and the rings through the near ground and the hills alike, the level horizon only where it clears them, at their own angular sizes, and the lander after them, so it covers them", and:
- change the first loop's list to `[band(s, SUN_BAND, true), band(s, EARTH_BAND, true)]`;
- after that loop add:

```ts
    // The level horizon is tested against what is drawn before it: the hills hide it, as both readers asked (16.3).
    expect(basic(levelBand(s)).depthTest).toBe(true);
    expect(THREE.MathUtils.radToDeg(world(levelBand(s), 0).sub(eye).angleTo(world(levelBand(s), 1).sub(eye)))).toBeCloseTo(0.15, 4);
```
- change `for (const guide of drawn(s.parts.guides))` (both places) to `for (const guide of [...drawn(s.parts.guides), ...drawn(s.parts.rings)])`.

Add after "hides the guides with the words":

```ts
  it('keeps the rings on hidden bodies with the labels, apart from the guides, and with them by default as the arrival has them', () => {
    const s = buildScene(flat());
    s.update(2); // none of the Sun in view: its ring shows
    s.setGuides(false, true, true);
    expect(s.parts.guides.visible).toBe(false);
    expect(s.parts.rings.visible).toBe(true);
    expect(s.parts.markers.sun.visible).toBe(true);
    expect(s.parts.markers.sun.parent).toBe(s.parts.rings);
    s.setGuides(true, true, false);
    expect(s.parts.guides.visible).toBe(true);
    expect(s.parts.rings.visible).toBe(false);
    s.setGuides(false);
    expect(s.parts.rings.visible).toBe(false);
    s.setGuides(true, false);
    expect(s.parts.rings.visible).toBe(true);
  });

  it('names the level horizon at the left-most stretch of it in view that clears the hills, 3 degrees or more long, and nowhere when none does', () => {
    // A hill 2 degrees high from 240 to 290 degrees round; elsewhere the skyline lies half a degree below level.
    const el = Array.from({ length: 720 }, (_, k) => (k / 2 >= 240 && k / 2 < 290 ? 2 : -0.5));
    const s = buildScene(flat({ mask: { az0: 0, step: 0.5, el } }));
    s.update(0);
    s.setView(300, 2, 60, 16 / 9); // the view from about 254 to 346 degrees round
    const at = s.labels().level!;
    expect(at.visible).toBe(true);
    // At the hill's right foot, 290 degrees, within half a degree (the scan's step, and the mask's nearest sample).
    const foot = (az: number) => {
      const p = new THREE.Vector3(...dirAzEl(az, 0)).multiplyScalar(1000).add(s.camera.position).project(s.camera);
      return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
    };
    expect(at.x).toBeGreaterThanOrEqual(foot(289.5).x);
    expect(at.x).toBeLessThanOrEqual(foot(290.5).x);
    expect(at.y).toBeCloseTo(foot(290).y, 2);
    // A crater: the skyline above level all round, so no stretch of the line shows.
    const deep = buildScene(flat({ mask: { az0: 0, step: 0.5, el: new Array(720).fill(1) } }));
    deep.update(0);
    deep.setView(300, 2, 60, 16 / 9);
    expect(deep.labels().level ?? null).toBeNull();
    // A stretch shorter than 3 degrees is no place for a name: an open notch 2 degrees wide in the hill.
    const notch = Array.from({ length: 720 }, (_, k) => (k / 2 >= 300 && k / 2 < 302 ? -0.5 : 2));
    const n = buildScene(flat({ mask: { az0: 0, step: 0.5, el: notch } }));
    n.update(0);
    n.setView(300, 2, 60, 16 / 9);
    expect(n.labels().level ?? null).toBeNull();
    // None with the guides hidden, or with the level horizon left out.
    s.setGuides(false);
    expect(s.labels().level ?? null).toBeNull();
    s.setGuides(true, false);
    expect(s.labels().level ?? null).toBeNull();
  });
```

If `dirAzEl` is not yet imported in the test file, import it from `./frames` (the renderer's own source of it).

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/lib/sky/standRenderer.test.ts --maxWorkers=1`
Expected: FAIL. `s.parts.rings` is undefined; the level band's `depthTest` is false; `labels().level` is undefined.

- [ ] **Step 3: Write the implementation**

In `standRenderer.ts`:

1. Add to `SkyLabels`:

```ts
  /** Where the level horizon's name goes: the left end of the first stretch of the line in view that clears the hills, 3° or more long; null when none does, or while the guides or the line are hidden. */
  level?: Spot | null;
```

2. Give `band` a last parameter that sets the depth test apart from faintness, and use it for the level horizon:

```ts
  const band = (dirs: Vec3[], colour: number, faint: boolean, opacity: number, floor?: number[], dash = 0, depth = !faint) => {
```

with `depthTest: depth` in its material instead of `depthTest: !faint`. Add to its comment: "`depth`, true by default for a solid band only, tests a band against what is drawn before it: the level horizon is faint but tested, so the hills hide it (16.3)."

```ts
  const levelBand = band(Array.from({ length: 361 }, (_, k) => dirAzEl(k, 0)), 0xffffff, true, 0.18, undefined, 0, true);
```

and in the guides' comment (above `const guides = new THREE.Group()`), replace "the level horizon all round, faint" with "the level horizon, faint, where it clears the hills". In the `band` comment, replace "A faint one, like the level horizon and the rings, does not" with "A faint one, like the rings, does not".

3. Hang the rings in their own group, shown with the words rather than with the guides:

```ts
  // The rings on hidden bodies go with the labels that name those bodies, not with the guides (16.2).
  const rings = new THREE.Group();
  skyGroup.add(rings);
```

placed just before `const ring = (colour: number, degrees: number) => {`, and in `ring` replace `guides.add(s);` with `rings.add(s);`.

4. In `setGuides`:

```ts
  /**
   * Shows or hides the guides (the month's paths and the level horizon), the level horizon alone (the arrival tells
   * its story without it), and the rings on hidden bodies, which go with the guides unless told apart: the stand view
   * shows them with its labels (16.2), the arrival with its guides.
   */
  const setGuides = (on: boolean, level = true, ringsOn = on) => {
    guides.visible = on;
    levelBand.visible = level;
    rings.visible = ringsOn;
  };
```

and add `rings` to the returned `parts` (beside `guides`).

5. Add, after `landerOnScreen`:

```ts
  /**
   * Where the level horizon's name goes (16.3): scanning the view from its left edge, in half degrees, the left end of
   * the first stretch of the line 3° or more long where the skyline lies below level, so the name always points at a
   * line in the open; null where no such stretch is in view, or while the guides or the line are hidden.
   */
  function levelSpot(): Spot | null {
    if (!guides.visible || !levelBand.visible) return null;
    camera.getWorldDirection(fwd);
    const yaw = Math.atan2(fwd.x, -fwd.z) / DEG, half = Math.atan(Math.tan((camera.fov * DEG) / 2) * camera.aspect) / DEG;
    let start: number | null = null;
    for (let a = -half + 1; a <= half - 1; a += 0.5) {
      const az = (((yaw + a) % 360) + 360) % 360;
      if (maskAt(az) >= 0) {
        start = null;
        continue;
      }
      if (start === null) start = a;
      if (a - start >= 3) {
        const d = dirAzEl((((yaw + start) % 360) + 360) % 360, 0);
        const s = spot(skyWorld(new THREE.Vector3(d[0] * RG, d[1] * RG, d[2] * RG)), 0, false);
        return s.visible ? s : null;
      }
    }
    return null;
  }
```

and in `labels()` add `level: levelSpot()` to the returned object.

6. In the `StandRenderer` class: add `private rings = true;`, and

```ts
  /** Shows or hides the month's paths and the level horizon (or the line alone), and the rings on hidden bodies. */
  setGuides(on: boolean, level = true, rings = on) {
    this.guides = on;
    this.level = level;
    this.rings = rings;
    this.built.setGuides(on, level, rings);
  }
```

Where the class applies them to a rebuilt scene (`this.built.setGuides(this.guides, this.level)`), pass `this.rings` too. In the redraw key (`const key = …${this.guides}`), use `${this.guides} ${this.level} ${this.rings}` so a change to any of them draws again.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/lib/sky/standRenderer.test.ts src/components/home/ArrivalCanvas.test.tsx --maxWorkers=1`
Expected: PASS, the renderer's tests and the arrival's (which calls `setGuides(on, false)`).

Then: `cd web && npx tsc --noEmit`
Expected: no errors (the canvas's `RendererLike.setGuides?: (on: boolean) => void` accepts the wider method).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sky/standRenderer.ts web/src/lib/sky/standRenderer.test.ts
git commit -m "feat(web): the rings on hidden bodies apart from the guides, the level horizon behind the hills, and where its name goes"
```

### Task 4: The canvas: Guides, the level name, each body's own room, opaque plates, whole compass letters, the phone's facing chip

**Files:**
- Modify: `web/src/components/stand/StandCanvas.tsx`
- Test: `web/src/components/stand/StandCanvas.test.ts`

**Interfaces:**
- Consumes: Task 3's `setGuides(on, level, rings)` and `SkyLabels.level`.
- Produces:
  - prop `guides?: boolean` (default `true`: the canvas shows what it is told; the page opens with it off);
  - `RendererLike.setGuides?: (on: boolean, level?: boolean, rings?: boolean) => void`;
  - exports `OWN_CLEAR = 24`, `inflate(b, m)`, `clearOfOwn(boxes, owners, zones)`, `starsNamed(guides, night, pitchDeg)`, `letterFade(x, halfWidth, stripW?)`;
  - `levelY` is removed: the renderer places the level horizon's name.
- Consumer: Task 5 passes `guides`.

- [ ] **Step 1: Write the failing tests**

In `StandCanvas.test.ts`:
- import `clearOfOwn, inflate, letterFade, OWN_CLEAR, starsNamed` from `./StandCanvas`, and `starLabel` from `@/lib/viz/stand`;
- delete the describe "the level horizon" (it tests `levelY`) and drop `levelY` from the import;
- in "the days on the paths", test "give way, frame by frame…", add to the object `labels()` returns: `level: { x: 0.012, y: 0.57, visible: true },` (the level horizon's name now goes where the renderer says).

Add:

```ts
describe('the guides', () => {
  const props = (guides: boolean, r: RendererLike) => {
    const scene: StandScene = { field: flatField(0), mask: { az0: 0, step: 0.5, el: new Array(720).fill(0) }, series: northSeries, startUtc: '2027-01-01T00:00:00', site: { lat: -88.28, lon: -64.31 }, mastM: 2, sky: { ...noStars, names: [{ index: 0, name: 'Sirius' }] }, lander: { azDeg: 30, distM: 16, powered: Uint8Array.from([1, 1, 1]) }, marks: [{ hour: 1, body: 'sun', text: 'Sunset, 3 Jan' }] };
    return { scene, hour: 0, look: null, startYaw: 0, reducedMotion: true, createRenderer: () => r, sunLabel: 'Sun 2.0° up', earthLabel: 'Earth 3.0° up', night: true, onFail: vi.fn(), guides };
  };
  const labels = (): SkyLabels => ({
    sun: { x: 0.5, y: 0.45, visible: true },
    earth: { x: 0.7, y: 0.4, visible: true },
    stars: [{ name: 'Sirius', x: 0.3, y: 0.2, visible: true }],
    lander: { x: 0.2, y: 0.6, visible: true },
    shadow: { x: 0.5, y: 0.8, visible: true, lengthM: 40, levelM: 40 },
    level: { x: 0.1, y: 0.5, visible: true },
    marks: [{ text: 'Sunset, 3 Jan', x: 0.3, y: 0.3, visible: true }],
    pathNames: [
      { body: 'sun', text: "Sun's path this month", x: 0.4, y: 0.55, visible: true },
      { body: 'earth', text: "Earth's path this month", x: 0, y: 0, visible: false },
    ],
  });
  const shown = (el: Element | null | undefined) => !!el && !(el as HTMLElement).hidden;
  const guideLabels = () => [
    document.querySelector('[data-path-mark]'),
    document.querySelector('[data-path-name="sun"]'),
    [...document.querySelectorAll('span')].find((n) => n.textContent === 'Level horizon'),
    [...document.querySelectorAll('span')].find((n) => n.textContent === starLabel('Sirius')),
    [...document.querySelectorAll('span')].find((n) => n.textContent?.startsWith('Your shadow')),
  ];

  it('without the guides, leaves out the days on the paths, their names, the level horizon’s name, the star names at night and your shadow, and keeps the Sun, Earth, the lander and the rings', async () => {
    const setGuides = vi.fn();
    const r: RendererLike = { setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), labels, dispose: vi.fn(), setGuides };
    const view = render(createElement(StandCanvas, props(false, r)));
    await waitFor(() => expect(shown(document.querySelector('[data-sky="sun"]'))).toBe(true));
    expect(setGuides).toHaveBeenLastCalledWith(false, true, true);
    expect(shown(document.querySelector('[data-sky="earth"]'))).toBe(true);
    expect(shown([...document.querySelectorAll('span')].find((n) => n.textContent === 'The lander, 16 m away'))).toBe(true);
    for (const el of guideLabels()) expect(shown(el)).toBe(false);
    view.rerender(createElement(StandCanvas, props(true, r)));
    await waitFor(() => expect(shown(document.querySelector('[data-path-mark]'))).toBe(true));
    expect(setGuides).toHaveBeenLastCalledWith(true, true, true);
    for (const el of guideLabels()) expect(shown(el)).toBe(true);
    // Hidden with the words, the rings too.
    view.rerender(createElement(StandCanvas, { ...props(true, r), clean: true }));
    await waitFor(() => expect(setGuides).toHaveBeenLastCalledWith(false, true, false));
  });

  it('names the bright stars with the guides at night, and whenever the view looks well up', () => {
    expect(starsNamed(true, true, 2)).toBe(true);
    expect(starsNamed(false, true, 2)).toBe(false);
    expect(starsNamed(true, false, 2)).toBe(false);
    expect(starsNamed(false, false, 30)).toBe(true);
  });

  it('puts the level horizon’s name where the renderer finds the line clear of the hills, and leaves it out where it finds none', async () => {
    let level: SkyLabels['level'] = { x: 0.31, y: 0.52, visible: true };
    const r: RendererLike = { setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), labels: () => ({ ...labels(), level }), dispose: vi.fn() };
    render(createElement(StandCanvas, props(true, r)));
    const name = [...document.querySelectorAll<HTMLElement>('span')].find((n) => n.textContent === 'Level horizon')!;
    await waitFor(() => expect(name.hidden).toBe(false));
    expect([name.style.left, name.style.top]).toEqual(['31%', '52%']);
    level = null;
    await waitFor(() => expect(name.hidden).toBe(true));
  });

  it('sets the names on plates near opaque, so no path line shows through them', () => {
    const r: RendererLike = { setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), labels, dispose: vi.fn() };
    render(createElement(StandCanvas, props(true, r)));
    for (const sel of ['[data-sky="sun"]', '[data-sky="earth"]', '[data-path-mark]', '[data-path-name="sun"]', '[data-pointer="earth"]']) expect(document.querySelector(sel)!.className).toContain('bg-black/90');
  });

  it('counts the phone’s facing chip as a panel, so the labels keep off it', () => {
    const r: RendererLike = { setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), labels, dispose: vi.fn() };
    render(createElement(StandCanvas, props(true, r)));
    const phone = [...document.querySelectorAll<HTMLElement>('p')].find((p) => p.textContent?.startsWith('Facing') && p.classList.contains('md:hidden'))!;
    expect(phone.hasAttribute('data-plate')).toBe(true);
  });
});

describe('a day or a path’s name beside its own body', () => {
  it('gives way within 24 px of its own body’s label, never for the other body’s', () => {
    expect(OWN_CLEAR).toBe(24);
    const earth = { left: 500, top: 300, right: 660, bottom: 328 };
    expect(inflate(earth, 24)).toEqual({ left: 476, top: 276, right: 684, bottom: 352 });
    const zones = { earth: inflate(earth, OWN_CLEAR) };
    const near = { left: 670, top: 300, right: 820, bottom: 328 }, far = { left: 690, top: 300, right: 840, bottom: 328 };
    expect(clearOfOwn([near, far, near, null], ['earth', 'earth', 'sun', 'earth'], zones)).toEqual([null, far, near, null]);
  });
});

describe('the compass letters', () => {
  it('fade whole: shown from 40 px in from either end of the strip, gone before any part of a letter reaches the end', () => {
    expect(letterFade(150, 6)).toBe(1);
    expect(letterFade(46, 6)).toBe(1);
    expect(letterFade(26, 6)).toBeCloseTo(0.5, 9);
    expect(letterFade(6, 6)).toBe(0);
    expect(letterFade(2, 6)).toBe(0);
    expect(letterFade(300 - 26, 6)).toBeCloseTo(0.5, 9);
    expect(letterFade(400, 6)).toBe(0);
  });

  it('sets each letter’s opacity as the view turns: facing north, N whole in the middle and E and W gone', async () => {
    const r: RendererLike = { setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), labels: () => ({ sun: { x: 0.5, y: 0.45, visible: true }, earth: { x: 0, y: 0, visible: false }, stars: [], lander: null }), dispose: vi.fn() };
    const scene: StandScene = { field: flatField(0), mask: { az0: 0, step: 0.5, el: new Array(720).fill(0) }, series: northSeries, startUtc: '2027-01-01T00:00:00', site: { lat: -88.28, lon: -64.31 }, mastM: 2, sky: noStars };
    render(createElement(StandCanvas, { scene, hour: 0, look: null, startYaw: 0, reducedMotion: true, createRenderer: () => r, sunLabel: 'Sun 2.0° up', earthLabel: 'Earth 3.0° up', night: false, onFail: vi.fn() }));
    const letters = () => [...document.querySelectorAll<HTMLElement>('[data-point]')];
    await waitFor(() => expect(r.render).toHaveBeenCalled());
    await waitFor(() => expect(letters().some((n) => n.textContent === 'N' && n.style.opacity === '1')).toBe(true));
    for (const n of letters().filter((n) => n.textContent === 'E' || n.textContent === 'W')) expect(n.style.opacity).toBe('0');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/components/stand/StandCanvas.test.ts --maxWorkers=2`
Expected: FAIL. The new exports are missing, the `guides` prop is ignored, the names sit on `bg-black/75`, no letter carries `data-point`, and the phone's facing chip is no panel.

- [ ] **Step 3: Write the implementation**

In `StandCanvas.tsx`:

1. The type: `setGuides?: (on: boolean, level?: boolean, rings?: boolean) => void`.

2. Delete `levelY` and its comment. Add, after `starNamesShown`:

```ts
/** Whether the bright stars carry their names: with the guides at night, and whenever the view looks well up (16.2). */
export const starsNamed = (guides: boolean, night: boolean, pitchDeg: number): boolean => (guides && night) || pitchDeg > 25;

/**
 * How far a day on a path, or a path's name, keeps from its own body's label (16.3): beside it, it reads as about the
 * hour shown, as "Earth sets, 23 Jan" beside a rising Earth did in part C's read.
 */
export const OWN_CLEAR = 24;
/** A box grown by `m` pixels on every side. */
export const inflate = (b: Rect, m: number): Rect => ({ left: b.left - m, top: b.top - m, right: b.right + m, bottom: b.bottom + m });
/** The boxes of days or paths' names, each left out (null) where it meets its own body's zone (that body's label grown by OWN_CLEAR). */
export function clearOfOwn(boxes: (Rect | null)[], owners: ('sun' | 'earth' | undefined)[], zones: Partial<Record<'sun' | 'earth', Rect>>): (Rect | null)[] {
  return boxes.map((b, k) => {
    const owner = owners[k], z = owner ? zones[owner] : undefined;
    return b && z && b.right > z.left && b.left < z.right && b.bottom > z.top && b.top < z.bottom ? null : b;
  });
}
```

`Rect` is declared further down the file; move `type Rect = …` (and `type PartSide`) above `starNamesShown` so the new helpers can use it.

3. After the strip's constants (`POINT`), add:

```ts
/**
 * How whole a compass letter shows (16.3), its middle `x` pixels along the strip and `halfWidth` half its width:
 * fully from 40 px in from either end, fading to nothing as its near edge reaches the end, so no letter is cut ("N"
 * read for "NW").
 */
export function letterFade(x: number, halfWidth: number, stripW = STRIP_W): number {
  return Math.max(0, Math.min(1, Math.min(x - halfWidth, stripW - x - halfWidth) / 40));
}
```

and change the strip's comment to "The compass strip: 120° of the horizon across 300 px, ticks every 15°, the eight points named; its ticks fade at the ends, and each letter fades whole (letterFade)."

4. Props: add `guides = true` to the destructured props and to the type:

```ts
  /** The guides (16.2): the month's paths, their days and names, the level horizon, the star names at night and your shadow. */
  guides?: boolean;
```

with `const guidesRef = useRef(guides);` and `useEffect(() => { guidesRef.current = guides; }, [guides]);` beside `cleanRef`. Add `const lettersRef = useRef<HTMLDivElement>(null);` and `const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);` beside `trackRef`.

5. In `tick`:
- `r.setGuides?.(guidesRef.current && !cleanRef.current, true, !cleanRef.current);` and its comment: "The month's paths and the level horizon go with the guides; the rings on hidden bodies with the words."
- after `const l = r.labels();` add `const guide = guidesRef.current;`
- your shadow: `const sh = guide ? l.shadow : null;` (the text and `place`/`keepOff` lines then use `sh` as now), with the comment "Your own shadow, with the guides: long across the ground while the Sun is low."
- the level horizon's name: replace the `levelY` lines with

```ts
      // The level horizon's name, with the guides, where the renderer finds the line clear of the hills (16.3).
      place(levelRef.current, guide && l.level ? l.level : null);
      offBody(levelRef.current);
```

- the star names: `const nameShown = starNamesShown(l.stars, starsNamed(guide, nightRef.current, v.pitch));`
- the compass: after the `trackRef` line,

```ts
      // The letters ride with the ticks and fade whole near the strip's ends.
      const shift = STRIP_W / 2 - (v.yaw + 360) * PX_PER_DEG;
      if (lettersRef.current) lettersRef.current.style.transform = `translateX(${shift}px)`;
      for (const n of letterRefs.current) {
        if (!n) continue;
        const o = String(letterFade(Number(n.dataset.at) + shift, n.offsetWidth / 2));
        if (n.style.opacity !== o) n.style.opacity = o;
      }
```

- the paths' names and days: just before `const named = PATHS.map(`,

```ts
      // Each body's own room: its label grown by OWN_CLEAR, which its path's name and days keep clear of (16.3).
      const zones: Partial<Record<'sun' | 'earth', Rect>> = {};
      for (const [k, node] of [['sun', sunRef.current], ['earth', earthRef.current]] as const) {
        if (!node || node.hidden) continue;
        const b = node.getBoundingClientRect();
        if (b.width > 0) zones[k] = inflate(b, OWN_CLEAR);
      }
```

  In `named`, take the name only with the guides: `n = guide ? (l.pathNames?.find((p) => p.body === k) ?? null) : null`. Then `const pathNamed = chipsShown(clearOfOwn(named, PATHS.map(([k]) => k), zones), shownLabels);`.
  Replace the days' block with:

```ts
      const marks = guide ? (l.marks ?? []) : [];
      const chips = pathRefs.current.map((node, k) => {
        const m = marks[k];
        if (!m) {
          if (node) node.hidden = true;
          return null;
        }
        keepOff(node, m, place(node, m), body, taken);
        return node && !node.hidden ? node.getBoundingClientRect() : null;
      });
      chipsShown(clearOfOwn(chips, pathRefs.current.map((_, k) => scene.marks?.[k]?.body), zones), taken).forEach((on, k) => {
        const node = pathRefs.current[k];
        if (node && !on) node.hidden = true;
      });
```

6. The markup:
- `LABEL`: `bg-black/75` becomes `bg-black/90`, and so do the pointers' spans, your shadow's span and the parts' name spans (`bg-black/75` to `bg-black/90` in each class string).
- the phone's facing chip: add `data-plate=""` to the `<p ref={facingPhoneRef} …>`.
- the strip's inner `<div className="relative h-8" style={{ maskImage… }}>` becomes:

```tsx
        <div className="relative h-8">
          {/* The ticks fade at the strip's ends; the letters fade whole (letterFade), so none is cut. */}
          <div className="absolute inset-0" style={{ maskImage: STRIP_FADE, WebkitMaskImage: STRIP_FADE }}>
            <div ref={trackRef} className="absolute inset-y-0 left-0" style={{ transform: `translateX(${STRIP_W / 2 - (startYaw + 360) * PX_PER_DEG}px)` }}>
              {TICKS.filter((d) => (((d % 360) + 360) % 360) % 45 !== 0).map((d) => (
                <i key={d} className="absolute bottom-1 h-2 w-px bg-white/45" style={{ left: (d + 360) * PX_PER_DEG }} />
              ))}
            </div>
          </div>
          <div ref={lettersRef} className="absolute inset-y-0 left-0" style={{ transform: `translateX(${STRIP_W / 2 - (startYaw + 360) * PX_PER_DEG}px)` }}>
            {TICKS.filter((d) => (((d % 360) + 360) % 360) % 45 === 0).map((d, k) => (
              <span
                key={d}
                data-point=""
                data-at={(d + 360) * PX_PER_DEG}
                ref={(node) => {
                  letterRefs.current[k] = node;
                }}
                className="absolute top-1 -translate-x-1/2 text-[14px] font-semibold"
                style={{ left: (d + 360) * PX_PER_DEG, opacity: letterFade(STRIP_W / 2 + (d - startYaw) * PX_PER_DEG, 6) }}
              >
                {POINT[(((d % 360) + 360) % 360) / 45]}
              </span>
            ))}
          </div>
        </div>
```

7. The component's comment: add "With `guides` off, only the Sun, Earth and the lander are named (and its parts when zoomed in), with the pointers; the paths, their days and names, the level horizon, the star names at night and your shadow come with the guides (16.2)."

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/components/stand --maxWorkers=2`
Expected: PASS, the canvas's tests and the page's (the page passes no `guides` yet, so the canvas shows them, as before).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/stand/StandCanvas.tsx web/src/components/stand/StandCanvas.test.ts
git commit -m "feat(web): the stand view's canvas takes the guides, keeps each body's labels apart, and fades the compass letters whole"
```

### Task 5: The page: the status, the card under More, Guides and the compact row

**Files:**
- Modify: `web/src/components/stand/StandView.tsx`
- Test: `web/src/components/stand/StandView.test.tsx`

**Interfaces:**
- Consumes: `statusLine` (Task 1), `standLander(series, power, tall, hour)` (Task 2), `StandCanvas`'s `guides` prop (Task 4).

- [ ] **Step 1: Write the failing tests**

In `StandView.test.tsx`:

1. Add a helper after `open`:

```tsx
/** Opens today's card under the status line. */
const openCard = () => fireEvent.click(screen.getByRole('button', { name: 'More' }));
```

2. Replace the first test ("marks the key moments’ days … hides both with the words") with:

```tsx
  it('opens with the guides off, shows the days on the paths and the level horizon on "Guides", and hides them with the words', async () => {
    window.history.replaceState(null, '', '/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const store = createExploreStore(fileLoaders());
    const setGuides = vi.fn();
    let scene: StandScene | null = null;
    render(
      <StandView
        store={store}
        createRenderer={(_canvas, sc) => {
          scene = sc;
          return { ...stub(), setGuides, labels: () => ({ ...everywhere, level: { x: 0.2, y: 0.5, visible: true }, marks: (sc.marks ?? []).map((m, k) => ({ text: m.text, x: 0.25 + 0.15 * k, y: 0.3, visible: true })) }) };
        }}
      />,
    );
    const guides = await screen.findByRole('button', { name: 'Guides' }, { timeout: 20_000 });
    // Off when the view opens: the renderer leaves out the paths and the level horizon, and keeps the rings.
    expect(guides.getAttribute('aria-pressed')).toBe('false');
    await waitFor(() => expect(setGuides).toHaveBeenLastCalledWith(false, true, true));
    expect(document.querySelectorAll('[data-path-mark]:not([hidden])')).toHaveLength(0);
    expect(screen.getByText('Level horizon').closest('[hidden]')).not.toBeNull();
    fireEvent.click(guides);
    expect(screen.getByRole('button', { name: 'Guides' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(setGuides).toHaveBeenLastCalledWith(true, true, true));
    await waitFor(() => expect(document.querySelectorAll('[data-path-mark]:not([hidden])').length).toBeGreaterThan(0));
    // The Sun sets behind the hills on 3 January and rises on the 20th; Earth rises on the 10th and sets on the 23rd.
    const marks = (scene! as StandScene).marks!;
    expect(marks.filter((m) => m.body === 'sun').map((m) => m.text)).toEqual(['Sunset, 3 Jan', 'Sunrise, 20 Jan']);
    expect(marks.filter((m) => m.body === 'earth').map((m) => m.text)).toEqual(['Earth rises, 10 Jan', 'Earth sets, 23 Jan']);
    expect([...document.querySelectorAll('[data-path-mark]')].map((n) => n.textContent)).toEqual(marks.map((m) => m.text));
    expect(screen.getByText('Level horizon').closest('[hidden]')).toBeNull();
    // Hidden with the words, the rings too; back as they were, the card and the guides with them.
    openCard();
    fireEvent.click(screen.getAllByRole('button', { name: 'Hide the words' })[0]);
    await waitFor(() => expect(setGuides).toHaveBeenLastCalledWith(false, true, false));
    await waitFor(() => expect(document.querySelectorAll('[data-path-mark]:not([hidden])')).toHaveLength(0));
    fireEvent.click(screen.getByRole('button', { name: 'Show the words' }));
    await waitFor(() => expect(setGuides).toHaveBeenLastCalledWith(true, true, true));
    expect(screen.getByRole('button', { name: 'Guides' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Less' })).toBeTruthy();
  }, 30_000);
```

3. Replace the test "opens on the site, period and hour of the address, with a short answer over the view…" with:

```tsx
  it('opens with one line on the lander’s power and radio, the site first, and today’s card under More', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    // The lander stands once the ground has loaded, a moment after the words: on a busy machine, later.
    await screen.findByRole('button', { name: 'Face the lander' }, { timeout: 20_000 });
    const st = store.getState();
    expect(st.cursorHour).toBe(10);
    // The headline is the page's heading for screen readers while the card is folded; both verdicts, each span on one line.
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Landing on 1 January: power for 3 days 4 hours, no radio contact, then 16 days without power');
    expect(h1.classList.contains('sr-only')).toBe(true);
    // One line: the site's name (one line, waiting on a phone), then the lander's power, its battery's level and its radio.
    const line = statusLine(st.series!, st.power, st.startUtc, 10, st.params.power.batteryWh);
    expect(line.text).toMatch(/^Power on, battery 100 %\. No radio: Earth is (below the horizon|behind a hill)\.$/);
    const status = screen.getByText(asRead(line.text));
    expect(status.closest('[data-plate]')!.querySelector('[data-tone]')!.getAttribute('data-tone')).toBe('power');
    const name = within(status).getByText(/^de\sGerlache\sRim\s2\.$/);
    expect(name.classList.contains('max-md:hidden')).toBe(true);
    expect(document.body.textContent).toContain('de Gerlache Rim 2');
    // One row of buttons.
    const row = screen.getByRole('group', { name: 'Look towards' });
    expect([...row.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Sun', 'Earth', 'Lander', 'Look up', 'Guides', 'Hide words']);
    expect(within(row).getByText('Face')).toBeTruthy();
    for (const name of ['Face the Sun', 'Face Earth', 'Face the lander', 'Look up', 'Guides', 'Hide the words']) expect(screen.getByRole('button', { name })).toBeTruthy();
    // Today's card waits under More: where you stand, what to watch, the better day, the ways on and the help.
    expect(screen.queryByText(watchNext(st.series!, st.power, st.startUtc, 10))).toBeNull();
    expect(screen.queryByRole('link', { name: 'Back to the forecast' })).toBeNull();
    const more = screen.getByRole('button', { name: 'More' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    openCard();
    expect(screen.getByRole('button', { name: 'Less' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/^Standing at de\sGerlache\sRim\s2, near the Moon's south pole\. (Hills: NASA height data|Ground drawn flat: no NASA heights here)\. Small craters and rocks: added to look real\.$/)).toBeTruthy();
    expect(screen.getByText(watchNext(st.series!, st.power, '2027-01-01T00:00:00', 10))).toBeTruthy();
    const better = screen.getByRole('link', { name: /^Try 20 January instead: power for 12\sdays\s15\shours, radio for 3\sdays\s5\shours$/ });
    expect(better.textContent).toBe('Try 20 January instead: power for 12 days 15 hours, radio for 3 days 5 hours');
    expect(better.getAttribute('href')).toMatch(/^\/explore\/stand\?site=de_gerlache_rim_2&start=2027-01-20/);
    expect(screen.getByRole('link', { name: 'Back to the forecast' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    expect(screen.getByText('Drag to look around; pinch or scroll to zoom.')).toBeTruthy();
    // The reasons wait under "Why this happens".
    expect(screen.queryByText(/^Near the Moon's south pole the Sun never climbs high/)).toBeNull();
    expect(screen.queryByText('How we know this')).toBeNull();
    expect(screen.getByRole('slider', { name: 'Time' })).toBeTruthy();
    // No chart above it here: the time bar carries the dates, the hours the lander is off, and those it can radio home.
    expect(screen.getByTestId('dates').querySelectorAll('[data-date]').length).toBeGreaterThan(3);
    expect(screen.getByText('lander off')).toBeTruthy();
    expect(screen.queryByText('radio contact')).toBeNull();
    expect(screen.getByText('radio, if it survives the night')).toBeTruthy();
    // The key moments are flags on the time bar.
    expect(screen.queryByRole('group', { name: 'Key moments' })).toBeNull();
    for (const m of keyMoments(st.series!, st.power, st.startUtc)) expect(screen.getByRole('button', { name: `${m.label}, ${m.day}` })).toBeTruthy();
    // The view opens 35 degrees left of the Sun, the Sun near its right edge: on the compass strip and the phone's note.
    expect(screen.getAllByText(`Facing ${compassWord((st.series!.sunAz[10] - 35 + 360) % 360)}`).length).toBe(2);
    await waitFor(() => expect(screen.getAllByText('N').length).toBeGreaterThan(0));
    for (const point of ['NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) expect(screen.getAllByText(point).length).toBeGreaterThan(0);
    expect(document.querySelector('.theme-dark')).toBeTruthy();
  });
```

4. Call `openCard();` right after `open(…)` in the tests "gives the reasons one at a time…", "lists all the reasons at once…", "keeps the links where they are…", "opens a site without polar terrain…", "falls back to the horizon chart, with the same words…" (before its "Why this happens" click), and "lands on the better day in place…" (after the heading appears). In the two `openWithTerrain` tests, call `openCard();` before reading the standing line.

5. The lander's place, by the opening hour:
- "turns the view at once, with no camera flight…": `const want = (store.getState().series!.sunAz[10] - 40 + 360) % 360;`
- "turns to the lander, which stands 40° to the left of the Sun at the landing…": rename to "turns to the lander, which stands 40° to the left of the Sun of the hour the view opened on (on a wide screen)", with `const want = (store.getState().series!.sunAz[10] - 40 + 360) % 360;`
- "keeps the lander where it landed, whatever hour the view opens on": replace with

```tsx
  it('places the lander by the hour the view opens on: at night on Earth, 22° to its left, so the narrower view holds both', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=219', () => r);
    const st = store.getState();
    expect(st.series!.sunFraction[219]).toBe(0);
    expect(st.series!.earthVisible[219]).toBe(1);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    const want = (st.series!.earthAz[219] - 22 + 360) % 360;
    const near = () => Math.abs(((r.setView.mock.calls.at(-1)![0] - want + 540) % 360) - 180) < 1;
    await waitFor(() => expect(near()).toBe(true), { timeout: 4000 });
  });
```

- "jumps to a key moment from its flag…": `const want = (st.series!.sunAz[10] - 40 + 360) % 360;`

6. Replace "folds a phone’s card to the headline, the lander’s line and the better day, with More for the rest (13.3)" with:

```tsx
  it('on a phone keeps the site’s name and the row’s "Hide words" for a wider screen, puts the row above the time bar, and "Hide the words" in the card', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    expect(screen.getByText(/^de\sGerlache\sRim\s2\.$/).classList.contains('max-md:hidden')).toBe(true);
    expect(screen.getByRole('button', { name: 'Hide the words' }).classList.contains('max-md:hidden')).toBe(true);
    expect(screen.getByRole('group', { name: 'Look towards' }).className).toMatch(/\bmax-md:fixed\b/);
    openCard();
    const inCard = screen.getAllByRole('button', { name: 'Hide the words' }).find((b) => b.classList.contains('md:hidden'))!;
    expect(inCard).toBeTruthy();
    // Button words on one line; the better day is a sentence, and wraps inside the card.
    expect(screen.getByRole('link', { name: /^Try 20 January instead/ }).className).not.toMatch(/\bwhitespace-nowrap\b/);
    expect(screen.getByRole('button', { name: /Why this happens/ }).className).toMatch(/\bwhitespace-nowrap\b/);
    expect(screen.getByRole('link', { name: 'Back to the forecast' }).className).toMatch(/\bwhitespace-nowrap\b/);
    // The card scrolls inside itself rather than run under the buttons and the time bar.
    expect(document.getElementById('stand-card')!.className).toMatch(/\boverflow-y-auto\b/);
    fireEvent.click(inCard);
    expect(screen.getByRole('button', { name: 'Show the words' })).toBeTruthy();
  });
```

7. Replace "keeps one card whatever the view does…" with:

```tsx
  it('keeps the card open and the same whatever the view does', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const st = store.getState();
    openCard();
    const watch = watchNext(st.series!, st.power, st.startUtc, 10);
    expect(screen.getByText(watch)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Face the Sun' }));
    expect(screen.getByText(/^Standing at de\sGerlache/)).toBeTruthy();
    expect(screen.getByText(watch)).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Try 20 January instead/ })).toBeTruthy();
    expect(screen.getByText(asRead(statusLine(st.series!, st.power, st.startUtc, 10, st.params.power.batteryWh).text))).toBeTruthy();
  });
```

8. Replace "names your own shadow and its length while the Sun is up" with:

```tsx
  it('names your own shadow and its length with the guides, and leaves it out without them', async () => {
    const r = stub();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.render).toHaveBeenCalled());
    expect(screen.getByText(/^Your shadow/).hidden).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Guides' }));
    // With the height it is worked out for, so a reader can check the Sun's height from it.
    await waitFor(() => expect(screen.getByText('Your shadow, about 52 m long (you are 1.8 m tall)').hidden).toBe(false));
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/components/stand/StandView.test.tsx --maxWorkers=2`
Expected: FAIL. There is no Guides button, no More on a wide screen, the card is open by default and the lander stands by hour 0.

- [ ] **Step 3: Write the implementation**

In `StandView.tsx`:

1. Constants: delete `Short`'s use on the Face buttons (keep `Short` for "Look ahead"); add

```ts
/** A toggle pressed: light, as the mockup has it; its words never change with its state (aria-pressed says it). */
const PRESSED = 'aria-pressed:border-[#f2f0ea] aria-pressed:bg-[#f2f0ea] aria-pressed:text-[#07080a] aria-pressed:hover:bg-[#f2f0ea]';
```

2. State: `const [guides, setGuides] = useState(false);` with the comment "The guides (16.2): off when the view opens; the month's paths, their days, the level horizon, the star names at night and your shadow." Change `cardOpen`'s comment to "Today's card under the status line, on every screen (16.2): the headline, what to watch, the better day, the reasons and the ways on." In `land`, add `setCardOpen(false);`.

3. The lander: `const lander = s.power ? standLander(s.series, s.power, tall(), openHour) : undefined;` with the comment "Where it landed, placed by the hour the view opens on, so the opening view holds it (16.3)." (The `scene` memo already depends on `openHour`.) Rename the variable to `landed` if it clashes with the status line's `lander` (it does not: the memo has its own scope).

4. Replace the whole `{!wordsHidden && (<div className="pointer-events-none fixed inset-x-4 top-4 …">…</div>)}` block with:

```tsx
      {!wordsHidden && (
        <div className="pointer-events-none fixed inset-x-4 top-4 flex flex-col items-start gap-3 md:flex-row md:justify-between">
          {/* One line on the lander's power and radio, with More for today's card (16.2). */}
          <section ref={topRef} aria-label="The answer for this site" className="pointer-events-none grid w-full min-w-0 justify-items-start gap-2 md:flex-1">
            {/* The page's heading at all times, for screen readers; the card shows it when it is open. */}
            <h1 className="sr-only">{title}</h1>
            <div data-plate="" className={`${PLATE} pointer-events-auto flex w-full max-w-[860px] items-start gap-3 px-3.5 py-1.5 md:w-fit md:px-4`}>
              <i aria-hidden="true" data-tone={lander.tone} className={`mt-[13px] h-3 w-3 shrink-0 rounded-full ${TONE[lander.tone]}`} />
              <p className="min-w-0 flex-1 py-2 text-[15px] leading-snug md:text-base">
                <span className="text-[#c3bfb6] max-md:hidden">{oneLine}. </span>
                {lander.text}
              </p>
              <button type="button" aria-expanded={cardOpen} className="flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap text-[15px] underline underline-offset-4" onClick={() => setCardOpen((o) => !o)}>
                {cardOpen ? 'Less' : 'More'}
                <span aria-hidden="true" className="no-underline">
                  {cardOpen ? '▴' : '▾'}
                </span>
              </button>
            </div>
            {cardOpen && (
              <div
                id="stand-card"
                data-plate=""
                className={`${PLATE} pointer-events-auto grid w-full max-w-[560px] gap-2 overflow-y-auto p-3.5 [scrollbar-color:rgba(255,255,255,0.25)_transparent] [scrollbar-width:thin] md:max-h-[calc(100dvh-var(--bar-h,185px)-120px)] md:gap-2.5 md:p-5 max-md:max-h-[calc(100dvh-var(--bar-h,211px)-var(--look-h,52px)-140px)]`}
              >
                <p className="text-[14px] text-[#c3bfb6] md:text-[15px]">{standingLine(site, oneLine, 'top', flat)}</p>
                {/* The headline as the eye reads it; the heading above says it for screen readers. */}
                <p aria-hidden="true" className="display text-pretty text-[18px] font-bold leading-tight sm:text-[22px]">
                  {title}
                </p>
                <p className="text-[14px] text-[#f6d48a] md:text-[15px]">{watchNext(series, power, s.startUtc, hour)}</p>
                {better && (
                  // The better day, on a row of its own, so the links below never move.
                  <div>
                    <a
                      href={better.href}
                      onClick={(e) => {
                        e.preventDefault();
                        land(better.startUtc, better.href);
                      }}
                      className={`${LOOK.replace('whitespace-nowrap ', '')} inline-flex items-center border-[#f6d48a]/55 text-[#f6d48a]`}
                    >
                      {better.label}
                    </a>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                  {/* Named for what it holds whether open or not, so the way back beside it stays put. */}
                  <button
                    type="button"
                    className="flex min-h-10 items-center gap-1.5 whitespace-nowrap text-[15px] underline underline-offset-4"
                    aria-expanded={more}
                    onClick={() => {
                      setMore((m) => !m);
                      setPage(0);
                    }}
                  >
                    Why this happens
                    <span aria-hidden="true" className="no-underline">
                      {more ? '▴' : '▾'}
                    </span>
                  </button>
                  <Link href={exploreHref(site.id, s.startUtc, s.days)} className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4">
                    Back to the forecast
                  </Link>
                  {/* On a phone the row above the time bar has no room for it: it waits here. */}
                  <button type="button" className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4 md:hidden" onClick={() => setWordsHidden(true)}>
                    Hide the words
                  </button>
                </div>
                {more && reasons.length > 0 && (
                  /* the reasons' block, moved here unchanged from the old card */
                )}
                <p className="text-[14px] text-[#c3bfb6]">Drag to look around; pinch or scroll to zoom.</p>
              </div>
            )}
          </section>
          {!failed && (
            // One compact row: at the top right on a wide screen, just above the time bar on a phone, where "Hide words"
            // waits in the card.
            <div
              ref={lookRef}
              data-plate=""
              role="group"
              aria-label="Look towards"
              className={`${PLATE} pointer-events-auto flex shrink-0 items-center gap-1.5 p-1.5 max-md:fixed max-md:inset-x-0 max-md:bottom-[var(--bar-h,211px)] max-md:justify-between max-md:gap-1 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:bg-[#1e1e1e] max-md:px-3 max-md:[&>button]:px-2 max-md:[&>button]:text-[14px]`}
            >
              <span className="pl-1 pr-0.5 text-[14px] text-[#c3bfb6] md:text-[15px]">Face</span>
              <button type="button" aria-label="Face the Sun" className={LOOK} onClick={() => face(series.sunAz[hour], series.sunEl[hour] - 2, 46)}>
                Sun
              </button>
              <button
                type="button"
                aria-label="Face Earth"
                className={LOOK}
                onClick={() => {
                  face(series.earthAz[hour], series.earthEl[hour], 16);
                  setCaption(viewCaption('earth', site.lat));
                }}
              >
                Earth
              </button>
              {scene?.lander && (
                <button
                  type="button"
                  aria-label="Face the lander"
                  className={LOOK}
                  onClick={() => {
                    faceLander();
                    setCaption(landerCaption(site.lat, panelBackSeen));
                  }}
                >
                  Lander
                </button>
              )}
              {/* The "Face" buttons end here: what follows is not a way to face. */}
              <i aria-hidden="true" className="h-7 w-px shrink-0 bg-white/25" />
              {lookingUp ? (
                <button type="button" aria-label="Look ahead" className={LOOK} onClick={() => face(series.sunAz[hour], 0.5, 60)}>
                  <Short short="Ahead" long="Look ahead" />
                </button>
              ) : (
                <button type="button" aria-label="Look up" className={LOOK} onClick={lookUp}>
                  Look up
                </button>
              )}
              <button type="button" aria-pressed={guides} className={`${LOOK} ${PRESSED}`} onClick={() => setGuides((g) => !g)}>
                Guides
              </button>
              <button type="button" aria-label="Hide the words" className={`${LOOK} max-md:hidden`} onClick={() => setWordsHidden(true)}>
                Hide words
              </button>
            </div>
          )}
        </div>
      )}
```

The reasons' block (`{more && reasons.length > 0 && (<div className="grid gap-2 border-t …">…</div>)}`) moves into the card unchanged; the placeholder comment above marks where it goes, and must not stay in the code.

5. Pass the guides to the canvas: `guides={guides}` on `<StandCanvas …>`.

6. The component's comment: replace "Over the view, one card that keeps its shape: …" up to "A key moment, chosen from its flag" with "Over the view (16.2), one line on the lander's power and radio with More, which opens today's card: where you stand, the headline (the page's heading at all times), what to watch next, the better landing day, "Why this happens" (where the site lies, why the light and the sky look as they do, the pole first, the radio story and how we know, one reason at a time or all as one list) and the way back. One row of buttons faces the Sun, Earth or the lander, looks up, shows the guides and hides the words; on a phone it sits above the time bar, and "Hide the words" waits in the card. A key moment, chosen from its flag".

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/components/stand src/lib/viz --maxWorkers=2`
Expected: PASS.

Then the gates: `cd web && npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Ledger the ruling on the Sun's path at night, and commit**

Ledger line: `Task 5: Ruling: the Sun's path drawn solid at night (15.3) is answered by the default, not changed — with Guides off when the view opens no path shows, and with Guides on the path is the month's, as its name says — cost if wrong: a reader who turns Guides on at night may again read the solid path as the Sun being up.`

```bash
git add web/src/components/stand/StandView.tsx web/src/components/stand/StandView.test.tsx
git commit -m "feat(web): the stand view opens on the Moon: one status line with More, Guides off, one compact row, the lander in frame"
```

### Task 6: The arrival: labels under the plated words, and its two phrases

**Files:**
- Modify: `web/src/components/home/ArrivalCanvas.tsx`
- Test: `web/src/components/home/ArrivalCanvas.test.tsx`

**Interfaces:**
- Produces: `lightWords(series, hour)` returns `'night, in blue Earthlight (picture brightened)'` with Earth in view; the night chip reads "Ground at night: the Sun is below the horizon". Labels give way only to words with no plate (`[data-words]:not([data-plate])`) and to each other; the date's bar still gives way to all words.

- [ ] **Step 1: Write the failing tests**

In `ArrivalCanvas.test.tsx`:
- change `'Night, lit only by Earthlight (picture brightened)'` to `'Night, in blue Earthlight (picture brightened)'`;
- change every `'Night here: the Sun is below the horizon'` to `'Ground at night: the Sun is below the horizon'`, and `startsWith('Night here')` to `startsWith('Ground at night')`;
- rename the test "says over the pole’s dark side that it is night there…" to "says over the pole’s dark side that it is ground at night, across from the Sun, so it is not read as space".

Add after the phone's night test:

```tsx
  it('keeps a label in place under a beat’s plate as the page scrolls, and gives way to words with no plate (part C read 1)', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    // A beat's sentence on its plate, over the night's name.
    const words = document.createElement('p');
    words.setAttribute('data-words', '');
    words.setAttribute('data-plate', '');
    words.textContent = 'At the south pole the Sun never climbs.';
    document.body.appendChild(words);
    const NIGHT = { left: 400, top: 400, right: 700, bottom: 430 };
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const el = this as HTMLElement;
      const b = el === words || el.textContent?.startsWith('Ground at night') ? NIGHT : this.tagName === 'CANVAS' ? { left: 0, top: 0, right: 1000, bottom: 1000 } : { left: 0, top: 0, right: 0, bottom: 0 };
      return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON: () => b } as DOMRect;
    });
    try {
      render(<ArrivalCanvas progress={{ current: 1.25 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
      const night = await screen.findByText('Ground at night: the Sun is below the horizon');
      // Under the plate it stays, whole, as the plate passes over it.
      await waitFor(() => expect(night.hidden).toBe(false));
      await new Promise((res) => setTimeout(res, 300));
      expect(night.hidden).toBe(false);
      // The same words without a plate would show through it: it gives way.
      words.removeAttribute('data-plate');
      await waitFor(() => expect(night.hidden).toBe(true));
    } finally {
      rect.mockRestore();
      words.remove();
    }
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/components/home/ArrivalCanvas.test.tsx --maxWorkers=1`
Expected: FAIL. The texts differ, and the night's name hides under the plate.

- [ ] **Step 3: Write the implementation**

In `ArrivalCanvas.tsx`:

1. `lightWords`: `return series.earthVisible[hour] === 1 ? 'night, in blue Earthlight (picture brightened)' : 'night (picture brightened)';`, and in its comment say that the ground looks blue in Earthlight (16.3).

2. The night chip's text: `Ground at night: the Sun is below the horizon`.

3. Beside `let words: DOMRect[] = [];` declare `let bare: DOMRect[] = [];`, and change the comment above them to:

```ts
    // The words on the screen (marked data-words), and the labels already placed this frame. Words on a plate (the
    // beats' sentences, data-plate) pass over the labels, which stay where they are under them: a label never switches
    // off for a quarter screen as a plate goes by (part C read 1). Words with no plate (the first screen's headline over
    // the Moon) would show through a label, so the labels give way to those (`bare`); the date's bar to all of them.
```

4. Where `words` is collected each labels pass, collect both:

```ts
      const shownWords = [...document.querySelectorAll<HTMLElement>('[data-words]')].filter((w) => Number(w.style.opacity || 1) >= 0.25);
      const boxOf = (w: HTMLElement) => w.getBoundingClientRect();
      words = shownWords.map(boxOf).filter((b) => b.width > 0 && b.height > 0);
      bare = shownWords.filter((w) => !w.hasAttribute('data-plate')).map(boxOf).filter((b) => b.width > 0 && b.height > 0);
```

5. In `show`, in `point`, in the night block and in `named`, replace `meets(b, words)` with `meets(b, bare)`. The date's bar keeps `meets(b, words)`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/components/home src/lib/viz/words.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/home/ArrivalCanvas.tsx web/src/components/home/ArrivalCanvas.test.tsx
git commit -m "feat(web): the arrival's labels stay under the beats' plates instead of blinking, and name the ground at night and the blue Earthlight"
```

### Task 7: Checks on the production build, and blind read D1

**Files:**
- Frames and scripts: `.playwright-mcp/readD1/` (gitignored) and the job folder.

- [ ] **Step 1: The suite and the gates**

Run: `cd web && npx vitest run --maxWorkers=2 > "$CLAUDE_JOB_DIR/tmp/d1-suite.txt" 2>&1; tail -5 "$CLAUDE_JOB_DIR/tmp/d1-suite.txt"; npx tsc --noEmit && npm run lint`
Expected: all files pass; no type or lint errors.

- [ ] **Step 2: The build, on a fresh host**

Free space first if needed: `df -h /c`; under 400 MB free, delete `web/.next/cache`.
Run: `cd web && npm run build`, then in the background `npx next start --port 3000 --hostname 0.0.0.0`.
Expected: the build succeeds; the server answers on `http://127.0.0.51:3000/`.

- [ ] **Step 3: Frames**

With Playwright MCP (`browser_run_code_unsafe`), on `http://127.0.0.51:3000/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=H`, wait for the `role="status"` element ("Building the ground…") to go, then 8 s more, and save to `.playwright-mcp/readD1/`:
- wide 1440 × 900: hours 10, 70, 219, 300 and 460 as they open; hour 10 with Guides on; hour 10 with More open; hour 219 with Guides on; hour 10 after "Face the lander";
- phone 390 × 844: hours 10 and 219 as they open; hour 10 with More open; hour 219 with Guides on;
- the arrival on `/` at 1440 × 900, its frames 03 to 08 at quarter screens (as read C1 took them), and on a phone its beats 1 to 3.

Restart the browser (`browser_close`) between the stand view's frames and the arrival's if the ground stops drawing.

- [ ] **Step 4: Measurements**

In the same pages, for each frame: no sideways scroll (`document.documentElement.scrollWidth <= innerWidth`); every visible text element's computed font size at least 13 px; text contrast against its plate at least 4.5:1 (the part C measure script); on the phone, `(row.top - section.bottom) / innerHeight >= 0.55`, with `row` the "Look towards" group and `section` the "The answer for this site" region; the status plate's height at 1440 px in its longest state (hour 600 of a 30-day period from 2027-01-01 gives "Power on again since…") at most two lines (`height <= 2 * lineHeight + padding`).
Expected: all pass. Record the numbers in the ledger.

- [ ] **Step 5: Blind read D1**

Dispatch two subagents (most capable model), a hackathon judge and a secondary-school science teacher, each given only the frames and the brief used in read C1 (the product in one sentence; score purpose, next step, look, room, readability and immersion from 1 to 5; name what confused them; one change). They never see the code, the spec or this plan.
Gate (13.2): purpose, next step and look at 4 or more, room and readability at 3 or more, immersion at 4, from both.
- Pass: one bounded pass on what both readers name that is clear, small and in D1's scope, with no further read (as parts B and C did).
- Fail: one bounded pass on what both name, then a second read, D1-2; after it, rule (as parts A and B did).

Ledger each read's scores and named items.

- [ ] **Step 6: Stop the server**

TaskStop the server, then free port 3000 (`Get-NetTCPConnection -LocalPort 3000 | % { Stop-Process -Id $_.OwningProcess -Force }`).

### Task 8: The spec as built, the ledger, the badge, the final review, and the pull request

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-immersive-space-design.md` (16.6 as built, 16.7 the reads)
- Modify: `web/public/validation/tests.json`
- Create: `docs/superpowers/plans/2026-10-05-immersive-d1-stand-view.ledger.md` (copy of the workspace ledger)

- [ ] **Step 1: The spec as built**

Add "16.6 Where it differs from 16.2 to 16.4", with every ruling of the ledger in a line each, and "16.7 The blind read", with the table of the read (or reads) in 13.2's form and the ruling.

- [ ] **Step 2: The badge**

From the suite's last run, write the web counts (files, tests) into `web/public/validation/tests.json`, keeping the pipeline's 131 and the date (`generated_utc`, now). Run: `cd web && npx vitest run src/components/ValidateView.test.tsx --maxWorkers=2`. Expected: PASS.

- [ ] **Step 3: The final review**

Run `review-package` for this plan from the branch's base (`git merge-base main HEAD`) to `HEAD`, and dispatch the reviewer on the most capable model with the package, this plan's path, the spec's path, this plan's Review Focus section verbatim, and the ledger's `Ruling:` lines. Re-grade its findings by effect. Fix Critical and Important ones in one pass, each test RED then GREEN, then the whole suite. Ledger the minors as deferred.

- [ ] **Step 4: Commit, push and open the pull request**

```bash
git add docs/superpowers/specs/2026-10-02-immersive-space-design.md docs/superpowers/plans/2026-10-05-immersive-d1-stand-view.ledger.md web/public/validation/tests.json
git commit -m "docs: spec 16 as built for D1, with its blind read, the ledger and the test badge"
git push -u origin feat/immersive-d
gh pr create --base main --title "Part D1: the stand view gives the Moon the screen" --body-file <body file>
```

The body lists what changed, the read's scores, the rulings and the deferred minors, and ends with the session's attribution lines.

- [ ] **Step 5: Merge on green**

Poll the check runs until "GitGuardian Security Checks" completes with success. Then run `gh pr merge N --merge`, `git checkout main` and `git pull`. Delete the plan's workspace directory. Update the project memory (D1 merged; D2 next).
