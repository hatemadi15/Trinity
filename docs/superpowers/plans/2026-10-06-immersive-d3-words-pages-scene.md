# Part D3: The Words, the Pages and the Scene, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec section 18: the puzzling phrases explained or dropped; the verdict on every screen with the radio on the desktop's button and the better day on a phone's first screen; a status plate that keeps its width; the caption docked on the compass's plate with its dots named; the tablet's flags laid out by their measured widths in up to three rows; the lander's feet clear of the time bar after Turn to Lander; Skip clear of a phone's first words; a brighter picture for projectors; the visitor's own lander from the stand view; the arrival's frame rate back to D1's; a key light at night; the daytime blotches halved; a hill in the opening frame.

**Architecture:** Words live in `web/src/lib/viz/stand.ts` (the stand view's lines), `lib/viz/shadowmap.ts` (the map's labels), `lib/viz/arrival.ts` and `components/home/Arrival.tsx` (the home page). The time bar's flags are laid out by `momentRows` in `components/explore/TimeBar.tsx`, which gains measured widths and a third row. The stand view (`components/stand/StandView.tsx`) owns the plate, the chip, the card's new toggle and link, and docks its caption on the compass's plate, which `components/stand/StandCanvas.tsx` draws with a key row; the canvas also fits the lander's feet after Turn to Lander. The renderer (`lib/sky/standRenderer.ts`) gains `setBright` and a night key light; the ground shader (`lib/sky/shaders.ts`) halves its blotches; `lib/viz/standOpening.ts` turns the opening towards a hill. The arrival's frame-time fix lands in `lib/sky/groundLevels.ts` or `lib/sky/shadowRule.ts` as the prototype measured it. No computed number changes (spec 11).

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, vitest with jsdom and Testing Library, three.js 0.186; the capture harness in the job folder (`cdp.py`, `d2cap.py`, `d2frames.py`) with headless Chrome.

