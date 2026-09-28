# NASA Space Apps 2026 — "CLPS Lunar Mission Browser" — High-Level Product Plan

## 1. Context

- Goal: win the Beirut local event again, earn Global Nominee, contend for a Global Award.
- Challenge: **CLPS Lunar Mission Browser** (2026; difficulty Advanced/Intermediate; subjects Human Exploration, Moon, Software, Space Exploration).
- Hackathon: **Nov 14–15, 2026**; submission closes Nov 15 23:59 local. Today Sep 28 → **7 weeks**.
- Repo: `C:\Users\user\Documents\GitHub\Trinity` (empty: LICENSE + README). Fresh build.
- User decisions: web app; full ambition incl. 3D; **full product before the event, polish at the event** (disclose pre-existing work); free tiers first, ready to pay small later; free OpenRouter models only; must run **offline on a laptop** at the venue.

### Official challenge summary (verbatim)

> Missions to the Moon's south pole face extreme lighting and communication constraints, and planning them takes careful coordination between science and engineering teams. Tools for determining Sun and Earth positions at candidate landing sites exist, but their complicated interfaces make it difficult to evaluate critical information with efficiency. Your challenge is to create an intuitive tool or application that lets mission planners, educators, and the public compare landing sites and dates quickly, visualizing Sun and Earth positions relative to the horizon to assess power generation potential and direct-to-Earth communication windows.

Full details (objectives, considerations, resource list) are not published yet. Re-check the challenge page weekly; align wording and add any listed resource when they drop.

### Judging and rules

- Criteria: **Impact, Creativity, Validity, Relevance, Presentation**. Global judges see only the project page, demo link and a **30-second video**.
- Judges penalize weak/indirect NASA-data use → list every dataset, show a dataset chip on every panel.
- Must disclose **pre-existing code** and **AI use** (where and how) in the submission.
- Known competitor for this exact challenge: `github.com/Hamzaslam1996/lunarwindow` (Python + SPICE + FastAPI, single site, server compute, no 3D, no compare, no battery, no validation page). Our bar: same rigor **plus** instant multi-site compare, 3D, decisions ("best window", "survive the night"), AI planner, validation page, live hosting.

## 2. Product concept

- **Name** (pick one; recommended first): **Earthrise** · Illume · Nightwatch.
- **One-liner:** "Pick a lunar landing site and a date in 60 seconds. See exactly when the Sun powers you and when Earth can hear you."
- **Hero moment (the 20 seconds that win):** on Artemis III "de Gerlache Rim 2", drag the date scrubber across Jan–Mar 2027. 3D terrain shadows sweep, the Sun track skims the sky-dome horizon, Earth dips behind a ridge, timeline bars go red, "Survive the night?" flips RED (96 h battery vs 180 h dark). Click **Best 14-day window** → snaps to 100 % sun / 91 % Earth, GREEN. One drag moves every panel.
- **Primary user:** mission planner (challenge text scores "power generation potential" and "DTE windows" explicitly). Header toggle **Planner / Learn**: Learn hides 3 of 6 KPIs, adds plain-language tooltips and a 5-step guided story on the same screens (educators + public).
- **Backcast hook for the pitch:** "IM-2 died in a day, Blue Ghost lived 14 days: light and line-of-sight." Replay real CLPS missions in the tool.

## 3. Feature tiers

### MVP (demoable by Oct 25)

| Feature | User sees | NASA data | Criterion |
|---|---|---|---|
| Site picker | ~20 featured sites (Artemis III 9 regions, CLPS past/planned, Shackleton/de Gerlache/Malapert) + click-anywhere | LOLA polar DEMs, USGS Artemis III regions, CLPS manifests | Relevance |
| Sky-dome | 360° terrain horizon mask with Sun and Earth tracks colored by time | LOLA DEM + SPICE DE440 | Validity, Creativity |
| Timeline | Illumination + Earth-visibility bars (1 h step), hover shows az/el | same | Impact |
| 3D globe + polar terrain | time-driven real shadows, site pins, fly-to | CGI Moon Kit, LOLA heightmaps, Moon Trek tiles | Presentation |
| Compare 2–4 sites | KPI grid: sunlit %, longest dark (h), Earth-visible %, longest comms gap (h), joint Sun+Earth % | same | Impact |
| Best-window finder | scan a year, rank 14/30-day windows by w1·sun + w2·earth − w3·maxgap | same | Impact |

### Differentiators (beat lunarwindow and "just a dashboard")

