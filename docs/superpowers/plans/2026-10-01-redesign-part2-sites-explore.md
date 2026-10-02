# Redesign Part 2: Site List and Explore Answer Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page that lists every landing site with how long a lander keeps power there, and an Explore page that leads with the answer in words (how long the power lasts, why, and the better landing date), a left-to-right time chart and a time bar pinned to the bottom.

**Architecture:** The new measure, time with power and the best landing date, is pure TypeScript in `web/src/lib/engine/landing.ts` with a Python reference in `pipeline/lunar_pipeline/landing.py` and golden fixtures in `data/fixtures/landing/`. Wording lives in `web/src/lib/viz/answer.ts` and `status.ts`. The zustand store gains the best landing date for the selected site, lander presets and an overview of all sites. The pages are new components under `web/src/components/sites/` and `web/src/components/explore/`; the cockpit components that Compare and the brief still use (`VerdictChip`, `WindowControls`, `PlannerParamsPanel`, `Timeline`, `SkyDome`, the old `verdictFor`) stay untouched until part 4.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, zustand 5, vitest 5 with Testing Library; Python 3.12, numpy, pytest.

**Spec:** `docs/superpowers/specs/2026-10-01-ui-redesign-design.md` (sections 5, 6.2, 6.3, 7, 9, 10, 12). Reference images: `docs/design/redesign-2026-10/design-sites-light.jpg`, `design-explore-light.jpg`, `design-explore-dark.jpg`. Read `web/AGENTS.md` first: this Next.js has breaking changes, the guides are in `web/node_modules/next/dist/docs/`.

## Spec amendment made by this plan (Task 1 writes it into the spec)

Section 7.1 of the spec searched the best landing date "over the next 12 months". A reference scan for 1 January 2027 with the default lander shows that rule sends almost every site to October 2027 (the best season), for example de Gerlache Rim 2 to 12 October for 14 days 3 hours. That answers a question the user did not ask: they chose a period. The approved mockup said "arriving between 1 and 30 January 2027" and "Land on 20 January instead: power for 12 days 15 hours".

The rule this plan builds:

- **Time with power** from a landing hour: the hours from that hour to the first brownout of a battery walk that starts with the configured charge (full by default), capped at the period length.
- **Best landing date in the period:** among the hours of the chosen period at which any part of the Sun is visible (a lander arrives in daylight), the hour with the longest time with power; ties go to more contact with Earth during that time, then to the earlier hour. No sunlit hour in the period: no best date.
- **Best date in the next 12 months:** the same measure on a six-hour grid over 365 days from the period start. This is what the assistant's "best N-day window" runs, and Explore offers it as a link under the verdict. For compared sites the time with power is averaged over the sites and only hours at which every site is sunlit are candidates.

## Global Constraints

- No text under 13 px anywhere; secondary text is 15 px (`text-[15px]`, never `text-sm`), body 16 px. Labels on a chart or picture are page text laid over the drawing, never text inside a scaled SVG (see `web/src/components/SkyRow.tsx` and the `.label-centred` rule).
- Design language (spec sections 4 and 15): headings use the class `display` (Bricolage at 87.5 % width, weight 700; add `font-semibold` for titles of 23 to 26 px). Panels are `.panel` (8 px radius), pictures `.stage` (6 px, true black, 1 px edge), label plates `rounded-[5px]`, outcome tags fully round and outlined. No shadows, gradients or blur as decoration. A link that stands alone is underlined (`font-semibold underline decoration-[1.5px] underline-offset-4`). Items with the same attributes go in a table or a ruled list, not in a row of cards. A dark picture that holds controls carries `.stage` or `data-stage`, so its focus ring is the bright gold. The only motion that plays by itself is the reveal on the home page.
- Part 1 as built: `SkyRow({ el, hill, visible, az?, startUtc, body, caption, height = 200, ticks = true, reveal = false })` draws two named height lines and fades hills that run off the top; `SkyRowKey({ body, compass?, className? })` is its key; side labels sit `var(--chart-inset, 10px)` from the edges. The home page list of places is `PLACES` in `web/src/lib/data/home.ts`.
- Buttons 44 to 52 px tall, fields and selects 52 px, segmented controls 52 px. Use the classes `.btn`, `.btn-primary`, `.btn-ink`, `.btn-sm`, `.field`, `.panel`, `.stage` from `web/src/app/globals.css`.
- One gold button (`.btn-primary`) per screen. On Explore it is the better landing date, or "Compare sites" when there is none. Play is `.btn-ink`. "Ask" is an outline button.
- Plain words in primary copy: never LOLA, DE440, Horizons, CLPS, ephemeris or skyline outside the footer credits and the Accuracy page. Say "the hills", "NASA elevation data".
- Durations: `spanWords` ("12 days 15 hours") in sentences, `spanShort` ("12 d 15 h") in cards and tables; never bare hours above 48.
- Dates: "20 January" in sentences and buttons, "20 Jan" on charts and in cards; the year is added only when it differs from the period start's year. Times are UTC and say so once, in the time bar.
- Colour: tokens only. Gold is the Sun, blue is Earth. Green and red are used only for the power verdict and the battery, always with an icon or words.
- Both themes must work. Picture panels are `.stage` (dark in both themes).
- Engine results do not change except where spec section 7 (as amended above) says so: the parity tests against Python and JPL stay green.
- Compare, the brief, How it works and Accuracy keep working: do not change `verdictFor`, `VerdictChip`, `WindowControls`, `PlannerParamsPanel`, `Timeline`, `SkyDome`.
- The OpenRouter key in `web/.env.local` is the user's secret: never read, print, log or commit it. No call to OpenRouter in tests.
- Commits end with the two attribution lines given in the session.

## Review Focus

1. A period that begins in the dark, ends in the dark, or has no sunrise at all: every verdict sentence stays true and names real dates; no "undefined", no negative or zero durations in prose. Tests in Task 3.
2. A brownout while the Sun is up (a panel too small for the load): the verdict must not say "then night". Test in Task 3.
3. The site list while skylines are still loading, or when one fails to load: rows show a placeholder, the page stays usable, the order does not jump under the pointer more than once. Tests in Tasks 4 and 5.
4. A start date close to the end of the Sun and Earth table (December 2036): the landing-date search clamps and never throws. Tests in Tasks 2 and 4.
5. The time bar from the keyboard and under reduced motion: arrow keys move one hour, Page Up and Page Down one day, both clamp at the ends; Play is disabled with a note when the system asks for reduced motion. Tests in Task 9.

## File map

| File | Responsibility |
|---|---|
| `data/sites.json`, `data/sites_derived.json` | `label` and `blurb` for every site |
| `pipeline/lunar_pipeline/sites.py`, `sync_local.py` | carry the two fields; catalogue copy |
| `pipeline/lunar_pipeline/landing.py` | reference: time with power, best landing date; fixture writer |
| `data/fixtures/landing/*.json` | golden values for the TypeScript port |
| `web/src/lib/engine/power.ts` | `PowerResult.powered` |
| `web/src/lib/engine/landing.ts` | `poweredFrom`, `landingScores`, `bestLanding`, `bestLandingAcross` |
| `web/src/lib/viz/answer.ts` | the verdict in words, the better date, the hint |
| `web/src/lib/viz/status.ts` | one sentence for the hour under the cursor |
| `web/src/lib/lander.ts` | three lander presets, the lander line, battery hours |
| `web/src/lib/store/explore.ts` | default site, `best`, `findBestWindow` on the new measure, `overview` |
| `web/src/components/PeriodControls.tsx` | From date and the 14, 30, 90 segmented control |
| `web/src/components/ReliefMap.tsx` | the relief picture with site pins |
| `web/src/components/sites/SitesView.tsx`, `web/src/app/sites/page.tsx` | "Choose a landing site" |
| `web/src/components/explore/PeriodBand.tsx`, `LanderDialog.tsx` | the band of four controls |
| `web/src/components/explore/VerdictPanel.tsx`, `NumbersCard.tsx` | the answer row |
| `web/src/lib/viz/timechart.ts`, `web/src/components/explore/TimeChart.tsx` | the three-row chart |
| `web/src/components/explore/TimeBar.tsx` | Play, date, status sentence, slider |
| `web/src/components/explore/GroundPanel.tsx`, `WhereOnMoon.tsx`, `AskPanel.tsx` | lower panels |
| `web/src/components/ExploreView.tsx` | assembles the page; the old cockpit pieces it alone used are deleted |

---

### Task 1: Spec amendment; site labels and one-line descriptions

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-ui-redesign-design.md` (sections 7.1 and 7.2)
- Modify: `data/sites.json`; regenerate `data/sites_derived.json`, `web/src/lib/data/catalogue.json`
- Modify: `pipeline/lunar_pipeline/sites.py`, `pipeline/lunar_pipeline/sync_local.py`
- Modify: `pipeline/tests/test_sites.py`, `pipeline/tests/test_sync_local.py`
- Modify: `web/src/lib/data/loaders.ts`
- Create: `web/src/lib/data/sites.test.ts`

**Interfaces:**
- Produces (Python): `Site.label: str | None`, `Site.blurb: str | None`; `derive_rim` may carry `label` and `blurb` for the derived rim point; `CATALOGUE_FIELDS` includes `label`, `blurb`.
- Produces (TypeScript, `web/src/lib/data/loaders.ts`): `Site.label?: string`, `Site.blurb?: string`, `siteLabel(site: Pick<Site, 'name' | 'label'>): string`.

- [ ] **Step 1: Amend the spec**

In `docs/superpowers/specs/2026-10-01-ui-redesign-design.md`, section 7.1, replace the bullet that begins `- *Best landing date*:` with:

```markdown
- *Best landing date in the period*: among the hours of the chosen period at which any part of the Sun is visible (a lander arrives in daylight), the hour with the longest time with power, capped at the period length; ties go to more contact with Earth during that time, then to the earlier hour. The lander lands with the configured battery charge (full by default). This is the gold button on Explore and the last column of the site list.
- *Best date in the next 12 months*: the same measure on a six-hour grid over 365 days from the period start. It replaces the scoring inside `findBestWindow`, so the assistant's "best window" uses it, and Explore offers it as a link under the verdict. For compared sites the time with power is averaged and only hours at which every site is sunlit are candidates.
- Amended on 2 October 2026 by the plan for part 2. The first version searched 12 months for the gold button as well; a reference scan sent almost every site to October 2027, away from the period the user chose, and the approved mockup offered a date inside the period ("Land on 20 January instead").
```

In section 7.2, replace `"No landing date in the next 12 months gives more power here"` with `"No landing date in these N days gives more power here"`.

- [ ] **Step 2: Write the failing pipeline tests**

Add to `pipeline/tests/test_sites.py` (add `import re` at the top and `all_sites` to the import from `lunar_pipeline.sites`):

```python
def test_every_site_has_a_short_label_and_one_plain_line():
    sites = all_sites()
    assert len(sites) == 19
    for s in sites:
        assert s.label and len(s.label) <= 28, s.id
        assert s.blurb and len(s.blurb) <= 72, s.id
        assert not re.search(r"LOLA|DE440|CLPS|Horizons|Artemis III", f"{s.label} {s.blurb}"), s.id
    assert len({s.label for s in sites}) == len(sites)


def test_derived_rim_point_takes_its_label_and_blurb_from_the_parent(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=1024, scale_m=20.0)
    centre = Site(
        "c", "c", -89.9, 45.0, "classic", True, "test",
        derive_rim={"r_min_km": 4.0, "r_max_km": 6.0, "label": "Test rim summit", "blurb": "The highest point of the rim"},
    )
    derived = derive_rim_points(grid, [centre])[0]
    assert derived.label == "Test rim summit"
    assert derived.blurb == "The highest point of the rim"
```

In `pipeline/tests/test_sync_local.py` add after the `set(doc["sites"][0].keys())` assertion:

```python
    assert {"label", "blurb"} <= set(CATALOGUE_FIELDS)
    assert all(s["label"] and s["blurb"] for s in doc["sites"])
```

- [ ] **Step 3: Run them to see them fail**

Run (from `pipeline/`): `uv run pytest tests/test_sites.py tests/test_sync_local.py -q`
Expected: FAIL: `Site` has no attribute `label`; `label` not in `CATALOGUE_FIELDS`.

- [ ] **Step 4: Carry the fields in the pipeline**

`pipeline/lunar_pipeline/sites.py`: add two fields at the end of the `Site` dataclass:

```python
    label: str | None = None
    blurb: str | None = None
```

and in `derive_rim_points`, add to the `Site(...)` call for the derived point:

```python
                label=s.derive_rim.get("label"),
                blurb=s.derive_rim.get("blurb"),
```

`pipeline/lunar_pipeline/sync_local.py`:

```python
CATALOGUE_FIELDS = ("id", "name", "label", "blurb", "lat", "lon", "category", "polar")
```

- [ ] **Step 5: Add the labels and blurbs to `data/sites.json`**

The file is hand-formatted, so the fields are inserted as text. Run once from the repository root (the script is not kept):

```python
import json
from pathlib import Path

LABELS = {
    "south_pole": ("Lunar south pole", "The pole itself, on the rim of Shackleton crater"),
    "shackleton_center": ("Shackleton crater floor", "The floor of the crater at the pole, always in shadow"),
    "de_gerlache_center": ("de Gerlache crater floor", "A crater floor that never sees the Sun"),
    "connecting_ridge": ("Connecting Ridge", "The ridge between Shackleton and de Gerlache craters"),
    "peak_near_shackleton": ("Peak near Shackleton", "A summit 30 km from the pole"),
    "peak_near_cabeus_b": ("Peak near Cabeus B", "A peak beside Cabeus B crater"),
    "haworth": ("Haworth", "Beside a crater that is always in shadow"),
    "malapert_massif": ("Malapert Massif", "A mountain 120 km from the pole"),
    "mons_mouton_plateau": ("Mons Mouton Plateau", "The centre of this region sits on the mountain's shaded flank"),
    "mons_mouton": ("Mons Mouton", "A broad, flat-topped mountain"),
    "nobile_rim_1": ("Nobile Rim 1", "On the rim of Nobile crater"),
    "nobile_rim_2": ("Nobile Rim 2", "On the rim of Nobile crater, farther from the pole"),
    "de_gerlache_rim_2": ("de Gerlache Rim 2", "A ridge on a crater rim, 52 km from the pole"),
    "slater_plain": ("Slater Plain", "A plain beside Slater crater"),
    "im1_odysseus": ("IM-1 Odysseus", "Where the Odysseus lander touched down in February 2024"),
    "im2_athena": ("IM-2 Athena", "Where the Athena lander came to rest on its side in March 2025"),
    "blue_ghost_m1": ("Blue Ghost Mission 1", "Where Blue Ghost worked for 14 days in March 2025, far from the pole"),
}
RIMS = {
    '"r_max_km": 12.0}': ("Shackleton rim summit", "The highest point of the crater rim, next to the pole"),
    '"r_max_km": 18.0}': ("de Gerlache rim summit", "The highest point of the crater rim"),
}

path = Path("data/sites.json")
lines = path.read_text(encoding="utf-8").split("\n")
out = []
done = set()
for line in lines:
    for old, (label, blurb) in RIMS.items():
        if old in line:
            line = line.replace(old, old[:-1] + f', "label": {json.dumps(label)}, "blurb": {json.dumps(blurb)}' + "}")
    out.append(line)
    for site_id, (label, blurb) in LABELS.items():
        if f'{{"id": "{site_id}",' in line:
            out.append(f'     "label": {json.dumps(label)}, "blurb": {json.dumps(blurb)},')
            done.add(site_id)
assert done == set(LABELS), sorted(set(LABELS) - done)
path.write_text("\n".join(out), encoding="utf-8", newline="\n")
doc = json.loads(path.read_text(encoding="utf-8"))
assert all(s.get("label") and s.get("blurb") for s in doc["sites"])
print("labelled", len(doc["sites"]), "sites")
```

Expected output: `labelled 17 sites`.

- [ ] **Step 6: Regenerate the derived sites and the catalogue**

Run (from `pipeline/`):

```bash
uv run python -m lunar_pipeline.cli sites-derive
uv run python -m lunar_pipeline.cli sync-local
```

Expected: `data/sites_derived.json` now carries `label` and `blurb` for the two rim points with unchanged coordinates (`-89.78131, -156.25683` and `-88.66401, -68.40606`); `web/src/lib/data/catalogue.json` has `label` and `blurb` for 19 sites; `web/public/data/sites.json` and `sites_derived.json` are refreshed for the dev server.

- [ ] **Step 7: Run the pipeline tests**

Run: `uv run pytest tests/test_sites.py tests/test_sync_local.py -q`
Expected: PASS.

- [ ] **Step 8: Write the failing web test**

`web/src/lib/data/sites.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readJson } from '../engine/__tests__/helpers';
import catalogue from './catalogue.json';
import { siteLabel, type Site } from './loaders';

const sites = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];

describe('site labels and blurbs', () => {
  it('gives every catalogue site a short label and one plain line', () => {
    expect(sites).toHaveLength(19);
    for (const s of sites) {
      expect(s.label, s.id).toBeTruthy();
      expect(s.label!.length, s.id).toBeLessThanOrEqual(28);
      expect(s.blurb, s.id).toBeTruthy();
      expect(s.blurb!.length, s.id).toBeLessThanOrEqual(72);
      expect(`${s.label} ${s.blurb}`, s.id).not.toMatch(/LOLA|DE440|CLPS|Horizons|Artemis III/);
    }
    expect(new Set(sites.map((s) => s.label)).size).toBe(sites.length);
  });

  it('carries them into the catalogue bundled with the app', () => {
    const bundled = catalogue.sites as Site[];
    expect(bundled).toHaveLength(19);
    for (const s of bundled) expect(Boolean(s.label && s.blurb), s.id).toBe(true);
  });

  it('shows the formal name when a site has no label', () => {
    expect(siteLabel({ name: 'Custom site -89.500°, 10.000°' })).toBe('Custom site -89.500°, 10.000°');
    expect(siteLabel({ name: 'de Gerlache Rim 2 (Artemis III region)', label: 'de Gerlache Rim 2' })).toBe('de Gerlache Rim 2');
  });
});
```

Run (from `web/`): `npx vitest run src/lib/data/sites.test.ts`
Expected: FAIL: `siteLabel` is not exported.

- [ ] **Step 9: Add the fields and the helper**

`web/src/lib/data/loaders.ts`: in `interface Site`, after `name: string;`:

```ts
  /** Short display name for lists, titles and map pins; `name` stays the formal catalogue name. */
  label?: string;
  /** One plain line that says what the place is. */
  blurb?: string;