**Spec:** `docs/superpowers/specs/2026-10-02-immersive-space-design.md`, section 18 (part D3), with 17.9 (the asks), 16.3 and 16.5 (the opening and the phone's band), 15.1 (the measurements), 13.2 (the gate). The mockup was published to the user on 6 October 2026 (`.playwright-mcp/mock_d3/index.html`, sources in the job folder `mock_d3/`); the scene prototype's numbers are in the job folder `mock_d3/proto/NOTES.md`.

## Scope

This plan covers D3 (spec 18). Of what read D2-2 left (17.9), everything but what 18.1 sets aside: the night's brightness as a switch, a shorter fly-down, the lander's shadow seam.

## Global Constraints

- Gates from `web/`: `npx vitest run --maxWorkers=2` (8 GB laptop), `npx tsc --noEmit`, `npm run lint`, `npm run build`. Pipeline untouched.
- Spec 2: "One gold action per screen; gold is the Sun, blue is Earth, green and red are the power verdict." The phone's chip is its screen's one gold action; the row's gold button is the desktop's.
- Spec 2: "No text under 14 px, controls at least 40 px tall, standalone links underlined, reduced motion respected." The chip is a link in a plate, 32 px tall, 14 px type (18.3): the one control under 40 px, by the spec's own rule.
- Spec 8: "Keyboard: arrows look, `+`/`-` zoom, space plays, the look buttons are buttons; focus is always visible."
- Spec 11: no change to a computed number. The shadow rule's CPU twin and its agreement with the engine stay as they are.
- Spec 18.5: no sideways scroll, no text under 13 px, no text under 4.5:1; the phone's scene band at least 55 % of the screen's height, measured from the chip's foot; the arrival's 95th-percentile frame under 50 ms on the laptop; the blind read's gate of 13.2.
- Captions over the view keep to 112 characters (`stand.test.ts` checks every one).
- The ground shader's compile runs short of memory on this laptop: no loop may be unrolled, and no function with a loop gains a second call site.
- Memory: one production build, one server and one headless Chrome at a time; a build only with 2 GB free (`(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB`); the harness reaps background shells under memory pressure, so builds, probes and captures run in the foreground.
- Screens are checked on a fresh loopback host (`127.0.0.53:3000` and up; never `localhost` or `127.0.0.1`), on the production build. Delete `web/.next/cache` after each build.
- Secrets: never read, print or copy `web/.env.local`; no calls to OpenRouter or any paid API in tests, reads or reviews.
- Subagents work in this checkout on their own files only, run only their own test files (`npx vitest run <files> --maxWorkers=1`), and commit with `git add <their files>`. If `git commit` reports `index.lock`, wait two seconds and try again. Never `git stash`, never `git checkout --` a file that is not theirs.
- Commits end with the attribution lines given in the session; one pull request for D3, merged after GitGuardian passes (`gh pr merge N --merge`).

## Review Focus

1. **A period with no better day** (a landing that already gets the best of the month): the row's gold is Compare sites, the phone shows no chip and its band is measured without it, and no "undefined" or empty link appears. Tested in Task 4.
2. **Flags crowded past three rows** (six moments within a week on a 538 px track): the layout with the fewest faults, no exception, no flag off the track, the bar's height still the rows'. Tested in Task 2.
3. **A site without a mask or a hill** (flat ground, the fallback chart): the opening yaw is the old one and nothing throws. Tested in Task 7.
4. **Brighter picture across a reload and a fallback** (session storage missing in a private window; the renderer that cannot start): the toggle still works for the visit and never throws. Tested in Tasks 4 and 5.
5. **The lander dialog in the dark theme** (the stand view is `theme-dark`): its controls readable, focus returns to Change lander on close, the verdict and the lander's line change with the lander. Tested in Task 4, measured in Task 10.

## File map

| File | Task | What changes |
|---|---|---|
| `web/src/lib/viz/stand.ts`, `stand.test.ts` | 1 | `skyLabel` names the hill's direction and says "up"; the night captions and the card's Earthlight line say "the picture is brightened so you can see it"; `WATCH_LEAD`, `WATCH_LEAD_DOTS`; `poleLine` with the thumb's width; `betterChip` |
| `web/src/lib/viz/shadowmap.ts`, `shadowmap.test.ts` | 1 | `heightWords` says "up" behind a hill |
| `web/src/components/explore/TimeBar.tsx`, `TimeBar.test.tsx` | 2 | the key's "if the lander survives the cold"; `momentRows` with measured widths and three rows; the flags measured after render |
| `web/src/components/stand/StandCanvas.tsx`, `StandCanvas.test.ts` | 3 | `pointerShort` for the new label; the compass plate's key row and its docking classes; `LookTarget.fit` keeps the lander's feet in sight after Turn to Lander |
| `web/src/lib/sky/standRenderer.ts`, `standRenderer.test.ts` | 5 | `setBright`; the night key light (`NIGHT.KEY`, `parts.keyLight`) |
| `web/src/lib/sky/shaders.ts`, `shaders.test.ts` | 6 | the 5 m blotch term halved |
| `web/src/lib/viz/standOpening.ts`, `standOpening.test.ts` | 7 | `hillShift`; `openingYaw` with the mask and the view's half-width |
| `web/src/components/stand/StandView.tsx`, `StandView.test.tsx` | 4 | the row's long gold button; the phone's chip; the plate's width; the caption docked; Paths; Open the full forecast; the watch-next lead; Change lander and the dialog; Brighter picture; the opening yaw with the mask; feet fit on Turn to Lander |
| `web/src/components/home/Arrival.tsx`, `Arrival.test.tsx`, `ArrivalCanvas.tsx`, `ArrivalCanvas.test.tsx`, `web/src/lib/viz/arrival.ts`, `arrival.test.ts` | 8 | Skip from the second screen on a phone; the intro's three sentences; Earth's label; the ridge named |
| `web/src/lib/sky/groundLevels.ts` or `shadowRule.ts` (+ tests), `shaders.ts` | 9 | the arrival's frame-time fix, as measured |
| `docs/superpowers/specs/2026-10-02-immersive-space-design.md`, `web/README.md`, `web/public/validation/tests.json` | 11 | spec 18 as built, the README, the badge |

## Waves

- **Wave 1 (parallel, subagents):** Task 1 (words), Task 2 (time bar), Task 8 (arrival). Each on its own files.
- **Wave 1 (main session, in order):** Task 5 (renderer), Task 6 (shader), Task 7 (opening), Task 3 (canvas), then Task 4 (view), which consumes 1, 3, 5 and 7.
- **Wave 2:** Task 9 (the frame-time fix, from the prototype's NOTES.md), Task 10 (checks and the blind read), Task 11 (docs, final review, PR).

---

### Task 1: The stand view's words (subagent)

**Files:**
- Modify: `web/src/lib/viz/stand.ts` (`skyLabel` lines 29–38, `watchNext` lines 142–170, `momentCaption` lines 273–300, `viewCaption` lines 323–333, `poleLine` lines 373–376, `whyLines` line 410, `betterLabel` lines 535–538)
- Modify: `web/src/lib/viz/shadowmap.ts:63–71`
- Test: `web/src/lib/viz/stand.test.ts`, `web/src/lib/viz/shadowmap.test.ts`

**Interfaces:**
- Consumes: `compassWord(azDeg)` from `@/lib/viz/ground` (eight points: "north", "north-east", … "north-west"); `dayMonth(startUtc, hour)` and `spanWords(hours)` from `@/lib/viz/format`.
- Produces: `skyLabel` strings of the forms `Sun behind a hill to the north-west, 1.6° up` and `Sun behind a hill to the north-west, on the horizon`; `export const WATCH_LEAD = 'Press Play, or a flag on the time bar, to watch:'`; `export const WATCH_LEAD_DOTS = 'Press Play, or a dot on the time bar, to watch:'`; `export function betterChip(dayShort: string, poweredHours: number): string`; the captions below.

- [ ] **Step 1: Write the failing tests**

In `stand.test.ts`, change the expectations of the three label tests at lines 56–81 to the new forms (the helper's azimuths are 300 for the Sun, "north-west", and 70 for Earth, "east"):

```ts
    expect(skyLabel('sun', s, 1)).toBe('Sun behind a hill to the north-west, 1.0° up');
    expect(skyLabel('earth', s, 1)).toBe('Earth behind a hill to the east, 1.2° up');
    // in 'gives the height of a body out of view':
    expect(skyLabel('sun', s, 0)).toBe('Sun behind a hill to the north-west, 0.4° up');
    expect(skyLabel('earth', s, 1)).toBe('Earth behind a hill to the east, 0.4° up');
    // in 'never gives a body out of view a height of 0.0°':
    expect(skyLabel('sun', s, 0)).toBe('Sun behind a hill to the north-west, on the horizon');
    expect(skyLabel('earth', s, 1)).toBe('Earth behind a hill to the east, on the horizon');
```

Add, after that test:

```ts
  it('names the hill that hides a body by its direction, as the ground panel does, and says "up", never "above the horizon" (read D2-2)', () => {
    const s = series({ sunEl: [1.6, 1.6], sunFraction: [0, 0], sunAz: [180, 225] });
    expect(skyLabel('sun', s, 0)).toBe('Sun behind a hill to the south, 1.6° up');
    expect(skyLabel('sun', s, 1)).toBe('Sun behind a hill to the south-west, 1.6° up');
    expect(skyLabel('sun', s, 0)).not.toMatch(/above the horizon/);
  });
```

Replace every `'Press Play or a moment on the time bar:'` in `stand.test.ts` with `${WATCH_LEAD}` (import `WATCH_LEAD`, `WATCH_LEAD_DOTS`, `betterChip` from `./stand`), and add:

```ts
  it('starts what to watch with Play and the flags, and has a lead for a phone, where the flags are dots', () => {
    expect(WATCH_LEAD).toBe('Press Play, or a flag on the time bar, to watch:');
    expect(WATCH_LEAD_DOTS).toBe('Press Play, or a dot on the time bar, to watch:');
  });
```

Change the caption constants at lines 731–733 and 217 and the `poleLine` expectations at 205 and 624–625:

```ts
  const earthlight = ' Only Earthlight lights the ground; the picture is brightened so you can see it.';
  const brightened = ' With no Sun or Earth in sight, the picture is brightened so you can see it.';
  const earthLight = 'At night only Earth lights the ground: sunlight bounced off Earth. The picture is brightened so the ground shows, and that light is why it looks blue.';
  const pole = "Near the Moon's south pole the Sun circles the sky once a month, never more than a few degrees above or below the horizon (two degrees is about a thumb's width at arm's length), so behind a low hill it can stay set for days.";
```

(and the north pole's line likewise). Add to the `viewCaption` tests:

```ts
  it('says the picture is brightened so you can see it, never "long exposure" (read D2-2)', () => {
    expect(viewCaption('dark', -88.28)).toBe('Neither the Sun nor Earth lights this ground; the picture is brightened so you can see it. No air, no twilight.');
    expect(viewCaption('faint', -88.28)).toBe('A thin crescent Earth gives this ground little light; the picture is brightened so you can see it.');
    expect(viewCaption('earthlight', -88.28)).toBe('Earthlight, sunlight bounced off Earth, tints this ground blue; the picture is brightened so you can see it.');
    for (const kind of ['dark', 'faint', 'earthlight'] as const) expect(viewCaption(kind, -88.28)).not.toMatch(/exposure/);
  });
```

Add to the better day's tests:

```ts
  it('gives a phone its chip: the day short, the power alone, each span on one line', () => {
    expect(betterChip('20 Jan', 303)).toBe(`Try 20 Jan instead: power for ${unbroken('12 days 15 hours')}`);
    expect(betterChip('2 Feb', 20)).toBe(`Try 2 Feb instead: power for ${unbroken('20 hours')}`);
  });
```

In `shadowmap.test.ts` lines 45–46:

```ts
    expect(heightWords('Sun', 2.4, 'yes')).toBe('Sun behind a hill, 2.4° up');
    expect(heightWords('Sun', 2.4, 'partly')).toBe('Sun partly behind a hill, 2.4° up');
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/lib/viz/stand.test.ts src/lib/viz/shadowmap.test.ts --maxWorkers=1`
Expected: FAIL on the label forms, the leads, the captions, the pole line, `betterChip` not exported, and the map's words.

- [ ] **Step 3: Implement**

`stand.ts`: import `compassWord` from `./ground` if not imported (`groundWords` is), and `dayMonth` is not needed (the view passes the short day). Then:

```ts
export function skyLabel(body: 'sun' | 'earth', s: Series, hour: number): string {
  const name = body === 'sun' ? 'Sun' : 'Earth';
  const el = body === 'sun' ? s.sunEl[hour] : s.earthEl[hour];
  const az = body === 'sun' ? s.sunAz[hour] : s.earthAz[hour];
  const shows = body === 'sun' ? s.sunFraction[hour] > 0 : s.earthVisible[hour] === 1;
  if (shows) return el >= 0.05 ? `${name} ${degrees(el)} up` : `${name}, on the horizon`;
  if (el < 0) return el > -0.05 ? `${name}, just below the horizon` : `${name}, ${degrees(-el)} below the horizon`;
  // Hidden by a hill while above the horizon: the hill named by its direction, as the ground panel names it, and
  // "up" rather than "above the horizon", which at night reads as the skyline (both readers of read D2-2); never
  // "up" and "set" at once (both readers, part C read 1).
  const hill = `behind a hill to the ${compassWord(az)}`;
  return el >= 0.05 ? `${name} ${hill}, ${degrees(el)} up` : `${name} ${hill}, on the horizon`;
}
```

```ts
/** What to watch next starts with Play and the flags on the time bar (18.2); a phone, where the flags are dots, says so. */
export const WATCH_LEAD = 'Press Play, or a flag on the time bar, to watch:';
export const WATCH_LEAD_DOTS = 'Press Play, or a dot on the time bar, to watch:';
```

and in `watchNext`, `const lead = WATCH_LEAD;`. The captions:

```ts
        : earth
          ? 'The battery runs out at night. Only Earthlight lights the ground; the picture is brightened so you can see it.'
          : 'The battery runs out at night. With no Sun or Earth in sight, the picture is brightened so you can see it.';
```

```ts
  if (kind === 'dark') return 'Neither the Sun nor Earth lights this ground; the picture is brightened so you can see it. No air, no twilight.';
  if (kind === 'faint') return 'A thin crescent Earth gives this ground little light; the picture is brightened so you can see it.';
  return 'Earthlight, sunlight bounced off Earth, tints this ground blue; the picture is brightened so you can see it.';
```

`whyLines`' Earthlight line: `'At night only Earth lights the ground: sunlight bounced off Earth. The picture is brightened so the ground shows, and that light is why it looks blue.'`. `poleLine`: `... never more than a few degrees above or below the horizon (two degrees is about a thumb's width at arm's length), so behind a low hill it can stay set for days.` Update the doc comments that say "long exposure" to say the picture is brightened. Add:

```ts
/**
 * The better landing day on a phone's first screen (18.3): the day short, as the flags write it ("20 Jan"), and the
 * power alone, each span on one line; today's card keeps the long form with the radio (betterLabel).
 */
export function betterChip(dayShort: string, poweredHours: number): string {
  return unbrokenSpans(`Try ${dayShort} instead: power for ${spanWords(poweredHours)}`);
}
```

`shadowmap.ts` lines 70–71: `${name} behind a hill, ${degrees(elDeg)} up` and `${name} partly behind a hill, ${degrees(elDeg)} up`, the comment saying "up" rather than "above the horizon" (18.2).

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/lib/viz/stand.test.ts src/lib/viz/shadowmap.test.ts src/lib/viz/ground.test.ts --maxWorkers=1`
Expected: PASS, every caption still at 112 characters or fewer.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/viz/stand.ts web/src/lib/viz/stand.test.ts web/src/lib/viz/shadowmap.ts web/src/lib/viz/shadowmap.test.ts
git commit -m "feat(web): the stand view's words: the hill named by its direction and 'up', the picture brightened so you can see it, Play or a flag, a thumb's width, the phone's chip"
```

---

### Task 2: The time bar's key and its flags in up to three rows (subagent)

**Files:**
- Modify: `web/src/components/explore/TimeBar.tsx` (`flagSpan` lines 45–53, `momentRows` lines 87–131, the key at line 417, the flags' markup lines 426–487, the docs at lines 150–151 and 163–170)
- Test: `web/src/components/explore/TimeBar.test.tsx` (lines 506–540 the key's words; 1056–1075 the rows; 1290–1386 `momentRows`)

**Interfaces:**
- Produces: `momentRows(moments, hours, trackPx, widths?: number[]): number[]` with rows 0, 1 or 2; `export const FLAG_ROWS = 3`; the flags' `data-row` of `'0' | '1' | '2'`, classes `bottom-[2px] | bottom-[24px] | bottom-[46px]`, stems `h-[12px] | h-[34px] | h-[56px]`, the box `h-[22px] | h-[44px] | h-[66px]`; the key's words `radio, if the lander survives the cold`.

- [ ] **Step 1: Write the failing tests**

Change every `radio, if it survives the night` in `TimeBar.test.tsx` to `radio, if the lander survives the cold`. Replace the `describe('momentRows', …)` block with:

```ts
/** The faults of a layout: px of flags over each other in a row, and stems down behind another flag's words. */
function faults(moments: { label: string; hour: number }[], hours: number, trackPx: number, rows: number[], widths?: number[]) {
  const span = (i: number) => {
    const at = (moments[i].hour / hours) * trackPx, w = widths?.[i] || moments[i].label.length * 7.75 + 14;
    return at + w > trackPx ? { from: at - w, to: at, stem: at } : { from: at, to: at + w, stem: at };
  };
  let over = 0, behind = 0;
  for (let a = 0; a < moments.length; a++)
    for (let b = 0; b < moments.length; b++) {
      if (a === b) continue;
      const sa = span(a), sb = span(b);
      if (rows[a] === rows[b] && a < b) over += Math.max(0, Math.min(sa.to, sb.to) - Math.max(sa.from, sb.from));
      if (rows[a] > rows[b] && sb.from < sa.stem && sa.stem < sb.to) behind++;
    }
  return { over, behind };
}

describe('momentRows', () => {
  it('keeps moments far apart in the first row', () => {
    expect(momentRows([MOMENTS[0], MOMENTS[2], MOMENTS[3]], 720, 1000)).toEqual([0, 0, 0]);
  });

  it('lifts the first of two moments a day apart, as the second one’s stem would come down behind it', () => {
    expect(momentRows([{ label: 'Sunset 3 Jan', hour: 48 }, { label: 'Battery runs out 4 Jan', hour: 72 }], 720, 1000)).toEqual([1, 0]);
  });

  it('lays the stand view’s five moments out clean on a 538 px track by their measured widths, in three rows (read D2-2, frame 27)', () => {
    // A 768 px screen; the widths as the browser measures them at 14 px.
    const stand = [
      { label: 'Sunset, 3 Jan', hour: 50 },
      { label: 'Battery runs out, 4 Jan', hour: 76 },
      { label: 'Earth rises, 10 Jan', hour: 216 },
      { label: 'Sunrise, 20 Jan', hour: 456 },
      { label: 'Earth sets, 23 Jan', hour: 528 },
    ];
    const widths = [95, 155, 125, 100, 120];
    const rows = momentRows(stand, 720, 538, widths);
    expect(faults(stand, 720, 538, rows, widths)).toEqual({ over: 0, behind: 0 });
    expect(Math.max(...rows)).toBe(2);
    // With a wide track two rows do.
    const wide = momentRows(stand, 720, 1050, widths);
    expect(faults(stand, 720, 1050, wide, widths)).toEqual({ over: 0, behind: 0 });
    expect(Math.max(...wide)).toBeLessThanOrEqual(1);
  });

  it('takes the fewest rows that are clean, and the lowest of those', () => {
    const rows = momentRows(MOMENTS, 720, 1000);
    expect(faults(MOMENTS, 720, 1000, rows)).toEqual({ over: 0, behind: 0 });
    expect(Math.max(...rows)).toBe(1);
  });

  it('with no clean layout in three rows, takes the one with the fewest faults, a stem behind words counting as 60 px', () => {
    // Six moments in a week on a 538 px track: nothing is clean; the layout still has every flag in a row and no exception.
    const crowd = [0, 24, 48, 72, 96, 120].map((hour, k) => ({ label: `Moment ${k}, ${k + 1} Jan`, hour }));
    const rows = momentRows(crowd, 720, 538);
    expect(rows).toHaveLength(6);
    for (const r of rows) expect([0, 1, 2]).toContain(r);
    const f = faults(crowd, 720, 538, rows);
    expect(f.over + 60 * f.behind).toBeGreaterThan(0);
  });

  it('prefers the later of two flags up on a tie: a flag ending at its hour reaches back over the one before', () => {
    expect(momentRows([{ label: 'Earth in view 25 Jan', hour: 576 }, { label: 'Sun and power back, 29 Jan', hour: 684 }], 720, 1000)).toEqual([0, 1]);
  });

  it('has no rows for no moments', () => {
    expect(momentRows([], 720, 1000)).toEqual([]);
  });

  it('falls back to the greedy rows beyond nine flags, so the search never runs long', () => {
    const many = Array.from({ length: 12 }, (_, k) => ({ label: `M${k}`, hour: k * 60 }));
    expect(momentRows(many, 720, 2000)).toHaveLength(12);
  });
});
```

Change the DOM test at 1056–1075 to read its rows from `momentRows(MOMENTS, 720, 1000)` rather than the literal `['1', '0', '0', '0']`, and add a DOM test for the third row:

```ts
  it('draws a third row 22 px above the second when the rows need it, each stem down to the strip', () => {
    const stand = [
      { label: 'Sunset, 3 Jan', hour: 50 },
      { label: 'Battery runs out, 4 Jan', hour: 76 },
      { label: 'Earth rises, 5 Jan', hour: 100 },
      { label: 'Sunrise, 6 Jan', hour: 124 },
      { label: 'Earth sets, 7 Jan', hour: 148 },
    ];
    const rows = momentRows(stand, 720, 1000);
    const { container } = showPeriod(30, { dates: true, moments: stand });
    const flags = flagsOf(container);
    expect(flags.map((f) => Number(f.dataset.row))).toEqual(rows);
    const top = Math.max(...rows);
    expect(container.querySelector('[data-part="moments"]')!.classList.contains(top === 2 ? 'h-[66px]' : top === 1 ? 'h-[44px]' : 'h-[22px]')).toBe(true);
    flags.forEach((f, i) => expect(f.classList.contains(['bottom-[2px]', 'bottom-[24px]', 'bottom-[46px]'][rows[i]])).toBe(true));
    expect(stemsOf(container).map(heightPx)).toEqual(rows.map((r) => [12, 34, 56][r]));
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/components/explore/TimeBar.test.tsx --maxWorkers=1`
Expected: FAIL: the key's words, `momentRows` takes no widths and gives no third row, `faults` finds crossings in the old layouts.

- [ ] **Step 3: Implement**

`flagSpan` takes a measured width:

```ts
function flagSpan(m: KeyMoment, hours: number, trackPx: number, widthPx?: number): { from: number; to: number; flipped: boolean } {
  const at = hours > 0 ? (m.hour / hours) * trackPx : 0;
  const width = widthPx && widthPx > 0 ? widthPx : m.label.length * 7.75 + 14;
  return at + width > trackPx ? { from: at - width, to: at, flipped: true } : { from: at, to: at + width, flipped: false };
}
```

Rename the old `momentRows` to `greedyRows(spans)` (taking the spans, same body), and write the new one:

```ts
/** The rows the flags may take: right above the track, 22 px above that, and 22 px above that (18.3). */
export const FLAG_ROWS = 3;
/** Beyond this many flags the search (3^n layouts) gives way to the greedy rows. */
const SEARCH_MAX = 9;
/** A stem down behind another flag's words counts as this many px of flags over each other. */
const BEHIND_PX = 60;

/**
 * The row of each flag over the track, 0 right above it, 1 above that and 2 above that, for moments in order of
 * time, by their measured widths when given (`widths`, px; else a guess from their letters). Of every way of giving
 * the flags rows, the one with no flag over another in its row and no stem down behind another flag's words (a
 * flag's stem comes down past the rows under it), and of those the fewest rows, then the lowest, a later flag going
 * up before an earlier one on a tie. With no clean way in three rows, the one with the fewest faults, a stem behind
 * words counting as 60 px of overlap. A flag that ends at its hour counts where it really runs, its stem on its
 * right edge. Beyond nine flags the greedy rows of part A take over, so the search never runs long.
 */
export function momentRows(moments: KeyMoment[], hours: number, trackPx: number, widths?: number[]): number[] {
  const spans = moments.map((m, i) => flagSpan(m, hours, trackPx, widths?.[i]));
  const n = spans.length;
  if (n === 0) return [];
  if (n > SEARCH_MAX) return greedyRows(spans);
  const stemAt = (k: number) => (spans[k].flipped ? spans[k].to : spans[k].from);
  const over = (a: number, b: number) => Math.max(0, Math.min(spans[a].to, spans[b].to) - Math.max(spans[a].from, spans[b].from));
  const behind = (a: number, b: number) => spans[b].from < stemAt(a) && stemAt(a) < spans[b].to;
  let best: number[] = [], bestCost = Infinity;
  const rows = new Array<number>(n).fill(0);
  const total = Math.pow(FLAG_ROWS, n);
  for (let code = 0; code < total; code++) {
    let c = code;
    for (let i = 0; i < n; i++) {
      rows[i] = c % FLAG_ROWS;
      c = Math.floor(c / FLAG_ROWS);
    }
    let fault = 0, top = 0, low = 0;
    for (let a = 0; a < n; a++) {
      top = Math.max(top, rows[a]);
      // Earlier flags weigh more, so on a tie the later one goes up.
      low += rows[a] * (n - a);
      for (let b = 0; b < n; b++) {
        if (a === b) continue;
        if (rows[a] === rows[b] && a < b) fault += over(a, b);
        if (rows[a] > rows[b] && behind(a, b)) fault += BEHIND_PX;
      }
    }
    const cost = (fault > 0 ? 1e6 + fault * 1e3 : 0) + top * 1e3 + low;
    if (cost < bestCost) {
      bestCost = cost;
      best = rows.slice();
    }
  }
  return best;
}
```

In the component: measure the flags after they render, and lay them out by the measurement.

```ts
  // The flags' widths as the browser draws them (0 before the first paint and in jsdom, where the guess from the
  // letters holds), measured again when the words, the track or the fonts change (18.3).
  const flagRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [widths, setWidths] = useState<number[]>([]);
  const [fontsReady, setFontsReady] = useState(false);
  const labelsKey = flags.map((m) => m.label).join('\n');
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setFontsReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  useLayoutEffect(() => {
    if (dots) return;
    const w = flags.map((_, i) => flagRefs.current[i]?.offsetWidth ?? 0);
    setWidths((old) => (old.length === w.length && old.every((x, i) => x === w[i]) ? old : w));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelsKey, dots, trackPx, fontsReady]);
  const rows = useMemo(() => momentRows(flags, hours, trackPx, widths), [flags, hours, trackPx, widths]);
  const flipped = flags.map((m, i) => !bare && flagSpan(m, hours, trackPx, widths[i]).flipped);
```

(`dots` must be declared before this block; move `const dots = compact || bare;` up.) Each flag button gets `ref={(node) => { flagRefs.current[i] = node; }}`. The classes: the box `${top === 2 ? 'h-[66px]' : top === 1 ? 'h-[44px]' : 'h-[22px]'}` with `const top = Math.max(0, ...rows)`; the flag `${['bottom-[2px]', 'bottom-[24px]', 'bottom-[46px]'][rows[i]]}`; the stem `${['h-[12px]', 'h-[34px]', 'h-[56px]'][rows[i]]}`. The key at line 417: `radio, if the lander survives the cold`; the docs at 150–151, 163–170 and 236 say the same and the three rows.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/components/explore/TimeBar.test.tsx src/components/stand/StandView.test.tsx --maxWorkers=1`
Expected: PASS (the stand view's test 'marks the radio contact after the night as only if the lander survives it' reads the key's new words; change its expectation if it quotes the old ones).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/explore/TimeBar.tsx web/src/components/explore/TimeBar.test.tsx
git commit -m "feat(web): the time bar's flags laid out by their measured widths in up to three rows, and the radio's key says if the lander survives the cold"
```

---

### Task 3: The compass plate's key row, the caption's dock, the pointer's short words, and the feet after Turn to Lander (main session)

**Files:**
- Modify: `web/src/components/stand/StandCanvas.tsx` (`pointerShort` lines 110–117; the strip lines 955–1000; `LookTarget` line 20; the look effect lines 505–521; the tick's fit at lines 657–666; the handlers at 899 and 918)
- Test: `web/src/components/stand/StandCanvas.test.ts`

**Interfaces:**
- Consumes: the label forms from Task 1.
- Produces: `LookTarget { yaw; pitch; fov; fit?: boolean }` (`fit` keeps the lander's feet in sight, as the opening does, until the view is dragged); the strip's plate with `data-strip=""`, classes `rounded-t-none border-t-0 bg-[#060607]` from 768 px and a key row `[data-key]` with the words "Sun", "Earth", "lander"; `STRIP_H = 78` exported (the plate's height in px: the compass 32, the facing line 24, the key 22).

- [ ] **Step 1: Write the failing tests**

In `StandCanvas.test.ts`, change lines 13–17 and 223–226:

```ts
    expect(pointerShort('Earth behind a hill to the east, 4.4° up')).toBe('Earth 4.4° up');
    expect(pointerShort('Earth behind a hill to the east, on the horizon')).toBe('Earth on the horizon');
    // pointerWords: the label already says "up"; it stays as it is.
    expect(pointerWords('Sun behind a hill to the west, 1.5° up')).toBe('Sun behind a hill to the west, 1.5° up');
```

Add a render test (the file already renders `StandCanvas` with a stub renderer at line 510; copy that setup):

```ts
  it('names the compass’s dots in a key row under the facing line, in a plate that the caption docks on from 768 px (18.3)', async () => {
    const { container } = renderCanvas();
    const strip = container.querySelector<HTMLElement>('[data-strip]')!;
    expect(strip).toBeTruthy();
    for (const c of ['rounded-t-none', 'border-t-0', 'bg-[#060607]']) expect(strip.classList.contains(c)).toBe(true);
    const key = strip.querySelector<HTMLElement>('[data-key]')!;
    expect(key.textContent).toBe('SunEarthlander');
    expect([...key.querySelectorAll('i')].map((i) => i.className)).toEqual(['mr-1 inline-block size-2 rounded-full bg-[#f6b646]', 'ml-3 mr-1 inline-block size-2 rounded-full bg-[#74adff]', 'ml-3 mr-1 inline-block size-2 rounded-full bg-[#f2f0ea]']);
    expect(STRIP_H).toBe(78);
  });

  it('keeps the lander’s feet in sight after a look with `fit`, as at the opening, until the view is dragged', () => {
    // fitPitch lowers the pitch when the feet (3° below level) would sit under the bar at 900 px with 160 px of bar.
    expect(fitPitch(900, 36, 740, -3, 0)).toBeLessThan(0);
  });
```

(`renderCanvas` is whatever the file names its helper; if there is none, build one from the setup at line 510 with `scene` from the file's fixtures.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/components/stand/StandCanvas.test.ts --maxWorkers=1`
Expected: FAIL: `pointerShort` gives the whole label, no `[data-strip]`, no `STRIP_H`.

- [ ] **Step 3: Implement**

`pointerShort`:

```ts
export function pointerShort(label: string): string {
  return label
    .replace(/^(\w+) behind a hill to the [\w-]+, (.+) up$/, '$1 $2 up')
    .replace(/^(\w+) behind a hill to the [\w-]+, on the horizon$/, '$1 on the horizon')
    .replace(/^(\w+), /, '$1 ')
    .replace(/ below the horizon$/, ' below');
}
```

`pointerWords` becomes the identity with its doc saying the label already says "up" (keep the export for the call sites). `LookTarget` gains `fit?: boolean`. The strip: `export const STRIP_H = 78;`; the wrapper's plate div gets `data-strip=""` and the classes `rounded-t-none border-t-0 bg-[#060607]` (replacing `bg-black`), and after the facing `<p>`:

```tsx
        <p data-key="" className="pb-1.5 text-center text-[14px] leading-none text-[#c3bfb6]">
          <i aria-hidden="true" className="mr-1 inline-block size-2 rounded-full bg-[#f6b646]" />Sun
          <i aria-hidden="true" className="ml-3 mr-1 inline-block size-2 rounded-full bg-[#74adff]" />Earth
          <i aria-hidden="true" className="ml-3 mr-1 inline-block size-2 rounded-full bg-[#f2f0ea]" />lander
        </p>
```

The facing `<p>` keeps `pb-1 text-center text-[15px]` with `leading-5` (20 px) so the plate is 32 + 24 + 22 = 78 px tall. The fit: a `fitRef = useRef(false)`; in the look effect (line 521) `fitRef.current = !!look.fit;` beside `goal.current = { ...look }`; where a drag, the wheel or a key clears `goal.current` (899, 918) also `fitRef.current = false;`; in the tick, `if ((openingRef.current || fitRef.current) && keep && keepRel < halfW)`. The strip's `hidden`, width and bottom classes stay.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/components/stand/StandCanvas.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/stand/StandCanvas.tsx web/src/components/stand/StandCanvas.test.ts
git commit -m "feat(web): the compass plate names its dots and takes the caption on top from 768 px; the lander's feet stay in sight after Turn to Lander"
```

---

### Task 4: The stand view's plate, chip, caption dock, words, lander dialog and Brighter picture (main session)

**Files:**
- Modify: `web/src/components/stand/StandView.tsx` (imports line 22; the plate lines 383–432; the card lines 433–487; the row lines 536–588; the caption lines 590–598; the canvas props lines 338–358; `better` lines 226–235)
- Test: `web/src/components/stand/StandView.test.tsx`

**Interfaces:**
- Consumes: Task 1's `WATCH_LEAD`, `WATCH_LEAD_DOTS`, `betterChip`; Task 3's `LookTarget.fit`, `STRIP_H`; Task 5's `RendererLike.setBright?`; Task 7's `openingYaw(series, hour, tall, withLander, mask?, halfWidthDeg?)`; `LanderDialog` from `@/components/explore/LanderDialog` with `params, onPower, onParams, busy, onClose, returnFocus`; `dayMonth` from `@/lib/viz/format`.
- Produces: the plate `w-full max-w-[860px]` at every width; the chip `a[data-chip]` with `md:hidden`; the caption `<p data-plate data-caption>` with `max-md:…` and the dock classes; the buttons "Paths", "Change lander", "Brighter picture" (`aria-pressed`), the link "Open the full forecast"; session storage key `earthrise-bright`; `StandCanvas` prop `bright`.

- [ ] **Step 1: Write the failing tests**

In `StandView.test.tsx`: rename every `'Guides'` to `'Paths'` (the button's name and the row's order at line 163: `['Sun', 'Earth', 'Lander', 'Look up', 'Paths', 'Hide the words']`); in the next-step test at 673 expect the gold link's text to be the long form `Try 20 January instead: power for 12 days 15 hours, radio for 3 days 5 hours` (whatever the fixture's numbers are, `better.label` as the card had it) and the links `['Change site', 'Change date', 'Change lander', 'Compare sites']`; in the phone test at 642 expect `Open the full forecast`. Add:

```ts
  it('keeps the status plate at its full width whatever the words, so More stays put as the night comes (18.3)', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const plate = screen.getByRole('button', { name: 'More' }).closest('[data-plate]')!;
    expect(plate.className).toMatch(/\bw-full\b/);
    expect(plate.className).toMatch(/\bmax-w-\[860px\]\b/);
    expect(plate.className).not.toMatch(/\bmd:w-fit\b/);
  });

  it('on a phone puts the better day on the first screen as one gold chip under the plate, a link to that landing (18.3)', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const chip = document.querySelector<HTMLAnchorElement>('a[data-chip]')!;
    expect(chip).toBeTruthy();
    expect(asRead(chip.textContent!)).toMatch(/^Try \d+ \w{3} instead: power for \d+ days \d+ hours›$/);
    expect(chip.className).toMatch(/\bmd:hidden\b/);
    expect(chip.className).toMatch(/\bh-8\b/);
    expect(chip.className).toMatch(/\btext-\[14px\]\b/);
    expect(chip.getAttribute('href')).toMatch(/^\/explore\/stand\?site=de_gerlache_rim_2&start=2027-01-\d\d&days=30&hour=0$/);
    // The chip sits inside the answer's section, so the view's measured top includes it.
    expect(chip.closest('section[aria-label="The answer for this site"]')).toBeTruthy();
  });

  it('shows no chip and no gold link when no landing day is better', async () => {
    // The period from the better day itself: nothing in it beats it.
    await open('?site=de_gerlache_rim_2&start=2027-01-20&days=30&hour=10');
    expect(document.querySelector('a[data-chip]')).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Next step' })).getByRole('button', { name: 'Compare sites' })).toBeTruthy();
  });

  it('docks the caption on the compass plate from 768 px: one plate at the foot of the view (18.3)', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    fireEvent.click(screen.getByRole('button', { name: 'Face Earth' }));
    const cap = screen.getByText(viewCaption('earth', -88.28)).closest('[data-caption]')!;
    for (const c of ['md:rounded-b-none', 'md:border-b-0', 'bottom-[calc(var(--bar-h,129px)+92px)]', 'max-xl:bottom-[calc(var(--bar-h,129px)+var(--look-h,52px)+92px)]', 'max-md:bottom-[calc(var(--bar-h,211px)+var(--look-h,52px)+12px)]']) expect(cap.className).toContain(c);
  });

  it('leads what to watch with Play and a flag, or a dot on a phone, said once to a screen reader', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    openCard();
    const line = screen.getByText(WATCH_LEAD, { selector: '.sr-only' }).parentElement!;
    expect(line.querySelector('[aria-hidden="true"].sm\\:hidden')!.textContent).toBe(WATCH_LEAD_DOTS);
    expect(line.querySelector('[aria-hidden="true"].max-sm\\:hidden')!.textContent).toBe(WATCH_LEAD);
  });

  it('opens the lander dialog in place from Change lander, and the verdict follows the lander chosen there (18.3)', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const before = screen.getByRole('heading', { level: 1 }).textContent;
    fireEvent.click(within(screen.getByRole('group', { name: 'Next step' })).getByRole('button', { name: 'Change lander' }));
    const dialog = await screen.findByRole('dialog');
    // The dialog's own test names its controls; choose the heaviest ready-made lander.
    fireEvent.click(within(dialog).getByRole('button', { name: /Blue Ghost|Nova-C|Griffin/ }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe(before), { timeout: 20_000 });
    fireEvent.click(within(dialog).getByRole('button', { name: /Close|Done/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement?.textContent).toBe('Change lander');
  });

  it('brightens the picture for projectors from today’s card, keeps it for the visit, and never throws without storage', async () => {
    const setBright = vi.fn();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => ({ ...stub(), setBright }));
    openCard();
    const b = screen.getByRole('button', { name: 'Brighter picture' });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(b);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.textContent).toBe('Brighter picture');
    await waitFor(() => expect(setBright).toHaveBeenLastCalledWith(true));
    expect(window.sessionStorage.getItem('earthrise-bright')).toBe('1');
    cleanup();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => ({ ...stub(), setBright }));
    openCard();
    expect(screen.getByRole('button', { name: 'Brighter picture' }).getAttribute('aria-pressed')).toBe('true');
    window.sessionStorage.clear();
    const stored = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', { get: () => { throw new Error('blocked'); }, configurable: true });
    cleanup();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    openCard();
    fireEvent.click(screen.getByRole('button', { name: 'Brighter picture' }));
    if (stored) Object.defineProperty(window, 'sessionStorage', stored);
  });

  it('turns the opening up to 30° towards the skyline’s highest point, the Sun and the lander kept in frame (18.4)', async () => {
    // The stand view passes the site's mask and the view's half-width to openingYaw; standOpening's own tests pin the turn.
    const setView = vi.fn();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => ({ ...stub(), setView }));
    const s = store.getState();
    const expected = openingYaw(s.series!, 10, false, true, { az0: 0, step: 360 / s.mask!.length, el: s.mask! }, (Math.atan(Math.tan((60 * Math.PI) / 360) * (window.innerWidth / window.innerHeight)) * 180) / Math.PI);
    await waitFor(() => expect(setView.mock.calls.at(-1)![0]).toBeCloseTo(expected, 3));
  });

  it('after Turn to Lander keeps the lander’s feet in sight: the look carries `fit`', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    // StandCanvas reads look.fit; StandView passes it: pinned through the canvas's data attribute of the last look.
    await waitFor(() => expect(document.querySelector('canvas')!.getAttribute('data-fit')).toBe('1'));
  });
```

(`data-fit` on the canvas: StandCanvas sets `data-fit="1"` on its canvas while `fitRef.current` is true, in Task 3's look effect; add it there if Task 3 did not.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/components/stand/StandView.test.tsx --maxWorkers=1`
Expected: FAIL on Paths, the long gold link, Change lander, Open the full forecast, the plate's classes, the chip, the dock classes, the leads, the dialog, Brighter picture, the yaw and the fit.

- [ ] **Step 3: Implement**

Imports: `LanderDialog`; `WATCH_LEAD, WATCH_LEAD_DOTS, betterChip` from `@/lib/viz/stand`; `dayMonth` from `@/lib/viz/format`; `STRIP_H` from `./StandCanvas`.

`better` gains `chip: betterChip(dayMonth(s.startUtc, answer.better.hour), s.best.poweredHours)` (keep `label`; drop `short`, and remove `betterLabel`'s `short` use). The row's gold link shows `better.label`. The plate's class: `${PLATE} pointer-events-auto flex w-full max-w-[860px] flex-col`. After the plate, inside the section:

```tsx
            {better && (
              // A phone's first screen keeps the better day in sight (18.3): one gold chip, a link to that landing.
              <a
                data-chip=""
                href={better.href}
                onClick={(e) => {
                  e.preventDefault();
                  land(better.startUtc, better.href);
                }}
                className={`${PLATE} pointer-events-auto inline-flex h-8 items-center gap-1 border-[#f6d48a]/55 px-2.5 text-[14px] text-[#f6d48a] md:hidden`}
              >
                {better.chip}
                <span aria-hidden="true">›</span>
              </a>
            )}
```

The card: "Open the full forecast" for "Back to the forecast"; after "Hide the words", a `Change lander` button (`md:hidden`, the phone's) and the toggle:

```tsx
                  <button type="button" aria-pressed={bright} className={`${LOOK} ${PRESSED}`} onClick={() => setBright((b) => !b)}>
                    Brighter picture
                  </button>
```

The row: the gold link's text `better.label`; after "Change date", `<button type="button" ref={landerRef} onClick={() => setLanderOpen(true)} className="flex min-h-10 items-center whitespace-nowrap text-[15px] underline underline-offset-4">Change lander</button>`. "Guides" becomes "Paths" (the state keeps its name). The watch-next line:

```tsx
                <p className="text-[14px] text-[#f6d48a] md:text-[15px]">
                  {watch.startsWith(WATCH_LEAD) ? (
                    <>
                      <span aria-hidden="true" className="sm:hidden">{WATCH_LEAD_DOTS}</span>
                      <span aria-hidden="true" className="max-sm:hidden">{WATCH_LEAD}</span>
                      <span className="sr-only">{WATCH_LEAD}</span>
                      {watch.slice(WATCH_LEAD.length)}
                    </>
                  ) : (
                    watch
                  )}
                </p>
```

with `const watch = watchNext(series, power, s.startUtc, hour);`. State:

```ts
  const [landerOpen, setLanderOpen] = useState(false);
  const landerRef = useRef<HTMLButtonElement>(null);
  // Brighter picture (18.3): twice the exposure, for projectors and bright rooms, kept for the visit.
  const [bright, setBright] = useState(() => readBright());
  useEffect(() => {
    try {
      window.sessionStorage.setItem('earthrise-bright', bright ? '1' : '0');
    } catch {
      // A private window or blocked storage: the setting holds for this page.
    }
  }, [bright]);
```

with, at module level:

```ts
/** Whether the visitor asked for a brighter picture earlier in the visit; false wherever storage is missing. */
function readBright(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem('earthrise-bright') === '1';
  } catch {
    return false;
  }
}
```

The dialog, after the time bar: `{landerOpen && <LanderDialog params={s.params} onPower={s.setPower} onParams={s.setParams} busy={s.maskBusy} onClose={() => setLanderOpen(false)} returnFocus={landerRef} />}`. The canvas gets `bright={bright}` (StandCanvas: `useEffect(() => { rendererRef.current?.setBright?.(bright); }, [bright])`, with the renderer's ref the canvas already keeps; call it again when the renderer is created) and `caption` is not passed: the caption `<p>` stays in StandView with `data-caption=""` and the dock classes:

```tsx
          className={`${PLATE} pointer-events-none fixed bottom-[calc(var(--bar-h,129px)+92px)] left-1/2 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 px-3 py-2 text-center text-[15px] md:rounded-b-none md:border-b-0 max-xl:bottom-[calc(var(--bar-h,129px)+var(--look-h,52px)+92px)] max-md:bottom-[calc(var(--bar-h,211px)+var(--look-h,52px)+12px)]`}
```

(92 = the strip's 14 px above the bar plus `STRIP_H` 78; write it as a constant string built from `STRIP_H` so the two cannot drift: `const DOCK = `bottom-[calc(var(--bar-h,129px)+${14 + STRIP_H}px)]`` is not a Tailwind class Tailwind can see, so write the classes out whole and add a test `expect(14 + STRIP_H).toBe(92)`.) `faceLander` passes `fit: true` in its look. The opening yaw: `startYaw={openingYaw(series, opening, tall(), !!scene.lander, scene.mask, halfWidthDeg(openOnEarth ? (tall() ? 56 : 44) : tall() ? 80 : 60))}` with:

```ts
/** Half the view's width in degrees for a vertical field of view, from the window's shape (60 by default on a wide screen). */
function halfWidthDeg(fovDeg: number): number {
  const aspect = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerWidth / window.innerHeight : 16 / 10;
  return (Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect) * 180) / Math.PI;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/components/stand --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/stand/StandView.tsx web/src/components/stand/StandView.test.tsx web/src/components/stand/StandCanvas.tsx
git commit -m "feat(web): the verdict on every screen (the radio on the row's gold, a phone's chip), a plate that keeps its width, the caption docked, Paths, Change lander in place, Brighter picture"
```

---

### Task 5: The renderer's Brighter picture and the night key light (main session)

**Files:**
- Modify: `web/src/lib/sky/standRenderer.ts` (lights lines 452–457, `applyLight` lines 560–579, `update` lines 580–590, the exposure at 1028 and 1164, `parts` at 943, the class's fields)
- Modify: `web/src/components/stand/StandCanvas.tsx:20` (`RendererLike` gains `setBright?: (on: boolean) => void`)
- Test: `web/src/lib/sky/standRenderer.test.ts`

**Interfaces:**
- Consumes: `NIGHT` from `./shaders` (gains `KEY`), `dirAzEl` from `./frames`.
- Produces: `StandRenderer.setBright(on: boolean)`; `parts.keyLight: THREE.DirectionalLight`; `NIGHT.KEY` (the prototype's value from `mock_d3/proto/NOTES.md`; 0.5 if it gives none).

- [ ] **Step 1: Write the failing tests**

In `standRenderer.test.ts` (it builds scenes with `buildScene` and a fake canvas; follow its fixtures):

```ts
  it('lights the rocks and the lander at night with a faint key from 50° up, 90° round from the Sun, a third of the hemisphere’s, and not by day (18.4)', () => {
    const built = buildScene(nightScene());
    built.update(NIGHT_HOUR);
    const key = built.parts.keyLight;
    expect(key.intensity).toBeCloseTo(NIGHT.KEY * nightFloorAt(NIGHT_HOUR), 3);
    expect(key.intensity).toBeGreaterThan(0);
    expect(key.intensity / built.parts.landerFill!.intensity).toBeCloseTo(1 / 3, 1);
    const d = key.position.clone().normalize();
    expect((Math.asin(d.y) * 180) / Math.PI).toBeCloseTo(50, 1);
    const sunAz = nightScene().series.sunAz[NIGHT_HOUR];
    expect(((Math.atan2(d.x, -d.z) * 180) / Math.PI + 360) % 360).toBeCloseTo((sunAz + 90) % 360, 1);
    built.update(DAY_HOUR);
    expect(built.parts.keyLight.intensity).toBe(0);
  });

  it('doubles the exposure on setBright, and halves it back', () => {
    const r = new StandRenderer(canvas(), dayScene());
    const base = r.renderer.toneMappingExposure;
    r.setBright(true);
    r.render();
    expect(r.renderer.toneMappingExposure).toBeCloseTo(2 * base, 6);
    r.setBright(false);
    r.render();
    expect(r.renderer.toneMappingExposure).toBeCloseTo(base, 6);
  });
```

(`nightFloorAt` is the test's own call of the renderer's exported `nightFloor` for that hour's sun fraction and earthshine, as the file's other night tests do; `NIGHT_HOUR`, `DAY_HOUR`, `nightScene`, `dayScene`, `canvas` are the file's fixtures, named as it names them.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/lib/sky/standRenderer.test.ts --maxWorkers=1`
Expected: FAIL: no `keyLight`, no `setBright`, no `NIGHT.KEY`.

- [ ] **Step 3: Implement**

`shaders.ts`: `NIGHT` gains `KEY: 0.5` (the prototype's value), documented: "the key light at night, a third of the hemisphere's SKY (18.4)". In `buildScene` beside `fillLight`:

```ts
  // A faint key light at night from 50° up and 90° round from the Sun's last place, a third of the fill's strength, so
  // the stones' facets and the lander's edges show where the hemisphere alone made every side the same (18.4). Off by day.
  const keyLight = new THREE.DirectionalLight(0xc4c6ca, 0);
  root.add(keyLight, keyLight.target);
```

In `update(t)`, after `sunDir.set(...)`: `const kd = dirAzEl(v.sunAz + 90, 50); keyLight.position.set(kd[0] * 100, kd[1] * 100, kd[2] * 100);`. In `applyLight`: `keyLight.intensity = NIGHT.KEY * night;` (so with `NIGHT.SKY = 1.6` the ratio to the fill's `0.03 + 1.6 * night` is a third at full night). `parts` gains `keyLight`. The class: `private bright = 1;` `setBright(on: boolean) { this.bright = on ? 2 : 1; }` and both `toneMappingExposure` lines multiply by `this.bright`. `RendererLike` in `StandCanvas.tsx` gains `setBright?: (on: boolean) => void`; the arrival's `ArrivalRenderer` pick needs nothing.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/lib/sky/standRenderer.test.ts src/lib/sky/shaders.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sky/standRenderer.ts web/src/lib/sky/standRenderer.test.ts web/src/lib/sky/shaders.ts web/src/components/stand/StandCanvas.tsx
git commit -m "feat(web): a faint key light at night so the stones keep their facets, and setBright doubles the exposure for projectors"
```

---

### Task 6: The daytime ground's blotches halved (main session)

**Files:**
- Modify: `web/src/lib/sky/shaders.ts:320`
- Test: `web/src/lib/sky/shaders.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('halves the drawn patches of lighter and darker dust near the eye, about 5 m across, so the ground reads as dust, not noise (18.4)', () => {
    expect(GROUND_FRAG).toContain('0.06 * (vnoise(vWorld.xz * 0.21) - 0.5)');
    expect(GROUND_FRAG).not.toContain('0.12 * (vnoise(vWorld.xz * 0.21) - 0.5)');
  });
```

- [ ] **Step 2: Run the test to see it fail**

Run: `cd web && npx vitest run src/lib/sky/shaders.test.ts --maxWorkers=1`
Expected: FAIL: the source still holds `0.12`.

- [ ] **Step 3: Implement**

Line 320: `0.06 * (vnoise(vWorld.xz * 0.21) - 0.5)`, the comment above it saying the patches are half of part A's (18.4; the prototype's still in `mock_d3/blotch-d3.png`).

- [ ] **Step 4: Run the test to see it pass**

Run: `cd web && npx vitest run src/lib/sky/shaders.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sky/shaders.ts web/src/lib/sky/shaders.test.ts
git commit -m "feat(web): the daytime ground's 5 m blotches halved, so it reads as dust with stones on it"
```

---

### Task 7: A hill in the opening frame (main session)

**Files:**
- Modify: `web/src/lib/viz/standOpening.ts`
- Test: `web/src/lib/viz/standOpening.test.ts`

**Interfaces:**
- Produces: `export function hillShift(mask: { az0: number; step: number; el: ArrayLike<number> }, yawDeg: number, halfWidthDeg: number, range: [number, number]): number` (degrees to turn, 0 when no turn helps); `openingYaw(series, hour, tall, withLander, mask?, halfWidthDeg?)`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('a hill in the opening frame (18.4)', () => {
  // A mask of 360 one-degree steps: level, but for a hill 8° high at one azimuth.
  const maskWith = (hillAz: number, el = 8) => ({ az0: 0, step: 1, el: Array.from({ length: 360 }, (_, a) => (a === hillAz ? el : 0)) });

  it('turns towards the skyline’s highest point within the range, as little as brings it 6° inside the frame', () => {
    // Facing 100° with a frame 44° wide each way: a hill at 40° needs the frame's edge at 34°: a turn of -28°.
    expect(hillShift(maskWith(40), 100, 44, [-30, 30])).toBe(-28);
  });

  it('does not turn when the highest point is already in frame, nor past the range', () => {
    expect(hillShift(maskWith(80), 100, 44, [-30, 30])).toBe(0);
    // A hill at 20° would need -42°: out of range, so the best in range is any of the level skyline: no turn.
    expect(hillShift(maskWith(20), 100, 44, [-30, 30])).toBe(0);
  });

  it('keeps the Sun and the lander in frame: on a wide screen the turn goes left up to 30° and right only while the Sun stays 6° inside', () => {
    const s = series({ sunEl: [2], sunFraction: [1], sunAz: [100] });
    // The view opens 35° left of the Sun, the lander 5° left of the middle; a hill 60° left of the Sun.
    const base = openingYaw(s, 0, false, true);
    expect(base).toBeCloseTo(65, 6);
    expect(openingYaw(s, 0, false, true, maskWith(40), 44)).toBeCloseTo(65 - 27, 6);
    // A hill to the right of the Sun: the Sun would leave the frame; at most 3° right.
    expect(openingYaw(s, 0, false, true, maskWith(140), 44)).toBeCloseTo(65 + 3, 6);
  });

  it('turns nothing without a mask, without a half-width, or when the view opens on Earth at night', () => {
    const s = series({ sunEl: [2, -3], sunFraction: [1, 0], sunAz: [100, 100], earthEl: [1, 1], earthAz: [200, 200], earthVisible: [1, 1] });
    expect(openingYaw(s, 0, false, true, undefined, 44)).toBeCloseTo(65, 6);
    expect(openingYaw(s, 0, false, true, maskWith(40))).toBeCloseTo(65, 6);
    expect(openingYaw(s, 1, false, true, maskWith(150), 22)).toBeCloseTo(196, 6);
  });
});
```

(`series` is the file's fixture, or copy `stand.test.ts`'s.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/lib/viz/standOpening.test.ts --maxWorkers=1`
Expected: FAIL: `hillShift` not exported; `openingYaw` ignores the mask.

- [ ] **Step 3: Implement**

```ts
/** How far inside the frame's edge a hill must stand to count as in view, degrees. */
const HILL_MARGIN_DEG = 6;

/**
 * The turn, in whole degrees within `range`, that brings the skyline's highest point within reach into the frame
 * (`halfWidthDeg` each side of the yaw, less a 6° margin): the smallest turn that shows the highest point; 0 when the
 * highest point in reach is already in frame, or when the skyline is level (18.4).
 */
export function hillShift(mask: { az0: number; step: number; el: ArrayLike<number> }, yawDeg: number, halfWidthDeg: number, range: [number, number]): number {
  const n = mask.el.length;
  if (n === 0 || halfWidthDeg <= HILL_MARGIN_DEG) return 0;
  const reach = halfWidthDeg - HILL_MARGIN_DEG;
  const highest = (yaw: number) => {
    let top = -Infinity;
    for (let i = 0; i < n; i++) {
      const az = mask.az0 + i * mask.step;
      const rel = Math.abs(((((az - yaw) % 360) + 540) % 360) - 180);
      if (rel <= reach) top = Math.max(top, mask.el[i]);
    }
    return top;
  };
  let best = 0, bestTop = highest(yawDeg);
  const lo = Math.ceil(Math.min(range[0], range[1])), hi = Math.floor(Math.max(range[0], range[1]));
  for (let s = lo; s <= hi; s++) {
    const top = highest(yawDeg + s);
    if (top > bestTop + 1e-9 || (Math.abs(top - bestTop) <= 1e-9 && Math.abs(s) < Math.abs(best))) {
      best = s;
      bestTop = top;
    }
  }
  return best;
}

/**
 * Where the first view faces at `hour`: beside the Sun with a lander in view, on Earth (4° left) at night with Earth up;
 * and, given the site's mask and the view's half-width, turned up to 30° towards the skyline's highest point, the Sun
 * and the lander kept 6° inside the frame (18.4); never when the view opens on Earth, whose hill is in frame already.
 */
export function openingYaw(series: Series, hour: number, tall: boolean, withLander: boolean, mask?: { az0: number; step: number; el: ArrayLike<number> }, halfWidthDeg?: number): number {
  const onEarth = series.sunFraction[hour] === 0 && series.earthVisible[hour] === 1;
  const base = (openingAnchor(series, hour) + (onEarth ? -4 : withLander ? openFromSun(tall) : 0) + 360) % 360;
  if (!mask || halfWidthDeg === undefined || onEarth) return base;
  // Where the Sun (or its place) and the lander stand against the view's middle, degrees to the right.
  const sunRel = withLander ? -openFromSun(tall) : 0;
  const landerRel = withLander ? landerFrom(false, tall) - openFromSun(tall) : 0;
  const inside = halfWidthDeg - HILL_MARGIN_DEG;
  const range: [number, number] = [Math.max(-30, -inside - Math.min(sunRel, landerRel)), Math.min(30, inside - Math.max(sunRel, landerRel))];
  if (range[0] > range[1]) return base;
  return (base + hillShift(mask, base, halfWidthDeg, range) + 360) % 360;
}
```

Check the arithmetic against the tests before running: wide, `openFromSun` −35 so `sunRel` 35, `landerRel` −40 + 35 = −5, `inside` 38, range [max(−30, −38 + 5), min(30, 38 − 35)] = [−30, 3]; a hill at 40 with the base at 65: the frame reaches 65 + s ± 38; the hill is inside when 65 + s − 38 ≤ 40, s ≤ 13: already in frame at s = 0, so the test's first `openingYaw` expectation must be `65` (fix the test: use a hill at 20: inside when 65 + s − 38 ≤ 20, s ≤ −7, the smallest turn −7; expect `65 - 7`). The `hillShift` test's first case: yaw 100, reach 38, hill 40: 100 + s − 38 ≤ 40, s ≤ −22: expect `-22`, not −28 (the margin is 6, not 12): fix the test to `-22`. The third case, a hill at 140: inside when 65 + s + 38 ≥ 140, s ≥ 37: out of range, so the best is 0: expect `65`, not 68: fix the test. Write the tests with these corrected numbers before Step 2.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/lib/viz/standOpening.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/viz/standOpening.ts web/src/lib/viz/standOpening.test.ts
git commit -m "feat(web): the opening turns up to 30° towards the skyline's highest point, the Sun and the lander kept in frame"
```

---

### Task 8: The arrival's Skip, intro, Earth label and the ridge's name (subagent)

**Files:**
- Modify: `web/src/components/home/Arrival.tsx:171–187`, `web/src/components/home/ArrivalCanvas.tsx:592`, `web/src/lib/viz/arrival.ts:17`
- Test: `web/src/components/home/Arrival.test.tsx` (lines 170–191), `ArrivalCanvas.test.tsx:238`, `web/src/lib/viz/arrival.test.ts:50`

**Interfaces:**
- Produces: Skip's class `max-sm:hidden` while `beat < 1`; the intro's three sentences; the Earth label `Earth, 394,000 km away on 1 January 2027: small because it is far`; the ridge's sentence `NASA has shortlisted de Gerlache Rim 2, this ridge, for astronauts to land on.`

- [ ] **Step 1: Write the failing tests**

`Arrival.test.tsx`: line 170 becomes `/^Earthrise is a forecast for landing sites and dates\. Pick a place and a day from 2024 to 2036\. See its hours of sunlight/`; in the test at 184 add, after the first `scrolled(2)` expectation, a check at the first screen's end:

```ts
    // On a phone Skip waits for the second screen, so it never covers the first screen's words (18.3).
    scrolled(0.5);
    expect(screen.getByRole('button', { name: 'Skip' }).className).toMatch(/\bmax-sm:hidden\b/);
    scrolled(1);
    expect(screen.getByRole('button', { name: 'Skip' }).className).not.toMatch(/\bmax-sm:hidden\b/);
```

(if `scrolled` takes whole screens only, use the test file's way of setting a fractional scroll; the beat at half a screen is 0.) `ArrivalCanvas.test.tsx:238`: `/^Earth, 3\d\d,000 km away on 1 January 2027: small because it is far$/`. `arrival.test.ts:50`: `'NASA has shortlisted de Gerlache Rim 2, this ridge, for astronauts to land on.'`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd web && npx vitest run src/components/home/Arrival.test.tsx src/components/home/ArrivalCanvas.test.tsx src/lib/viz/arrival.test.ts --maxWorkers=1`
Expected: FAIL on the four strings and Skip's class.

- [ ] **Step 3: Implement**

`Arrival.tsx:171`: `className={`btn fixed bottom-6 right-6 z-20 border-white/30 bg-black/70 max-sm:bottom-auto ${beat < 1 ? 'max-sm:hidden ' : ''}${landedAt(beat) ? 'max-sm:top-[160px]' : 'max-sm:top-4'}`}` (`beat` is the component's current beat, as `landedAt(beat)` reads it). Lines 186–187:

```tsx
                Earthrise is a forecast for landing sites and dates. Pick a place and a day from 2024 to 2036. See its hours of sunlight and of radio contact with Earth, and
                how long a lander keeps power, for three ready-made landers or your own.
```

`ArrivalCanvas.tsx:592`: `: small because it is far`. `arrival.ts:17`: `'NASA has shortlisted de Gerlache Rim 2, this ridge, for astronauts to land on.'` (check `ArrivalCanvas.tsx:445`'s comment and any placement that keys off the sentence's length).

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/components/home src/lib/viz/arrival.test.ts --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/home/Arrival.tsx web/src/components/home/Arrival.test.tsx web/src/components/home/ArrivalCanvas.tsx web/src/components/home/ArrivalCanvas.test.tsx web/src/lib/viz/arrival.ts web/src/lib/viz/arrival.test.ts
git commit -m "feat(web): the arrival's Skip waits for a phone's second screen; a forecast, not a browser; Earth small because it is far; the ridge named"
```

---

### Task 9: The arrival's frame rate (main session or subagent, after the prototype's report)

**Files:**
- Modify: as `mock_d3/proto/NOTES.md` names the winning variant: `web/src/lib/sky/groundLevels.ts` (`half(l)`, the flight level's mesh step) for every fourth cell; `web/src/lib/sky/shadowRule.ts` (`sunMargins`' first step, a uniform `uStart` for the flight level) for the later march; else the edit the profiling found.
- Test: `web/src/lib/sky/groundLevels.test.ts` or `shadowRule.test.ts`, `shaders.test.ts`.

**Interfaces:**
- Consumes: the measured numbers in NOTES.md (p95, frames, over-50 per variant).
- Produces: the arrival's 95th-percentile frame under 50 ms on the laptop (Task 10 measures it).

- [ ] **Step 1: Read NOTES.md and write the failing test for the named variant**

For every fourth cell, in `groundLevels.test.ts`:

```ts
  it('draws the flight level at every fourth cell of its 240 m heights in flight, its light still per pixel (18.4)', () => {
    const g = buildGround(fieldWithFlight(), { flight: true });
    const flight = g.find((m) => m.userData.flight)!;
    expect(flight.userData.stepCells).toBe(4);
    expect((flight.material as THREE.ShaderMaterial).uniforms.uPixel.value).toBe(1);
  });
```

For the later march, in `shadowRule.test.ts`:

```ts
  it('starts the flight level’s march four cells out, the cap’s a cell and a third, so the 240 m level costs no more steps a pixel than the cap (18.4)', () => {
    expect(SHADOW_GLSL).toContain('max(T0_MIN, uStart * cellAt(');
  });
```

and in `groundLevels.test.ts` that the flight material's `uStart` is 4 and the others' 1.3. (Pick the one NOTES.md names; the other is not written.)

- [ ] **Step 2: Run the test to see it fail**

Run: `cd web && npx vitest run src/lib/sky/groundLevels.test.ts src/lib/sky/shadowRule.test.ts --maxWorkers=1`
Expected: FAIL on the new expectation.

- [ ] **Step 3: Implement the named variant**

Every fourth cell: in `groundLevels.ts`, the flight mesh's grid step becomes 4 cells (`half(l)` generalised to `coarsen(l, 4)`, the vertex grid `cols / 4`), `userData.stepCells = 4`, the height slots unchanged (the shader reads the 240 m heights per pixel). The later march: `shadowRule.ts` adds `uniform float uStart;` and the first step `float t = max(T0_MIN, uStart * cellAt(p.xz, 0));`, `groundLevels.ts` sets `uStart: { value: 1.3 }` on every material and `4.0` on the flight level's. Apply the diff NOTES.md recorded for the winner where it gives one.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd web && npx vitest run src/lib/sky --maxWorkers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/sky
git commit -m "perf(web): the arrival's flight level <the variant>, measured on the laptop's Intel chip"
```

---

### Task 10: Checks on the production build, and blind read D3 (main session)

**Files:** none in the repo (frames under `.playwright-mcp/finalD3/`, the harness in the job folder).

- [ ] **Step 1: The whole suite, types and lint**

Run from `web/`: `npx vitest run --maxWorkers=2 > ../.superpowers/sdd/d3-suite.txt 2>&1; tail -5 ../.superpowers/sdd/d3-suite.txt`, `npx tsc --noEmit`, `npm run lint`.
Expected: every test passes; tsc clean; lint with no new warning.

- [ ] **Step 2: The production build and the server**

Run: free memory over 2 GB, then `rm -rf web/.next/cache; cd web && npm run build` (about 4 minutes), then `npx next start --port 3000 --hostname 0.0.0.0` in the background.
Expected: the build succeeds; the server answers on `http://127.0.0.53:3000/`.

- [ ] **Step 3: The stand view's frames and measurements**

Run: `python C:\Users\user\.claude\jobs\a9458886\tmp\d2cap.py stand C:\Users\user\Documents\GitHub\Trinity\.playwright-mcp\finalD3 C:\Users\user\.claude\jobs\a9458886\tmp\d3-jobs.json` with the jobs of `d2-jobs-final.json` plus: the phone at hour 10 (the chip; the band from the section's foot, which holds the chip, to the row's top); 1440 and 820 at hour 219 (the caption docked on the compass plate: its box's bottom equals the strip plate's top); 768 at hour 600 (the flags' rows); 1024 after Turn to Lander (the feet above the row); the card open with Brighter picture pressed; the lander dialog open at 1440 and 390.
Expected: no sideways scroll, no text under 13 px, no text under 4.5:1, no overlap; the phone's band at least 55 %; the caption's bottom equal to the strip's top within 1 px; the flags' stems all in sight at 768; the lander's feet above the row at 1024.

- [ ] **Step 4: The arrival's frame times**

Run: `python C:\Users\user\.claude\jobs\a9458886\tmp\d2frames.py 3000` twice (an 80 s settle each).
Expected: p95 under 50 ms; record the median, p95, max and frames over 50 ms in the ledger.

- [ ] **Step 5: Blind read D3**

Capture the read's frames as read D2-2 did (the arrival's wide and phone screens, the stand view at 1440, 1024, 820 and 390 by day and at night, More open, the lander turned to), then dispatch two reader agents (the judge and the teacher roles, the same briefs as read D2-2, with no access to the spec or the code) on `opus`; collect their scores against the gate of 13.2 and their named changes.
Expected: purpose, next step and look 4 or more; room and readability 3 or more; immersion 4. If the gate fails, one bounded fix pass (TDD) and one re-read, as D2 did; record the ruling.

- [ ] **Step 6: Stop the server; ledger the numbers**

Kill the port-3000 listener; delete `web/.next/cache`; append the measurements and the read's scores to the ledger.

---

### Task 11: The spec as built, the README, the badge, the final review, and the pull request (main session)

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-immersive-space-design.md` (18.6 "D3 as built", 18.7 "D3: the blind read", 18.8 "Asks carried on" if any), `web/README.md` (the stand view's words and controls), `web/public/validation/tests.json` (the suite's counts), the plan's ledger copy `docs/superpowers/plans/2026-10-06-immersive-d3-words-pages-scene.ledger.md`.

- [ ] **Step 1: The spec as built**

Write 18.6 with every difference from 18.2 to 18.4 (the caption's shortened Earthlight line, the chip's 8 px gap, the map's label without a direction, the dock's two elements, the frame-time variant chosen and its numbers), 18.7 with the read's scores and named items, 18.8 with what is carried on.

- [ ] **Step 2: The README and the badge**

Update the stand view's section (Paths, Brighter picture, Change lander, the chip) and `tests.json` from the suite's counts.

- [ ] **Step 3: Commit the docs**

```bash
git add docs web/README.md web/public/validation/tests.json
git commit -m "docs: spec 18 as built for D3 with its blind read, the ledger, the README and the test badge"
```

- [ ] **Step 4: The final review**

Run `review-package` from the merge base to HEAD; dispatch the reviewer on `opus` with the package, the plan, the spec, the Review Focus and the ledger's rulings. Re-grade; one fix pass for Critical and Important, each RED→GREEN with the suite green; minors to the ledger.

- [ ] **Step 5: Push, the pull request, merge on green**

```bash
git push -u origin feat/immersive-d3
gh pr create --title "Immersive design, part D3: the words, the pages and the scene" --body-file <the PR body>
gh pr merge <N> --merge   # after GitGuardian passes
```

The PR body: the three groups, the measurements, the read's scores, the rulings and the deferred minors, ending with the attribution lines.

---

## Self-review

- **Spec coverage.** 18.2: every phrase has a task (1, 3, 4, 8). 18.3: the verdict (4), the plate's width (4), one plate at the foot (3, 4), the flags (2), the feet (3, 4), Skip (8), Brighter picture (4, 5), Change lander (4). 18.4: the frame rate (9, 10), the key light (5), the blotches (6), the hill (4, 7). 18.5: Task 10.
- **Placeholders.** Task 9 names two fully written variants and the rule that chooses one from NOTES.md; no step says "TBD".
- **Type consistency.** `openingYaw`'s mask type is `StandScene['mask']` in Task 4 and the literal `{ az0; step; el }` in Task 7: the same shape. `RendererLike.setBright?` (Task 5) is what Task 4's stub and `StandCanvas` call. `STRIP_H` (Task 3) is what Task 4's dock test pins at 92 − 14. `betterChip` (Task 1) is what Task 4's chip shows. `WATCH_LEAD`/`WATCH_LEAD_DOTS` (Task 1) are what Task 4 renders.
- **Review Focus.** 1 → Task 4's "no chip" test; 2 → Task 2's crowd test; 3 → Task 7's "nothing without a mask" test; 4 → Task 4's storage test and Task 5's `setBright`; 5 → Task 4's dialog test and Task 10's frames.