| Feature | Detail | Criterion |
|---|---|---|
| Power budget | panel type (vertical fixed / horizontal / 1-axis az tracking / full tracking), area, efficiency, load W, battery Wh → "Survive the night" verdict, min state of charge, brownout hours | Validity, Impact |
| Comms mask | min elevation 0–10°, mast height 0–10 m, terrain occlusion → DTE windows list | Validity |
| Mission backcast | IM-1, IM-2, Blue Ghost M1: predicted local sunset vs reported end of mission | Validity, Impact |
| Mazarico overlay | published multi-year illumination / Earth-visibility maps on terrain + our delta | Validity |
| Validation page | Horizons cross-check table (+ live re-check button), Mazarico agreement, method, error budget, test badge | Validity |
| AI planner | typed question drives the UI through deterministic tools; "Mission brief" narrates computed numbers | Creativity |
| Export brief | 1-page PDF: KPIs, charts, method, dataset citations | Presentation |
| Learn mode | 5 guided steps | Impact |

### Stretch
Shareable URL state; NAC imagery per site; first-person "stand on the surface" view.

### Cut (no judging value / risk)
Relay satellites, rover traverse, thermal model, accounts, runtime backend compute, mobile layout (desktop 1440 px only).

## 4. UX flow (3 screens)

1. **Land:** globe rotates to the south pole; one-line pitch; 3 cards (Artemis III, IM-2, Blue Ghost M1).
2. **Explore:** left 60 % 3D terrain; right-top sky-dome; right-bottom timeline; bottom scrubber (start date, 14/30/90 d); side drawer for power/comms params; "Add to compare".
3. **Compare:** top bar = window + params; one column per site (sparkline timeline, 6 KPIs, verdict chip); footer = "Find best window", "Ask planner", "Export brief".

## 5. Architecture (decided: static-first, compute in the browser)

- **Stack:** Next.js (App Router) + TypeScript; React Three Fiber + drei; Zustand; Web Workers (Comlink); IndexedDB + Cache API; Tailwind + shadcn/ui; Canvas/SVG charts; Vercel AI SDK with OpenRouter provider; vitest + Playwright. Pipeline: Python 3.12 + uv + spiceypy + rasterio/GDAL + numpy + pytest.
- **Why not a runtime backend:** same `next build` artifact on Vercel and on the venue laptop; no cold starts; sub-100 ms recompute when scrubbing dates; per-request Python is the competitor's design. Python stays as the **offline reference implementation** (precompute + validation), which is what earns Validity points.

### 5.1 Ephemeris (offline SPICE → tiny static table)
- `spkpos('SUN'|'EARTH', et, 'MOON_ME', 'LT+S', 'MOON')` hourly TDB grid 2024-01-01 → 2036-12-31: 113,952 × 2 bodies × 3 float32 ≈ 2.7 MB (brotli ≈ 2.3 MB) + header JSON (t0, dt, kernel list, SHA-256).
- Browser: site vector p = (R+h)(cos lat cos lon, cos lat sin lon, sin lat), R = 1737.4 km, h = DEM height + mast; topocentric d = r_body − p (Earth parallax ≈ 0.26° — required); ENU → az = atan2(e, n), el = asin(up/|d|). Cubic Hermite interpolation (Sun moves 0.508°/h; error ≈ 0). UTC→TDB +69.184 s.
- Fallback/third opinion: `astronomy-engine` (pure JS) outside the table range only.

### 5.2 Horizon mask engine (Web Worker)
- Tiles 512×512 int16 (0.5 m units), row-delta + deflate (~200–250 KB each), decoded with `DecompressionStream`. Levels: L0 20 m (`ldem_875s_20m`, 225 tiles + 20 m windows cut from `ldem_80s_20m` for featured sites north of 87.5°S), L1 80 m (`ldem_80s_80m`), L2 240 m (`ldem_60s_240m`). ≈170 MB total on R2.
- Nested bands (Barker et al. 2021 method): L0 0–6 km (10 m step), L1 6–100 km (40 m), L2 100–220 km (120 m); 720 azimuths; great-circle march with exact curvature: el = atan2(r_t cos d − r_o, r_t sin d). Mask[az] = max over samples.
- Budget: ≤37 MB int16 resident; 10–15 MB cold download; 50–150 ms per mask, progressive (L2 preview ≈10 ms). Masks cached in IndexedDB; tiles in Cache API.
- Featured sites: **5 m masks precomputed offline** (5 m mosaic for r < 5 km, then 20/80/240 m) shipped as JSON (~30 × 3 KB); browser splices its far-field by element-wise max.

### 5.3 Metrics
- Per hour: h(az) interpolated; solar disk fraction f with ρ = 0.267°; Earth visible if el_E − h(az_E) > margin.
- Per site+mask compute the full 13-year hourly series once (~10 ms); any window = prefix-sum O(1); best-window sweep O(N). Ten-site compare updates instantly.
- Power: S = 1361 (AU/d)² f W/m²; P = η·A·S·max(0, n·s) per panel model; battery E += (P − P_load)·dt clamped → min SOC, brownouts, survival hours.