```

and below the interface:

```ts
/** The name to show: the short label when the catalogue has one. */
export function siteLabel(site: Pick<Site, 'name' | 'label'>): string {
  return site.label ?? site.name;
}
```

- [ ] **Step 10: Run the web tests**

Run: `npx vitest run src/lib/data src/lib/ai` and `npx tsc --noEmit`
Expected: PASS (the assistant's site matcher still reads `name`).

- [ ] **Step 11: Commit**

```bash
git add docs/superpowers/specs/2026-10-01-ui-redesign-design.md data/sites.json data/sites_derived.json pipeline/lunar_pipeline/sites.py pipeline/lunar_pipeline/sync_local.py pipeline/tests/test_sites.py pipeline/tests/test_sync_local.py web/src/lib/data/catalogue.json web/src/lib/data/loaders.ts web/src/lib/data/sites.test.ts
git commit -m "feat(data): short labels and one-line descriptions for every site; best landing date is searched inside the period"
```

---

### Task 2: Time with power and the best landing date (Python reference, fixtures, TypeScript)

**Files:**
- Create: `pipeline/lunar_pipeline/landing.py`, `pipeline/tests/test_landing.py`
- Modify: `pipeline/lunar_pipeline/cli.py`, `pipeline/tests/test_cli.py`
- Create: `data/fixtures/landing/*.json` (five files, generated)
- Modify: `web/src/lib/engine/power.ts`, `web/src/lib/engine/power.test.ts`
- Create: `web/src/lib/engine/landing.ts`, `web/src/lib/engine/landing.test.ts`

**Interfaces:**
- Produces (Python): `powered_from(power_w, cfg, hour, cap_hours) -> int`; `best_landing(series, cfg, start, stop, step, cap_hours) -> dict | None` with keys `hour`, `powered_hours`, `earth_fraction`; `landing_fixture(site_id, start_utc, days) -> dict`; `write_landing_fixture(site_id, start_utc, days) -> Path`; CLI `fixture-landing --site ID [--start UTC] [--days N]`.
- Produces (TypeScript, `power.ts`): `PowerResult.powered: Uint8Array` (1 for an hour with power, 0 for a brownout hour).
- Produces (TypeScript, `landing.ts`):
  - `YEAR_HOURS = 8760`
  - `interface Landing { hour: number; poweredHours: number; earthFraction: number }`
  - `interface LandingScan { from: number; to: number; step: number; capHours: number }`
  - `interface LandingScores { hours: Int32Array; powered: Int32Array; contact: Int32Array; sunlit: Uint8Array }`
  - `timeWithPower(power: { firstBrownoutHour: number | null; powerW: { length: number } }): number`
  - `poweredFrom(powerW: ArrayLike<number>, cfg: PowerConfig, hour: number, capHours: number): number`
  - `landingScores(series: Series, cfg: PowerConfig, scan: LandingScan): LandingScores`
  - `bestLandingAcross(scores: LandingScores[]): Landing | null`
  - `bestLanding(series: Series, cfg: PowerConfig, scan: LandingScan): Landing | null`

- [ ] **Step 1: Write the failing Python tests**

`pipeline/tests/test_landing.py`:

```python
import numpy as np

from lunar_pipeline.landing import best_landing, powered_from
from lunar_pipeline.power import PowerConfig, power_series

# 1361 W while any Sun shows, 100 W load, 1000 Wh battery: ten hours in the dark.
CFG = PowerConfig(panel="full_tracking", area_m2=1.0, efficiency=1.0, load_w=100.0, battery_wh=1000.0)


def series(sun, earth=None) -> dict:
    sun = np.asarray(sun, dtype=np.float64)
    n = sun.size
    return {
        "sun_az": np.zeros(n),
        "sun_el": np.full(n, 5.0),
        "sun_fraction": sun,
        "sun_au": np.ones(n),
        "earth_visible": np.asarray(earth if earth is not None else np.zeros(n), dtype=bool),
    }


def test_powered_from_counts_the_hours_to_the_first_brownout():
    dark = power_series(series([0] * 30), CFG)
    assert powered_from(dark, CFG, 0, 30) == 10
    assert powered_from(dark, CFG, 0, 6) == 6  # capped at the period
    assert powered_from(dark, CFG, 25, 30) == 5  # capped at the end of the table
    day_then_night = power_series(series([1] * 5 + [0] * 30), CFG)
    assert powered_from(day_then_night, CFG, 0, 35) == 15
    assert powered_from(day_then_night, CFG, 5, 35) == 10


def test_best_landing_is_the_sunlit_hour_with_the_longest_time_with_power():
    s = series([0] * 10 + [1] * 20 + [0] * 30 + [1] * 5 + [0] * 40)
    assert best_landing(s, CFG, 0, 105, 1, 100) == {"hour": 10, "powered_hours": 30, "earth_fraction": 0.0}


def test_ties_go_to_more_contact_with_earth_then_to_the_earlier_hour():
    sun = [1] * 10 + [0] * 30 + [1] * 10 + [0] * 30
    earth = [0] * 40 + [1] * 40
    assert best_landing(series(sun, earth), CFG, 0, 80, 1, 80)["hour"] == 40
    assert best_landing(series(sun), CFG, 0, 80, 1, 80)["hour"] == 0


def test_no_sunlit_hour_means_no_landing_date():
    assert best_landing(series([0] * 50), CFG, 0, 50, 1, 50) is None


def test_time_with_power_is_capped_at_the_period_length():
    assert best_landing(series([1] * 50), CFG, 0, 26, 6, 24) == {"hour": 0, "powered_hours": 24, "earth_fraction": 0.0}
```

In `pipeline/tests/test_cli.py` add `"fixture-landing"` to the list of commands and to the tuple of commands that take `--site`:

```python
        "report", "fixture-time", "fixture-metrics", "fixture-power", "fixture-landing", "validate", "sync-local", "home-assets",
    ]:
        args = parser.parse_args([cmd] + (["--site", "x"] if cmd in ("report", "fixture-metrics", "fixture-power", "fixture-landing") else []))
```

- [ ] **Step 2: Run them to see them fail**

Run (from `pipeline/`): `uv run pytest tests/test_landing.py tests/test_cli.py -q`
Expected: FAIL: no module `lunar_pipeline.landing`; `fixture-landing` is not a command.

- [ ] **Step 3: Write the Python reference**

`pipeline/lunar_pipeline/landing.py`:

```python
"""Time with power and the best landing date (reference for web/src/lib/engine/landing.ts)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from . import config
from .ephemeris import load_table
from .illumination import hourly_series
from .masks import load_mask
from .power import PowerConfig, config_dict, power_series
from .sites import all_sites

YEAR_HOURS = 365 * 24
SAMPLE_HOURS = [0, 1, 6, 24, 67, 100, 240, 466, 500, 719]


def powered_from(power_w, cfg: PowerConfig, hour: int, cap_hours: int) -> int:
    """Hours with power for a lander arriving at `hour` with the configured charge: hours to the first brownout, capped."""
    cap = max(0.0, cfg.battery_wh)
    e = min(cap, max(0.0, cfg.initial_soc_fraction) * cap)
    end = min(len(power_w), hour + cap_hours)
    for h in range(hour, end):
        nxt = e + float(power_w[h]) - cfg.load_w
        if nxt < 0.0:
            return h - hour
        e = min(cap, nxt)
    return max(0, end - hour)


def best_landing(series: dict, cfg: PowerConfig, start: int, stop: int, step: int, cap_hours: int) -> dict | None:
    """The sunlit landing hour with the longest time with power; ties go to more contact with Earth, then to the earlier hour."""
    power_w = power_series(series, cfg)
    vis = np.concatenate([[0], np.cumsum(np.asarray(series["earth_visible"], dtype=np.int64))])
    best: dict | None = None
    for h in range(start, min(stop, len(power_w)), step):
        if not series["sun_fraction"][h] > 0:
            continue
        n = powered_from(power_w, cfg, h, cap_hours)
        frac = float(vis[h + n] - vis[h]) / n if n > 0 else 0.0
        if best is None or n > best["powered_hours"] or (n == best["powered_hours"] and frac > best["earth_fraction"]):
            best = {"hour": h, "powered_hours": n, "earth_fraction": frac}
    return best


def landing_fixture(site_id: str, start_utc: str, days: int, cfg: PowerConfig | None = None) -> dict:
    cfg = cfg or PowerConfig()
    site = next(s for s in all_sites() if s.id == site_id)
    table, header = load_table()
    mask = load_mask(site_id) if site.polar else np.zeros(720)
    period = days * 24
    series = hourly_series(site, mask, table, header, start_utc, YEAR_HOURS + period)
    power_w = power_series(series, cfg)
    samples = [h for h in SAMPLE_HOURS if h < period]
    return {
        "site_id": site_id,
        "lat": site.lat,
        "lon": site.lon,
        "polar": site.polar,
        "start_utc": start_utc,
        "days": days,
        "config": config_dict(cfg),
        "now_hours": powered_from(power_w, cfg, 0, period),
        "period_best": best_landing(series, cfg, 0, period, 1, period),
        "year_best": best_landing(series, cfg, 0, YEAR_HOURS, 6, period),
        "sample_hours": samples,
        "sample_powered": [powered_from(power_w, cfg, h, period) for h in samples],
    }


def write_landing_fixture(
    site_id: str,
    start_utc: str = "2027-01-01T00:00:00",
    days: int = 30,
    out_dir: Path = config.DATA_DIR / "fixtures" / "landing",
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{site_id}_{start_utc[:10]}_{days}d.json"
    path.write_text(json.dumps(landing_fixture(site_id, start_utc, days), indent=1) + "\n", encoding="utf-8", newline="\n")
    return path
```

`pipeline/lunar_pipeline/cli.py`: after the `fixture-power` parser lines add

```python
    fl = sub.add_parser("fixture-landing", help="write a best-landing-date golden fixture for a site")
    fl.add_argument("--site", required=True)
    fl.add_argument("--start", default="2027-01-01T00:00:00")
    fl.add_argument("--days", type=int, default=30)
```

and after the `fixture-power` branch in `main`:

```python
    elif args.cmd == "fixture-landing":
        from .landing import write_landing_fixture

        print(write_landing_fixture(args.site, args.start, args.days))
```

- [ ] **Step 4: Run the Python tests**

Run: `uv run pytest tests/test_landing.py tests/test_cli.py -q` and `uv run ruff check lunar_pipeline/landing.py tests/test_landing.py`
Expected: PASS; no findings.

- [ ] **Step 5: Write the fixtures**

Run (from `pipeline/`):

```bash
uv run python -m lunar_pipeline.cli fixture-landing --site de_gerlache_rim_2
uv run python -m lunar_pipeline.cli fixture-landing --site shackleton_center
uv run python -m lunar_pipeline.cli fixture-landing --site shackleton_center_rim_high
uv run python -m lunar_pipeline.cli fixture-landing --site blue_ghost_m1 --start 2025-03-02T00:00:00 --days 14
uv run python -m lunar_pipeline.cli fixture-landing --site nobile_rim_1 --days 90
```

Expected values (measured on 1 October 2026):

| File | now_hours | period_best | year_best |
|---|---|---|---|
| `de_gerlache_rim_2_2027-01-01_30d.json` | 76 | hour 466, 303 h | hour 6834, 333 h |
| `shackleton_center_2027-01-01_30d.json` | 10 | null | null |
| `shackleton_center_rim_high_2027-01-01_30d.json` | 720 | hour 0, 720 h | hour 6102, 720 h |
| `blue_ghost_m1_2025-03-02_14d.json` | 336 | hour 1, 336 h | hour 6, 336 h |
| `nobile_rim_1_2027-01-01_90d.json` | 58 | hour 373, 388 h | hour 6744, 403 h |

Hour 466 of January 2027 is 20 January 10:00 UTC, and 303 hours are 12 days 15 hours: the figures of the approved mockup.

- [ ] **Step 6: Write the failing TypeScript tests**

Add to `web/src/lib/engine/power.test.ts`, inside `describe('simulateBattery', ...)`:

```ts
  it('flags each hour as powered or browned out', () => {
    const p = new Float64Array(14); // darkness: the 1000 Wh battery carries 100 W for ten hours
    p[12] = 300; // one sunlit hour recharges 200 Wh
    const r = simulateBattery(p, cfg);
    expect(Array.from(r.powered)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1]);
    expect(r.brownoutHours).toBe(2);
    expect(r.firstBrownoutHour).toBe(10);
  });
```

`web/src/lib/engine/landing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from './ephemeris';
import { bestLanding, bestLandingAcross, landingScores, poweredFrom, timeWithPower, YEAR_HOURS } from './landing';
import { hourlySeries, type Series } from './metrics';
import { DEFAULT_POWER, powerSeries, simulateBattery, type PowerConfig } from './power';
import { utcToEt } from './time';
import { readBytes, readJson } from './__tests__/helpers';

// 1361 W while any Sun shows, 100 W load, 1000 Wh battery: ten hours in the dark.
const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };

function series(sun: number[], earth?: number[]): Series {
  const n = sun.length;
  return {
    i0: 0,
    hours: n,
    sunAz: new Float64Array(n),
    sunEl: new Float64Array(n).fill(5),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n),
    sunFraction: Float64Array.from(sun),
    earthVisible: Uint8Array.from(earth ?? new Array<number>(n).fill(0)),
    sunAu: new Float64Array(n).fill(1),
  };
}
const rep = (v: number, n: number) => new Array<number>(n).fill(v);

describe('poweredFrom', () => {
  it('counts the hours to the first brownout, capped at the period and at the end of the table', () => {
    const dark = powerSeries(series(rep(0, 30)), CFG);
    expect(poweredFrom(dark, CFG, 0, 30)).toBe(10);
    expect(poweredFrom(dark, CFG, 0, 6)).toBe(6);
    expect(poweredFrom(dark, CFG, 25, 30)).toBe(5);
    expect(poweredFrom(dark, CFG, 30, 30)).toBe(0);
    const dayThenNight = powerSeries(series([...rep(1, 5), ...rep(0, 30)]), CFG);
    expect(poweredFrom(dayThenNight, CFG, 0, 35)).toBe(15);
    expect(poweredFrom(dayThenNight, CFG, 5, 35)).toBe(10);
  });

  it('agrees with the battery walk from the start of the period', () => {
    const p = powerSeries(series([...rep(1, 3), ...rep(0, 20), ...rep(1, 4)]), CFG);
    const walk = simulateBattery(p, CFG);
    expect(poweredFrom(p, CFG, 0, p.length)).toBe(timeWithPower(walk));
    expect(timeWithPower(walk)).toBe(13);
    expect(timeWithPower(simulateBattery(powerSeries(series(rep(1, 8)), CFG), CFG))).toBe(8);
  });
});

describe('bestLanding', () => {
  it('is the sunlit hour with the longest time with power', () => {
    const s = series([...rep(0, 10), ...rep(1, 20), ...rep(0, 30), ...rep(1, 5), ...rep(0, 40)]);
    expect(bestLanding(s, CFG, { from: 0, to: 105, step: 1, capHours: 100 })).toEqual({ hour: 10, poweredHours: 30, earthFraction: 0 });
  });

  it('breaks ties by more contact with Earth, then by the earlier hour', () => {
    const sun = [...rep(1, 10), ...rep(0, 30), ...rep(1, 10), ...rep(0, 30)];
    const earth = [...rep(0, 40), ...rep(1, 40)];
    expect(bestLanding(series(sun, earth), CFG, { from: 0, to: 80, step: 1, capHours: 80 })?.hour).toBe(40);
    expect(bestLanding(series(sun), CFG, { from: 0, to: 80, step: 1, capHours: 80 })?.hour).toBe(0);
  });

  it('has no answer when no hour of the scan is sunlit', () => {
    expect(bestLanding(series(rep(0, 50)), CFG, { from: 0, to: 50, step: 1, capHours: 50 })).toBeNull();
  });

  it('caps the time with power at the period length and honours the step', () => {
    const scores = landingScores(series(rep(1, 50)), CFG, { from: 0, to: 26, step: 6, capHours: 24 });
    expect(Array.from(scores.hours)).toEqual([0, 6, 12, 18, 24]);
    expect(Array.from(scores.powered)).toEqual([24, 24, 24, 24, 24]);
    expect(bestLandingAcross([scores])).toEqual({ hour: 0, poweredHours: 24, earthFraction: 0 });
  });

  it('never scans past the end of the series', () => {
    const scores = landingScores(series(rep(1, 10)), CFG, { from: 0, to: 500, step: 4, capHours: 100 });
    expect(Array.from(scores.hours)).toEqual([0, 4, 8]);
    expect(Array.from(scores.powered)).toEqual([10, 6, 2]);
    expect(landingScores(series(rep(1, 10)), CFG, { from: 20, to: 30, step: 1, capHours: 5 }).hours).toHaveLength(0);
  });

  it('across several sites takes the mean and only hours at which every site is sunlit', () => {
    const a = landingScores(series([...rep(1, 10), ...rep(0, 30)]), CFG, { from: 0, to: 40, step: 5, capHours: 40 });
    const b = landingScores(series([...rep(0, 5), ...rep(1, 25), ...rep(0, 10)]), CFG, { from: 0, to: 40, step: 5, capHours: 40 });
    // Hour 0: a sunlit, b dark, so not a candidate. Hour 5: a keeps power 15 h, b 35 h (to the end of the table).
    expect(bestLandingAcross([a, b])).toEqual({ hour: 5, poweredHours: 25, earthFraction: 0 });
    expect(bestLandingAcross([])).toBeNull();
  });
});

interface LandingFixture {
  site_id: string;
  lat: number;
  lon: number;
  polar: boolean;
  start_utc: string;
  days: number;
  config: { panel: PowerConfig['panel']; panel_azimuth_deg: number; area_m2: number; efficiency: number; load_w: number; battery_wh: number; initial_soc_fraction: number };
  now_hours: number;
  period_best: { hour: number; powered_hours: number; earth_fraction: number } | null;
  year_best: { hour: number; powered_hours: number; earth_fraction: number } | null;
  sample_hours: number[];
  sample_powered: number[];
}

describe('parity with the Python reference', () => {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  for (const name of [
    'de_gerlache_rim_2_2027-01-01_30d.json',
    'shackleton_center_2027-01-01_30d.json',
    'shackleton_center_rim_high_2027-01-01_30d.json',
    'blue_ghost_m1_2025-03-02_14d.json',
    'nobile_rim_1_2027-01-01_90d.json',
  ]) {
    it(`matches ${name}`, () => {
      const fx = readJson<LandingFixture>('data', 'fixtures', 'landing', name);
      const mask = fx.polar ? readJson<{ elevation_deg: number[] }>('data', 'masks', `${fx.site_id}.json`).elevation_deg : new Float64Array(720);
      const period = fx.days * 24;
      const s = hourlySeries({ lat: fx.lat, lon: fx.lon }, mask, eph, utcToEt(fx.start_utc), YEAR_HOURS + period);
      const cfg: PowerConfig = {
        panel: fx.config.panel,
        panelAzimuthDeg: fx.config.panel_azimuth_deg,
        areaM2: fx.config.area_m2,
        efficiency: fx.config.efficiency,
        loadW: fx.config.load_w,
        batteryWh: fx.config.battery_wh,
        initialSocFraction: fx.config.initial_soc_fraction,
      };
      const powerW = powerSeries(s, cfg);
      expect(poweredFrom(powerW, cfg, 0, period)).toBe(fx.now_hours);
      expect(fx.sample_hours.map((h) => poweredFrom(powerW, cfg, h, period))).toEqual(fx.sample_powered);
      const check = (got: ReturnType<typeof bestLanding>, want: LandingFixture['period_best']) => {
        if (!want) {
          expect(got).toBeNull();
          return;
        }
        expect(got?.hour).toBe(want.hour);
        expect(got?.poweredHours).toBe(want.powered_hours);
        expect(got?.earthFraction).toBeCloseTo(want.earth_fraction, 12);
      };
      check(bestLanding(s, cfg, { from: 0, to: period, step: 1, capHours: period }), fx.period_best);
      check(bestLanding(s, cfg, { from: 0, to: YEAR_HOURS, step: 6, capHours: period }), fx.year_best);
    });
  }
});
```

- [ ] **Step 7: Run them to see them fail**

Run (from `web/`): `npx vitest run src/lib/engine/power.test.ts src/lib/engine/landing.test.ts`
Expected: FAIL: `r.powered` is undefined; cannot find `./landing`.

- [ ] **Step 8: Add the powered flags**

`web/src/lib/engine/power.ts`: in `PowerResult`, after `energyWh`:

```ts
  /** 1 for an hour the lander had power, 0 for a brownout hour. */
  powered: Uint8Array;
```

In `simulateBattery`: declare `const powered = new Uint8Array(n);` beside `energyWh`, set `powered[h] = next < 0 ? 0 : 1;` on the line before `if (next < 0) {`, and add `powered` to the returned object after `energyWh`.

Then run `npx tsc --noEmit`: wherever a test builds a `PowerResult` literal by hand, add `powered: new Uint8Array(<same length as energyWh>).fill(1)` (or `0` for a literal that describes a brownout).

- [ ] **Step 9: Write the TypeScript module**

`web/src/lib/engine/landing.ts`:

```ts
import type { Series } from './metrics';
import { powerSeries, type PowerConfig } from './power';

/** Hours in the year a best-date search covers. */
export const YEAR_HOURS = 365 * 24;

/** A landing hour and what the lander gets from it. Hours are indexes into the series that was scanned. */
export interface Landing {
  hour: number;
  /** Hours with power from the landing, capped at the period length (a mean when several sites are scored). */
  poweredHours: number;
  /** Share of those hours with Earth in view; 0 when there are none. */
  earthFraction: number;
}

/** Which landing hours to try: `from` up to but not including `to`, every `step` hours, counting at most `capHours` each. */
export interface LandingScan {
  from: number;
  to: number;
  step: number;
  capHours: number;
}

/** One entry per candidate landing hour. */
export interface LandingScores {
  hours: Int32Array;
  /** Time with power from that hour. */
  powered: Int32Array;
  /** How many of those hours have Earth in view. */
  contact: Int32Array;
  /** 1 where any part of the Sun is visible at the landing hour. */
  sunlit: Uint8Array;
}

/** Hours from the start of a battery walk to its first brownout: the whole walk when it never browns out. */
export function timeWithPower(power: { firstBrownoutHour: number | null; powerW: { length: number } }): number {
  return power.firstBrownoutHour ?? power.powerW.length;
}

/**
 * Hours with power for a lander that arrives at `hour` with the configured battery charge: the hours
 * to the first brownout, capped at `capHours` and at the end of `powerW`. The walk is the one in
 * `simulateBattery`, started at `hour`.
 */
export function poweredFrom(powerW: ArrayLike<number>, cfg: PowerConfig, hour: number, capHours: number): number {
  const cap = Math.max(0, cfg.batteryWh);
  let e = Math.min(cap, Math.max(0, cfg.initialSocFraction) * cap);
  const end = Math.min(powerW.length, hour + capHours);
  for (let h = hour; h < end; h++) {
    const next = e + powerW[h] - cfg.loadW;
    if (next < 0) return h - hour;
    e = Math.min(cap, next);
  }
  return Math.max(0, end - hour);
}

/** Time with power and contact with Earth for every candidate landing hour of a scan (none past the end of the series). */
export function landingScores(series: Series, cfg: PowerConfig, scan: LandingScan): LandingScores {
  const powerW = powerSeries(series, cfg);
  const vis = new Int32Array(series.hours + 1); // prefix sums of the hours with Earth in view
  for (let h = 0; h < series.hours; h++) vis[h + 1] = vis[h] + series.earthVisible[h];
  const last = Math.min(scan.to, series.hours);
  const count = last > scan.from ? Math.ceil((last - scan.from) / scan.step) : 0;
  const hours = new Int32Array(count);
  const powered = new Int32Array(count);
  const contact = new Int32Array(count);
  const sunlit = new Uint8Array(count);
  for (let k = 0; k < count; k++) {
    const h = scan.from + k * scan.step;
    const n = poweredFrom(powerW, cfg, h, scan.capHours);
    hours[k] = h;
    powered[k] = n;
    contact[k] = vis[h + n] - vis[h];
    sunlit[k] = series.sunFraction[h] > 0 ? 1 : 0;
  }
  return { hours, powered, contact, sunlit };
}

/**
 * The best landing hour for several sites at once (one site is the usual case): the longest mean time
 * with power, then the larger share of it with Earth in view, then the earlier hour. A lander arrives
 * in daylight, so only hours at which every site is sunlit are candidates; null when there is none.
 */
export function bestLandingAcross(scores: LandingScores[]): Landing | null {
  if (scores.length === 0) return null;
  const count = Math.min(...scores.map((s) => s.hours.length));
  let best: Landing | null = null;
  for (let k = 0; k < count; k++) {
    if (!scores.every((s) => s.sunlit[k] === 1)) continue;
    let powered = 0;
    let contact = 0;
    for (const s of scores) {
      powered += s.powered[k];
      contact += s.contact[k];
    }
    const poweredHours = powered / scores.length;
    const earthFraction = powered > 0 ? contact / powered : 0;
    if (!best || poweredHours > best.poweredHours || (poweredHours === best.poweredHours && earthFraction > best.earthFraction)) {
      best = { hour: scores[0].hours[k], poweredHours, earthFraction };
    }
  }
  return best;
}

/** The best landing hour of a scan for one site; see `bestLandingAcross`. */
export function bestLanding(series: Series, cfg: PowerConfig, scan: LandingScan): Landing | null {
  return bestLandingAcross([landingScores(series, cfg, scan)]);
}
```

- [ ] **Step 10: Run the tests**

Run: `npx vitest run src/lib/engine` and `npx tsc --noEmit`
Expected: PASS, including the five parity cases.

- [ ] **Step 11: Commit**

```bash
git add pipeline/lunar_pipeline/landing.py pipeline/lunar_pipeline/cli.py pipeline/tests/test_landing.py pipeline/tests/test_cli.py data/fixtures/landing web/src/lib/engine/power.ts web/src/lib/engine/power.test.ts web/src/lib/engine/landing.ts web/src/lib/engine/landing.test.ts
git add -u web/src
git commit -m "feat(engine): time with power and the best landing date, with a Python reference and golden fixtures"
```

---

### Task 3: The answer in words and the status sentence

**Files:**
- Modify: `web/src/lib/viz/format.ts`, `web/src/lib/viz/format.test.ts`
- Create: `web/src/lib/viz/answer.ts`, `web/src/lib/viz/answer.test.ts`
- Create: `web/src/lib/viz/status.ts`, `web/src/lib/viz/status.test.ts`

The old `verdictFor` in `web/src/lib/viz/verdict.ts` stays as it is: Compare and the brief use it until part 4.

**Interfaces:**
- Consumes: `Landing`, `timeWithPower` from `web/src/lib/engine/landing.ts` (Task 2); `PowerResult.powered` (Task 2); `spanWords`, `dayMonth` from `format.ts` (part 1).
- Produces in `format.ts`:
  - `dateLong(startUtc: string, hour: number): string`: "20 January", with the year when it differs from the start's year ("3 January 2028").
  - `clockUtc(startUtc: string, hour: number): string`: "10:00".
  - `isoAt(startUtc: string, hour: number): string`: "2027-01-20T10:00:00".
  - `pct0(x: number): string`: "45 %".
- Produces in `answer.ts`:
  - `type AnswerKind = 'all' | 'night' | 'low-sun' | 'no-sun'`
  - `interface Answer { tone: 'good' | 'bad'; kind: AnswerKind; title: string; sentences: string[]; better: { hour: number; startUtc: string; label: string; note: string } | null; hint: string | null }`
  - `interface AnswerInput { series: Series; summary: Summary; power: PowerResult; startUtc: string; days: number; loadW: number; best: Landing | null }`
  - `answerFor(input: AnswerInput): Answer`
- Produces in `status.ts`: `statusSentence(series: Series, power: PowerResult | null, hour: number, batteryWh: number): string`.

- [ ] **Step 1: Write the failing tests**

Add to `web/src/lib/viz/format.test.ts` (extend the import with `clockUtc, dateLong, isoAt, pct0`):

```ts
describe('dates for sentences and buttons', () => {
  it('writes the day and the full month, with the year only when it is not the start year', () => {
    expect(dateLong('2027-01-01T00:00:00', 466)).toBe('20 January');
    expect(dateLong('2027-12-20T00:00:00', 24 * 20)).toBe('9 January 2028');
  });

  it('writes the UTC hour and the ISO time of an hour of the period', () => {
    expect(clockUtc('2027-01-01T00:00:00', 466)).toBe('10:00');
    expect(isoAt('2027-01-01T00:00:00', 466)).toBe('2027-01-20T10:00:00');
    expect(isoAt('2027-01-01T06:00:00Z', 0)).toBe('2027-01-01T06:00:00');
  });

  it('writes a share as a whole percentage', () => {
    expect(pct0(0.446)).toBe('45 %');
    expect(pct0(1)).toBe('100 %');
  });
});
```

`web/src/lib/viz/answer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { bestLanding } from '../engine/landing';
import { hourlySeries, summarize, type Series } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig } from '../engine/power';
import { utcToEt } from '../engine/time';
import { readBytes, readJson } from '../engine/__tests__/helpers';
import { answerFor } from './answer';

// 1361 W while any Sun shows, 100 W load, 1000 Wh battery: ten hours in the dark.
const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };
const START = '2027-01-01T00:00:00';
const rep = (v: number, n: number) => new Array<number>(n).fill(v);

function series(sun: number[]): Series {
  const n = sun.length;
  return {
    i0: 0,
    hours: n,
    sunAz: new Float64Array(n),
    sunEl: new Float64Array(n).fill(5),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n),
    sunFraction: Float64Array.from(sun),
    earthVisible: new Uint8Array(n),
    sunAu: new Float64Array(n).fill(1),
  };
}

/** The answer for the first `days` days of a longer series, the way the store asks for it. */
function answer(sun: number[], days: number, cfg: PowerConfig = CFG) {
  const scan = series(sun);
  const hours = days * 24;
  const period = series(sun.slice(0, hours));
  return answerFor({
    series: period,
    summary: summarize(period),
    power: powerBudget(period, cfg),
    startUtc: START,
    days,
    loadW: cfg.loadW,
    best: bestLanding(scan, cfg, { from: 0, to: hours, step: 1, capHours: hours }),
  });
}

describe('answerFor', () => {
  it('says the lander keeps power when the Sun never sets', () => {
    const a = answer(rep(1, 96), 2);
    expect(a).toMatchObject({ tone: 'good', kind: 'all', title: 'Keeps power for all 2 days', better: null, hint: null });
    expect(a.sentences).toEqual(['The Sun never sets in these 2 days.']);
  });

  it('names the longest night when the battery covers it', () => {
    const a = answer([...rep(1, 20), ...rep(0, 8), ...rep(1, 68)], 2);
    expect(a.title).toBe('Keeps power for all 2 days');
    expect(a.sentences).toEqual(['The Sun is up 83 % of the time. The longest night lasts 8 hours, and the battery covers it.']);
  });

  it('says how long the power lasts, when the Sun sets, what the battery covers and when the lander is back', () => {
    // Sun for 30 h, night for 40 h, Sun again: the battery carries 10 h of the night.
    const a = answer([...rep(1, 30), ...rep(0, 40), ...rep(1, 122)], 4);
    expect(a).toMatchObject({ tone: 'bad', kind: 'night', title: 'Power for 1 day 16 hours, then night' });
    expect(a.sentences).toEqual([
      'The Sun sets on 2 January and stays behind the hills for 1 day 16 hours.',
      'The battery covers the first 10 hours; the lander is back on 3 January.',
    ]);
    expect(a.better).toEqual({
      hour: 70,
      startUtc: '2027-01-03T22:00:00',
      label: 'Land on 3 January instead',
      note: 'From 3 January, 22:00 UTC, the lander keeps power for all 4 days.',
    });
    expect(a.hint).toBeNull();
  });

  it('stays true when the period starts in the dark', () => {
    const a = answer([...rep(0, 30), ...rep(1, 20), ...rep(0, 142)], 2);
    expect(a.title).toBe('Power for 10 hours, then night');
    expect(a.sentences).toEqual([
      'The period starts in the dark: the Sun stays behind the hills until 2 January.',
      'The battery covers the first 10 hours; the lander is back on 2 January.',
    ]);
    expect(a.better?.label).toBe('Land on 2 January instead');
    expect(a.better?.note).toBe('From 2 January, 06:00 UTC: power for 1 day 6 hours in a row.');
  });

  it('stays true when the night outlasts the period', () => {
    const a = answer([...rep(1, 20), ...rep(0, 172)], 2);
    expect(a.title).toBe('Power for 1 day 6 hours, then night');
    expect(a.sentences).toEqual([
      'The Sun sets on 1 January and stays behind the hills for the rest of the period.',
      'The battery covers the first 10 hours, and the lander stays off for the rest of the period.',
    ]);
    expect(a.better).toBeNull();
    expect(a.hint).toBe('No landing date in these 2 days gives more power here. A shorter stay or a bigger battery may.');
  });

  it('does not blame the night when the panel is too small for the load', () => {
    const weak: PowerConfig = { ...CFG, areaM2: 0.05 }; // 68 W against a 100 W load: the battery drains in daylight
    const a = answer(rep(1, 96), 2, weak);
    expect(a).toMatchObject({ tone: 'bad', kind: 'low-sun', title: 'Power for 1 day 7 hours, then too little sunlight' });
    expect(a.sentences[0]).toBe('The Sun is up, but the panel makes about 68 W and the lander uses 100 W.');
    expect(a.sentences.join(' ')).not.toMatch(/night/);
    expect(a.better).toBeNull();
  });

  it('says so when there is no sunlight at all', () => {
    const a = answer(rep(0, 96), 2);
    expect(a).toMatchObject({ tone: 'bad', kind: 'no-sun', title: 'No sunlight in these 2 days', better: null });
    expect(a.sentences).toEqual(['This spot stays in shadow for the whole period. A solar lander cannot work here.']);
    expect(a.hint).toBe('Try another site, or another month.');
  });

  it('credits the battery when it alone carries a period without sunlight', () => {
    const a = answer(rep(0, 96), 2, { ...CFG, batteryWh: 10_000 });
    expect(a).toMatchObject({ tone: 'good', kind: 'all', title: 'Keeps power for all 2 days' });
    expect(a.sentences).toEqual(['There is no sunlight in these 2 days: the battery alone carries the lander.']);
  });

  it('never writes "undefined", "NaN" or a zero duration in a sentence', () => {
    const cases = [rep(1, 96), rep(0, 96), [...rep(0, 30), ...rep(1, 66)], [...rep(1, 47), 0, ...rep(1, 48)], [...rep(1, 1), ...rep(0, 95)]];
    for (const sun of cases) {
      for (const cfg of [CFG, { ...CFG, batteryWh: 0 }, { ...CFG, initialSocFraction: 0 }]) {
        const a = answer(sun, 2, cfg);
        const text = [a.title, ...a.sentences, a.better?.label ?? '', a.better?.note ?? '', a.hint ?? ''].join(' ');
        expect(text).not.toMatch(/undefined|NaN|null|\b0 hours|\b0 days/);
      }
    }
  });
});

describe('answerFor on real data', () => {
  it('reads de Gerlache Rim 2 in January 2027 the way the approved design does', () => {
    const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
    const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
    const site = { lat: -88.28, lon: -64.31 };
    const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg;
    const scan = hourlySeries(site, mask, eph, utcToEt(START), 1440);
    const period = hourlySeries(site, mask, eph, utcToEt(START), 720);
    const a = answerFor({
      series: period,
      summary: summarize(period),
      power: powerBudget(period, DEFAULT_POWER),
      startUtc: START,
      days: 30,
      loadW: DEFAULT_POWER.loadW,
      best: bestLanding(scan, DEFAULT_POWER, { from: 0, to: 720, step: 1, capHours: 720 }),
    });
    expect(a.title).toBe('Power for 3 days 4 hours, then night');
    expect(a.sentences[0]).toBe('The Sun sets on 3 January and stays behind the hills for 16 days 15 hours.');
    expect(a.sentences[1]).toMatch(/^The battery covers the first \d+ hours; the lander is back on 20 January\.$/);
    expect(a.better?.label).toBe('Land on 20 January instead');
    expect(a.better?.note).toBe('From 20 January, 10:00 UTC: power for 12 days 15 hours in a row.');
    expect(a.better?.startUtc).toBe('2027-01-20T10:00:00');
  });
});
```

`web/src/lib/viz/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Series } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig } from '../engine/power';
import { statusSentence } from './status';

const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };

function series(sun: number[], earth: number[]): Series {
  const n = sun.length;
  return {
    i0: 0,
    hours: n,
    sunAz: new Float64Array(n),
    sunEl: new Float64Array(n).fill(5),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n),
    sunFraction: Float64Array.from(sun),
    earthVisible: Uint8Array.from(earth),
    sunAu: new Float64Array(n).fill(1),
  };
}

describe('statusSentence', () => {
  // Sun up, setting, then 14 dark hours (the battery carries ten), rising, up.
  const sun = [1, 1, 0.5, ...new Array<number>(14).fill(0), 0.3, 1, 1];
  const earth = [0, 0, 0, ...new Array<number>(7).fill(1), ...new Array<number>(7).fill(0), 1, 1, 1];
  const s = series(sun, earth);
  const p = powerBudget(s, CFG);

  it('says where the Sun and Earth are and how full the battery is', () => {
    expect(statusSentence(s, p, 0, CFG.batteryWh)).toBe('Sun up, Earth behind the hills, battery 100 %');
    expect(statusSentence(s, p, 2, CFG.batteryWh)).toBe('Sun setting, Earth behind the hills, battery 100 %');
    expect(statusSentence(s, p, 5, CFG.batteryWh)).toBe('Sun behind the hills, Earth in view, battery 70 %');
    expect(statusSentence(s, p, 17, CFG.batteryWh)).toMatch(/^Sun rising, Earth in view/);
  });

  it('says when the lander is off', () => {
    expect(p.powered[13]).toBe(0);
    expect(statusSentence(s, p, 13, CFG.batteryWh)).toBe('Sun behind the hills, Earth behind the hills, lander off, battery empty');
    const contact = series(sun, new Array<number>(sun.length).fill(1));
    expect(statusSentence(contact, powerBudget(contact, CFG), 13, CFG.batteryWh)).toBe('Sun behind the hills, Earth in view but the lander is off, battery empty');
  });

  it('leaves the battery out before the power budget is known, and for a lander without one', () => {
    expect(statusSentence(s, null, 0, CFG.batteryWh)).toBe('Sun up, Earth behind the hills');
    expect(statusSentence(s, powerBudget(s, { ...CFG, batteryWh: 0 }), 0, 0)).toBe('Sun up, Earth behind the hills, no battery');
  });

  it('calls a Sun that is partly hidden at a standstill what it is', () => {
    const flat = series([0.4, 0.4, 0.4], [1, 1, 1]);
    expect(statusSentence(flat, null, 1, 0)).toBe('Sun partly behind the hills, Earth in view');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `web/`): `npx vitest run src/lib/viz/format.test.ts src/lib/viz/answer.test.ts src/lib/viz/status.test.ts`
Expected: FAIL: `dateLong` is not exported; cannot find `./answer`, `./status`.

- [ ] **Step 3: Add the date helpers**

Append to `web/src/lib/viz/format.ts`:

```ts
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function at(startUtc: string, hour: number): { start: Date; d: Date } {
  const start = new Date(startUtc.endsWith('Z') ? startUtc : `${startUtc}Z`);
  return { start, d: new Date(start.getTime() + hour * 3_600_000) };
}

/** The UTC date `hour` hours after the start, for sentences and buttons: "20 January"; the year is added when it is not the start's year. */
export function dateLong(startUtc: string, hour: number): string {
  const { start, d } = at(startUtc, hour);
  const text = `${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === start.getUTCFullYear() ? text : `${text} ${d.getUTCFullYear()}`;
}

/** The UTC time of day `hour` hours after the start: "10:00". */
export function clockUtc(startUtc: string, hour: number): string {
  return at(startUtc, hour).d.toISOString().slice(11, 16);
}

/** The UTC instant `hour` hours after the start, in the form the store keeps: "2027-01-20T10:00:00". */
export function isoAt(startUtc: string, hour: number): string {
  return at(startUtc, hour).d.toISOString().slice(0, 19);
}

/** A share as a whole percentage for sentences: "45 %". */
export function pct0(x: number): string {
  return `${Math.round(x * 100)} %`;
}
```

- [ ] **Step 4: Write `answer.ts`**

```ts
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
    const dark =
      sunset === 0
        ? `The period starts in the dark: the Sun stays behind the hills until ${dateLong(startUtc, sunrise)}.`
        : sunrise >= hours
          ? `The Sun sets on ${dateLong(startUtc, sunset)} and stays behind the hills for the rest of the period.`
          : `The Sun sets on ${dateLong(startUtc, sunset)} and stays behind the hills for ${spanWords(sunrise - sunset)}.`;
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
```

- [ ] **Step 5: Write `status.ts`**

```ts
import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';

/**
 * One sentence for the hour under the time cursor: where the Sun and Earth are, whether the lander is
 * on, and how full the battery is. `power` is null until the budget is known.
 */
export function statusSentence(series: Series, power: PowerResult | null, hour: number, batteryWh: number): string {
  const f = series.sunFraction[hour];
  let sun: string;
  if (f <= 0) sun = 'Sun behind the hills';
  else if (f >= 0.999) sun = 'Sun up';
  else {
    const before = hour > 0 ? series.sunFraction[hour - 1] : f;
    const after = hour + 1 < series.hours ? series.sunFraction[hour + 1] : f;
    sun = after > before ? 'Sun rising' : after < before ? 'Sun setting' : 'Sun partly behind the hills';
  }
  const inView = series.earthVisible[hour] === 1;
  const off = power !== null && power.powered[hour] === 0;
  const earth = inView ? (off ? 'Earth in view but the lander is off' : 'Earth in view') : off ? 'Earth behind the hills, lander off' : 'Earth behind the hills';
  const parts = [sun, earth];
  if (power) {
    if (batteryWh <= 0) parts.push('no battery');
    else parts.push(off ? 'battery empty' : `battery ${Math.round((100 * power.energyWh[hour]) / batteryWh)} %`);
  }
  return parts.join(', ');
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/viz` and `npx tsc --noEmit`
Expected: PASS. If the real-data case reports a different sunset or sunrise date, print `a` and compare with `data/fixtures/landing/de_gerlache_rim_2_2027-01-01_30d.json` before touching the wording.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/viz/format.ts web/src/lib/viz/format.test.ts web/src/lib/viz/answer.ts web/src/lib/viz/answer.test.ts web/src/lib/viz/status.ts web/src/lib/viz/status.test.ts
git commit -m "feat(web): the verdict in words with the better landing date, and a status sentence for the hour under the cursor"
```

---

### Task 4: Store: default site, best landing date, lander presets, overview of all sites

**Files:**
- Modify: `web/src/lib/engine/metrics.ts`, `web/src/lib/engine/metrics.test.ts` (`headSeries`)
- Create: `web/src/lib/lander.ts`, `web/src/lib/lander.test.ts`
- Modify: `web/src/lib/store/explore.ts`, `web/src/lib/store/explore.test.ts`
- Modify: `web/src/lib/ai/actions.ts` (the note after a best-window search), `web/src/lib/ai/actions.test.ts`, `web/src/lib/ai/explanations.ts`
- Modify: `web/src/components/BriefView.test.tsx`, `web/src/components/PlannerChat.test.tsx` (mocks and the default site)

**Interfaces:**
- Consumes: `bestLanding`, `bestLandingAcross`, `landingScores`, `timeWithPower`, `YEAR_HOURS`, `Landing` (Task 2); `isoAt`, `dayMonth`, `spanShort`, `pct0` (Task 3 and part 1).
- Produces in `metrics.ts`: `headSeries(series: Series, hours: number): Series` (the first hours of a series, sharing its memory).
- Produces in `lander.ts`:
  - `interface LanderPreset { id: 'small' | 'medium' | 'large'; label: string; power: Pick<PowerConfig, 'areaM2' | 'loadW' | 'batteryWh'> }`
  - `LANDER_PRESETS: LanderPreset[]` (4 m², 200 W, 2 kWh; 8 m², 400 W, 20 kWh; 20 m², 500 W, 50 kWh)
  - `presetOf(power: PowerConfig): LanderPreset | null`, `landerName(power: PowerConfig): string`, `landerLine(power: PowerConfig): string`, `batteryHours(power: PowerConfig): number`
- Produces in `explore.ts`:
  - `DEFAULT_SITE = 'de_gerlache_rim_2'`
  - `SiteResult.best: Landing | null` and `ExploreState.best: Landing | null` (best landing hour inside the period, hours from the period start)
  - `interface SiteOverview { sunFraction: number; earthFraction: number; nowHours: number; best: Landing | null }`
  - `ExploreState.overview: Record<string, SiteOverview>`, `overviewBusy: boolean`, `loadOverview(): Promise<void>`
  - `findBestWindow(days, scope?)` now returns `Promise<{ startUtc: string; poweredHours: number; earthFraction: number } | null>`

- [ ] **Step 1: Write the failing tests for the helpers**

Add to `web/src/lib/engine/metrics.test.ts` (extend the import with `headSeries`):

```ts
describe('headSeries', () => {
  it('returns the first hours of a series without copying', () => {
    const s: Series = {
      i0: 7,
      hours: 4,
      sunAz: Float64Array.from([1, 2, 3, 4]),
      sunEl: Float64Array.from([1, 2, 3, 4]),
      earthAz: Float64Array.from([1, 2, 3, 4]),
      earthEl: Float64Array.from([1, 2, 3, 4]),
      sunFraction: Float64Array.from([1, 0, 1, 0]),
      earthVisible: Uint8Array.from([1, 1, 0, 0]),
      sunAu: Float64Array.from([1, 1, 1, 1]),
    };
    const head = headSeries(s, 2);
    expect(head.hours).toBe(2);
    expect(head.i0).toBe(7);
    expect(Array.from(head.sunFraction)).toEqual([1, 0]);
    expect(Array.from(head.earthVisible)).toEqual([1, 1]);
    expect(head.sunAz.buffer).toBe(s.sunAz.buffer);
    expect(headSeries(s, 9)).toBe(s);
  });
});
```

If `Series` is not yet imported as a type in that test file, add `type Series` to the import from `./metrics`.

`web/src/lib/lander.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER } from './engine/power';
import { batteryHours, landerLine, landerName, LANDER_PRESETS, presetOf } from './lander';
import { POWER_RANGES } from './planner-ranges';

describe('lander presets', () => {
  it('names three landers by their numbers, the first being the default', () => {
    expect(LANDER_PRESETS.map((p) => p.label)).toEqual(['4 m² panel, 200 W, 2 kWh battery', '8 m² panel, 400 W, 20 kWh battery', '20 m² panel, 500 W, 50 kWh battery']);
    expect(presetOf(DEFAULT_POWER)?.id).toBe('small');
    expect(landerName(DEFAULT_POWER)).toBe('4 m² panel, 200 W, 2 kWh battery');
  });

  it('stays inside the ranges the settings accept', () => {
    for (const p of LANDER_PRESETS) {
      expect(p.power.areaM2).toBeLessThanOrEqual(POWER_RANGES.areaM2.max);
      expect(p.power.loadW).toBeLessThanOrEqual(POWER_RANGES.loadW.max);
      expect(p.power.batteryWh).toBeLessThanOrEqual(POWER_RANGES.batteryWh.max);
    }
  });

  it('calls anything else a custom lander', () => {
    expect(presetOf({ ...DEFAULT_POWER, loadW: 250 })).toBeNull();
    expect(presetOf({ ...DEFAULT_POWER, panel: 'horizontal' })).toBeNull();
    expect(landerName({ ...DEFAULT_POWER, loadW: 250 })).toBe('Custom lander');
  });

  it('describes a lander in one line and says how long its battery lasts in the dark', () => {
    expect(landerLine(DEFAULT_POWER)).toBe('4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery');
    expect(landerLine({ ...DEFAULT_POWER, panel: 'horizontal', areaM2: 2.5, loadW: 1500, batteryWh: 500 })).toBe('flat 2.5 m² panel, uses 1.5 kW, 0.5 kWh battery');
    expect(landerLine({ ...DEFAULT_POWER, panel: 'vertical', panelAzimuthDeg: 90 })).toBe('upright 4 m² panel facing 90°, uses 200 W, 2 kWh battery');
    expect(landerLine({ ...DEFAULT_POWER, panel: 'full_tracking' })).toBe('4 m² panel that follows the Sun, uses 200 W, 2 kWh battery');
    expect(batteryHours(DEFAULT_POWER)).toBe(10);
    expect(batteryHours({ ...DEFAULT_POWER, loadW: 0 })).toBe(Infinity);
  });
});
```

Run (from `web/`): `npx vitest run src/lib/engine/metrics.test.ts src/lib/lander.test.ts`
Expected: FAIL: `headSeries` is not exported; cannot find `./lander`.

- [ ] **Step 2: Write the helpers**

Append to `web/src/lib/engine/metrics.ts`, after `withCommsThreshold`:

```ts
/** The first `hours` of a series, sharing its memory; the series itself when it is no longer than that. */
export function headSeries(series: Series, hours: number): Series {
  if (hours >= series.hours) return series;
  return {
    i0: series.i0,
    hours,
    sunAz: series.sunAz.subarray(0, hours),
    sunEl: series.sunEl.subarray(0, hours),
    earthAz: series.earthAz.subarray(0, hours),
    earthEl: series.earthEl.subarray(0, hours),
    sunFraction: series.sunFraction.subarray(0, hours),
    earthVisible: series.earthVisible.subarray(0, hours),
    sunAu: series.sunAu.subarray(0, hours),
  };
}
```

`web/src/lib/lander.ts`:

```ts
import { DEFAULT_POWER, type PowerConfig } from './engine/power';

/** A ready-made lander, named by its numbers so nobody has to guess what "small" means. */
export interface LanderPreset {
  id: 'small' | 'medium' | 'large';
  label: string;
  power: Pick<PowerConfig, 'areaM2' | 'loadW' | 'batteryWh'>;
}

export const LANDER_PRESETS: LanderPreset[] = [
  { id: 'small', label: '4 m² panel, 200 W, 2 kWh battery', power: { areaM2: 4, loadW: 200, batteryWh: 2000 } },
  { id: 'medium', label: '8 m² panel, 400 W, 20 kWh battery', power: { areaM2: 8, loadW: 400, batteryWh: 20000 } },
  { id: 'large', label: '20 m² panel, 500 W, 50 kWh battery', power: { areaM2: 20, loadW: 500, batteryWh: 50000 } },
];

/** The preset these settings are, or null when any field differs from it or from the defaults around it. */
export function presetOf(power: PowerConfig): LanderPreset | null {
  const plain = power.panel === DEFAULT_POWER.panel && power.efficiency === DEFAULT_POWER.efficiency && power.initialSocFraction === DEFAULT_POWER.initialSocFraction;
  if (!plain) return null;
  return LANDER_PRESETS.find((p) => p.power.areaM2 === power.areaM2 && p.power.loadW === power.loadW && p.power.batteryWh === power.batteryWh) ?? null;
}

export function landerName(power: PowerConfig): string {
  return presetOf(power)?.label ?? 'Custom lander';
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const watts = (w: number) => (w >= 1000 ? `${num(w / 1000)} kW` : `${num(w)} W`);

/** One line that says what the lander is: "4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery". */
export function landerLine(power: PowerConfig): string {
  const area = `${num(power.areaM2)} m² panel`;
  const panel =
    power.panel === 'horizontal'
      ? `flat ${area}`
      : power.panel === 'vertical'
        ? `upright ${area} facing ${num(power.panelAzimuthDeg)}°`
        : power.panel === 'vertical_tracking'
          ? `${area} that turns to the Sun`
          : `${area} that follows the Sun`;
  return `${panel}, uses ${watts(power.loadW)}, ${num(power.batteryWh / 1000)} kWh battery`;
}

/** Hours the full battery carries the lander with no sunlight. */
export function batteryHours(power: PowerConfig): number {
  return power.loadW > 0 ? power.batteryWh / power.loadW : Infinity;
}
```

Run: `npx vitest run src/lib/engine/metrics.test.ts src/lib/lander.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing store tests**

In `web/src/lib/store/explore.test.ts`:

1. In `init loads sites, ephemeris and the default site` change the expected id to `'de_gerlache_rim_2'` and add:

```ts
    expect(s.best).toEqual({ hour: 466, poweredHours: 303, earthFraction: expect.closeTo(0.2541, 3) });
```

2. Replace the three tests `findBestWindow moves the start date to the best-scoring span and reports it`, `findBestWindow across the compared sites scores their mean and says so` and `findBestWindow near the end of the ephemeris table clamps the scan and never throws` with:

```ts
  it('findBestWindow moves the start to the landing hour with the longest time with power in the next 12 months', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init(); // de Gerlache Rim 2, 1 January 2027, 30 days
    const result = await store.getState().findBestWindow(30);
    expect(result).toEqual({ startUtc: '2027-10-12T18:00:00', poweredHours: 333, earthFraction: expect.closeTo(0.7988, 3) });
    expect(store.getState().startUtc).toBe('2027-10-12T18:00:00');
    expect(store.getState().days).toBe(30);
    expect(store.getState().series!.sunFraction[0]).toBeGreaterThan(0); // a lander arrives in daylight
    expect(store.getState().bestWindowNote).toBe('Best landing in the next 12 months: 12 Oct 2027, power for 13 d 21 h, Earth in view 80 % of that time.');
  });

  it('findBestWindow across the compared sites takes the mean time with power and says so', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().addToCompare('im1_odysseus');
    await store.getState().addToCompare('shackleton_center_rim_high');
    const r = await store.getState().findBestWindow(14, 'compare');
    expect(r).not.toBeNull();
    expect(r!.poweredHours).toBeGreaterThan(300);
    expect(store.getState().startUtc).toBe(r!.startUtc);
    expect(store.getState().bestWindowNote).toMatch(/^Across 2 compared sites: best landing in the next 12 months: .* power for .* on average/);
    for (const c of store.getState().compare) expect(c.series.sunFraction[0]).toBeGreaterThan(0);
  });

  it('findBestWindow reports a site that never sees the Sun instead of moving the window', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().selectSite('shackleton_center');
    await expect(store.getState().findBestWindow(30)).resolves.toBeNull();
    expect(store.getState().startUtc).toBe('2027-01-01T00:00:00');
    expect(store.getState().bestWindowNote).toBe('No hour in the next 12 months has sunlight here.');
  });

  it('findBestWindow near the end of the Sun and Earth table clamps the scan and never throws', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().selectSite('shackleton_center_rim_high'); // sunlit almost always, so a candidate hour exists in the short scan
    store.getState().setWindow('2036-10-01T00:00:00', 90);
    expect(store.getState().error).toBeNull();
    const result = await store.getState().findBestWindow(90);
    expect(result).not.toBeNull();
    expect(store.getState().startUtc >= '2036-10-01T00:00:00').toBe(true);
    expect(store.getState().series?.hours).toBe(90 * 24);
    store.getState().setWindow('2036-12-01T00:00:00', 14);
    expect(store.getState().best).not.toBeUndefined();
    await expect(store.getState().findBestWindow(90)).resolves.toBeNull();
    expect(store.getState().bestWindowNote).toMatch(/does not fit/);
    expect(store.getState().startUtc).toBe('2036-12-01T00:00:00');
  });
```

3. Add a new block at the end of the file:

```ts
describe('best landing date and the overview of all sites', () => {
  it('keeps the best landing hour of the period in step with the site, the period and the lander', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    expect(store.getState().best?.hour).toBe(466);
    store.getState().setWindow('2027-01-01T00:00:00', 14);
    expect(store.getState().best?.hour).toBeLessThan(14 * 24);
    await store.getState().selectSite('shackleton_center');
    expect(store.getState().best).toBeNull(); // the crater floor never sees the Sun
    await store.getState().selectSite('shackleton_center_rim_high');
    store.getState().setWindow('2027-01-01T00:00:00', 30);
    expect(store.getState().best?.poweredHours).toBe(720);
    store.getState().setPower({ batteryWh: 20000, loadW: 400, areaM2: 8 });
    expect(store.getState().best).not.toBeNull();
  });

  it('gives every compared site its own best landing hour', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().addToCompare('nobile_rim_1');
    expect(store.getState().compare[0].best).toEqual({ hour: 373, poweredHours: 388, earthFraction: expect.any(Number) });
  });

  it('loadOverview fills one entry per catalogue site and fetches each skyline once', async () => {
    const counters = { masks: 0, sites: 0 };
    const store = createExploreStore(fileLoaders({ counters }));
    await store.getState().init();
    await store.getState().loadOverview();
    const o = store.getState().overview;
    expect(Object.keys(o)).toHaveLength(19);
    expect(store.getState().overviewBusy).toBe(false);
    expect(o.de_gerlache_rim_2).toEqual({ sunFraction: expect.closeTo(0.446, 3), earthFraction: expect.closeTo(0.45, 3), nowHours: 76, best: { hour: 466, poweredHours: 303, earthFraction: expect.any(Number) } });
    expect(o.shackleton_center).toMatchObject({ sunFraction: 0, nowHours: 10, best: null });
    expect(o.shackleton_center_rim_high.nowHours).toBe(720);
    expect(o.blue_ghost_m1.sunFraction).toBeGreaterThan(0.3); // a flat horizon, no skyline file
    expect(counters.masks).toBe(18);
    await store.getState().loadOverview(); // same period and lander: nothing to do
    expect(counters.masks).toBe(18);
  });

  it('loadOverview starts again when the period or the lander changes', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().loadOverview();
    const before = store.getState().overview.de_gerlache_rim_2.nowHours;
    store.getState().setPower({ batteryWh: 20000 });
    await store.getState().loadOverview();
    expect(store.getState().overview.de_gerlache_rim_2.nowHours).toBeGreaterThan(before);
    store.getState().setWindow('2027-06-01T00:00:00', 14);
    await store.getState().loadOverview();
    expect(Object.keys(store.getState().overview)).toHaveLength(19);
  });

  it('loadOverview leaves a site out when its skyline cannot be loaded, and finishes', async () => {
    const base = fileLoaders();
    const store = createExploreStore({
      ...base,
      loadMask: async (id: string) => {
        if (id === 'haworth') throw new Error('could not load /data/masks/haworth.json (HTTP 404)');
        return base.loadMask(id);
      },
    });
    await store.getState().init();
    await store.getState().loadOverview();
    expect(store.getState().overview.haworth).toBeUndefined();
    expect(Object.keys(store.getState().overview)).toHaveLength(18);
    expect(store.getState().overviewBusy).toBe(false);
    expect(store.getState().error).toBeNull();
  });

  it('a newer loadOverview wins over one still running', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const first = store.getState().loadOverview();
    store.getState().setWindow('2027-03-01T00:00:00', 14);
    const second = store.getState().loadOverview();
    await Promise.all([first, second]);
    const period = recompute(eph, sites.find((s) => s.id === 'malapert_massif')!, Float64Array.from(maskOf('malapert_massif').elevation_deg), '2027-03-01T00:00:00', 14);
    expect(store.getState().overview.malapert_massif.sunFraction).toBeCloseTo(period.summary.illumFraction, 9);
    expect(store.getState().overviewBusy).toBe(false);
  });
});
```

Nobile Rim 1: landing at hour 373 (16 January 13:00) gives 388 hours, the figure of the 90-day fixture, because 388 hours fit inside 30 days as well.

4. Every other test in this file, and in `BriefView.test.tsx`, that relied on the old default site selects it explicitly: after `await store.getState().init();` add `await store.getState().selectSite('shackleton_center_rim_high');`. Find them by running the file after Step 4 and reading the failures; do not change any expected number.

Run: `npx vitest run src/lib/store/explore.test.ts`
Expected: FAIL: `best` and `loadOverview` are not in the store; the default site is still Shackleton.

- [ ] **Step 4: Change the store**

In `web/src/lib/store/explore.ts`:

Imports: add `indexForEt` to the import from `'../engine/ephemeris'` (a value import beside the `Ephemeris` type), `headSeries` to the import from `'../engine/metrics'` and drop `bestWindowAcross` and `SeriesIndex` from it, and add

```ts
import { bestLanding, bestLandingAcross, landingScores, timeWithPower, YEAR_HOURS, type Landing } from '../engine/landing';
import { dayMonth, pct0, spanShort } from '../viz/format';
```

Constants and types:

```ts
export const DEFAULT_SITE = 'de_gerlache_rim_2';
```

In `SiteResult` add:

```ts
  /** The best landing hour inside the period (hours from its start), or null when no hour is sunlit. */
  best: Landing | null;
```

Add below `SiteResult`:

```ts
/** What the site list shows for one site over the chosen period. */
export interface SiteOverview {
  sunFraction: number;
  earthFraction: number;
  /** Hours with power when the lander arrives at the period start. */
  nowHours: number;
  best: Landing | null;
}
```

In `ExploreState` add after `contacts: ContactWindow[];`:

```ts
  /** The best landing hour inside the period for the selected site. */
  best: Landing | null;
  /** One entry per catalogue site once `loadOverview` has reached it. */
  overview: Record<string, SiteOverview>;
  overviewBusy: boolean;
  /** Computes the overview site by site for the current period and lander; a no-op when it is already there. */
  loadOverview: () => Promise<void>;
```

and change the `findBestWindow` member to:

```ts
  /**
   * Searches the next 12 months from the start date for the landing hour with the longest time with
   * power and moves the period there; null when none fits. Scope 'compare' takes the mean over the
   * compared sites (and falls back to the selected site when there are none).
   */
  findBestWindow: (days: WindowDays, scope?: 'site' | 'compare') => Promise<{ startUtc: string; poweredHours: number; earthFraction: number } | null>;
```

Replace `recompute`:

```ts
export function recompute(
  eph: Ephemeris,
  site: Site,
  mask: Float64Array,
  startUtc: string,
  days: number,
  params: PlannerParams = DEFAULT_PARAMS,
  mastM = 2,
): SiteResult {
  const hours = days * 24;
  const startEt = utcToEt(startUtc);
  // One pass serves the period and the landing-date search, which looks up to a period past its end
  // (less near the end of the table; a period that does not fit at all still throws below).
  const reach = Math.max(hours, Math.min(2 * hours, eph.n - indexForEt(eph, startEt)));
  const raw = hourlySeries(site, mask, eph, startEt, reach);
  const scan = params.minEarthElDeg > 0 ? withCommsThreshold(raw, mask, params.minEarthElDeg) : raw;
  const series = headSeries(scan, hours);
  return {
    site,
    series,
    summary: summarize(series),
    power: powerBudget(series, params.power),
    contacts: contactWindows(series),
    mastM,
    best: bestLanding(scan, params.power, { from: 0, to: hours, step: 1, capHours: hours }),
  };
}
```

Inside `createExploreStore`:

- beside `let windowSeq = 0;` add `let overviewSeq = 0;` and `let overviewKey: string | null = null;`
- initial state: `best: null,`, `overview: {},`, `overviewBusy: false,`
- in the four places that set `series: r.series, summary: r.summary, power: r.power, contacts: r.contacts` (`selectSite`, `setWindow`, `applyMask`, `setParams`) add `best: r.best`.
- move the mask lookup of `selectSite` into a helper below the store (beside `recomputeCompare`) and use it from `selectSite`, `addToCompare` and `loadOverview`:

```ts
  /** The skyline of a catalogue site: from the cache, flat for a mare site, or fetched once. */
  async function ensureMask(site: Site): Promise<CachedMask> {
    let cached = masks.get(site.id);
    if (cached) return cached;
    if (!site.polar) {
      // Mare sites lie outside the LOLA polar grids: a flat horizon is the honest skyline there.
      cached = { mask: new Float64Array(720), meta: { siteHeightM: 0, source: 'flat', failedTiles: 0, mastM: store.getState().params.mastM } };
    } else {
      const doc = await loaders.loadMask(site.id);
      cached = { mask: Float64Array.from(doc.elevation_deg), meta: { siteHeightM: doc.site_height_m, source: 'featured', failedTiles: 0, mastM: doc.mast_m } };
    }
    masks.set(site.id, cached);
    return cached;
  }
```

  In `selectSite` the block from `let cached = masks.get(id);` to the closing brace of `if (!cached) { ... }` becomes `const cached = await ensureMask(site);`. In `addToCompare` the block `if (!masks.has(id)) { try { ... } catch (err) { ... } }` becomes:

```ts
      try {
        await ensureMask(site);
      } catch (err) {
        set({ error: message(err) });
        return;
      }