### 5.4 3D
- Globe: CGI Moon Kit 4K color + LOLA displacement (16 px/deg); Moon Trek tiles for the polar map.
- Polar terrain: per-site 1024² PNG16 heightmaps (20 m → ~20 km windows) + one coarse 240 m south-cap mesh; directional light = computed Sun vector; cascaded shadow maps; Earth sprite at computed az/el; LOD + performance toggle.

### 5.5 AI layer (free OpenRouter, non-critical)
- Roles: (1) intent → tool calls that drive the UI; (2) narrate tool JSON into a mission brief; (3) glossary explanations. **Never computes physics.**
- Tools: `select_site`, `set_window`, `compute_site_metrics`, `compare_sites`, `find_best_window`, `set_power_config`, `export_brief`, `explain`.
- Guardrails: temperature 0, max 3 tool rounds, numbers in briefs regex-checked against tool JSON (mismatch → retry once → template brief).
- **All inference goes through the OpenRouter API key (server-side in `/api/chat`, 30 req/min/IP). No local LLM anywhere.** Model chain (free tier): `google/gemma-4-31b-it:free` → `nvidia/nemotron-3-super-120b-a12b:free` → `qwen/qwen3.8-27b:free` → `openrouter/free`. If every model call fails or times out (8–12 s each): deterministic non-model fallbacks only — a regex intent matcher for the 12 rehearsed demo phrasings, then cached transcripts keyed by normalized prompt. `?demo=1` forces cached transcripts for the live pitch.
- Disclosure: project-page section "AI use" (models, roles, limits; Claude Code used for development; pre-existing libraries).

### 5.6 Hosting and offline
- **App:** Vercel Hobby (Next.js, Fluid functions, `iad1`); env `OPENROUTER_API_KEY`, `NEXT_PUBLIC_DATA_BASE`, `NEXT_PUBLIC_AI_MODE=live|cached`; routes `/api/chat`, `/api/horizons`. Keep static output < 50 MB (Hobby CLI source limit 100 MB, ~100 GB/mo transfer).
- **Data (~250 MB):** Cloudflare R2 free (10 GB, zero egress) fronted by a free Cloudflare Worker or custom domain (`r2.dev` is rate-limited); `Cache-Control: public,max-age=31536000,immutable`; CORS GET/HEAD for `*.vercel.app`, prod domain, `localhost:3000`. Mirror as a GitHub Release.
- **Offline venue mode:** `pnpm build && pnpm start` with `public/data` (gitignored, `.vercelignore`d) filled by `sync_local.py`; cached AI transcripts; Horizons fixtures; Service Worker precaching shell + featured-site tiles so even the live URL survives Wi-Fi loss after one warm visit.
- **Go-live upgrade path:** custom domain (~$10/yr) → Vercel Pro ($20/mo) only if transfer/limits bite. **Plan B host:** Cloudflare Pages via `@opennextjs/cloudflare` (unlimited free bandwidth); data layer unchanged.

### 5.7 Repo layout
```
Trinity/
  pipeline/        fetch.py ephemeris.py tiles.py masks.py overlays.py terrain3d.py validate.py sync_local.py  (Python, uv)
  data/            site catalog, 5 m masks JSON, ephemeris .bin (~3 MB), Horizons fixtures   (committed, < 30 MB)
  src/app/         (explore|compare|learn|validate)/page.tsx, api/chat, api/horizons
  src/lib/         ephemeris.ts metrics.ts power.ts ai/tools.ts
  src/workers/     horizon.worker.ts
  src/components/  globe/ terrain/ skydome/ timeline/ compare/
  public/data/     gitignored heavy mirror for offline
  docs/            method.md, data-credits.md, submission.md, pitch.md
```

## 6. Validity story (first-class feature)

- **Horizons cross-check:** 8 sites × 24 epochs (2025–2027), Sun + Earth az/el via `CENTER='coord@301'`; stored table with query URLs + live re-check button (fixture fallback offline). Target |Δ| < 0.01°.
- **Mazarico agreement:** our 13-yr hourly sunlit % at 6 pixels vs `AVGVISIB_85S_060M`; expect within 5–10 points; Shackleton floor = 0 % and matches the PSR map.
- **Backcasts:** Blue Ghost M1 sunset ~Mar 16 2025 vs Firefly's reported end; IM-1 Feb 29 2024 shutdown; IM-2 low Sun in crater.
- **Tests:** flat DEM → 0° mask; cone → analytic; pole Sun el within ±1.54°; disk-fraction endpoints; Python/JS mask parity < 0.01°; Hermite vs 1,000 off-grid SPICE samples; landmark tests (Shackleton rim 89.66°S/129.2°E) for projection sign. CI badge on the project page.
- **Error budget on the method page:** ephemeris < 0.01°; mask 0.05–0.15°; event timing ±15–60 min near the pole (1 h step, DEM 1–2 m).