```

  (The featured mask now always records `mastM: doc.mast_m`, which is 2 for every committed skyline; `selectSite` compared `cached.meta.mastM ?? 2` with the mast setting before, so nothing changes.)

- replace `findBestWindow`:

```ts
    async findBestWindow(days, scope = 'site') {
      const { eph, site, mask, startUtc, params, compareIds, sites } = get();
      if (!eph) return null;
      const compared = compareIds.flatMap((id) => {
        const s = sites.find((x) => x.id === id);
        const c = masks.get(id);
        return s && c ? [{ site: s, mask: c.mask }] : [];
      });
      const targets = scope === 'compare' && compared.length > 0 ? compared : site && mask ? [{ site, mask }] : [];
      if (targets.length === 0) return null;
      const windowHours = days * 24;
      const startEt = utcToEt(startUtc);
      const lastEt = eph.t0Et + (eph.n - 1) * eph.stepS;
      const available = Math.floor((lastEt - startEt) / 3600) - 3; // Catmull-Rom guard rows at the table end
      const scanHours = Math.min(YEAR_HOURS + windowHours, available);
      if (scanHours < windowHours) {
        set({ bestWindowNote: `A ${days}-day period does not fit between this start date and the end of the Sun and Earth table (2036-12-31).` });
        return null;
      }
      // Only landing hours that leave room for the whole period are candidates.
      const scan = { from: 0, to: Math.min(YEAR_HOURS, scanHours - windowHours + 1), step: 6, capHours: windowHours };
      const best = bestLandingAcross(
        targets.map((t) => {
          const raw = hourlySeries(t.site, t.mask, eph, startEt, scanHours);
          return landingScores(params.minEarthElDeg > 0 ? withCommsThreshold(raw, t.mask, params.minEarthElDeg) : raw, params.power, scan);
        }),
      );
      if (!best) {
        set({ bestWindowNote: targets.length > 1 ? 'No hour in the next 12 months has sunlight at every compared site.' : 'No hour in the next 12 months has sunlight here.' });
        return null;
      }
      const newStart = etToIso(startEt + best.hour * 3600).slice(0, 13) + ':00:00';
      get().setWindow(newStart, days);
      const when = `${dayMonth(newStart, 0)} ${newStart.slice(0, 4)}`;
      const lasting = spanShort(Math.round(best.poweredHours));
      set({
        bestWindowNote:
          targets.length > 1
            ? `Across ${targets.length} compared sites: best landing in the next 12 months: ${when}, power for ${lasting} on average.`
            : `Best landing in the next 12 months: ${when}, power for ${lasting}, Earth in view ${pct0(best.earthFraction)} of that time.`,
      });
      return { startUtc: newStart, poweredHours: best.poweredHours, earthFraction: best.earthFraction };
    },
```

- add the overview action after `findBestWindow`:

```ts
    async loadOverview() {
      const { eph, sites, startUtc, days, params } = get();
      if (!eph) return;
      const key = JSON.stringify([startUtc, days, params]);
      if (key === overviewKey) return; // already there, or on its way, for this period and lander
      overviewKey = key;
      const seq = ++overviewSeq;
      set({ overview: {}, overviewBusy: true });
      for (const site of sites) {
        if (site.category === 'custom') continue;
        try {
          const cached = await ensureMask(site);
          if (seq !== overviewSeq) return;
          const r = recompute(eph, site, cached.mask, startUtc, days, params);
          set({
            overview: {
              ...get().overview,
              [site.id]: { sunFraction: r.summary.illumFraction, earthFraction: r.summary.earthVisFraction, nowHours: timeWithPower(r.power), best: r.best },
            },
          });
        } catch {
          // a skyline that fails to load, or a period outside the table, leaves this row empty
        }
        await new Promise((resolve) => setTimeout(resolve, 0)); // let the page paint between sites
        if (seq !== overviewSeq) return;
      }
      set({ overviewBusy: false });
    },
```

  and make every change of period or lander drop the overview, so a run still in flight stops and the next `loadOverview` starts again. Add beside `recomputeCompare`:

```ts
  /** The overview belongs to one period and one lander: forget it, and stop a run still in flight. */
  function dropOverview(): void {
    overviewKey = null;
    overviewSeq++;
    const { overview, overviewBusy } = store.getState();
    if (overviewBusy || Object.keys(overview).length > 0) store.setState({ overview: {}, overviewBusy: false });
  }
```

  and call `dropOverview();` as the first line of `setWindow` and of `setParams`.

- [ ] **Step 5: Update the callers of `findBestWindow`**

`web/src/lib/ai/actions.ts`, case `'find_best_window'`: the note becomes

```ts
        notes.push(r ? `Moved to the best landing date for ${a.days} days: ${r.startUtc.slice(0, 10)}.` : (store.getState().bestWindowNote ?? `No ${a.days}-day period fits after the start date.`));
```

In `web/src/lib/ai/actions.test.ts` and `web/src/components/PlannerChat.test.tsx`, a mocked `findBestWindow` that resolved `{ startUtc, summary }` now resolves `{ startUtc, poweredHours: 300, earthFraction: 0.5 }`, and the expected note text follows the line above.

`web/src/lib/ai/explanations.ts`, replace the `'best window'` paragraph with:

```ts
  'best window':
    'The best window is the landing date, within the next 12 months, from which the lander keeps power the longest: the hours from touchdown to the first hour the battery cannot cover, counted up to the length of the stay you chose. Only hours with the Sun in view are candidates, because a lander arrives in daylight. When two dates give the same time with power, the one with more contact with Earth wins. On the Compare page the time with power is averaged over the compared sites.',
```

If a test pins the old paragraph's words, change it to pin `/keeps power the longest/`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib src/components` and `npx tsc --noEmit`
Expected: PASS. Tests that only needed the old default site now select it explicitly (Step 3, item 4); `ExploreView.test.tsx` still passes because the page is not rebuilt yet (its `Shackleton` heading assertion needs `/de Gerlache/` instead).

- [ ] **Step 7: Commit**

```bash
git add -u web/src
git add web/src/lib/lander.ts web/src/lib/lander.test.ts
git commit -m "feat(web): the store carries the best landing date, lander presets and an overview of every site; de Gerlache Rim 2 is the default"
```

---

### Task 5: "Choose a landing site" (`/sites`)

**Files:**
- Create: `web/src/test/file-loaders.ts`
- Create: `web/src/components/PeriodControls.tsx`, `web/src/components/PeriodControls.test.tsx`
- Create: `web/src/components/ReliefMap.tsx`, `web/src/components/ReliefMap.test.tsx`
- Create: `web/src/components/sites/SitesView.tsx`, `web/src/components/sites/SitesView.test.tsx`
- Create: `web/src/app/sites/page.tsx`
- Modify: `web/src/components/AppFrame.tsx`, `web/src/components/AppFrame.test.tsx` (the first section opens `/sites`)
- Modify: `web/src/app/page.tsx`, `web/src/app/page.test.tsx` (the gold button opens `/sites`)

**Interfaces:**
- Consumes: `overview`, `overviewBusy`, `loadOverview`, `SiteOverview`, `selectCustom`, `setWindow` (Task 4); `siteLabel`, `Site.blurb` (Task 1); `landerLine` (Task 4); `dateLong`, `dayMonth`, `pct0`, `spanShort` (Task 3, part 1); `HOME.relief` (part 1); `checkPick` (`web/src/lib/viz/pick.ts`); `useNavigate`.
- Produces:
  - `web/src/test/file-loaders.ts`: `eph`, `sites`, `fileLoaders(overrides?: Partial<Loaders>): Loaders` (store loaders that read the committed data files; used by every component test from here on).
  - `PeriodControls({ startUtc, days, onChange }: { startUtc: string; days: WindowDays; onChange: (startUtc: string, days: WindowDays) => void })`: two labelled controls, "From" and "For", to be placed in a flex row by the caller.
  - `ReliefMap({ pins, activeId?, selectedId?, onActive?, labelled? })` with `interface MapPin { id: string; u: number; v: number; label: string; href: string; tone: 'good' | 'plain' }`.
  - `exploreHref(siteId: string, startUtc: string, days: number): string` exported from `SitesView.tsx`.
  - `SitesView({ store?, navigate? })`.

- [ ] **Step 1: The shared test loaders**

`web/src/test/file-loaders.ts`:

```ts
import type { Site } from '@/lib/data/loaders';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import type { Loaders } from '@/lib/store/explore';

const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
export const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
export const sites: Site[] = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];

/** Store loaders that read the committed data files, for tests that need the real catalogue and the real sky. */
export function fileLoaders(overrides: Partial<Loaders> = {}): Loaders {
  return {
    loadSites: async () => sites,
    loadEphemeris: async () => eph,
    loadMask: async (id) => {
      const m = readJson<{ elevation_deg: number[]; site_height_m: number }>('data', 'masks', `${id}.json`);
      return { site_id: id, lat: 0, lon: 0, mast_m: 2, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
    },
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing tests**

`web/src/components/PeriodControls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PeriodControls } from './PeriodControls';

describe('PeriodControls', () => {
  it('shows the start date and the three lengths, with the chosen one checked', () => {
    render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={() => {}} />);
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2027-01-20');
    const group = screen.getByRole('radiogroup', { name: 'For' });
    expect(group.textContent).toBe('14 days30 days90 days');
    expect((screen.getByRole('radio', { name: '30 days' }) as HTMLInputElement).checked).toBe(true);
  });

  it('reports a new date at midnight UTC and a new length with the same start', () => {
    const onChange = vi.fn();
    render(<PeriodControls startUtc="2027-01-20T10:00:00" days={30} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2027-03-05' } });
    expect(onChange).toHaveBeenLastCalledWith('2027-03-05T00:00:00', 30);
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }));
    expect(onChange).toHaveBeenLastCalledWith('2027-01-20T10:00:00', 90);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledTimes(2); // an emptied date field changes nothing
  });
});
```

`web/src/components/ReliefMap.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReliefMap, type MapPin } from './ReliefMap';

const pins: MapPin[] = [
  { id: 'a', u: 0.25, v: 0.5, label: 'Alpha Ridge', href: '/explore?site=a', tone: 'good' },
  { id: 'b', u: 0.9, v: 0.1, label: 'Beta Plain', href: '/explore?site=b', tone: 'plain' },
];

describe('ReliefMap', () => {
  it('places one link per site, named after the site', () => {
    render(<ReliefMap pins={pins} />);
    const a = screen.getByRole('link', { name: 'Alpha Ridge' });
    expect(a.getAttribute('href')).toBe('/explore?site=a');
    expect(a.style.left).toBe('25%');
    expect(a.style.top).toBe('50%');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('img').getAttribute('alt')).toMatch(/south pole/);
  });

  it('writes every name on the map, and marks the active and the selected pin', () => {
    render(<ReliefMap pins={pins} activeId="a" selectedId="b" />);
    expect(screen.getByText('Alpha Ridge')).toBeTruthy();
    expect(screen.getByText('Beta Plain')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Alpha Ridge' }).getAttribute('data-active')).toBe('true');
    expect(screen.getByRole('link', { name: 'Beta Plain' }).getAttribute('aria-current')).toBe('true');
  });

  it('tells its owner which pin the pointer or the keyboard is on', () => {
    const onActive = vi.fn();
    render(<ReliefMap pins={pins} onActive={onActive} />);
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Beta Plain' }));
    expect(onActive).toHaveBeenLastCalledWith('b');
    fireEvent.mouseLeave(screen.getByRole('link', { name: 'Beta Plain' }));
    expect(onActive).toHaveBeenLastCalledWith(null);
    fireEvent.focus(screen.getByRole('link', { name: 'Alpha Ridge' }));
    expect(onActive).toHaveBeenLastCalledWith('a');
  });
});
```

`web/src/components/sites/SitesView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { exploreHref, SitesView } from './SitesView';

async function ready() {
  const store = createExploreStore(fileLoaders());
  const view = render(<SitesView store={store} navigate={() => {}} />);
  await waitFor(() => expect(store.getState().overviewBusy).toBe(false), { timeout: 20_000 });
  await waitFor(() => expect(Object.keys(store.getState().overview)).toHaveLength(19), { timeout: 20_000 });
  return { store, ...view };
}
const rowOf = (name: string) => screen.getAllByRole('link').find((a) => a.dataset.row && a.textContent?.startsWith(name))!;

describe('exploreHref', () => {
  it('carries the site and the period, with the hour only when it is not midnight', () => {
    expect(exploreHref('nobile_rim_1', '2027-01-01T00:00:00', 30)).toBe('/explore?site=nobile_rim_1&start=2027-01-01&days=30');
    expect(exploreHref('nobile_rim_1', '2027-01-20T10:00:00', 14)).toBe('/explore?site=nobile_rim_1&start=2027-01-20T10:00&days=14');
  });
});

describe('SitesView', () => {
  it('titles the page, says what the figures assume and groups the catalogue in plain words', async () => {
    await ready();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Choose a landing site');
    expect(screen.getByText(/19 places on the Moon/).textContent).toMatch(/4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery.*in the 30 days from 1 January 2027/);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Shortlisted by NASA for a crewed Artemis landing',
      'Where commercial landers touched down',
      'High points and crater floors',
      'Somewhere else',
    ]);
    expect(screen.getByText(/Each figure is for the centre of the region/)).toBeTruthy();
    expect(document.querySelectorAll('main .btn-primary')).toHaveLength(0);
  });

  it('gives each site its sunlight, its contact with Earth and its longest time with power', async () => {
    await ready();
    const row = rowOf('de Gerlache Rim 2');
    expect(row.getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    expect(row.textContent).toMatch(/A ridge on a crater rim, 52 km from the pole/);
    expect(row.textContent).toMatch(/Sunlight 45 %/);
    expect(row.textContent).toMatch(/Earth in view 45 %/);
    expect(row.textContent).toMatch(/Longest time with power 12 d 15 h, landing 20 Jan/);
  });

  it('says in words when a site has no sunlight or no contact with Earth', async () => {
    await ready();
    expect(rowOf('Shackleton crater floor').textContent).toMatch(/No sunlight/);
    expect(rowOf('Shackleton crater floor').textContent).toMatch(/No power from the Sun/);
    expect(rowOf('Mons Mouton').textContent).toMatch(/No contact with Earth/);
    expect(rowOf('Shackleton rim summit').textContent).toMatch(/all 30 days/);
  });

  it('sorts each group by time with power once every figure is in', async () => {
    const { store } = await ready();
    const first = screen.getAllByRole('list')[0];
    const hours = [...first.querySelectorAll<HTMLElement>('a[data-row]')].map((a) => store.getState().overview[a.dataset.row!].best?.poweredHours ?? -1);
    expect(hours).toHaveLength(9);
    expect(hours).toEqual([...hours].sort((a, b) => b - a));
  });

  it('pins every site that lies on the map, each a link with the site name', async () => {
    await ready();
    const map = screen.getByRole('region', { name: 'Map of the sites' });
    const pins = within(map).getAllByRole('link');
    expect(pins).toHaveLength(17);
    expect(within(map).getByRole('link', { name: 'de Gerlache Rim 2' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    expect(map.textContent).toMatch(/IM-1 Odysseus and Blue Ghost Mission 1 lie outside this map/);
  });

  it('lights the pin of the row under the pointer, and the row of the pin', async () => {
    await ready();
    const map = screen.getByRole('region', { name: 'Map of the sites' });
    fireEvent.mouseEnter(rowOf('Haworth'));
    expect(within(map).getByRole('link', { name: 'Haworth' }).getAttribute('data-active')).toBe('true');
    fireEvent.mouseLeave(rowOf('Haworth'));
    fireEvent.mouseEnter(within(map).getByRole('link', { name: 'Slater Plain' }));
    expect(rowOf('Slater Plain').getAttribute('data-active')).toBe('true');
  });

  it('redoes the figures for another period', async () => {
    const { store } = await ready();
    fireEvent.click(screen.getByRole('radio', { name: '14 days' }));
    expect(store.getState().days).toBe(14);
    await waitFor(() => expect(Object.keys(store.getState().overview)).toHaveLength(19), { timeout: 20_000 });
    await waitFor(() => expect(rowOf('de Gerlache Rim 2').getAttribute('href')).toMatch(/days=14/));
    expect(screen.getByText(/19 places on the Moon/).textContent).toMatch(/in the 14 days from 1 January 2027/);
  });

  it('shows the rows before the figures arrive', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const base = fileLoaders();
    const store = createExploreStore({
      ...base,
      loadMask: async (id) => {
        if (id !== 'de_gerlache_rim_2') await gate;
        return base.loadMask(id);
      },
    });
    render(<SitesView store={store} navigate={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole('link').some((a) => a.dataset.row === 'haworth')).toBe(true));
    expect(rowOf('Haworth').textContent).toMatch(/working it out/);
    release();
    await waitFor(() => expect(rowOf('Haworth').textContent).toMatch(/Sunlight \d+ %/), { timeout: 20_000 });
  });

  it('computes a place that is not in the list and opens it', async () => {
    const navigate = vi.fn();
    const computeMask = vi.fn(async () => ({ mask: new Float64Array(720), siteHeightM: 0, failedTiles: 0 }));
    const store = createExploreStore(fileLoaders({ computeMask }));
    render(<SitesView store={store} navigate={navigate} />);
    await waitFor(() => expect(store.getState().status).toBe('ready'));
    fireEvent.change(screen.getByLabelText('Latitude (°)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compute this place' }));
    expect(screen.getByRole('alert').textContent).toMatch(/south of 60° S/);
    expect(computeMask).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Latitude (°)'), { target: { value: '-88.2' } });
    fireEvent.change(screen.getByLabelText('Longitude (°)'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compute this place' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/explore'));
    expect(computeMask).toHaveBeenCalledWith(-88.2, 40, 2);
    expect(store.getState().site?.category).toBe('custom');
  });

  it('says what to do when the data files are missing', async () => {
    const store = createExploreStore({
      loadSites: async () => {
        throw new Error('could not load /data/sites.json (HTTP 404)');
      },
      loadEphemeris: async () => {
        throw new Error('could not load /data/ephemeris/x (HTTP 404)');
      },
      loadMask: async () => {
        throw new Error('could not load /data/masks/x (HTTP 404)');
      },
    });
    render(<SitesView store={store} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/sync-local/));
  });
});
```

In `web/src/components/AppFrame.test.tsx` change the expected first link to `['Explore a site', '/sites']`. In `web/src/app/page.test.tsx` change the expected `href` of the gold button to `'/sites'`.

- [ ] **Step 3: Run them to see them fail**

Run (from `web/`): `npx vitest run src/components/PeriodControls.test.tsx src/components/ReliefMap.test.tsx src/components/sites src/components/AppFrame.test.tsx src/app/page.test.tsx`
Expected: FAIL: the three modules do not exist; the two links still point at `/explore`.

- [ ] **Step 4: Write `PeriodControls.tsx`**

```tsx
'use client';
import { useId } from 'react';
import { WINDOW_DAYS, type WindowDays } from '@/lib/store/explore';

/**
 * The period every figure on a page is for: "From" (a date, midnight UTC) and "For" (14, 30 or 90
 * days). Renders two labelled controls; the caller lays them out in a row.
 */
export function PeriodControls({ startUtc, days, onChange }: { startUtc: string; days: WindowDays; onChange: (startUtc: string, days: WindowDays) => void }) {
  const id = useId();
  return (
    <>
      <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
        From
        <input
          type="date"
          value={startUtc.slice(0, 10)}
          min="2024-01-02"
          max="2036-12-30"
          onChange={(e) => e.target.value && onChange(`${e.target.value}T00:00:00`, days)}
          className="field w-[190px]"
        />
      </label>
      <div className="flex flex-col gap-1.5 text-[15px] text-ink-2">
        <span id={`${id}-for`}>For</span>
        <div role="radiogroup" aria-labelledby={`${id}-for`} className="flex h-[52px] overflow-hidden rounded-[10px] border border-line-strong bg-surface text-base">
          {WINDOW_DAYS.map((d) => (
            <label
              key={d}
              className={`flex cursor-pointer items-center whitespace-nowrap px-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-sun-ink ${
                d === days ? 'bg-ink font-semibold text-page' : 'text-ink-2 hover:bg-surface-2'
              }`}
            >
              <input type="radio" name={`${id}-days`} className="sr-only" checked={d === days} onChange={() => onChange(startUtc, d)} />
              {d} days
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Write `ReliefMap.tsx`**

```tsx
'use client';
import Image from 'next/image';
import Link from 'next/link';
import { HOME } from '@/lib/data/home';

export interface MapPin {
  id: string;
  /** Position on the picture as fractions of its width and height, from the top left. */
  u: number;
  v: number;
  label: string;
  href: string;
  /** Green for a site with two weeks or more of power. */
  tone: 'good' | 'plain';
}

/**
 * The relief picture of the south pole with one pin per site. Each pin is a link named after its
 * site. The name is written on the map and shows for the pin under the pointer, the pin with keyboard
 * focus, the active pin (the row under the pointer) and the selected site.
 */
export function ReliefMap({
  pins,
  activeId = null,
  selectedId = null,
  onActive,
}: {
  pins: MapPin[];
  activeId?: string | null;
  selectedId?: string | null;
  onActive?: (id: string | null) => void;
}) {
  return (
    <div className="stage relative aspect-square">
      <Image src={HOME.relief.image} alt="Relief map of the Moon's south pole, 500 km across, with the pole at the centre" fill sizes="(min-width: 1024px) 460px, 100vw" className="object-cover" />
      {pins.map((p) => {
        const selected = p.id === selectedId;
        const active = p.id === activeId;
        const shown = selected || active;
        return (
          <Link
            key={p.id}
            href={p.href}
            aria-label={p.label}
            aria-current={selected ? 'true' : undefined}
            data-active={active ? 'true' : undefined}
            onMouseEnter={() => onActive?.(p.id)}
            onMouseLeave={() => onActive?.(null)}
            onFocus={() => onActive?.(p.id)}
            onBlur={() => onActive?.(null)}
            className={`group absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full hover:z-20 focus-visible:z-20 ${shown ? 'z-10' : ''}`}
            style={{ left: `${+(p.u * 100).toFixed(2)}%`, top: `${+(p.v * 100).toFixed(2)}%` }}
          >
            <span
              className={`block rounded-full border-2 border-stage ${selected ? 'h-5 w-5 bg-stage-sun' : shown ? 'h-4 w-4' : 'h-3 w-3 group-hover:h-4 group-hover:w-4'} ${
                selected ? '' : p.tone === 'good' ? 'bg-[#46c98b]' : 'bg-stage-ink'
              }`}
            />
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-full mt-0.5 whitespace-nowrap rounded-md bg-stage/85 px-2 py-0.5 text-[15px] font-medium text-stage-ink ${p.u > 0.72 ? 'right-0' : p.u < 0.28 ? 'left-0' : 'left-1/2 -translate-x-1/2'} ${
                shown ? '' : 'hidden group-hover:block group-focus-visible:block'
              }`}
            >
              {p.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Write `SitesView.tsx` and the route**

`web/src/components/sites/SitesView.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from '@/components/AppFrame';
import { PeriodControls } from '@/components/PeriodControls';
import { ReliefMap, type MapPin } from '@/components/ReliefMap';
import { HOME } from '@/lib/data/home';
import { siteLabel, type Site } from '@/lib/data/loaders';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { landerLine } from '@/lib/lander';
import { exploreStore, type ExploreState, type SiteOverview } from '@/lib/store/explore';
import { dateLong, dayMonth, pct0, spanShort } from '@/lib/viz/format';
import { checkPick } from '@/lib/viz/pick';

const TWO_WEEKS_H = 14 * 24;

const GROUPS: { title: string; note: string; categories: string[] }[] = [
  {
    title: 'Shortlisted by NASA for a crewed Artemis landing',
    note: 'The nine candidate regions NASA named in October 2024. Each figure is for the centre of the region.',
    categories: ['artemis3'],
  },
  { title: 'Where commercial landers touched down', note: 'Three real missions to replay.', categories: ['clps_landed'] },
  { title: 'High points and crater floors', note: 'The extremes: rims that almost never lose the Sun, floors that never see it.', categories: ['classic', 'reference'] },
];

const COLUMNS = 'grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_16px] items-center gap-x-5';

/** The Explore address for a site and a period; the hour is kept only when the period does not start at midnight. */
export function exploreHref(siteId: string, startUtc: string, days: number): string {
  const start = startUtc.endsWith('T00:00:00') ? startUtc.slice(0, 10) : startUtc.slice(0, 16);
  return `/explore?site=${siteId}&start=${start}&days=${days}`;
}

/** Rows are ranked by the longest time with power, then by sunlight; a site without figures goes last. */
const rank = (o: SiteOverview | undefined) => (o ? (o.best?.poweredHours ?? -1) * 10 + o.sunFraction : -100);

function Row({ site, o, href, startUtc, days, active, onActive }: { site: Site; o: SiteOverview | undefined; href: string; startUtc: string; days: number; active: boolean; onActive: (id: string | null) => void }) {
  const capped = o?.best ? o.best.poweredHours >= days * 24 : false;
  return (
    <li>
      <Link
        href={href}
        data-row={site.id}
        data-active={active ? 'true' : undefined}
        onMouseEnter={() => onActive(site.id)}
        onMouseLeave={() => onActive(null)}
        onFocus={() => onActive(site.id)}
        onBlur={() => onActive(null)}
        className={`${COLUMNS} rounded-xl border px-3 py-3.5 ${active ? 'border-line-strong bg-surface' : 'border-transparent hover:border-line-strong hover:bg-surface'}`}
      >
        <span>
          <span className="block text-[17px] font-semibold leading-snug">{siteLabel(site)}</span>
          <span className="mt-0.5 block text-[15px] text-ink-2">{site.blurb}</span>
        </span>
        {!o ? (
          <span className="col-span-3 text-[15px] text-ink-3">working it out…</span>
        ) : (
          <>
            <span className="flex items-center gap-3">
              <span className="sr-only"> Sunlight </span>
              {o.sunFraction > 0 ? (
                <>
                  <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-sun" style={{ width: `${Math.round(o.sunFraction * 100)}%` }} />
                  </span>
                  <b className="w-12 text-right font-semibold">{pct0(o.sunFraction)}</b>
                </>
              ) : (
                <span className="text-[15px] text-ink-2">No sunlight</span>
              )}
            </span>
            <span className={o.earthFraction > 0 ? 'text-right' : 'text-[15px] text-ink-2'}>
              <span className="sr-only"> Earth in view </span>
              {o.earthFraction > 0 ? pct0(o.earthFraction) : 'No contact with Earth'}
            </span>
            <span>
              <span className="sr-only"> Longest time with power </span>
              {o.best ? (
                <>
                  <b className={`block font-semibold ${o.best.poweredHours >= TWO_WEEKS_H ? 'text-good' : ''}`}>{capped ? `all ${days} days` : spanShort(Math.round(o.best.poweredHours))}</b>
                  <span className="block text-[15px] text-ink-2">
                    <span className="sr-only">, </span>landing {dayMonth(startUtc, o.best.hour)}
                  </span>
                </>
              ) : (
                <span className="text-[15px] text-ink-2">No power from the Sun</span>
              )}
            </span>
          </>
        )}
        <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-ink-3" aria-hidden="true">
          <path d="M6 3l5 5-5 5" />
        </svg>
      </Link>
    </li>
  );
}

function Elsewhere({ store, navigate }: { store: StoreApi<ExploreState>; navigate: (href: string) => void }) {
  const busy = useStore(store, (s) => s.maskBusy);
  const [lat, setLat] = useState('-89.5');
  const [lon, setLon] = useState('0');
  const [problem, setProblem] = useState<string | null>(null);
  async function submit() {
    const pick = lat.trim() === '' || lon.trim() === '' ? { ok: false as const } : checkPick(Number(lat), Number(lon));
    if (!pick.ok || pick.lat < -90) {
      setProblem('This tool covers the Moon south of 60° S. Give a latitude between -90 and -60, and a longitude in degrees.');
      return;
    }
    setProblem(null);
    await store.getState().selectCustom(pick.lat, pick.lon);
    const failed = store.getState().customError;
    if (failed) setProblem(`That place could not be worked out: ${failed}.`);
    else navigate('/explore');
  }
  return (
    <section aria-labelledby="h-elsewhere" className="panel mt-10">
      <h2 id="h-elsewhere" className="display text-[23px] font-semibold">
        Somewhere else
      </h2>
      <p className="mt-1.5 max-w-[46em] text-ink-2">Any point south of 60° S works. The hills around it are read from NASA elevation data in your browser, which takes a few seconds.</p>
      <form
        className="mt-4 flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
          Latitude (°)
          <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" className="field w-36" />
        </label>
        <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
          Longitude (°)
          <input value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" className="field w-36" />
        </label>
        <button type="submit" disabled={busy} className="btn h-[52px]">
          {busy ? 'Working it out…' : 'Compute this place'}
        </button>
        {problem && (
          <p role="alert" className="basis-full text-bad">
            {problem}
          </p>
        )}
      </form>
    </section>
  );
}

/** "Choose a landing site": every catalogue site with its sunlight, its contact with Earth and its longest time with power. */
export function SitesView({ store = exploreStore, navigate }: { store?: StoreApi<ExploreState>; navigate?: (href: string) => void }) {
  const s = useStore(store);
  const routerNavigate = useNavigate();
  const go = navigate ?? routerNavigate;
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    void store.getState().init();
  }, [store]);
  useEffect(() => {
    if (s.status === 'ready') void store.getState().loadOverview();
  }, [store, s.status, s.startUtc, s.days, s.params]);

  const catalogue = useMemo(() => s.sites.filter((x) => x.category !== 'custom'), [s.sites]);
  const groups = useMemo(() => {
    const settled = !s.overviewBusy && Object.keys(s.overview).length > 0;
    return GROUPS.map((g) => {
      const rows = catalogue.filter((x) => g.categories.includes(x.category));
      // The order changes once, when every figure is in: rows must not jump under the pointer while they load.
      return { ...g, rows: settled ? [...rows].sort((a, b) => rank(s.overview[b.id]) - rank(s.overview[a.id])) : rows };
    });
  }, [catalogue, s.overview, s.overviewBusy]);
  const pins: MapPin[] = useMemo(
    () =>
      HOME.relief.sites.flatMap((p) => {
        const site = catalogue.find((x) => x.id === p.id);
        if (!site) return [];
        const best = s.overview[p.id]?.best;
        return [{ id: p.id, u: p.u, v: p.v, label: siteLabel(site), href: exploreHref(p.id, s.startUtc, s.days), tone: best && best.poweredHours >= TWO_WEEKS_H ? ('good' as const) : ('plain' as const) }];
      }),
    [catalogue, s.overview, s.startUtc, s.days],
  );
  const offMap = catalogue.filter((x) => !HOME.relief.sites.some((p) => p.id === x.id)).map(siteLabel);

  if (s.status === 'idle' || s.status === 'loading') {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <p className="text-ink-2">Loading NASA data…</p>
        </main>
      </AppFrame>
    );
  }
  if (s.status === 'error') {
    const missing = /HTTP 404/.test(s.error ?? '');
    return (
      <AppFrame>
        <main className="wrap py-12">
          <div role="alert" className="max-w-prose border-l-2 border-bad pl-4 text-ink-2">
            <p className="text-ink">{missing ? 'Data files are missing.' : 'Something went wrong while loading.'}</p>
            <p className="mt-2 text-[15px]">
              {missing ? (
                <>
                  Run <code className="text-ink">uv run python -m lunar_pipeline.cli sync-local --tiles</code> inside <code className="text-ink">pipeline/</code> and reload this page.
                </>
              ) : (
                s.error
              )}
            </p>
          </div>
        </main>
      </AppFrame>
    );
  }

  return (
    <AppFrame>
      <main className="wrap pb-16 pt-10">
        <h1 className="display text-[40px] font-semibold leading-tight tracking-[-0.02em]">Choose a landing site</h1>
        <p className="mt-3 max-w-[46em] text-lg text-ink-2">
          {catalogue.length} places on the Moon, most of them near the south pole. The figures are for a lander with a {landerLine(s.params.power)}, arriving in the {s.days} days from{' '}
          {dateLong(s.startUtc, 0)} {s.startUtc.slice(0, 4)}: how often it has sunlight and sees Earth, and how long it can stay powered. Pick one to see why.
        </p>
        <div className="mt-6 flex flex-wrap items-end gap-4">
          <PeriodControls startUtc={s.startUtc} days={s.days} onChange={s.setWindow} />
        </div>
        {s.error && (
          <p role="status" className="mt-3 text-warn">
            {s.error}
          </p>
        )}

        <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
          <section aria-label="Map of the sites" className="lg:sticky lg:top-6">
            <ReliefMap pins={pins} activeId={active} onActive={setActive} />
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-2">
              <span className="flex items-center gap-2">
                <i className="h-3 w-3 rounded-full bg-good" />
                two weeks or more with power
              </span>
              <span className="flex items-center gap-2">
                <i className="h-3 w-3 rounded-full border-2 border-ink-3" />
                less
              </span>
            </p>
            <p className="mt-1.5 text-[15px] text-ink-3">
              The map is 500 km across with the south pole at the centre.{offMap.length > 0 ? ` ${offMap.join(' and ')} lie outside this map.` : ''}
            </p>
          </section>

          <div>
            {groups.map((g, i) => (
              <section key={g.title} aria-labelledby={`h-group-${i}`} className={i > 0 ? 'mt-10' : ''}>
                <h2 id={`h-group-${i}`} className="display text-[23px] font-semibold">
                  {g.title}
                </h2>
                <p className="mt-1 text-ink-2">{g.note}</p>
                <div aria-hidden="true" className={`${COLUMNS} mt-4 border-b border-line px-3 pb-2 text-[15px] text-ink-3`}>
                  <span>Site</span>
                  <span>Sunlight</span>
                  <span className="text-right">Earth in view</span>
                  <span>Longest time with power</span>
                  <span />
                </div>
                <ul className="mt-1 divide-y divide-line">
                  {g.rows.map((site) => (
                    <Row key={site.id} site={site} o={s.overview[site.id]} href={exploreHref(site.id, s.startUtc, s.days)} startUtc={s.startUtc} days={s.days} active={active === site.id} onActive={setActive} />
                  ))}
                </ul>
              </section>
            ))}
            <Elsewhere store={store} navigate={go} />
          </div>
        </div>
      </main>
    </AppFrame>
  );
}
```

`web/src/app/sites/page.tsx`:

```tsx
import { SitesView } from '@/components/sites/SitesView';

export default function SitesPage() {
  return <SitesView />;
}
```

- [ ] **Step 7: Point the header and the home page at the list**

`web/src/components/AppFrame.tsx`: in `NAV`, the first entry becomes `{ href: '/sites', label: 'Explore a site' }` and the comment above it `/** The four sections in plain words. "Explore a site" opens the site list. */`.

`web/src/app/page.tsx`: the gold link's `href` becomes `"/sites"`.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/components src/app` and `npx tsc --noEmit` and `npm run lint`
Expected: PASS. The `Mons Mouton` row helper matches the first row whose text starts with that name; if it picks `Mons Mouton Plateau`, change `rowOf` to compare `a.dataset.row` with the site id and pass ids instead of names.

- [ ] **Step 9: Look at it**

With the dev server running, open `http://app.localhost:3000/sites` and `?theme=dark` at 1440 by 900 and at 1024 by 768 with Playwright. Check: the map and the list side by side; names appear on the pins under the pointer; no row wraps into three lines at 1440; nothing scrolls sideways at 390 px (under 1024 px the map stacks above the list); no text under 13 px; every control at least 44 px tall. Save screenshots under `.playwright-mcp/part2-sites-*.png`.

- [ ] **Step 10: Commit**

```bash
git add web/src/test/file-loaders.ts web/src/components/PeriodControls.tsx web/src/components/PeriodControls.test.tsx web/src/components/ReliefMap.tsx web/src/components/ReliefMap.test.tsx web/src/components/sites web/src/app/sites web/src/components/AppFrame.tsx web/src/components/AppFrame.test.tsx web/src/app/page.tsx web/src/app/page.test.tsx
git commit -m "feat(web): choose a landing site: every site with its sunlight, its contact with Earth and its longest time with power"
```

---

### Task 6: Explore's period band and the lander dialog

**Files:**
- Create: `web/src/components/Modal.tsx`, `web/src/components/Modal.test.tsx`
- Create: `web/src/components/NumberField.tsx`, `web/src/components/NumberField.test.tsx`
- Create: `web/src/components/explore/LanderDialog.tsx`, `web/src/components/explore/LanderDialog.test.tsx`
- Create: `web/src/components/explore/PeriodBand.tsx`, `web/src/components/explore/PeriodBand.test.tsx`

**Interfaces:**
- Consumes: `PeriodControls` (Task 5); `LANDER_PRESETS`, `presetOf`, `landerName`, `batteryHours` (Task 4); `siteLabel` (Task 1); `PANEL_LABELS`, `DEFAULT_POWER`, `PowerConfig`, `PanelModel`; `POWER_RANGES`, `PARAM_RANGES`, `percentRange`; `PlannerParams`, `WindowDays`.
- Produces:
  - `Modal({ title, onClose, returnFocus?, wide?, children })`: `role="dialog"`, `aria-modal`, named by `title`; focus moves in, Tab stays inside, Escape and a press on the backdrop call `onClose`, the opener gets the focus back.
  - `NumberField({ label, value, min, max, step, onChange, className? })`: a 52 px number field that commits valid values as they are typed and reverts an invalid draft on blur.
  - `LanderDialog({ params, onPower, onParams, busy, onClose, returnFocus? })`.
  - `PeriodBand({ site, startUtc, days, onWindow, power, onLander, landerRef? })`.

- [ ] **Step 1: Write the failing tests**

`web/src/components/Modal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

function Host({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={opener} type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Modal
          title="Settings"
          returnFocus={opener}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <input aria-label="First" />
          <button type="button">Last</button>
        </Modal>
      )}
    </>
  );
}

describe('Modal', () => {
  it('is a named modal dialog that takes the focus and gives it back', () => {
    render(<Host onClose={() => {}} />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Escape and on a press outside, not on a press inside', () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('First'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab inside', () => {
    render(<Host onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
```

`web/src/components/NumberField.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';

describe('NumberField', () => {
  it('commits a valid value as it is typed and lets the user type through an invalid one', () => {
    const onChange = vi.fn();
    render(<NumberField label="Load (W)" value={200} min={10} max={2000} step={10} onChange={onChange} />);
    const input = screen.getByLabelText('Load (W)') as HTMLInputElement;
    expect(input.className).toMatch(/\bfield\b/);
    fireEvent.change(input, { target: { value: '5' } }); // on the way to 500
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('5');
    fireEvent.change(input, { target: { value: '500' } });
    expect(onChange).toHaveBeenLastCalledWith(500);
  });

  it('goes back to the last valid value when the field is left with an invalid draft', () => {
    render(<NumberField label="Load (W)" value={200} min={10} max={2000} step={10} onChange={() => {}} />);
    const input = screen.getByLabelText('Load (W)') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input.value).toBe('200');
  });
});
```

`web/src/components/explore/LanderDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARAMS } from '@/lib/store/explore';
import { LanderDialog } from './LanderDialog';

function open(params = DEFAULT_PARAMS) {
  const onPower = vi.fn();
  const onParams = vi.fn();
  const onClose = vi.fn();
  render(<LanderDialog params={params} onPower={onPower} onParams={onParams} busy={false} onClose={onClose} />);
  return { onPower, onParams, onClose };
}

describe('LanderDialog', () => {
  it('offers three landers named by their numbers, with the current one checked', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'The lander' });
    const presets = within(dialog).getByRole('radiogroup', { name: 'Lander' });
    expect(within(presets).getAllByRole('radio').map((r) => (r as HTMLInputElement).checked)).toEqual([true, false, false, false]);
    expect(presets.textContent).toMatch(/4 m² panel, 200 W, 2 kWh battery.*10 hours in the dark/);
    expect(presets.textContent).toMatch(/20 m² panel, 500 W, 50 kWh battery.*4 days 4 hours in the dark/);
    expect(presets.textContent).toMatch(/Custom/);
  });

  it('applies a preset with the standard panel around it', () => {
    const { onPower } = open({ ...DEFAULT_PARAMS, power: { ...DEFAULT_PARAMS.power, panel: 'horizontal', efficiency: 0.2 } });
    fireEvent.click(screen.getByRole('radio', { name: /8 m² panel, 400 W, 20 kWh battery/ }));
    expect(onPower).toHaveBeenLastCalledWith({ areaM2: 8, loadW: 400, batteryWh: 20000, panel: 'vertical_tracking', panelAzimuthDeg: 0, efficiency: 0.3, initialSocFraction: 1 });
  });

  it('shows Custom as checked for any other lander and opens its fields', () => {
    const { onPower, onParams } = open({ ...DEFAULT_PARAMS, power: { ...DEFAULT_PARAMS.power, loadW: 250 } });
    expect((screen.getByRole('radio', { name: /Custom/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Battery (Wh)'), { target: { value: '5000' } });
    expect(onPower).toHaveBeenLastCalledWith({ batteryWh: 5000 });
    fireEvent.change(screen.getByLabelText('Cell efficiency (%)'), { target: { value: '25' } });
    expect(onPower).toHaveBeenLastCalledWith({ efficiency: 0.25 });
    fireEvent.click(screen.getByRole('radio', { name: 'Flat on the deck' }));
    expect(onPower).toHaveBeenLastCalledWith({ panel: 'horizontal' });
    fireEvent.change(screen.getByLabelText('Mast height (m)'), { target: { value: '5' } });
    expect(onParams).toHaveBeenLastCalledWith({ mastM: 5 });
    fireEvent.change(screen.getByLabelText('Earth at least this high above the hills (°)'), { target: { value: '2' } });
    expect(onParams).toHaveBeenLastCalledWith({ minEarthElDeg: 2 });
  });

  it('keeps the custom fields closed for a preset until Custom is chosen', () => {
    open();
    expect(screen.queryByLabelText('Battery (Wh)')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Custom/ }));
    expect(screen.getByLabelText('Battery (Wh)')).toBeTruthy();
    expect(screen.queryByLabelText('Panel faces (° from north)')).toBeNull(); // only for the upright fixed panel
  });

  it('closes from its button and says in plain words how the power is worked out', () => {
    const { onClose } = open();
    expect(screen.getByRole('dialog').textContent).toMatch(/The battery fills when the panel makes more than the lander uses/);
    expect(screen.getByRole('dialog').textContent).not.toMatch(/skyline|LOLA|DE440/);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

`web/src/components/explore/PeriodBand.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_POWER } from '@/lib/engine/power';
import { PeriodBand } from './PeriodBand';

const site = { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (Artemis III region)', label: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, category: 'artemis3', polar: true, source: 'x' };

describe('PeriodBand', () => {
  it('shows the four things a forecast is for: site, start, length, lander', () => {
    render(<PeriodBand site={site} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    const band = screen.getByRole('region', { name: 'What this forecast is for' });
    expect(band).toBeTruthy();
    const siteLink = screen.getByRole('link', { name: 'Landing site: de Gerlache Rim 2. Change site' });
    expect(siteLink.getAttribute('href')).toBe('/sites');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2027-01-01');
    expect(screen.getByRole('radiogroup', { name: 'For' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lander: 4 m² panel, 200 W, 2 kWh battery. Change' })).toBeTruthy();
  });

  it('opens the lander settings and passes period changes on', () => {
    const onLander = vi.fn();
    const onWindow = vi.fn();
    render(<PeriodBand site={site} startUtc="2027-01-01T00:00:00" days={30} onWindow={onWindow} power={{ ...DEFAULT_POWER, loadW: 250 }} onLander={onLander} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lander: Custom lander. Change' }));
    expect(onLander).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: '14 days' }));
    expect(onWindow).toHaveBeenLastCalledWith('2027-01-01T00:00:00', 14);
  });

  it('names a custom place by its coordinates', () => {
    const custom = { id: 'custom_-89.5000_10.0000', name: 'Custom site -89.500°, 10.000°', lat: -89.5, lon: 10, category: 'custom', polar: true, source: 'user' };
    render(<PeriodBand site={custom} startUtc="2027-01-01T00:00:00" days={30} onWindow={() => {}} power={DEFAULT_POWER} onLander={() => {}} />);
    expect(screen.getByRole('link', { name: 'Landing site: Custom site -89.500°, 10.000°. Change site' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `web/`): `npx vitest run src/components/Modal.test.tsx src/components/NumberField.test.tsx src/components/explore`
Expected: FAIL: the four modules do not exist.

- [ ] **Step 3: Write `Modal.tsx`**

```tsx
'use client';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog. Focus moves in when it opens and Tab stays inside; Escape, the Close button and a
 * press on the backdrop call `onClose`; when it unmounts the opener gets the focus back.
 */
export function Modal({ title, onClose, returnFocus, wide = false, children }: { title: string; onClose: () => void; returnFocus?: RefObject<HTMLElement | null>; wide?: boolean; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = returnFocus?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus();
  }, [returnFocus]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`panel w-full shadow-2xl ${wide ? 'max-w-[900px]' : 'max-w-[640px]'}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
            return;
          }
          if (e.key !== 'Tab') return;
          const items = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
          if (items.length === 0) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="display text-[23px] font-semibold leading-tight">{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-sm shrink-0">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write `NumberField.tsx`**

```tsx
'use client';
import { useState } from 'react';

/**
 * A number field that lets the user type through out-of-range values on the way to a valid one ("5"
 * on the way to "500"): the draft shows while the field has focus, a valid value is committed as it
 * is typed, and an invalid draft goes back to the last valid value on blur.
 */
export function NumberField({ label, value, min, max, step, onChange, className = 'w-36' }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const valid = (raw: string) => {
    const v = Number(raw);
    return raw !== '' && Number.isFinite(v) && v >= min && v <= max;
  };
  return (
    <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
      {label}
      <input
        type="number"
        value={draft ?? String(value)}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value);
          if (valid(e.target.value)) onChange(Number(e.target.value));
        }}
        onBlur={() => setDraft(null)}
        className={`field ${className}`}
      />
    </label>
  );
}
```

- [ ] **Step 5: Write `LanderDialog.tsx`**

```tsx
'use client';
import { useState, type RefObject } from 'react';
import { Modal } from '@/components/Modal';
import { NumberField } from '@/components/NumberField';
import { DEFAULT_POWER, type PanelModel, type PowerConfig } from '@/lib/engine/power';
import { batteryHours, LANDER_PRESETS, presetOf } from '@/lib/lander';
import { PARAM_RANGES, percentRange, POWER_RANGES } from '@/lib/planner-ranges';
import type { PlannerParams } from '@/lib/store/explore';
import { spanWords } from '@/lib/viz/format';

const PANELS: [PanelModel, string][] = [
  ['vertical_tracking', 'Upright, turns to the Sun'],
  ['vertical', 'Upright, fixed'],
  ['horizontal', 'Flat on the deck'],
  ['full_tracking', 'Follows the Sun in two axes'],
];

const dark = (power: Pick<PowerConfig, 'batteryWh' | 'loadW'>) => `${spanWords(batteryHours({ ...DEFAULT_POWER, ...power }))} in the dark`;

function Choice({ name, checked, onChange, title, note }: { name: string; checked: boolean; onChange: () => void; title: string; note: string }) {
  return (
    <label className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[10px] border px-4 py-2.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sun-ink ${checked ? 'border-ink bg-surface-2' : 'border-line-strong'}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="h-4 w-4 accent-[var(--ink)]" />
      <span>
        <span className="font-medium text-ink">{title}</span>
        <span className="text-ink-2"> {note}</span>
      </span>
    </label>
  );
}

/** The lander: three ready-made ones named by their numbers, and every field under "Custom". */
export function LanderDialog({
  params,
  onPower,
  onParams,
  busy,
  onClose,
  returnFocus,
}: {
  params: PlannerParams;
  onPower: (p: Partial<PowerConfig>) => void;
  onParams: (p: Partial<PlannerParams>) => void;
  busy: boolean;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const p = params.power;
  const preset = presetOf(p);
  const [custom, setCustom] = useState(preset === null);
  const showCustom = custom || preset === null;
  return (
    <Modal title="The lander" onClose={onClose} returnFocus={returnFocus} wide>
      <p className="mt-2 text-ink-2">What the lander needs decides how long it lasts. Pick one, or set your own numbers.</p>
      <div role="radiogroup" aria-label="Lander" className="mt-4 grid gap-2.5">
        {LANDER_PRESETS.map((x) => (
          <Choice
            key={x.id}
            name="lander"
            checked={!showCustom && preset?.id === x.id}
            onChange={() => {
              setCustom(false);
              onPower({ ...x.power, panel: DEFAULT_POWER.panel, panelAzimuthDeg: DEFAULT_POWER.panelAzimuthDeg, efficiency: DEFAULT_POWER.efficiency, initialSocFraction: DEFAULT_POWER.initialSocFraction });
            }}
            title={x.label}
            note={`(${dark(x.power)})`}
          />
        ))}
        <Choice name="lander" checked={showCustom} onChange={() => setCustom(true)} title="Custom" note="(your own panel, load and battery)" />
      </div>

      {showCustom && (
        <div className="mt-5 border-t border-line pt-5">
          <div role="radiogroup" aria-label="Solar panel" className="grid gap-2 sm:grid-cols-2">
            {PANELS.map(([model, label]) => (
              <label key={model} className="flex min-h-[44px] cursor-pointer items-center gap-3 text-ink">
                <input type="radio" name="panel" checked={p.panel === model} onChange={() => onPower({ panel: model })} className="h-4 w-4 accent-[var(--ink)]" />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-4">
            {p.panel === 'vertical' && <NumberField label="Panel faces (° from north)" value={p.panelAzimuthDeg} {...POWER_RANGES.panelAzimuthDeg} onChange={(v) => onPower({ panelAzimuthDeg: v })} />}
            <NumberField label="Panel area (m²)" value={p.areaM2} {...POWER_RANGES.areaM2} onChange={(v) => onPower({ areaM2: v })} />
            <NumberField label="Cell efficiency (%)" value={Math.round(p.efficiency * 100)} {...percentRange(POWER_RANGES.efficiency)} onChange={(v) => onPower({ efficiency: v / 100 })} />
            <NumberField label="Lander uses (W)" value={p.loadW} {...POWER_RANGES.loadW} onChange={(v) => onPower({ loadW: v })} />
            <NumberField label="Battery (Wh)" value={p.batteryWh} {...POWER_RANGES.batteryWh} onChange={(v) => onPower({ batteryWh: v })} />
            <NumberField label="Battery at landing (%)" value={Math.round(p.initialSocFraction * 100)} {...percentRange(POWER_RANGES.initialSocFraction)} onChange={(v) => onPower({ initialSocFraction: v / 100 })} />
            <NumberField label="Earth at least this high above the hills (°)" value={params.minEarthElDeg} {...PARAM_RANGES.minEarthElDeg} onChange={(v) => onParams({ minEarthElDeg: v })} className="w-full sm:w-72" />
            <NumberField label="Mast height (m)" value={params.mastM} {...PARAM_RANGES.mastM} onChange={(v) => onParams({ mastM: v })} />
          </div>
          <p className="mt-4 max-w-[52em] text-[15px] text-ink-2">
            The panel makes its share of full sunlight (1361 W on each square metre at Earth&apos;s distance), reduced by the part of the Sun the hills hide and by the angle of the panel. The battery fills when the panel
            makes more than the lander uses and empties when it makes less. A taller mast sees over more of the hills{busy ? '; the view from the new height is being worked out…' : '.'}
          </p>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onClose} className="btn">
          Done
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 6: Write `PeriodBand.tsx`**

```tsx
'use client';
import Link from 'next/link';
import type { RefObject } from 'react';
import { PeriodControls } from '@/components/PeriodControls';
import { siteLabel, type Site } from '@/lib/data/loaders';
import type { PowerConfig } from '@/lib/engine/power';
import { landerName } from '@/lib/lander';
import type { WindowDays } from '@/lib/store/explore';

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3" aria-hidden="true">
      <path d="M3 6l5 5 5-5" />
    </svg>
  );
}

const TAG = 'shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[15px] text-ink-2';

/** The four things a forecast is for, in one row: the landing site, the start, the length and the lander. */
export function PeriodBand({
  site,
  startUtc,
  days,
  onWindow,
  power,
  onLander,
  landerRef,
}: {
  site: Site;
  startUtc: string;
  days: WindowDays;
  onWindow: (startUtc: string, days: WindowDays) => void;
  power: PowerConfig;
  onLander: () => void;
  landerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const label = siteLabel(site);
  const lander = landerName(power);
  return (
    <section aria-label="What this forecast is for" className="flex flex-wrap items-end gap-4">
      <div className="flex min-w-[250px] flex-[1.2] flex-col gap-1.5 text-[15px] text-ink-2">
        <span aria-hidden="true">Landing site</span>
        <Link href="/sites" aria-label={`Landing site: ${label}. Change site`} className="field flex items-center gap-3 text-base text-ink">
          <span className="grow truncate font-medium">{label}</span>
          <span className={TAG}>change site</span>
          <Chevron />
        </Link>
      </div>
      <PeriodControls startUtc={startUtc} days={days} onChange={onWindow} />
      <div className="flex min-w-[250px] flex-1 flex-col gap-1.5 text-[15px] text-ink-2">
        <span aria-hidden="true">Lander</span>
        <button ref={landerRef} type="button" onClick={onLander} aria-haspopup="dialog" aria-label={`Lander: ${lander}. Change`} className="field flex items-center gap-3 text-left text-base text-ink">
          <span className="grow truncate">{lander}</span>
          <span className={TAG}>change</span>
          <Chevron />
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/components/Modal.test.tsx src/components/NumberField.test.tsx src/components/explore` and `npx tsc --noEmit` and `npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/Modal.tsx web/src/components/Modal.test.tsx web/src/components/NumberField.tsx web/src/components/NumberField.test.tsx web/src/components/explore
git commit -m "feat(web): Explore's period band and a lander dialog with three presets named by their numbers"
```

---

### Task 7: The answer row: verdict panel, numbers card, all numbers

**Files:**
- Create: `web/src/components/explore/VerdictPanel.tsx`, `web/src/components/explore/VerdictPanel.test.tsx`
- Create: `web/src/components/explore/NumbersCard.tsx`, `web/src/components/explore/NumbersCard.test.tsx`

**Interfaces:**
- Consumes: `Answer` (Task 3); `Modal` (Task 6); `landerLine`, `batteryHours` (Task 4); `timeWithPower` (Task 2); `pct`, `spanShort`, `spanWords` (`format.ts`); `Summary`, `PowerResult`, `PlannerParams`, `MaskMeta`, `Site`.
- Produces:
  - `VerdictPanel({ siteName, answer, onLand, onCompare, onYear, yearNote })` where `onLand: (startUtc: string) => void`, `onCompare: () => void`, `onYear: () => void`, `yearNote: string | null`. Its title is the page's `h1`, prefixed for screen readers with the site name.
  - `NumbersCard({ site, summary, power, params, days, maskMeta, inCompare, compareFull, onAddToCompare })`: three rows, the links "All numbers", "Add to compare" and "Printable brief", and the "All numbers" dialog.

- [ ] **Step 1: Write the failing tests**

`web/src/components/explore/VerdictPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Answer } from '@/lib/viz/answer';
import { VerdictPanel } from './VerdictPanel';

const night: Answer = {
  tone: 'bad',
  kind: 'night',
  title: 'Power for 3 days 4 hours, then night',
  sentences: ['The Sun sets on 3 January and stays behind the hills for 16 days 15 hours.', 'The battery covers the first 9 hours; the lander is back on 20 January.'],
  better: { hour: 466, startUtc: '2027-01-20T10:00:00', label: 'Land on 20 January instead', note: 'From 20 January, 10:00 UTC: power for 12 days 15 hours in a row.' },
  hint: null,
};
const good: Answer = { tone: 'good', kind: 'all', title: 'Keeps power for all 30 days', sentences: ['The Sun never sets in these 30 days.'], better: null, hint: null };
const stuck: Answer = { ...night, better: null, hint: 'No landing date in these 30 days gives more power here. A shorter stay or a bigger battery may.' };

function show(answer: Answer, yearNote: string | null = null) {
  const onLand = vi.fn();
  const onCompare = vi.fn();
  const onYear = vi.fn();
  render(<VerdictPanel siteName="de Gerlache Rim 2" answer={answer} onLand={onLand} onCompare={onCompare} onYear={onYear} yearNote={yearNote} />);
  return { onLand, onCompare, onYear };
}

describe('VerdictPanel', () => {
  it('leads the page with the answer in words, named for the site', () => {
    show(night);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('de Gerlache Rim 2: Power for 3 days 4 hours, then night');
    expect(screen.getByText(/The Sun sets on 3 January/)).toBeTruthy();
    expect(screen.getByText(/The battery covers the first 9 hours/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'The answer' }).getAttribute('data-tone')).toBe('bad');
  });

  it('makes the better landing date the one gold button, with what it gives', () => {
    const { onLand, onCompare } = show(night);
    const gold = screen.getByRole('button', { name: 'Land on 20 January instead' });
    expect(gold.className).toMatch(/btn-primary/);
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
    fireEvent.click(gold);
    expect(onLand).toHaveBeenCalledWith('2027-01-20T10:00:00');
    expect(screen.getByText('From 20 January, 10:00 UTC: power for 12 days 15 hours in a row.')).toBeTruthy();
    const compare = screen.getByRole('button', { name: 'Compare sites' });
    expect(compare.className).not.toMatch(/btn-primary/);
    fireEvent.click(compare);
    expect(onCompare).toHaveBeenCalled();
  });

  it('makes "Compare sites" the gold button when no date does better, and says what else to try', () => {
    show(stuck);
    expect(screen.getByRole('button', { name: 'Compare sites' }).className).toMatch(/btn-primary/);
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
    expect(screen.getByText(/A shorter stay or a bigger battery may/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Land on/ })).toBeNull();
  });

  it('shows a good answer in the good tone with an icon and words', () => {
    show(good);
    const panel = screen.getByRole('region', { name: 'The answer' });
    expect(panel.getAttribute('data-tone')).toBe('good');
    expect(panel.querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Keeps power for all 30 days/);
  });

  it('offers the search over the next 12 months and reports what it found', () => {
    const { onYear } = show(night, 'Best landing in the next 12 months: 12 Oct 2027, power for 13 d 21 h, Earth in view 80 % of that time.');
    fireEvent.click(screen.getByRole('button', { name: 'Find the best date in the next 12 months' }));
    expect(onYear).toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toMatch(/12 Oct 2027/);
  });
});
```

`web/src/components/explore/NumbersCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Summary } from '@/lib/engine/metrics';
import { DEFAULT_POWER, simulateBattery } from '@/lib/engine/power';
import { DEFAULT_PARAMS } from '@/lib/store/explore';
import { NumbersCard } from './NumbersCard';

const site = { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (Artemis III region)', label: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, category: 'artemis3', polar: true, source: 'x', approximate: true };
const summary: Summary = { hours: 720, illumFraction: 0.4458, meanSunFraction: 0.44, longestDarkH: 399, earthVisFraction: 0.45, longestEarthGapH: 396, jointFraction: 0.2 };
// 66 lit hours, then darkness: the default battery carries the next ten, so the power lasts 76 hours.
const power = simulateBattery(Float64Array.from({ length: 720 }, (_, h) => (h < 66 ? 1600 : 0)), DEFAULT_POWER);

function show(extra: Partial<Parameters<typeof NumbersCard>[0]> = {}) {
  const onAddToCompare = vi.fn();
  render(
    <NumbersCard
      site={site}
      summary={summary}
      power={power}
      params={DEFAULT_PARAMS}
      days={30}
      maskMeta={{ siteHeightM: 1432, source: 'featured', failedTiles: 0 }}
      inCompare={false}
      compareFull={false}
      onAddToCompare={onAddToCompare}
      {...extra}
    />,
  );
  return { onAddToCompare };
}

describe('NumbersCard', () => {
  it('gives the three numbers behind the answer, each with what it measures', () => {
    show();
    const card = screen.getByRole('region', { name: 'The numbers' });
    expect(card.textContent).toMatch(/Sunlight.*share of the 30 days with the Sun above the hills.*44\.6 %/);
    expect(card.textContent).toMatch(/Contact with Earth.*share of the 30 days with Earth in view for radio.*45\.0 %/);
    expect(card.textContent).toMatch(/Lander.*4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery.*10 h.*in the dark/);
    expect(card.textContent).not.toMatch(/skyline|LOLA|brownout/i);
  });

  it('opens every number in a dialog, in plain words', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'All numbers' }));
    const dialog = screen.getByRole('dialog', { name: 'All numbers' });
    const row = (label: string) => within(dialog).getByRole('rowheader', { name: label }).closest('tr')?.textContent ?? '';
    expect(row('Sunlight')).toMatch(/44\.6 %/);
    expect(row('Longest night')).toMatch(/16 d 15 h/);
    expect(row('Contact with Earth')).toMatch(/45\.0 %/);
    expect(row('Longest time without Earth')).toMatch(/16 d 12 h/);
    expect(row('Sunlight and Earth together')).toMatch(/20\.0 %/);
    expect(row('Time with power from the start')).toMatch(/3 d 4 h/);
    expect(row('Time without power')).toMatch(/26 d 20 h/);
    expect(row('Lowest battery')).toMatch(/0 %/);
    expect(row('Average power from the panel')).toMatch(/147 W/);
    expect(row('Mast')).toMatch(/2 m/);
    expect(row('Earth counts as in view')).toMatch(/0° or more above the hills/);
    expect(row('Height of the hills')).toMatch(/NASA elevation data, worked out ahead of time/);
    expect(row('Where')).toMatch(/88\.280° S, 64\.310° W.*1432 m.*centre of the region.*about 5 km/);
    expect(dialog.textContent).not.toMatch(/skyline|LOLA|DE440|brownout/i);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says where the hills come from for a place worked out in the browser and for a flat horizon', () => {
    show({ maskMeta: { siteHeightM: 10, source: 'computed', failedTiles: 3, mastM: 5 }, params: { ...DEFAULT_PARAMS, mastM: 5, minEarthElDeg: 2 } });
    fireEvent.click(screen.getByRole('button', { name: 'All numbers' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/worked out in your browser/);
    expect(dialog.textContent).toMatch(/3 pieces of the elevation map could not be loaded/);
    expect(dialog.textContent).toMatch(/2° or more above the hills/);
    expect(dialog.textContent).toMatch(/5 m/);
  });

  it('adds the site to the comparison and links to the printable brief', () => {
    const { onAddToCompare } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Add to compare' }));
    expect(onAddToCompare).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Printable brief' }).getAttribute('href')).toBe('/brief');
  });

  it('says so when the site is already compared or the comparison is full', () => {
    show({ inCompare: true });
    expect((screen.getByRole('button', { name: 'In the comparison' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `web/`): `npx vitest run src/components/explore/VerdictPanel.test.tsx src/components/explore/NumbersCard.test.tsx`
Expected: FAIL: the modules do not exist.

- [ ] **Step 3: Write `VerdictPanel.tsx`**

```tsx
'use client';
import type { Answer } from '@/lib/viz/answer';

function Icon({ good }: { good: boolean }) {
  return (
    <svg viewBox="0 0 32 32" width={34} height={34} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden="true">
      <circle cx="16" cy="16" r="13" />
      {good ? <path d="M10 16.5l4.2 4.2L22 12.5" /> : <path d="M11.5 11.5l9 9m0-9l-9 9" />}
    </svg>
  );
}

/**
 * The answer, first on the page: what happens to the power, why, and the better landing date. The
 * better date is the one gold button; when there is none, "Compare sites" is.
 */
export function VerdictPanel({
  siteName,
  answer,
  onLand,
  onCompare,
  onYear,
  yearNote,
}: {
  siteName: string;
  answer: Answer;
  onLand: (startUtc: string) => void;
  onCompare: () => void;
  onYear: () => void;
  yearNote: string | null;
}) {
  const good = answer.tone === 'good';
  const better = answer.better;
  return (
    <section aria-label="The answer" data-tone={answer.tone} className={`rounded-2xl border px-6 py-5 ${good ? 'border-good-line bg-good-bg' : 'border-bad-line bg-bad-bg'}`}>
      <div className={`flex items-start gap-3 ${good ? 'text-good' : 'text-bad'}`}>
        <Icon good={good} />
        <h1 className="display text-[32px] font-semibold leading-[1.12] tracking-[-0.02em]">
          <span className="sr-only">{siteName}: </span>
          {answer.title}
        </h1>
      </div>
      <p className="mt-2.5 max-w-[42em] text-[17px] leading-relaxed text-ink">{answer.sentences.join(' ')}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {better && (
          <button type="button" onClick={() => onLand(better.startUtc)} className="btn btn-primary">
            {better.label}
          </button>
        )}
        <button type="button" onClick={onCompare} className={better ? 'btn' : 'btn btn-primary'}>
          Compare sites
        </button>
      </div>
      {(better?.note || answer.hint) && <p className="mt-3 text-ink-2">{better ? better.note : answer.hint}</p>}
      <p className="mt-2 text-ink-2">
        <button type="button" onClick={onYear} className="min-h-[40px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Find the best date in the next 12 months
        </button>
      </p>
      {yearNote && (
        <p role="status" className="text-ink-2">
          {yearNote}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Write `NumbersCard.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { Modal } from '@/components/Modal';
import type { Site } from '@/lib/data/loaders';
import { timeWithPower } from '@/lib/engine/landing';
import type { Summary } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { batteryHours, landerLine } from '@/lib/lander';
import type { MaskMeta, PlannerParams } from '@/lib/store/explore';
import { pct, spanShort } from '@/lib/viz/format';

const ICON = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

function Line({ icon, title, note, value, unit }: { icon: ReactNode; title: string; note: string; value: string; unit?: string }) {
  return (
    <div className="flex items-center gap-3.5 border-t border-line py-3 first:border-t-0 first:pt-0">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-[15px] text-ink-2">{note}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block display text-[28px] font-semibold leading-none">{value}</span>
        {unit && <span className="mt-1 block text-[15px] text-ink-2">{unit}</span>}
      </span>
    </div>
  );
}

const QUIET = 'min-h-[40px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink disabled:text-ink-3 disabled:no-underline';

function coordinates(site: Site): string {
  const lat = `${Math.abs(site.lat).toFixed(3)}° ${site.lat < 0 ? 'S' : 'N'}`;
  const lon = `${Math.abs(site.lon).toFixed(3)}° ${site.lon < 0 ? 'W' : 'E'}`;
  return `${lat}, ${lon}`;
}

/** The three numbers behind the answer, and every other number behind "All numbers". */
export function NumbersCard({
  site,
  summary,
  power,
  params,
  days,
  maskMeta,
  inCompare,
  compareFull,
  onAddToCompare,
}: {
  site: Site;
  summary: Summary;
  power: PowerResult;
  params: PlannerParams;
  days: number;
  maskMeta: MaskMeta | null;
  inCompare: boolean;
  compareFull: boolean;
  onAddToCompare: () => void;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const dark = batteryHours(params.power);
  const withPower = timeWithPower(power);
  const hills =
    maskMeta?.source === 'flat'
      ? 'flat: this place lies outside the polar elevation maps'
      : maskMeta?.source === 'computed'
        ? 'from NASA elevation data, worked out in your browser'
        : 'from NASA elevation data, worked out ahead of time';
  const rows: [string, string, string][] = [
    ['Sunlight', pct(summary.illumFraction), 'share of the hours with any part of the Sun above the hills'],
    ['Longest night', spanShort(summary.longestDarkH), 'the longest stretch with the Sun behind the hills'],
    ['Contact with Earth', pct(summary.earthVisFraction), 'share of the hours with Earth in view for a direct radio link'],
    ['Longest time without Earth', spanShort(summary.longestEarthGapH), 'the longest stretch with Earth behind the hills'],
    ['Sunlight and Earth together', pct(summary.jointFraction), 'share of the hours with both'],
    ['Time with power from the start', withPower >= summary.hours ? `all ${days} days` : spanShort(withPower), 'until the battery first runs out'],
    ['Time without power', spanShort(power.brownoutHours), 'hours the lander is off in the period'],
    ['Lowest battery', `${Math.round(power.socMin * 100)} %`, 'the lowest charge in the period'],
    ['Average power from the panel', `${Math.round(power.meanPowerW)} W`, landerLine(params.power)],
    ['Mast', `${params.mastM} m`, 'the height the Sun and Earth are seen from'],
    ['Earth counts as in view', `${params.minEarthElDeg}° or more above the hills`, 'a radio needs a little clearance'],
    ['Height of the hills', hills, maskMeta && maskMeta.failedTiles > 0 ? `${maskMeta.failedTiles} pieces of the elevation map could not be loaded; some hills may be missing` : 'in 720 directions around the site'],
    [
      'Where',
      coordinates(site),
      `${maskMeta ? `${maskMeta.siteHeightM.toFixed(0)} m above the Moon's mean radius` : ''}${site.approximate ? `${maskMeta ? '; ' : ''}the centre of the region, read from NASA's map to about 5 km` : ''}`,
    ],
  ];
  return (
    <section aria-label="The numbers" className="panel flex flex-col">
      <Line
        icon={
          <svg {...ICON} className="text-sun-ink">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
          </svg>
        }
        title="Sunlight"
        note={`share of the ${days} days with the Sun above the hills`}
        value={pct(summary.illumFraction)}
      />
      <Line
        icon={
          <svg {...ICON} className="text-earth-ink">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
          </svg>
        }
        title="Contact with Earth"
        note={`share of the ${days} days with Earth in view for radio`}
        value={pct(summary.earthVisFraction)}
      />
      <Line
        icon={
          <svg {...ICON} className="text-ink-3">
            <rect x="2.5" y="7" width="16.5" height="10" rx="2.2" />
            <path d="M21.5 10.5v3" />
          </svg>
        }
        title="Lander"
        note={landerLine(params.power)}
        value={Number.isFinite(dark) ? spanShort(dark) : 'no load'}
        unit="in the dark"
      />
      <p className="mt-auto flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-2">
        <button ref={opener} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={QUIET}>
          All numbers
        </button>
        <button type="button" onClick={onAddToCompare} disabled={inCompare || compareFull} className={QUIET}>
          {inCompare ? 'In the comparison' : compareFull ? 'The comparison is full' : 'Add to compare'}
        </button>
        <Link href="/brief" className={`${QUIET} inline-flex items-center`}>
          Printable brief
        </Link>
      </p>
      {open && (
        <Modal title="All numbers" onClose={() => setOpen(false)} returnFocus={opener} wide>
          <p className="mt-2 text-ink-2">
            {site.label ?? site.name}, {days} days.
          </p>
          <table className="mt-4 w-full border-collapse text-left">
            <tbody>
              {rows.map(([label, value, note]) => (
                <tr key={label} className="border-t border-line align-top">
                  <th scope="row" className="py-2.5 pr-4 font-medium">
                    {label}
                  </th>
                  <td className="py-2.5 pr-4 font-semibold">{value}</td>
                  <td className="py-2.5 text-[15px] text-ink-2">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/explore` and `npx tsc --noEmit` and `npm run lint`
Expected: PASS. The test power walk gives: first brownout at hour 76 (3 d 4 h), 644 hours without power (26 d 20 h), lowest battery 0 %, average panel power 147 W (66 hours of 1600 W over 720). If a figure differs, check the walk by hand before changing the expectation.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/explore/VerdictPanel.tsx web/src/components/explore/VerdictPanel.test.tsx web/src/components/explore/NumbersCard.tsx web/src/components/explore/NumbersCard.test.tsx
git commit -m "feat(web): the answer row: a verdict in words with one gold action, and the numbers behind it"
```

---

### Task 8: The time chart: the Sun, Earth and the battery on one time axis

**Files:**
- Create: `web/src/lib/viz/timechart.ts`, `web/src/lib/viz/timechart.test.ts`
- Create: `web/src/components/explore/TimeChart.tsx`, `web/src/components/explore/TimeChart.test.tsx`

The Sun row and the Earth row are the `SkyRow` of part 1 without its own date row (`ticks={false}`); this task adds what surrounds them: the compass row, the battery row, the shared date row, the key, and the pointer layer.

**Interfaces:**
- Consumes: `SkyRow` (`{ el, hill, visible, startUtc, body, caption, height, ticks }`), `compassTicks` (part 1); `maskAtAzimuth`, `Series`; `PowerResult.powered`, `energyWh` (Task 2); `dayMonth`, `dateLong`, `spanWords`.
- Produces in `timechart.ts`:
  - `hillsToward(mask: ArrayLike<number>, az: ArrayLike<number>): Float64Array` (height of the hills in the direction of a body, hour by hour)
  - `runsWhere(length: number, test: (hour: number) => boolean): { from: number; to: number }[]` (maximal runs, half-open)
  - `litRuns(sunFraction: ArrayLike<number>)`, `offRuns(powered: ArrayLike<number>)`: runs of sunlit hours and of hours without power
  - `chargeArea(energyWh: ArrayLike<number>, capWh: number, width: number, height: number): string` (the charge as a closed SVG path, full at the top)
  - `hourAt(x: number, width: number, hours: number): number` (the hour under a pointer, clamped)
  - `batteryWords(power: PowerResult, startUtc: string, days: number): string` (one sentence for the battery row)
- Produces: `TimeChart({ series, mask, power, batteryWh, startUtc, days, cursor, hoverHour, onCursor, onHover })`.

- [ ] **Step 1: Write the failing tests**

`web/src/lib/viz/timechart.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER, simulateBattery } from '../engine/power';
import { batteryWords, chargeArea, hillsToward, hourAt, litRuns, offRuns, runsWhere } from './timechart';

describe('hillsToward', () => {
  it('reads the height of the hills in the direction of the body, hour by hour', () => {
    const mask = Float64Array.from({ length: 720 }, (_, k) => (k === 180 ? 6 : 0)); // one hill due east
    const out = hillsToward(mask, [90, 0, 90.25, 270]);
    expect(out[0]).toBeCloseTo(6, 9);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(3, 9); // half a step past the hill
    expect(out[3]).toBe(0);
  });
});

describe('runs', () => {
  it('finds maximal runs as half-open hour ranges', () => {
    expect(runsWhere(6, (h) => h === 1 || h === 2 || h === 5)).toEqual([
      { from: 1, to: 3 },
      { from: 5, to: 6 },
    ]);
    expect(runsWhere(0, () => true)).toEqual([]);
  });

  it('lists the stretches with any sunlight and the stretches without power', () => {
    expect(litRuns([1, 0.2, 0, 0, 1, 1, 0, 0.5])).toEqual([
      { from: 0, to: 2 },
      { from: 4, to: 6 },
      { from: 7, to: 8 },
    ]);
    expect(litRuns([0, 0])).toEqual([]);
    expect(offRuns([1, 1, 0, 0, 1, 0])).toEqual([
      { from: 2, to: 4 },
      { from: 5, to: 6 },
    ]);
  });
});

describe('chargeArea', () => {
  it('draws the charge as a closed shape, full at the top and empty at the bottom', () => {
    const d = chargeArea([1000, 500, 0, 0], 1000, 400, 20);
    expect(d).toBe('M0 20L0 0L100 0L100 10L200 10L200 20L300 20L300 20L400 20L400 20Z');
  });

  it('is empty for a lander without a battery', () => {
    expect(chargeArea([0, 0], 0, 400, 20)).toBe('');
  });
});

describe('hourAt', () => {
  it('maps a pointer position to an hour and clamps at both ends', () => {
    expect(hourAt(0, 720, 720)).toBe(0);
    expect(hourAt(360.4, 720, 720)).toBe(360);
    expect(hourAt(719.9, 720, 720)).toBe(719);
    expect(hourAt(900, 720, 720)).toBe(719);
    expect(hourAt(-5, 720, 720)).toBe(0);
    expect(hourAt(10, 0, 720)).toBe(0);
  });
});

describe('batteryWords', () => {
  const cfg = { ...DEFAULT_POWER, loadW: 100, batteryWh: 1000 };

  it('says when the battery first runs out and for how long the lander is off', () => {
    const p = Float64Array.from({ length: 96 }, (_, h) => (h < 30 || h >= 70 ? 500 : 0));
    expect(batteryWords(simulateBattery(p, cfg), '2027-01-01T00:00:00', 4)).toBe('The battery first runs out on 2 January and the lander is off for 1 day 6 hours of these 4 days.');
  });

  it('says so when it never runs out', () => {
    expect(batteryWords(simulateBattery(new Float64Array(96).fill(500), cfg), '2027-01-01T00:00:00', 4)).toBe('The battery never runs out in these 4 days.');
  });
});
```

`web/src/components/explore/TimeChart.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { hourlySeries } from '@/lib/engine/metrics';
import { DEFAULT_POWER, powerBudget } from '@/lib/engine/power';
import { utcToEt } from '@/lib/engine/time';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { eph } from '@/test/file-loaders';
import { TimeChart } from './TimeChart';

// jsdom has no PointerEvent; MouseEvent carries clientX, which is all the chart reads.
if (!('PointerEvent' in window)) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

const START = '2027-01-01T00:00:00';
const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);
const series = hourlySeries({ lat: -88.28, lon: -64.31 }, mask, eph, utcToEt(START), 720);
const power = powerBudget(series, DEFAULT_POWER);

function show(extra: Partial<Parameters<typeof TimeChart>[0]> = {}) {
  const onCursor = vi.fn();
  const onHover = vi.fn();
  const view = render(<TimeChart series={series} mask={mask} power={power} batteryWh={2000} startUtc={START} days={30} cursor={30} hoverHour={null} onCursor={onCursor} onHover={onHover} {...extra} />);
  return { onCursor, onHover, ...view };
}

describe('TimeChart', () => {
  it('says what it is and that time runs left to right', () => {
    show();
    const chart = screen.getByRole('region', { name: 'Why: the 30 days, hour by hour' });
    expect(within(chart).getByRole('heading', { level: 2 }).textContent).toBe('Why: the 30 days, hour by hour');
    expect(chart.textContent).toMatch(/Time runs left to right\. Press Play or drag the handle in the bar below\./);
  });

  it('draws the Sun, Earth and the battery as three named rows with their story in words', () => {
    show();
    const [sun, earth, battery] = screen.getAllByRole('img');
    expect(sun.getAttribute('aria-label')).toMatch(/^The Sun over the 30 days from 1 January\. The Sun is hidden from 3 Jan to 20 Jan, 16 days 15 hours\.$/);
    expect(earth.getAttribute('aria-label')).toMatch(/^Earth over the 30 days from 1 January\. Earth is hidden from /);
    expect(battery.getAttribute('aria-label')).toBe('The battery first runs out on 4 January and the lander is off for 16 days 6 hours of these 30 days.');
    expect(screen.getByText('The Sun')).toBeTruthy();
    expect(screen.getByText('Earth')).toBeTruthy();
    expect(screen.getByText('Battery')).toBeTruthy();
  });

  it('explains its marks in a key with a sample of each', () => {
    show();
    const key = screen.getByRole('list', { name: 'Key' });
    expect(within(key).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      "the Sun's height",
      "Earth's height",
      'dotted: hidden behind the hills',
      'the hills in that direction',
      'battery charge',
    ]);
    expect(key.querySelectorAll('svg, [data-swatch]').length).toBeGreaterThanOrEqual(5);
  });

  it('names the compass direction of the Sun along the top and the days along the bottom', () => {
    show();
    const compass = screen.getByTestId('compass');
    expect(compass.textContent).toMatch(/west.*south.*east/);
    expect(screen.getByText('Direction of the Sun')).toBeTruthy();
    expect(screen.getByTestId('days').textContent).toMatch(/^1 Jan6 Jan11 Jan16 Jan21 Jan26 Jan$/);
  });

  it('marks the hour of the time bar, and the hour under the pointer', () => {
    const { container, rerender, onCursor, onHover } = show();
    const cursor = container.querySelector<HTMLElement>('[data-part="cursor"]')!;
    expect(parseFloat(cursor.style.left)).toBeCloseTo(((30 + 0.5) / 720) * 100, 6);
    expect(container.querySelector('[data-part="hover"]')).toBeNull();
    rerender(<TimeChart series={series} mask={mask} power={power} batteryWh={2000} startUtc={START} days={30} cursor={30} hoverHour={400} onCursor={onCursor} onHover={onHover} />);
    expect(parseFloat(container.querySelector<HTMLElement>('[data-part="hover"]')!.style.left)).toBeCloseTo(((400 + 0.5) / 720) * 100, 6);
  });

  it('follows the pointer: moving shows the hour, pressing and dragging moves the time', () => {
    const { container, onCursor, onHover } = show();
    const layer = container.querySelector<HTMLElement>('[data-part="pointer"]')!;
    layer.getBoundingClientRect = () => ({ left: 100, top: 0, width: 720, height: 200, right: 820, bottom: 200, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerMove(layer, { clientX: 460 });
    expect(onHover).toHaveBeenLastCalledWith(360);
    expect(onCursor).not.toHaveBeenCalled();
    fireEvent.pointerDown(layer, { clientX: 200, pointerId: 1 });
    expect(onCursor).toHaveBeenLastCalledWith(100);
    fireEvent.pointerMove(layer, { clientX: 300 });
    expect(onCursor).toHaveBeenLastCalledWith(200);
    fireEvent.pointerUp(layer, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(layer, { clientX: 350 });
    expect(onCursor).toHaveBeenCalledTimes(2);
    expect(onHover).toHaveBeenLastCalledWith(250);
    fireEvent.pointerLeave(layer);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it('writes on the battery row when the lander is off, and nothing when it never is', () => {
    const { unmount } = show();
    expect(screen.getByText('battery empty, lander off')).toBeTruthy();
    unmount();
    show({ power: powerBudget(series, { ...DEFAULT_POWER, batteryWh: 50000, loadW: 10 }), batteryWh: 50000 });
    expect(screen.queryByText('battery empty, lander off')).toBeNull();
    expect(screen.getAllByRole('img')[2].getAttribute('aria-label')).toBe('The battery never runs out in these 30 days.');
  });

  it('still draws the Sun and Earth before the power budget is known', () => {
    show({ power: null });
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('keeps every label as page text of at least 13 px', () => {
    const { container } = show();
    expect(container.querySelectorAll('svg text')).toHaveLength(0);
    for (const l of container.querySelectorAll<HTMLElement>('[data-label]')) expect(parseFloat(l.style.fontSize)).toBeGreaterThanOrEqual(13);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `web/`): `npx vitest run src/lib/viz/timechart.test.ts src/components/explore/TimeChart.test.tsx`
Expected: FAIL: the two modules do not exist.

- [ ] **Step 3: Write `timechart.ts`**

```ts
import { maskAtAzimuth } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { dateLong, spanWords } from './format';

/** Height of the hills in the direction a body is in, hour by hour (degrees). */
export function hillsToward(mask: ArrayLike<number>, az: ArrayLike<number>): Float64Array {
  const out = new Float64Array(az.length);
  for (let h = 0; h < az.length; h++) out[h] = maskAtAzimuth(mask, az[h]);
  return out;
}

/** Maximal runs of hours that pass a test, as half-open hour ranges. */
export function runsWhere(length: number, test: (hour: number) => boolean): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let from = -1;
  for (let h = 0; h <= length; h++) {
    const yes = h < length && test(h);
    if (yes && from < 0) from = h;
    if (!yes && from >= 0) {
      out.push({ from, to: h });
      from = -1;
    }
  }
  return out;
}

/** The stretches with any sunlight. */
export function litRuns(sunFraction: ArrayLike<number>): { from: number; to: number }[] {
  return runsWhere(sunFraction.length, (h) => sunFraction[h] > 0);
}

/** The stretches without power. */
export function offRuns(powered: ArrayLike<number>): { from: number; to: number }[] {
  return runsWhere(powered.length, (h) => powered[h] === 0);
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/**
 * The battery charge as a closed shape `width` by `height`: one step per hour, full at the top and
 * empty at the bottom. Empty string for a lander without a battery.
 */
export function chargeArea(energyWh: ArrayLike<number>, capWh: number, width: number, height: number): string {
  const n = energyWh.length;
  if (capWh <= 0 || n === 0) return '';
  let d = `M0 ${f1(height)}`;
  for (let h = 0; h < n; h++) {
    const y = f1(height * (1 - Math.min(1, Math.max(0, energyWh[h] / capWh))));
    d += `L${f1((h / n) * width)} ${y}L${f1(((h + 1) / n) * width)} ${y}`;
  }
  return `${d}L${f1(width)} ${f1(height)}Z`;
}

/** The hour under a pointer `x` pixels into a plot `width` pixels wide, clamped to the period. */
export function hourAt(x: number, width: number, hours: number): number {
  if (!(width > 0)) return 0;
  return Math.max(0, Math.min(hours - 1, Math.floor((x / width) * hours)));
}

/** One sentence for the battery row: when the battery first runs out and how long the lander is off. */
export function batteryWords(power: PowerResult, startUtc: string, days: number): string {
  if (power.firstBrownoutHour === null) return `The battery never runs out in these ${days} days.`;
  return `The battery first runs out on ${dateLong(startUtc, power.firstBrownoutHour)} and the lander is off for ${spanWords(power.brownoutHours)} of these ${days} days.`;
}
```

- [ ] **Step 4: Write `TimeChart.tsx`**

```tsx
'use client';
import { useMemo, useRef } from 'react';
import { SkyRow } from '@/components/SkyRow';
import type { Series } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { dateLong, dayMonth } from '@/lib/viz/format';
import { compassTicks } from '@/lib/viz/skyrow';
import { batteryWords, chargeArea, hillsToward, hourAt, offRuns } from '@/lib/viz/timechart';

const SUN_H = 84;
const EARTH_H = 64;
const BATTERY_H = 30;
/** The rows share one grid: a narrow column of row names, then the plot. */
const GRID = 'grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 max-sm:grid-cols-1';

function Swatch({ color, dotted = false }: { color: string; dotted?: boolean }) {
  return (
    <span aria-hidden="true" className="flex h-5 w-9 shrink-0 items-center justify-center rounded bg-stage">
      <svg width={26} height={8}>
        <line x1={2} y1={4} x2={24} y2={4} stroke={color} strokeWidth={dotted ? 2.2 : 3.4} strokeDasharray={dotted ? '2 6' : undefined} strokeLinecap="round" />
      </svg>
    </span>
  );
}

function RowName({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-col justify-center max-sm:mt-2">
      <span className="font-semibold leading-tight">{title}</span>
      {note && <span className="text-[13px] leading-snug text-ink-3">{note}</span>}
    </div>
  );
}

/**
 * "Why": the period hour by hour on one time axis that runs left to right. The Sun's height against
 * the hills in its direction, the same for Earth, and the battery. Pointing at the chart shows that
 * hour in the time bar; pressing or dragging moves the time. The keyboard path is the time bar's slider.
 */
export function TimeChart({
  series,
  mask,
  power,
  batteryWh,
  startUtc,
  days,
  cursor,
  hoverHour,
  onCursor,
  onHover,
}: {
  series: Series;
  mask: ArrayLike<number>;
  power: PowerResult | null;
  batteryWh: number;
  startUtc: string;
  days: number;
  cursor: number;
  hoverHour: number | null;
  onCursor: (hour: number) => void;
  onHover: (hour: number | null) => void;
}) {
  const hours = series.hours;
  const dragging = useRef(false);
  const sunHill = useMemo(() => hillsToward(mask, series.sunAz), [mask, series.sunAz]);
  const earthHill = useMemo(() => hillsToward(mask, series.earthAz), [mask, series.earthAz]);
  const sunUp = useMemo(() => Uint8Array.from(series.sunFraction, (f) => (f > 0 ? 1 : 0)), [series.sunFraction]);
  const pct = (hour: number) => ((hour + 0.5) / hours) * 100;
  const period = `the ${days} days from ${dateLong(startUtc, 0)}`;

  let last = -Infinity;
  const compass = compassTicks(series.sunAz).filter((t) => {
    const p = pct(t.hour);
    if (p < 3 || p > 97 || p - last < 9) return false;
    last = p;
    return true;
  });
  const every = days > 45 ? 10 : 5;
  const dayTicks = Array.from({ length: Math.floor((days - 1) / every) + 1 }, (_, k) => k * every);
  const off = power ? offRuns(power.powered) : [];
  const longestOff = off.reduce<{ from: number; to: number } | null>((best, r) => (!best || r.to - r.from > best.to - best.from ? r : best), null);

  const at = (e: React.PointerEvent<HTMLDivElement>): number | null => {
    if (!Number.isFinite(e.clientX)) return null;
    const box = e.currentTarget.getBoundingClientRect();
    return hourAt(e.clientX - box.left, box.width, hours);
  };

  return (
    <section aria-labelledby="h-why-chart" className="panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="h-why-chart" className="display text-[23px] font-semibold">
          Why: the {days} days, hour by hour
        </h2>
        <p className="text-[15px] text-ink-2">Time runs left to right. Press Play or drag the handle in the bar below.</p>
      </div>
      <ul aria-label="Key" className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-2">
        <li className="flex items-center gap-2">
          <Swatch color="var(--stage-sun)" />
          the Sun&apos;s height
        </li>
        <li className="flex items-center gap-2">
          <Swatch color="var(--stage-earth)" />
          Earth&apos;s height
        </li>
        <li className="flex items-center gap-2">
          <Swatch color="var(--stage-ink-2)" dotted />
          dotted: hidden behind the hills
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" data-swatch="" className="flex h-5 w-9 shrink-0 items-center justify-center rounded bg-stage">
            <span className="block h-2.5 w-6 rounded-sm bg-hill" style={{ borderTop: '1.5px solid var(--hill-edge)' }} />
          </span>
          the hills in that direction
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" data-swatch="" className="block h-3.5 w-9 shrink-0 rounded-sm bg-good" />
          battery charge
        </li>
      </ul>

      <div className={`${GRID} mt-3`}>
        <span className="self-end pb-1 text-[13px] leading-tight text-ink-3 max-sm:hidden">Direction of the Sun</span>
        <div data-testid="compass" aria-hidden="true" className="relative h-6 text-[15px] text-ink-2 max-sm:hidden">
          {compass.map((t) => (
            <span key={t.hour} className="absolute whitespace-nowrap" style={{ left: `${pct(t.hour)}%`, transform: 'translateX(-50%)' }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative">
        <div className={`${GRID} gap-y-2`}>
          <RowName title="The Sun" note="against the hills in its direction" />
          <div className="stage">
            <SkyRow el={series.sunEl} hill={sunHill} visible={sunUp} startUtc={startUtc} body="sun" caption={`The Sun over ${period}`} height={SUN_H} ticks={false} />
          </div>
          <RowName title="Earth" note="against the hills in its direction" />
          <div className="stage">
            <SkyRow el={series.earthEl} hill={earthHill} visible={series.earthVisible} startUtc={startUtc} body="earth" caption={`Earth over ${period}`} height={EARTH_H} ticks={false} />
          </div>
          {power && (
            <>
              <RowName title="Battery" />
              <div role="img" aria-label={batteryWords(power, startUtc, days)} className="relative overflow-hidden rounded-lg bg-surface-2" style={{ height: BATTERY_H }}>
                <svg viewBox={`0 0 1000 ${BATTERY_H}`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
                  <path d={chargeArea(power.energyWh, batteryWh, 1000, BATTERY_H)} fill="var(--good)" />
                  {off.map((r) => (
                    <rect key={r.from} x={(r.from / hours) * 1000} y={BATTERY_H - 3} width={((r.to - r.from) / hours) * 1000} height={3} fill="var(--bad)" />
                  ))}
                </svg>
                {longestOff && (longestOff.to - longestOff.from) / hours > 0.2 && (
                  <span
                    data-label=""
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-semibold text-bad"
                    style={{ left: `${((longestOff.from + longestOff.to) / 2 / hours) * 100}%`, fontSize: 14 }}
                  >
                    battery empty, lander off
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* The time of the time bar, the hour under the pointer, and the layer that listens to the pointer: all over the plot column. */}
        <div className="pointer-events-none absolute inset-y-0 left-[116px] right-0 max-sm:left-0">
          {hoverHour !== null && <div data-part="hover" className="absolute inset-y-0 w-px bg-ink-3" style={{ left: `${pct(hoverHour)}%` }} />}
          <div data-part="cursor" className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${pct(cursor)}%` }}>
            <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-ink" />
          </div>
          <div
            data-part="pointer"
            className="pointer-events-auto absolute inset-0 cursor-crosshair touch-pan-y"
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              const h = at(e);
              if (h !== null) onCursor(h);
            }}
            onPointerMove={(e) => {
              const h = at(e);
              if (h === null) return;
              if (dragging.current) onCursor(h);
              else onHover(h);
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
            onPointerLeave={() => {
              dragging.current = false;
              onHover(null);
            }}
          />
        </div>
      </div>

      <div className={`${GRID} mt-1`}>
        <span className="max-sm:hidden" />
        <div data-testid="days" aria-hidden="true" className="relative h-6 text-[15px] text-ink-3">
          {dayTicks.map((d) => (
            <span key={d} className="absolute whitespace-nowrap" style={d === 0 ? { left: 0 } : { left: `${((d * 24) / hours) * 100}%`, transform: 'translateX(-50%)' }}>
              {dayMonth(startUtc, d * 24)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/viz/timechart.test.ts src/components/explore/TimeChart.test.tsx` and `npx tsc --noEmit` and `npm run lint`
Expected: PASS. Figures to expect for de Gerlache Rim 2 in January 2027 with the default lander: first brownout at hour 76 (4 January), 390 hours without power (16 days 6 hours).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/viz/timechart.ts web/src/lib/viz/timechart.test.ts web/src/components/explore/TimeChart.tsx web/src/components/explore/TimeChart.test.tsx
git commit -m "feat(web): the time chart: the Sun, Earth and the battery on one time axis, with a key and a pointer layer"
```

---

### Task 9: The time bar, pinned to the bottom of the window

**Files:**
- Modify: `web/src/lib/viz/format.ts`, `web/src/lib/viz/format.test.ts` (`dateTimeUtc`)
- Create: `web/src/components/explore/TimeBar.tsx`, `web/src/components/explore/TimeBar.test.tsx`
- Modify: `web/src/app/globals.css` (the slider's thumb and track)

**Interfaces:**
- Consumes: `statusSentence` (Task 3); `litRuns` (Task 8); `dayMonth` (`format.ts`); `useReducedMotion`; `Series`, `PowerResult`.
- Produces:
  - `dateTimeUtc(startUtc: string, hour: number): string`: "2 Jan 2027, 06:00 UTC".
  - `TimeBar({ series, power, startUtc, cursor, hoverHour, batteryWh, onCursor })`.

- [ ] **Step 1: Write the failing tests**

Add to `web/src/lib/viz/format.test.ts` (extend the import with `dateTimeUtc`):

```ts
describe('the time bar label', () => {
  it('writes the date, the year and the UTC hour', () => {
    expect(dateTimeUtc('2027-01-01T00:00:00', 30)).toBe('2 Jan 2027, 06:00 UTC');
    expect(dateTimeUtc('2027-12-31T20:00:00', 6)).toBe('1 Jan 2028, 02:00 UTC');
  });
});
```

`web/src/components/explore/TimeBar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig } from '@/lib/engine/power';
import { TimeBar } from './TimeBar';

const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };
const HOURS = 72;
// Sun for a day, night for a day (the battery carries ten hours of it), Sun again; Earth in view on the second day only.
const sun = Array.from({ length: HOURS }, (_, h) => (h < 24 || h >= 48 ? 1 : 0));
const series: Series = {
  i0: 0,
  hours: HOURS,
  sunAz: new Float64Array(HOURS),
  sunEl: new Float64Array(HOURS).fill(5),
  earthAz: new Float64Array(HOURS),
  earthEl: new Float64Array(HOURS),
  sunFraction: Float64Array.from(sun),
  earthVisible: Uint8Array.from({ length: HOURS }, (_, h) => (h >= 24 && h < 48 ? 1 : 0)),
  sunAu: new Float64Array(HOURS).fill(1),
};
const power = powerBudget(series, CFG);
const START = '2027-01-01T00:00:00';

function show(cursor: number, extra: Partial<Parameters<typeof TimeBar>[0]> = {}) {
  const onCursor = vi.fn();
  const view = render(<TimeBar series={series} power={power} startUtc={START} cursor={cursor} hoverHour={null} batteryWh={CFG.batteryWh} onCursor={onCursor} {...extra} />);
  return { onCursor, ...view };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TimeBar', () => {
  it('says the date and hour in UTC and what is happening then', () => {
    show(6);
    expect(screen.getByTestId('when').textContent).toBe('1 Jan 2027, 06:00 UTC');
    expect(screen.getByTestId('status').textContent).toBe('Sun up, Earth behind the hills, battery 100 %');
  });

  it('shows the hour under the pointer on the chart while the handle stays put', () => {
    show(6, { hoverHour: 40 });
    expect(screen.getByTestId('when').textContent).toBe('2 Jan 2027, 16:00 UTC');
    expect(screen.getByTestId('status').textContent).toBe('Sun behind the hills, Earth in view but the lander is off, battery empty');
    expect((screen.getByRole('slider', { name: 'Time' }) as HTMLInputElement).value).toBe('6');
  });

  it('is a slider over the hours of the period that reads its position in words', () => {
    const { onCursor } = show(10);
    const slider = screen.getByRole('slider', { name: 'Time' }) as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('71');
    expect(slider.step).toBe('1');
    expect(slider.getAttribute('aria-valuetext')).toBe('1 Jan 2027, 10:00 UTC: Sun up, Earth behind the hills, battery 100 %');
    fireEvent.change(slider, { target: { value: '30' } });
    expect(onCursor).toHaveBeenLastCalledWith(30);
  });

  it('moves one hour with the arrow keys and one day with Page Up and Page Down, never past the ends', () => {
    const { onCursor, rerender } = show(10);
    const slider = screen.getByRole('slider', { name: 'Time' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onCursor).toHaveBeenLastCalledWith(11);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onCursor).toHaveBeenLastCalledWith(9);
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(onCursor).toHaveBeenLastCalledWith(34);
    fireEvent.keyDown(slider, { key: 'PageDown' });
    expect(onCursor).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onCursor).toHaveBeenLastCalledWith(71);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onCursor).toHaveBeenLastCalledWith(0);
    rerender(<TimeBar series={series} power={power} startUtc={START} cursor={60} hoverHour={null} batteryWh={CFG.batteryWh} onCursor={onCursor} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time' }), { key: 'PageUp' });
    expect(onCursor).toHaveBeenLastCalledWith(71);
  });

  it('draws the sunlight of the period as the track, with the days under it', () => {
    const { container } = show(0);
    expect(container.querySelectorAll('[data-part="lit"]')).toHaveLength(2);
    expect(screen.getByTestId('ticks').textContent).toBe('1 Jan2 Jan3 Jan');
  });

  it('plays an hour at a time in ink, not gold, and stops at the end', () => {
    vi.useFakeTimers();
    const { onCursor, rerender } = show(69);
    const play = screen.getByRole('button', { name: 'Play' });
    expect(play.className).toMatch(/btn-ink/);
    expect(play.className).not.toMatch(/btn-primary/);
    fireEvent.click(play);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(90);
    });
    expect(onCursor).toHaveBeenLastCalledWith(70);
    rerender(<TimeBar series={series} power={power} startUtc={START} cursor={71} hoverHour={null} batteryWh={CFG.batteryWh} onCursor={onCursor} />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy(); // stopped at the last hour
    expect(onCursor).not.toHaveBeenCalledWith(72);
  });

  it('starts again from the beginning when Play is pressed at the end', () => {
    vi.useFakeTimers();
    const { onCursor } = show(71);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onCursor).toHaveBeenLastCalledWith(0);
  });

  it('does not play when the system asks for reduced motion, and says why', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    show(0);
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Playback is off because your system asks for reduced motion/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `web/`): `npx vitest run src/lib/viz/format.test.ts src/components/explore/TimeBar.test.tsx`
Expected: FAIL: `dateTimeUtc` is not exported; `./TimeBar` does not exist.

- [ ] **Step 3: Add the helper**

Append to `web/src/lib/viz/format.ts`:

```ts
/** The UTC date and hour `hour` hours after the start, for the time bar: "2 Jan 2027, 06:00 UTC". */
export function dateTimeUtc(startUtc: string, hour: number): string {
  const { d } = at(startUtc, hour);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${d.toISOString().slice(11, 16)} UTC`;
}
```

- [ ] **Step 4: Style the slider**

Add to `web/src/app/globals.css`, inside `@layer components`, after `.label-centred`:

```css
  /* The time slider: a see-through track over the sunlight strip, and a handle that is easy to grab. */
  .time-range {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    height: 44px;
    margin: 0;
    background: transparent;
    cursor: pointer;
  }
  .time-range::-webkit-slider-runnable-track {
    height: 44px;
    background: transparent;
  }
  .time-range::-moz-range-track {
    height: 44px;
    background: transparent;
  }
  .time-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 34px;
    margin-top: 5px;
    border-radius: 7px;
    border: 3px solid var(--ink);
    background: var(--surface);
  }
  .time-range::-moz-range-thumb {
    width: 8px;
    height: 28px;
    border-radius: 7px;
    border: 3px solid var(--ink);
    background: var(--surface);
  }
```

- [ ] **Step 5: Write `TimeBar.tsx`**

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import type { Series } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { dateTimeUtc, dayMonth } from '@/lib/viz/format';
import { statusSentence } from '@/lib/viz/status';
import { litRuns } from '@/lib/viz/timechart';

/** Hours of the period shown per second of playback. */
const HOURS_PER_SECOND = 12;

/**
 * The time bar, pinned to the bottom of the window: Play, the date and hour with one sentence about
 * that hour, and a slider whose track is the sunlight of the period. Arrow keys move one hour, Page Up
 * and Page Down one day. While the pointer is on the chart the words follow it; the handle stays.
 */
export function TimeBar({
  series,
  power,
  startUtc,
  cursor,
  hoverHour,
  batteryWh,
  onCursor,
}: {
  series: Series;
  power: PowerResult | null;
  startUtc: string;
  cursor: number;
  hoverHour: number | null;
  batteryWh: number;
  onCursor: (hour: number) => void;
}) {
  const hours = series.hours;
  const last = Math.max(0, hours - 1);
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  const cursorRef = useRef(cursor);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const next = cursorRef.current + 1;
      if (next > last) setPlaying(false);
      else onCursor(next);
    }, 1000 / HOURS_PER_SECOND);
    return () => window.clearInterval(id);
  }, [playing, last, onCursor]);

  const shown = Math.min(last, hoverHour ?? cursor);
  const days = Math.round(hours / 24);
  const every = days > 45 ? 10 : days > 20 ? 5 : days > 7 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor((days - 1) / every) + 1 }, (_, k) => k * every);
  const move = (to: number) => onCursor(Math.max(0, Math.min(last, to)));

  return (
    <section aria-label="Time" className="sticky bottom-0 z-30 border-t border-line bg-page">
      <div className="wrap flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
        <button
          type="button"
          disabled={reduced}
          onClick={() => {
            if (!playing && cursor >= last) onCursor(0);
            setPlaying((p) => !p);
          }}
          className="btn btn-ink w-[116px]"
        >
          <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" aria-hidden="true">
            {playing ? <path d="M3 2h4v12H3zM9 2h4v12H9z" /> : <path d="M4 2l10 6-10 6z" />}
          </svg>
          {playing ? 'Pause' : 'Play'}
        </button>
        <div className="w-[330px] max-w-full">
          <p data-testid="when" className="text-[17px] font-semibold leading-tight">
            {dateTimeUtc(startUtc, shown)}
          </p>
          <p data-testid="status" className="mt-0.5 text-[15px] text-ink-2">
            {statusSentence(series, power, shown, batteryWh)}
          </p>
          {reduced && <p className="text-[15px] text-ink-3">Playback is off because your system asks for reduced motion.</p>}
        </div>
        <div className="min-w-[280px] flex-1">
          <div className="relative h-11">
            <svg viewBox={`0 0 ${hours} 10`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-x-0 top-[15px] h-3.5 w-full overflow-hidden rounded-full bg-surface-2">
              {litRuns(series.sunFraction).map((r) => (
                <rect key={r.from} data-part="lit" x={r.from} y={0} width={r.to - r.from} height={10} fill="var(--sun)" />
              ))}
            </svg>
            <input
              type="range"
              aria-label="Time"
              aria-valuetext={`${dateTimeUtc(startUtc, cursor)}: ${statusSentence(series, power, Math.min(last, cursor), batteryWh)}`}
              min={0}
              max={last}
              step={1}
              value={cursor}
              onChange={(e) => onCursor(Number(e.target.value))}
              onKeyDown={(e) => {
                const step: Record<string, number> = { ArrowRight: cursor + 1, ArrowUp: cursor + 1, ArrowLeft: cursor - 1, ArrowDown: cursor - 1, PageUp: cursor + 24, PageDown: cursor - 24, Home: 0, End: last };
                if (!(e.key in step)) return;
                e.preventDefault();
                move(step[e.key]);
              }}
              className="time-range relative"
            />
          </div>
          <p data-testid="ticks" aria-hidden="true" className="relative h-5 text-[13px] text-ink-3">
            {ticks.map((d) => (
              <span key={d} className="absolute whitespace-nowrap" style={d === 0 ? { left: 0 } : { left: `${((d * 24) / hours) * 100}%`, transform: 'translateX(-50%)' }}>
                {dayMonth(startUtc, d * 24)}
              </span>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/viz src/components/explore/TimeBar.test.tsx` and `npx tsc --noEmit` and `npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/viz/format.ts web/src/lib/viz/format.test.ts web/src/components/explore/TimeBar.tsx web/src/components/explore/TimeBar.test.tsx web/src/app/globals.css
git commit -m "feat(web): a time bar pinned to the bottom: Play in ink, the hour in words, a slider on the sunlight of the period"
```

---

### Task 10: The ground, where on the Moon, and the assistant panel

**Files:**
- Create: `web/src/lib/viz/relief.ts`, `web/src/lib/viz/relief.test.ts`
- Create: `web/src/components/explore/GroundPanel.tsx`, `web/src/components/explore/GroundPanel.test.tsx`
- Create: `web/src/components/explore/WhereOnMoon.tsx`, `web/src/components/explore/WhereOnMoon.test.tsx`
- Modify: `web/src/components/PlannerChat.tsx`, `web/src/components/PlannerChat.test.tsx` (a `panel` variant)

In this part the ground panel shows the existing 3D view (terrain, or the globe for a site far from the pole and for picking a place). Part 3 adds the shadow map and the horizon picture as tabs and re-lights the 3D view.

**Interfaces:**
- Consumes: `ReliefMap`, `MapPin` (Task 5); `exploreHref` (Task 5); `siteLabel`; `HOME.relief`; `SiteOverview` (Task 4); `Scene3DLazy`, `SceneState`; `dateTimeUtc` (Task 9); `pct0`.
- Produces in `relief.ts`:
  - `reliefUV(lat: number, lon: number, halfKm: number): { u: number; v: number }` (south polar stereographic, the pole at 0.5, 0.5, longitude 0 up; matches `pipeline/lunar_pipeline/home_assets.py`).
  - `distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number` (great circle on the Moon).
  - `nearestSites(site: Site, sites: Site[], count: number): { site: Site; km: number }[]` (catalogue sites only, nearest first, never the site itself).
- Produces:
  - `GroundPanel({ site, sites, scene, mode, exaggeration, heightmap, capHeightmap, textureUrl, terrainState, windowLoading, customError, when, onMode, onExaggeration, onPick, reducedMotion })`.
  - `WhereOnMoon({ site, sites, overview, startUtc, days })`.
  - `PlannerChat` gains `variant?: 'strip' | 'panel'` (default `'strip'`).

- [ ] **Step 1: Write the failing tests**

`web/src/lib/viz/relief.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HOME } from '../data/home';
import { sites } from '@/test/file-loaders';
import { distanceKm, nearestSites, reliefUV } from './relief';

describe('reliefUV', () => {
  it('puts the pole at the centre and longitude 0 straight up', () => {
    expect(reliefUV(-90, 0, 250)).toEqual({ u: 0.5, v: 0.5 });
    const up = reliefUV(-86, 0, 250);
    expect(up.u).toBeCloseTo(0.5, 6);
    expect(up.v).toBeCloseTo(0.2573, 3);
  });

  it('agrees with the pins the pipeline wrote for the relief picture', () => {
    for (const pin of HOME.relief.sites) {
      const site = sites.find((s) => s.id === pin.id)!;
      const { u, v } = reliefUV(site.lat, site.lon, HOME.relief.half_km);
      expect(u, pin.id).toBeCloseTo(pin.u, 3);
      expect(v, pin.id).toBeCloseTo(pin.v, 3);
    }
  });
});

describe('distances', () => {
  const site = (id: string) => sites.find((s) => s.id === id)!;

  it('measures along the surface of the Moon', () => {
    expect(distanceKm({ lat: -90, lon: 0 }, { lat: -89, lon: 123 })).toBeCloseTo(30.32, 1);
    expect(distanceKm(site('de_gerlache_rim_2'), site('de_gerlache_center_rim_high'))).toBeCloseTo(12.1, 0);
    expect(distanceKm(site('haworth'), site('haworth'))).toBe(0);
  });

  it('lists the nearest catalogue sites, nearest first, without the site itself or custom places', () => {
    const custom = { id: 'custom_x', name: 'Custom', lat: -88.3, lon: -64, category: 'custom', polar: true, source: 'user' };
    const near = nearestSites(site('de_gerlache_rim_2'), [...sites, custom], 3);
    expect(near.map((n) => n.site.id)).toEqual(['de_gerlache_center_rim_high', 'de_gerlache_center', 'south_pole']);
    expect(near[0].km).toBeCloseTo(12.1, 0);
    expect(near.map((n) => n.km)).toEqual([...near.map((n) => n.km)].sort((a, b) => a - b));
  });
});
```

`web/src/components/explore/GroundPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SceneState } from '@/lib/viz/scene-state';
import { GroundPanel } from './GroundPanel';

const scene = { sunDirLocal: [0, 0.1, -1], earthDirLocal: [1, 0.1, 0], sunDirMoon: [1, 0, 0], earthDirMoon: [0, 1, 0], sunAz: 0, sunEl: 2, earthAz: 90, earthEl: 3, skylineAtSun: 0, skylineAtEarth: 0, light: { intensity: 1, castShadow: true }, earthVisible: true } as SceneState;
const site = { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (Artemis III region)', label: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, category: 'artemis3', polar: true, source: 'x' };

function show(extra: Partial<Parameters<typeof GroundPanel>[0]> = {}) {
  const onMode = vi.fn();
  const onExaggeration = vi.fn();
  render(
    <GroundPanel
      site={site}
      sites={[site]}
      scene={scene}
      mode="terrain"
      exaggeration={1}
      heightmap={null}
      capHeightmap={null}
      textureUrl={null}
      terrainState="unavailable"
      windowLoading={false}
      customError={null}
      when="2 Jan 2027, 06:00 UTC"
      onMode={onMode}
      onExaggeration={onExaggeration}
      onPick={() => {}}
      reducedMotion={false}
      {...extra}
    />,
  );
  return { onMode, onExaggeration };
}

describe('GroundPanel', () => {
  it('titles the picture, says which hour it shows and mounts the 3D view', async () => {
    show();
    const panel = screen.getByRole('region', { name: 'The ground' });
    expect(panel.textContent).toMatch(/2 Jan 2027, 06:00 UTC/);
    // jsdom has no WebGL: the 3D view shows its fallback, which proves it mounted with the site.
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/3D view is not available/));
  });

  it('switches between the terrain and the globe, and between true and tripled heights', () => {
    const { onMode, onExaggeration } = show();
    expect(screen.getByRole('button', { name: 'Terrain' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Globe' }));
    expect(onMode).toHaveBeenCalledWith('globe');
    fireEvent.click(screen.getByRole('button', { name: 'Heights ×3' }));
    expect(onExaggeration).toHaveBeenCalledWith(3);
  });

  it('says in plain words what the picture is made from', () => {
    show({ heightmap: { meta: { cell_m: 20, width: 1024, height: 1024 } } as never, terrainState: 'ready' });
    expect(screen.getByRole('region', { name: 'The ground' }).textContent).toMatch(/NASA elevation data at 20 m per pixel, 20\.48 km across\. Drag to turn, scroll to zoom\. The light follows the time bar\./);
  });

  it('explains the globe and reports a place that cannot be worked out', () => {
    show({ mode: 'globe', customError: 'no DEM coverage north of 60S (lat -40.00)' });
    const text = screen.getByRole('region', { name: 'The ground' }).textContent ?? '';
    expect(text).toMatch(/Click anywhere south of 60° S to work out that place/);
    expect(screen.getByRole('alert').textContent).toMatch(/That place cannot be worked out: this tool covers the Moon south of 60° S/);
    expect(screen.queryByRole('button', { name: 'Heights ×3' })).toBeNull();
  });

  it('says so while the terrain loads and when only the coarse model is there', () => {
    show({ terrainState: 'loading' });
    expect(screen.getByRole('region', { name: 'The ground' }).textContent).toMatch(/Loading the terrain…/);
  });
});
```

`web/src/components/explore/WhereOnMoon.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sites } from '@/test/file-loaders';
import { WhereOnMoon } from './WhereOnMoon';

const site = (id: string) => sites.find((s) => s.id === id)!;
const overview = {
  de_gerlache_center_rim_high: { sunFraction: 1, earthFraction: 0.49, nowHours: 720, best: { hour: 0, poweredHours: 720, earthFraction: 0.49 } },
  de_gerlache_center: { sunFraction: 0, earthFraction: 0, nowHours: 10, best: null },
};

describe('WhereOnMoon', () => {
  it('says what the place is and shows it on the map', () => {
    render(<WhereOnMoon site={site('de_gerlache_rim_2')} sites={sites} overview={overview} startUtc="2027-01-01T00:00:00" days={30} />);
    const panel = screen.getByRole('region', { name: 'Where on the Moon' });
    expect(panel.textContent).toMatch(/de Gerlache Rim 2\. A ridge on a crater rim, 52 km from the pole\./);
    expect(within(panel).getByRole('link', { name: 'de Gerlache Rim 2' }).getAttribute('aria-current')).toBe('true');
    expect(within(panel).getByRole('link', { name: 'See all sites' }).getAttribute('href')).toBe('/sites');
  });

  it('lists the three nearest sites with their sunlight for the same period, as links', () => {
    render(<WhereOnMoon site={site('de_gerlache_rim_2')} sites={sites} overview={overview} startUtc="2027-01-01T00:00:00" days={30} />);
    const near = screen.getByRole('list', { name: 'Nearby sites, same 30 days' });
    const rows = within(near).getAllByRole('link');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/de Gerlache rim summit.*12 km away.*100 %/);
    expect(rows[0].getAttribute('href')).toBe('/explore?site=de_gerlache_center_rim_high&start=2027-01-01&days=30');
    expect(rows[1].textContent).toMatch(/de Gerlache crater floor.*no sunlight/);
    expect(rows[2].textContent).toMatch(/Lunar south pole, 52 km away.*working it out/);
  });

  it('says so for a site that lies outside the map, and places a custom site by its coordinates', () => {
    const { unmount } = render(<WhereOnMoon site={site('blue_ghost_m1')} sites={sites} overview={{}} startUtc="2025-03-02T00:00:00" days={14} />);
    expect(screen.getByRole('region', { name: 'Where on the Moon' }).textContent).toMatch(/lies far outside this map of the south pole/);
    unmount();
    const custom = { id: 'custom_-89.0000_45.0000', name: 'Custom site -89.000°, 45.000°', lat: -89, lon: 45, category: 'custom', polar: true, source: 'user' };
    render(<WhereOnMoon site={custom} sites={[...sites, custom]} overview={{}} startUtc="2027-01-01T00:00:00" days={30} />);
    const pin = screen.getByRole('link', { name: 'Custom site -89.000°, 45.000°' });
    expect(pin.getAttribute('aria-current')).toBe('true');
    expect(pin.style.left).toMatch(/^5[34]/);
  });
});
```

Add to `web/src/components/PlannerChat.test.tsx`, inside `describe('PlannerChat', ...)`:

```tsx
  it('as a panel is always open, says what the assistant does, and keeps "Ask" out of gold', () => {
    const { store } = fakeStore();
    render(<PlannerChat store={store} ask={vi.fn()} navigate={() => {}} variant="panel" />);
    const panel = screen.getByRole('region', { name: 'Ask in plain words' });
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe('Ask in plain words');
    expect(panel.textContent).toMatch(/The assistant moves the controls for you\. It never invents numbers\./);
    expect(within(panel).getByLabelText('Ask the planner').className).toMatch(/\bfield\b/);
    const askButton = within(panel).getByRole('button', { name: 'Ask' });
    expect(askButton.className).toMatch(/\bbtn\b/);
    expect(askButton.className).not.toMatch(/btn-primary/);
    expect(within(panel).getAllByRole('button', { name: /^Try: / })).toHaveLength(EXAMPLE_PROMPTS.length);
    expect(within(panel).queryByRole('button', { expanded: true })).toBeNull(); // no collapse control
  });
```

- [ ] **Step 2: Run them to see them fail**

Run (from `web/`): `npx vitest run src/lib/viz/relief.test.ts src/components/explore/GroundPanel.test.tsx src/components/explore/WhereOnMoon.test.tsx src/components/PlannerChat.test.tsx`
Expected: FAIL: the three modules do not exist; `PlannerChat` has no region named "Ask in plain words".

- [ ] **Step 3: Write `relief.ts`**

```ts
import type { Site } from '../data/loaders';
import { R_MOON_KM } from '../engine/constants';

const DEG = Math.PI / 180;

/**
 * Where a point falls on the relief picture of the south pole, as fractions of its width and height
 * from the top left: south polar stereographic, the pole at the centre, longitude 0 straight up,
 * `halfKm` from the centre to an edge. The same projection as `pipeline/lunar_pipeline/home_assets.py`.
 */
export function reliefUV(lat: number, lon: number, halfKm: number): { u: number; v: number } {
  const rho = 2 * R_MOON_KM * Math.tan(((90 + lat) / 2) * DEG);
  return { u: 0.5 + (rho * Math.sin(lon * DEG)) / (2 * halfKm), v: 0.5 - (rho * Math.cos(lon * DEG)) / (2 * halfKm) };
}

/** Great-circle distance on the Moon, in kilometres. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MOON_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The catalogue sites nearest to a site, nearest first; never the site itself, never a custom place. */
export function nearestSites(site: Site, sites: Site[], count: number): { site: Site; km: number }[] {
  return sites
    .filter((s) => s.id !== site.id && s.category !== 'custom')
    .map((s) => ({ site: s, km: distanceKm(site, s) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}
```

- [ ] **Step 4: Write `GroundPanel.tsx`**

```tsx
'use client';
import { Scene3DLazy } from '@/components/three';
import type { Site } from '@/lib/data/loaders';
import type { Heightmap } from '@/lib/data/terrain';
import type { Exaggeration, SceneMode, TerrainState } from '@/lib/store/explore';
import type { SceneState } from '@/lib/viz/scene-state';

const SEG = 'flex h-11 overflow-hidden rounded-[10px] border border-stage-line bg-stage/85 text-[15px] text-stage-ink';
const seg = (on: boolean) => `px-3.5 ${on ? 'bg-stage-ink font-semibold text-stage' : 'hover:bg-white/10'}`;

/**
 * The ground around the site in 3D, lit for the hour of the time bar. A site far from the pole shows
 * the globe instead; the globe is also where a new place is picked by clicking.
 */
export function GroundPanel({
  site,
  sites,
  scene,
  mode,
  exaggeration,
  heightmap,
  capHeightmap,
  textureUrl,
  terrainState,
  windowLoading,
  customError,
  when,
  onMode,
  onExaggeration,
  onPick,
  reducedMotion,
}: {
  site: Site;
  sites: Site[];
  scene: SceneState;
  mode: SceneMode;
  exaggeration: Exaggeration;
  heightmap: Heightmap | null;
  capHeightmap: Heightmap | null;
  textureUrl: string | null;
  terrainState: TerrainState;
  windowLoading: boolean;
  customError: string | null;
  when: string;
  onMode: (mode: SceneMode) => void;
  onExaggeration: (x: Exaggeration) => void;
  onPick: (lat: number, lon: number) => void;
  reducedMotion: boolean;
}) {
  let caption: string;
  if (mode === 'globe') caption = 'The whole Moon. Click anywhere south of 60° S to work out that place. Drag to turn, scroll to zoom.';
  else if (heightmap) caption = `NASA elevation data at ${heightmap.meta.cell_m} m per pixel, ${(heightmap.meta.width * heightmap.meta.cell_m) / 1000} km across. Drag to turn, scroll to zoom. The light follows the time bar.`;
  else if (terrainState === 'loading' || windowLoading) caption = 'Loading the terrain…';
  else if (capHeightmap) caption = 'A coarse model of the polar cap, 48 km across: this site has no detailed terrain yet. The light follows the time bar.';
  else caption = 'The terrain files are not on this machine.';
  return (
    <section aria-label="The ground" className="panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="display text-[23px] font-semibold">The ground</h2>
        <p className="text-[15px] text-ink-2">{when}</p>
      </div>
      <div className="stage mt-3 aspect-[4/3] min-h-[380px]">
        <div className="absolute inset-0">
          <Scene3DLazy mode={mode} scene={scene} site={site} sites={sites} heightmap={heightmap} capHeightmap={capHeightmap} exaggeration={exaggeration} textureUrl={textureUrl} onPick={onPick} reducedMotion={reducedMotion} />
        </div>
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap gap-2">
          <div role="group" aria-label="View" className={`${SEG} pointer-events-auto`}>
            <button type="button" aria-pressed={mode === 'terrain'} onClick={() => onMode('terrain')} className={seg(mode === 'terrain')}>
              Terrain
            </button>
            <button type="button" aria-pressed={mode === 'globe'} onClick={() => onMode('globe')} className={seg(mode === 'globe')}>
              Globe
            </button>
          </div>
          {mode === 'terrain' && (
            <div role="group" aria-label="Heights" className={`${SEG} pointer-events-auto`}>
              <button type="button" aria-pressed={exaggeration === 1} onClick={() => onExaggeration(1)} className={seg(exaggeration === 1)}>
                True heights
              </button>
              <button type="button" aria-pressed={exaggeration === 3} onClick={() => onExaggeration(3)} className={seg(exaggeration === 3)}>
                Heights ×3
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-[15px] text-ink-2">{caption}</p>
      {customError && (
        <p role="alert" className="mt-1 text-[15px] text-bad">
          That place cannot be worked out: this tool covers the Moon south of 60° S.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Write `WhereOnMoon.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { ReliefMap, type MapPin } from '@/components/ReliefMap';
import { exploreHref } from '@/components/sites/SitesView';
import { HOME } from '@/lib/data/home';
import { siteLabel, type Site } from '@/lib/data/loaders';
import type { SiteOverview } from '@/lib/store/explore';
import { pct0 } from '@/lib/viz/format';
import { nearestSites, reliefUV } from '@/lib/viz/relief';

/** The place on the relief map of the south pole, one line about it, and the nearest other sites with their sunlight. */
export function WhereOnMoon({ site, sites, overview, startUtc, days }: { site: Site; sites: Site[]; overview: Record<string, SiteOverview>; startUtc: string; days: number }) {
  const half = HOME.relief.half_km;
  const onMap = (uv: { u: number; v: number }) => uv.u > 0.02 && uv.u < 0.98 && uv.v > 0.02 && uv.v < 0.98;
  const pins: MapPin[] = sites
    .filter((s) => s.category !== 'custom' || s.id === site.id)
    .flatMap((s) => {
      const uv = reliefUV(s.lat, s.lon, half);
      if (!onMap(uv)) return [];
      const best = overview[s.id]?.best;
      return [{ id: s.id, ...uv, label: siteLabel(s), href: exploreHref(s.id, startUtc, days), tone: best && best.poweredHours >= 336 ? ('good' as const) : ('plain' as const) }];
    });
  const here = pins.some((p) => p.id === site.id);
  const near = nearestSites(site, sites, 3);
  return (
    <section aria-label="Where on the Moon" className="panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="display text-[23px] font-semibold">Where on the Moon</h2>
        <Link href="/sites" className="text-[15px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          See all sites
        </Link>
      </div>
      <p className="mt-2 text-ink-2">
        <b className="font-semibold text-ink">{siteLabel(site)}.</b> {site.blurb ? `${site.blurb}.` : `A place at ${Math.abs(site.lat).toFixed(2)}° ${site.lat < 0 ? 'S' : 'N'}.`}
        {!here && ' It lies far outside this map of the south pole.'}
      </p>
      <div className="mt-3">
        <ReliefMap pins={pins} selectedId={site.id} />
      </div>
      <p id="near-title" className="mt-4 flex justify-between border-b border-line pb-2 text-[15px] text-ink-3">
        <span>Nearby sites, same {days} days</span>
        <span>Sunlight</span>
      </p>
      <ul aria-label={`Nearby sites, same ${days} days`} className="divide-y divide-line">
        {near.map(({ site: other, km }) => {
          const o = overview[other.id];
          return (
            <li key={other.id}>
              <Link href={exploreHref(other.id, startUtc, days)} className="flex min-h-[48px] items-center gap-4 py-2 hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  {siteLabel(other)}, {km < 10 ? km.toFixed(1) : Math.round(km)} km away
                </span>
                {!o ? (
                  <span className="text-[15px] text-ink-3">working it out…</span>
                ) : o.sunFraction > 0 ? (
                  <>
                    <span aria-hidden="true" className="h-2 w-20 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full bg-sun" style={{ width: `${Math.round(o.sunFraction * 100)}%` }} />
                    </span>
                    <b className="w-14 text-right font-semibold">{pct0(o.sunFraction)}</b>
                  </>
                ) : (
                  <span className="text-[15px] text-ink-2">no sunlight</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Give `PlannerChat` a panel variant**

In `web/src/components/PlannerChat.tsx`:

- add `variant = 'strip'` to the destructured props and `variant?: 'strip' | 'panel';` to their type;
- the `open` state starts as `variant === 'panel' || defaultOpen || plannerLog.getState().exchanges.length > 0`;
- before the existing `return`, add the panel layout (the form, the chips and the transcript are the same elements with the new control classes):

```tsx
  if (variant === 'panel') {
    return (
      <section aria-label="Ask in plain words" className="panel">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="display text-[23px] font-semibold">Ask in plain words</h2>
          <p className="text-[15px] text-ink-2">
            The assistant moves the controls for you. It never invents numbers.
            {aiMode === 'cached' && ' Demo mode: rehearsed answers.'}
          </p>
        </div>
        <form
          aria-label="Planner question"
          className="mt-3 flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(input);
          }}
        >
          <input
            type="text"
            aria-label="Ask the planner"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days"
            maxLength={500}
            className="field min-w-[260px] flex-1 placeholder:text-ink-3"
          />
          <button type="submit" disabled={busy || !input.trim()} className="btn h-[52px]">
            {busy ? 'Thinking…' : 'Ask'}
          </button>
        </form>
        {showChips && (
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((p) => (
              <button key={p} type="button" aria-label={`Try: ${p}`} onClick={() => setInput(p)} className="min-h-[40px] rounded-full border border-line-strong px-4 text-[15px] text-ink-2 hover:bg-surface-2 hover:text-ink">
                {p}
              </button>
            ))}
          </div>
        )}
        {exchanges.length > 0 && (
          <ol aria-label="Planner replies" className="mt-4 flex flex-col gap-3">
            {exchanges.map((x, i) => (
              <li key={x.id} className={i === 0 ? 'text-ink' : 'text-ink-3'}>
                <p className={i === 0 ? 'text-base' : 'text-[15px]'}>{x.reply}</p>
                {x.notes.length > 0 && <p className="text-[15px] text-ink-2">{x.notes.join(' ')}</p>}
                <p className="text-[15px] text-ink-3">
                  {sourceLabel(x)}, after you asked “{x.prompt}”
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/lib/viz/relief.test.ts src/components/explore src/components/PlannerChat.test.tsx` and `npx tsc --noEmit` and `npm run lint`
Expected: PASS. The three nearest sites to de Gerlache Rim 2 are its rim summit (12.1 km), its crater floor (20.4 km) and the south pole (52.2 km).

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/viz/relief.ts web/src/lib/viz/relief.test.ts web/src/components/explore/GroundPanel.tsx web/src/components/explore/GroundPanel.test.tsx web/src/components/explore/WhereOnMoon.tsx web/src/components/explore/WhereOnMoon.test.tsx web/src/components/PlannerChat.tsx web/src/components/PlannerChat.test.tsx
git commit -m "feat(web): the ground in a panel, where on the Moon with the nearest sites, and the assistant as an open panel"
```

---

### Task 11: The Explore page, assembled

**Files:**
- Rewrite: `web/src/components/ExploreView.tsx`, `web/src/components/ExploreView.test.tsx`
- Delete: `web/src/components/GuidedStory.tsx`, `GuidedStory.test.tsx`, `SiteSelect.tsx`, `SiteSelect.test.tsx`, `SummaryTiles.tsx`, `SummaryTiles.test.tsx`, `TimeScrubber.tsx`, `TimeScrubber.test.tsx`, `AudienceToggle.tsx` (and its test if one exists). Only the old Explore used them.
- Modify: `web/src/app/globals.css` (remove the `tall` custom variant and its comment), `web/src/app/globals.test.ts` if it names the variant

This task is specified by its tests and its structure, not by a full listing: the executor is the author of the components it assembles and writes the code test first.

**Interfaces:**
- Consumes: `PeriodBand`, `LanderDialog` (Task 6); `VerdictPanel`, `NumbersCard` (Task 7); `TimeChart` (Task 8); `TimeBar` (Task 9); `GroundPanel`, `WhereOnMoon`, `PlannerChat` with `variant="panel"` (Task 10); `answerFor` (Task 3); the store members `best`, `overview`, `loadOverview`, `findBestWindow`, `bestWindowNote`, `setWindow`, `setPower`, `setParams`, `addToCompare`, `compareIds`, `setCursor`, `selectCustom`, `setCustomError`, `setMode`, `setExaggeration` (Task 4 and before); `sceneStateAt`; `checkPick`; `useNavigate`; `useReducedMotion`; `useDemoMode`; `fileLoaders` (Task 5).
- Produces: `ExploreView({ store?, navigate? })`. No `data-testid="cockpit"`, no Planner or Learn audience.

**Structure, top to bottom (spec 6.3):**

```
<AppFrame>
  <main class="pb-[the time bar's height]">
    <div class="wrap">
      <PeriodBand/>                      landing site, From, For, Lander
      status line when the store reports a recoverable error
      <div class="grid lg:grid-cols-[minmax(0,1fr)_380px]">
        <VerdictPanel/>                  the page's h1; the one gold button
        <NumbersCard/>
      </div>
      <section aria-labelledby>          "Why: the N days, hour by hour"
        <TimeChart/>
      </section>
      <div class="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <GroundPanel/>  <WhereOnMoon/>
      </div>
      <section aria-labelledby>          "Ask in plain words"
        <PlannerChat variant="panel"/>
      </section>
    </div>
    <TimeBar/>                           pinned to the bottom of the window
    {lander dialog when open}
  </main>
</AppFrame>
```

Wiring:
- `answer = answerFor({ series, summary, power, startUtc, days, loadW: params.power.loadW, best })`.
- `onLand(startUtc)` calls `setWindow(startUtc, days)`. `onCompare()` adds the site to the compared sites when it is not there and there is room, then navigates to `/compare`. `onYear()` calls `findBestWindow(days)`; `yearNote` is `bestWindowNote`.
- The hour under the pointer on the chart (`hoverHour`) is local state; the time bar and the status sentence show `hoverHour ?? cursorHour`.
- `loadOverview()` runs once after `init()`, for "Where on the Moon".
- The loading and error states keep their wording ("Loading NASA data…", "Data files are missing." with the `sync-local --tiles` command, "Something went wrong while loading.").

- [ ] **Step 1: Write the failing tests** (replace `ExploreView.test.tsx`; the store uses `fileLoaders()` with the committed data, start 2027-01-01, 30 days, the default lander)

1. `shows the answer for the default site as the page's heading`: after loading, the `h1` contains "de Gerlache Rim 2" and "Power for 3 days 4 hours, then night"; `main` holds exactly one `.btn-primary`, and its name starts with "Land on 20 January".
2. `lands on the better date when its button is pressed`: pressing it sets `startUtc` to `2027-01-20T10:00:00` in the store and the heading then contains "12 days 15 hours".
3. `offers Compare as the gold action when no date in the period does better`: with `?site=shackleton_center_rim_high` the heading says "Keeps power for all 30 days", the gold button is "Compare sites", and pressing it adds the site to `compareIds` and calls `navigate('/compare')`.
4. `puts the period band first and the time bar last, and names every region`: regions "Why: the 30 days, hour by hour", "The ground", "Where on the Moon", "Ask in plain words" exist in that order; a `slider` named "Time" exists.
5. `moves the time from the keyboard and says what is happening at that hour`: Arrow Right on the slider moves `cursorHour` by one and the status sentence changes when the Sun sets (hour 67).
6. `opens the lander settings from the band and applies a preset`: pressing the Lander control opens a dialog named "Lander"; choosing the large preset closes nothing by itself, updates `params.power.batteryWh` to 50000 and the lander line in the numbers card.
7. `applies the site, start and length from the address`: `?site=blue_ghost_m1&start=2025-03-02&days=14` shows "Blue Ghost" in the heading and "Keeps power for all 14 days".
8. `keeps instrument and programme names out of the page`: `main` text does not match `/LOLA|DE440|Horizons|CLPS|ephemeris|skyline/`.
9. `says what to do when the data files are missing` and `shows an error it cannot explain`: as in the old test, through a failing loader.
10. `has no audience switch and no guided story`: no "Planner", "Learn" buttons; no element with `data-testid="cockpit"`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/components/ExploreView.test.tsx`
Expected: FAIL (the old page renders the cockpit).

- [ ] **Step 3: Rewrite `ExploreView.tsx`** to the structure above; delete the five old components and their tests; remove the `tall` variant from `globals.css`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/ExploreView.test.tsx && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: PASS; no file imports a deleted component.

- [ ] **Step 5: Commit**

```bash
git add -A web/src
git commit -m "feat(web): Explore leads with the answer in words, a left-to-right time chart and a pinned time bar"
```

---

### Task 12: Look at it, measure it, badge and notes

**Files:**
- Modify: `web/public/validation/tests.json` (regenerated), `web/README.md` (the site list, the answer page, the landing fixtures command), `docs/data-credits.md` only if a new source was used (none)

- [ ] **Step 1: Look at the two pages**

With the dev server running, open with Playwright at 1440 by 900 (use `http://app.localhost:3000`, hide the Next badge):
`/sites`, `/explore` (default site), `/explore?site=shackleton_center_rim_high`, `/explore?site=shackleton_center`, `/explore?site=blue_ghost_m1&start=2025-03-02&days=14`, each in the light and the dark theme. Then `/sites` and `/explore` at 1280, 1024, 820 and 390 px wide.

Check and fix before going on:
- no sideways scroll at any width; no clipped or colliding label on the chart; the time bar never covers the last section;
- the first screen of `/explore` at 1440 by 900 shows the period band, the answer row, the whole time chart and the time bar;
- one gold button per screen; Play is ink; links that stand alone are underlined;
- headings use the display face at 87.5 % width; panels 8 px, pictures 6 px; no shadow, gradient or blur;
- both themes: picture panels keep their edge on the dark page.

- [ ] **Step 2: Measure the first screens** (`/sites` and `/explore` at 1440 by 900)

In the page: the share of visible text nodes under 14 px must be at most 15 %, none under 13 px; every button, field, select and slider at least 40 px tall (links inside text are exempt). Record the numbers in the ledger.

- [ ] **Step 3: Blind read**

Viewport-sized screenshots (1440 by 900) of `/sites` and `/explore` in scroll order, light theme, plus the first screen of each in the dark theme. Two readers who see only the pictures (a hackathon judge without a space background, a school science teacher), the same seven headings as in part 1, scores for purpose clarity, next step, professional look, breathing room and readability. Gate: no score under 4, 4, 4, 3, 3. Fix what both readers name.

- [ ] **Step 4: Gates, badge, notes**

Run from `web/`: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`, then `npm run validation:tests`. From `pipeline/`: `uv run pytest -q`.
Expected: all green; `web/public/validation/tests.json` carries the new counts.

Add to `web/README.md`: the `/sites` page and what its columns mean; how the answer on Explore is worded (time with power, the better landing date inside the period, the 12-month search); `uv run python -m lunar_pipeline.cli fixture-landing --site ID` regenerates a golden file in `data/fixtures/landing/`.

- [ ] **Step 5: Commit**

```bash
git add web/public/validation/tests.json web/README.md
git commit -m "chore(web): test badge and notes on the site list and the answer page"
```

---

### Task 13: The home page says what the battery does

Added on 2 October 2026. In the second and third blind reads of part 1 both readers looked for the battery the home page promises ("and whether the battery survives the night") and did not find it. This task adds one sentence with the figures of Task 2's engine.

**Files:**
- Modify: `pipeline/lunar_pipeline/home_assets.py`, `pipeline/tests/test_home_assets.py`; regenerate `web/src/lib/data/home.json` with `home-assets` (the pictures do not change)
- Modify: `web/src/lib/data/home.ts`, `web/src/lib/data/home.test.ts`, `web/src/app/page.tsx`, `web/src/app/page.test.tsx`

**Interfaces:**
- Consumes: `powered_from`, `best_landing` (Task 2, Python); `illumination.hourly_series`; `PowerConfig`, `config_dict`, `power_series`; `spanWords`, `dayMonth` (web).
- Produces: `battery_facts(series: dict, cfg: PowerConfig, hours: int) -> dict` with keys `lander` (the config), `now_hours`, `best_hour`, `best_hours`; `home.json` gains `battery` with those keys; `HomeDoc.battery`.

- [ ] **Step 1: Failing pipeline test.** `test_battery_facts_give_the_time_with_power_now_and_on_the_best_day` on the synthetic series of `test_landing.py` (sun `[0]*10 + [1]*20 + [0]*30 + [1]*5 + [0]*40`, the ten-hour battery): `now_hours == 0` (no sunlight at hour 0 and the first brownout... use the expected values the reference gives), `best_hour == 10`, `best_hours == 30`. Extend the data test of `write_all`: `battery.now_hours == 76`, `battery.best_hour == 466`, `battery.best_hours == 303` (the values of `data/fixtures/landing/de_gerlache_rim_2_2027-01-01_30d.json`).
- [ ] **Step 2: Implement** `battery_facts` from `powered_from` and `best_landing` over the hero month (`hourly_series` for the hero site, the default `PowerConfig`), add `battery` to `home.json`, run `home-assets`.
- [ ] **Step 3: Failing web tests.** `home.test.ts`: `HOME.battery` matches the landing fixture of the hero site (now, best hour, best hours). `page.test.tsx`: the forecast band says "A small lander (4 m² of solar panels, a 2 kWh battery) that lands on 1 January keeps power for 3 days 4 hours. Landing on 20 January instead keeps it going for 12 days 15 hours." (numbers and dates from `HOME.battery`, durations with `spanWords`, dates with `dayMonth`).
- [ ] **Step 4: Implement** the sentence under the chart, above the note, at full strength; keep the whole chart and this sentence on the first screen at 1440 by 900 (adjust `PX_PER_DEG` or spacing if needed, and rule on it).
- [ ] **Step 5: Look, gates, commit.**