## 7. Presentation package

- **Pitch (5:00):** 0:00 hook (IM-2 vs Blue Ghost) · 0:30 problem (SPICE/GIS complexity) · 1:00 live demo: hero → compare 3 Artemis regions → best window → AI question → export · 3:00 validity (3 tables) · 3:45 impact + next (CLPS providers, classrooms) · 4:20 data list + team · 4:40 close.
- **30-s video storyboard:** 0–3 black "14 days of night." · 3–8 globe to pole · 8–15 scrubber drag (shadows, dome, bars) · 15–21 compare + best-window snap · 21–26 AI query moves UI, brief exports · 26–30 logo, "LRO LOLA · JPL DE440", URL. Captions only; two iterations.
- **Project page:** Summary → Problem → Demo + video → 3 screens (GIFs) → Validity tables → NASA data list (LOLA LDEM polar, LOLA illumination maps, DE440 + NAIF kernels, Horizons API, CGI Moon Kit, Moon Trek, Artemis III regions, CLPS manifests) → Other data → AI + pre-existing code disclosure → Team → Repo.
- **Failure-proofing:** offline build on 2 laptops + USB; `?demo=1`; screen-recorded full demo backup; HDMI/USB-C adapters; phone hotspot; kiosk fullscreen; notifications off; 1080p projector test; script rehearsed 5×.

## 8. Timeline (feature freeze Nov 8)

| Week | Dates | Build | Demoable by end of week |
|---|---|---|---|
| 1 | Sep 28–Oct 4 | Pipeline: kernels + DEMs fetched, `ephemeris.py`, `tiles.py` (+ landmark tests), masks for 20 sites, Horizons fixtures; Next.js + R3F scaffold; R2 bucket | CLI: Shackleton sunlit % matches Horizons/Mazarico |
| 2 | Oct 5–11 | TS engine (`ephemeris.ts`, `horizon.worker.ts`, `metrics.ts`) + golden tests; sky-dome; timeline | Explore screen for 1 site |
| 3 | Oct 12–18 | Globe, polar terrain, real-time shadows, site picker, scrubber | Hero moment |
| 4 | Oct 19–25 | Compare, best-window finder, power/comms params, "survive the night" | Full 3-screen flow (MVP) |
| 5 | Oct 26–Nov 1 | Validation page (Horizons live, Mazarico, backcasts), export brief, Learn mode | Validity tables |
| 6 | Nov 2–8 | AI planner + fallbacks + caches, design polish, video v1, project page draft, Vercel + R2 live | Full pitch run-through |
| 7 | Nov 9–15 | Bugs only, 3 rehearsals, offline builds, video v2; event: visible polish work + public commits, submit early Nov 15 | Submission |

## 9. Risks

1. **Rules on pre-built work:** Space Apps expects work during the hackathon. Read the 2026 project-submission guide when it drops (early Oct); disclose the engine as pre-existing open-source; keep visible event-weekend work (AI polish, Learn mode, backcasts, project page) with public commits Nov 14–15. User's call on how much to pre-build.
2. **DEM projection/sign bugs** → plausible-but-wrong masks: landmark tests + Python/JS parity in week 1.
3. **Venue bandwidth/CPU:** offline mode, Service Worker precache, L2-first progressive masks, 3D LOD toggle, rehearse on the actual laptop by week 4.
4. **Free-LLM flakiness:** fallback chain, timeouts, cached demo transcripts; AI never blocks core UX.
5. **"Just a dashboard" perception:** lead with decisions (best window, survive-night) and backcasts.
6. **Official challenge details shift emphasis:** check weekly; keep data adapters isolated.
7. **Scope creep with one builder:** freeze Nov 8, enforce the cut list.

## 10. Verification (end-to-end)

1. `uv run pytest` in `pipeline/` (SPICE fixtures, mask landmarks, Horizons parity).
2. `pnpm test` (vitest golden tests: ephemeris, mask, metrics parity with Python).
3. `pnpm build && pnpm start` offline with `public/data` filled → walk the 3-screen flow with Wi-Fi off; AI in `cached` mode.
4. Playwright e2e: hero flow, compare, best-window, export.
5. Live check on the Vercel URL + R2: Lighthouse ≥ 90 perf on desktop; masks < 200 ms; tiles served with immutable cache headers.
6. Validation page shows Horizons |Δ| < 0.01° and Mazarico agreement; backcast dates match reported mission ends.
7. Full pitch rehearsal on the venue laptop at 1080p, timed under 5:00.

## 11. After approval

1. Commit this plan as `docs/superpowers/specs/2026-09-28-clps-lunar-mission-browser-design.md`.
2. Run the writing-plans skill to produce the Week 1 implementation plan (pipeline + scaffold + validation), then build week by week per the timeline.
