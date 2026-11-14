"""Prototype measurements for docs/ml-feasibility.md. Not part of the pipeline, its tests or the app.

ensemble: at one polar site, skylines traced through PGDA product 90's adjusted models perturbed within
their ERR maps by smooth random fields (spatially correlated errors), with the pipeline's own march; times
each step, and compares the spread of one-minute Sun and Earth events with the budget's raised and lowered
skylines and with the first-order rule (shift = skyline change / crossing rate).

diviner: reads the Diviner south polar resource product from its zip, times the read, and summarises it
around each polar site next to product 90's permanent shadow (the cached 10 km LPSR windows).

Run from pipeline/:
    uv run python -I scratch/ml_study_probe.py ensemble --site connecting_ridge --members 20 --lengths 250 2500
    uv run python -I scratch/ml_study_probe.py diviner --zip <path to dlre_prp_south.zip>
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from lunar_pipeline import config
from lunar_pipeline.geometry import azel_from_body_vectors, ps_south_xy_m
from lunar_pipeline.horizon import Band, mask_at_azimuth, site_height_m
from lunar_pipeline.illumination import sun_radius_deg
from lunar_pipeline.lola import LolaGrid
from lunar_pipeline.masks import bands_for_site, fallback_bands, load_mask
from lunar_pipeline.pgda90 import full_path, grid_from_geotiff
from lunar_pipeline.sites import all_sites
from lunar_pipeline.uncertainty import (
    SPAN_DAYS,
    SPAN_START,
    TERRAIN_WINDOW_H,
    adjusted_grids,
    fine_vectors,
    horizon_profile,
    longest_run_h,
    match_offsets,
    read_err_window,
    sign_changes,
)


def crop(grid: LolaGrid, lat: float, lon: float, half_m: float) -> LolaGrid:
    col, row = grid.pixel_from_latlon(lat, lon)
    n = int(np.ceil(half_m / grid.label.map_scale_m))
    r0, c0 = max(int(row) - n, 0), max(int(col) - n, 0)
    rows = min(2 * n + 1, grid.label.lines - r0)
    cols = min(2 * n + 1, grid.label.samples - c0)
    return grid.subgrid(r0, c0, rows, cols)


def err_on(dem: LolaGrid, err: LolaGrid) -> np.ndarray:
    """The error map on the DEM's pixels: the same array when the grids coincide, else sampled at the DEM's pixel centres."""
    a, b = dem.label, err.label
    if (a.lines, a.samples, a.map_scale_m, a.line_offset_px, a.sample_offset_px) == (b.lines, b.samples, b.map_scale_m, b.line_offset_px, b.sample_offset_px):
        e = np.asarray(err.data, dtype=np.float64)
    else:
        rr, cc = np.mgrid[0 : a.lines, 0 : a.samples]
        lat, lon = dem.latlon_from_pixel(cc.astype(float), rr.astype(float))
        e = err.value_at(lat, lon).reshape(a.lines, a.samples)
    return np.where(np.isfinite(e), e, np.nanmedian(e))


def smooth_field(shape: tuple[int, int], length_px: float, rng: np.random.Generator) -> np.ndarray:
    """Unit-variance Gaussian random field with a Gaussian covariance of length `length_px` (correlation e^-1/2 there)."""
    w = rng.standard_normal(shape)
    if length_px < 0.5:
        return w
    s = length_px / np.sqrt(2.0)  # kernel width that gives that covariance length
    ky = np.fft.fftfreq(shape[0])[:, None]
    kx = np.fft.rfftfreq(shape[1])[None, :]
    z = np.fft.irfft2(np.fft.rfft2(w) * np.exp(-2.0 * np.pi**2 * s**2 * (kx**2 + ky**2)), s=shape)
    return (z - z.mean()) / z.std()


def events(sun_el, sun_az, radius, earth_el, earth_az, mask, t_h) -> dict:
    limb = sun_el - mask_at_azimuth(mask, sun_az) + radius
    earth = earth_el - mask_at_azimuth(mask, earth_az)
    out = {}
    for name, margin in (("lit", limb), ("earth", earth)):
        t, d, r = sign_changes(margin, t_h)
        out[name] = (t, d, r)
    step_h = float(t_h[1] - t_h[0])
    out["sunlit_pct"] = 100.0 * float(np.mean(limb > 0))
    out["earth_pct"] = 100.0 * float(np.mean(earth > 0))
    out["longest_night_h"] = longest_run_h(~(limb > 0), step_h)
    return out


KIND = {"sunset": ("lit", -1), "sunrise": ("lit", 1), "earthset": ("earth", -1), "earthrise": ("earth", 1)}


def of_kind(ev: dict, kind: str):
    flag, direction = KIND[kind]
    t, d, r = ev[flag]
    sel = d == direction
    return t[sel], d[sel], r[sel]


def shifts(base: dict, other: dict, kind: str) -> np.ndarray:
    """Each base event's time under the other skyline minus its time under the base (NaN: the other has no such event)."""
    tb, db, _ = of_kind(base, kind)
    to, do, _ = of_kind(other, kind)
    return -match_offsets(tb, db, to, do, TERRAIN_WINDOW_H)


def q(v, p):
    v = np.asarray(v, dtype=np.float64)
    v = v[np.isfinite(v)]
    return None if not v.size else round(float(np.percentile(v, p)), 3)


def run_ensemble(site_id: str, members: int, lengths_m: list[float], seed: int) -> dict:
    t_all = time.perf_counter()
    site = {s.id: s for s in all_sites()}[site_id]
    timing = {}
    t = time.perf_counter()
    full = {k: grid_from_geotiff(full_path(k)) for k in ("dem80", "err80", "dem240", "err240")}
    timing["load_product90_whole_files_s"] = time.perf_counter() - t
    # Keep only what the bands reach (100 km on the 80 m model, 220 km on the 240 m model) so each field is small.
    dem80, err80 = crop(full["dem80"], site.lat, site.lon, 103_000.0), crop(full["err80"], site.lat, site.lon, 103_000.0)
    dem240, err240 = crop(full["dem240"], site.lat, site.lon, 224_000.0), crop(full["err240"], site.lat, site.lon, 224_000.0)
    del full
    grids = adjusted_grids(site, dem80, dem240)
    errs = {"L1": err_on(grids["L1"], err80), "L2": err_on(grids["L2"], err240)}
    if grids["L0"] is not grids["L1"]:
        errs["L0"] = err_on(grids["L0"], read_err_window(site))
    t = time.perf_counter()
    bands = bands_for_site(site, grids)
    bands = bands + fallback_bands(site, bands, grids)
    h0 = site_height_m(site.lat, site.lon, [b.grid for b in bands])
    base = horizon_profile(site.lat, site.lon, bands, h0)
    timing["one_skyline_with_band_setup_s"] = time.perf_counter() - t
    stored = json.loads((config.DATA_DIR / "uncertainty" / "skylines" / f"{site_id}.json").read_text())
    adjusted = np.asarray(stored["adjusted_deg"])
    sigma = np.asarray(stored["raised_deg"]) - adjusted
    check = float(np.max(np.abs(base.elevation_deg - adjusted)))
    key = {id(g): k for k, g in grids.items()}
    levels = sorted({key[id(b.grid)] for b in bands})
    rng = np.random.default_rng(seed)
    # Pixel centres of each band's grid in polar stereographic metres, for fields shared by all bands.
    sx, sy = ps_south_xy_m(site.lat, site.lon)
    xy = {}
    for k in levels:
        lab = grids[k].label
        cols = (np.arange(lab.samples) - lab.sample_offset_px) * lab.map_scale_m
        rows = (lab.line_offset_px - np.arange(lab.lines)) * lab.map_scale_m
        xy[k] = (cols, rows)
    skylines: dict[float, list[np.ndarray]] = {}
    march_s, field_s = [], []
    for length in lengths_m:
        out = []
        for _ in range(members):
            t = time.perf_counter()
            pert = {}
            shared = None
            if length >= 1000.0:
                # One field on a lattice a quarter of the length apart, 452 km across, sampled by every band: the
                # near and far terrain then share their errors, and a long length is not cut by a small window.
                step = length / 4.0
                n = int(np.ceil(452_000.0 / step)) + 1
                shared = (smooth_field((n, n), 4.0, rng), sx - 226_000.0, sy + 226_000.0, step)
            for k in levels:
                g = grids[k]
                if shared is None:
                    z = smooth_field(g.data.shape, length / g.label.map_scale_m, rng)
                else:
                    field, x0, y0, step = shared
                    cols, rows = xy[k]
                    fc = np.clip((cols - x0) / step, 0, field.shape[1] - 1.001)
                    fr = np.clip((y0 - rows) / step, 0, field.shape[0] - 1.001)
                    c0, r0 = fc.astype(int), fr.astype(int)
                    wc, wr = fc - c0, fr - r0
                    top = field[r0][:, c0] * (1 - wc) + field[r0][:, c0 + 1] * wc
                    bot = field[r0 + 1][:, c0] * (1 - wc) + field[r0 + 1][:, c0 + 1] * wc
                    z = top * (1 - wr)[:, None] + bot * wr[:, None]
                pert[k] = LolaGrid(g.label, (np.asarray(g.data, dtype=np.float64) + errs[k] * z).astype(np.float32))
            field_s.append(time.perf_counter() - t)
            t = time.perf_counter()
            pb = [Band(pert[key[id(b.grid)]], b.r_min_m, b.r_max_m, b.step_m) for b in bands]
            h = site_height_m(site.lat, site.lon, [b.grid for b in pb])
            out.append(horizon_profile(site.lat, site.lon, pb, h).elevation_deg)
            march_s.append(time.perf_counter() - t)
        skylines[length] = out
    timing["random_fields_per_member_s"] = float(np.median(field_s))
    timing["march_per_member_s"] = float(np.median(march_s))
    # The sky every minute for the budget's span, once; every skyline then costs only the lookups.
    t = time.perf_counter()
    n = int(SPAN_DAYS * 1440)
    vec = fine_vectors(SPAN_START, n, 60.0)
    timing["spice_one_minute_vectors_s"] = time.perf_counter() - t
    t = time.perf_counter()
    sun_az, sun_el = azel_from_body_vectors(vec[:, 0, :], site.lat, site.lon, 0.0)
    earth_az, earth_el = azel_from_body_vectors(vec[:, 1, :], site.lat, site.lon, 0.0)
    radius = sun_radius_deg(np.linalg.norm(vec[:, 0, :], axis=1))
    del vec
    timing["directions_once_s"] = time.perf_counter() - t
    t_h = np.arange(n, dtype=np.float64) / 60.0
    ev = lambda m: events(sun_el, sun_az, radius, earth_el, earth_az, m, t_h)
    t = time.perf_counter()
    e_app = ev(load_mask(site_id))
    timing["events_per_skyline_s"] = time.perf_counter() - t
    e_adj, e_up, e_down = ev(adjusted), ev(adjusted + sigma), ev(adjusted - sigma)
    result = {
        "site": site_id,
        "members_per_length": members,
        "march_reproduces_stored_adjusted_skyline_max_abs_deg": round(check, 5),
        "sigma_deg": {"median": q(sigma, 50), "p95": q(sigma, 95)},
        "durations": {
            name: {k: round(e[k], 3) for k in ("sunlit_pct", "earth_pct", "longest_night_h")}
            for name, e in (("app", e_app), ("adjusted", e_adj), ("raised", e_up), ("lowered", e_down))
        },
        "kinds": {},
        "lengths": {},
    }
    # The first-order rule against the raised skyline: |shift| predicted as sigma at the crossing direction / |rate|.
    coherent_by_kind = {}
    for kind in KIND:
        tb, _, rb = of_kind(e_adj, kind)
        az = np.interp(tb, t_h, np.unwrap(np.radians(sun_az if KIND[kind][0] == "lit" else earth_az)))
        pred = mask_at_azimuth(sigma, np.degrees(az)) / np.abs(rb)
        up, down = shifts(e_adj, e_up, kind), shifts(e_adj, e_down, kind)
        coherent = np.fmax(np.abs(up), np.abs(down))
        # Only shifts of a minute or more say anything about the rule; smaller ones are below the one-minute step.
        big = (pred >= 1.0 / 60.0) | (np.nan_to_num(np.abs(up), nan=99.0) >= 1.0 / 60.0)
        with np.errstate(divide="ignore", invalid="ignore"):
            ratio = np.abs(up[big]) / pred[big]
        bad = ~np.isfinite(ratio) | (ratio > 2.0) | (ratio < 0.5)
        result["kinds"][kind] = {
            "events": int(tb.size),
            "coherent_pm_sigma_shift_h": {"median": q(coherent, 50), "p95": q(coherent, 95), "max": q(coherent, 100)},
            "lost_under_raised_or_lowered": int(np.sum(np.isnan(up) | np.isnan(down))),
            "first_order_rule": {
                "events_moving_a_minute_or_more": int(big.sum()),
                "actual_over_predicted_median": q(ratio, 50),
                "within_25pct": round(float(np.mean(np.abs(ratio - 1.0) <= 0.25)), 3) if ratio.size else None,
                "off_by_2x_or_lost": int(bad.sum()),
                "worst_actual_h_where_off": q(np.abs(up[big])[bad], 100) if bad.any() else None,
            },
        }
        coherent_by_kind[kind] = coherent
    for length, sks in skylines.items():
        arr = np.asarray(sks)
        per_az_sd = arr.std(axis=0)
        evs = [ev(m) for m in sks]
        entry = {
            "skyline_sd_over_sigma_median": round(float(np.median(per_az_sd / np.maximum(sigma, 1e-6))), 3),
            "skyline_mean_minus_adjusted_deg": {"median": q(arr.mean(axis=0) - adjusted, 50), "p95": q(arr.mean(axis=0) - adjusted, 95)},
            "sunlit_pct": [q([e["sunlit_pct"] for e in evs], 5), q([e["sunlit_pct"] for e in evs], 95)],
            "longest_night_h": [q([e["longest_night_h"] for e in evs], 5), q([e["longest_night_h"] for e in evs], 95)],
            "longest_night_changed_by_10pct_share": round(float(np.mean([abs(e["longest_night_h"] - e_adj["longest_night_h"]) > 0.1 * e_adj["longest_night_h"] for e in evs])), 3),
            "earth_pct": [q([e["earth_pct"] for e in evs], 5), q([e["earth_pct"] for e in evs], 95)],
            "kinds": {},
        }
        for kind in KIND:
            s = np.asarray([shifts(e_adj, e, kind) for e in evs])  # members x events
            lost = np.isnan(s)
            spread = np.nanpercentile(np.abs(s), 95, axis=0) if s.size else np.array([])
            sd = np.nanstd(s, axis=0) if s.size else np.array([])
            tb, _, rb = of_kind(e_adj, kind)
            az = np.interp(tb, t_h, np.unwrap(np.radians(sun_az if KIND[kind][0] == "lit" else earth_az)))
            pred_sd = mask_at_azimuth(per_az_sd, np.degrees(az)) / np.abs(rb)
            coh = coherent_by_kind[kind]
            moving = coh >= 1.0 / 60.0
            sdbig = pred_sd >= 1.0 / 60.0
            with np.errstate(divide="ignore", invalid="ignore"):
                sd_ratio = sd[sdbig] / pred_sd[sdbig]
                vs_coherent = spread[moving] / coh[moving]
            entry["kinds"][kind] = {
                "member_shift_p95_h": {"median_over_events": q(spread, 50), "p95_over_events": q(spread, 95), "max": q(spread, 100)},
                "member_p95_over_coherent_shift_median": q(vs_coherent, 50),
                "events_lost_in_some_member": int(np.sum(lost.any(axis=0))),
                "member_events_lost": int(lost.sum()),
                "first_order_sd_ratio": {"events": int(sdbig.sum()), "median": q(sd_ratio, 50), "within_25pct": round(float(np.mean(np.abs(sd_ratio - 1.0) <= 0.25)), 3) if sd_ratio.size else None},
            }
        result["lengths"][str(int(length))] = entry
    timing["total_s"] = time.perf_counter() - t_all
    result["timing_s"] = {k: round(v, 2) for k, v in timing.items()}
    return result


# ---------------------------------------------------------------- Diviner


COLUMNS = {  # 0-based start, width (from the product's PDS4 label)
    "v1": [(0, 12), (14, 12), (28, 12)],
    "v2": [(42, 12), (56, 12), (70, 12)],
    "v3": [(84, 12), (98, 12), (112, 12)],
    "clon": (126, 15),
    "clat": (143, 15),
    "tavg": (177, 8),
    "tmax": (187, 8),
    "ice_depth": (197, 11),
}


def parse_column(rows: np.ndarray, start: int, width: int) -> np.ndarray:
    block = np.ascontiguousarray(rows[:, start : start + width])
    text = np.concatenate([block, np.full((block.shape[0], 1), 32, np.uint8)], axis=1).tobytes().decode("ascii")
    return np.array(text.split(), dtype=np.float64)


def read_prp(zip_path: Path) -> tuple[dict, dict]:
    timing = {}
    t = time.perf_counter()
    with zipfile.ZipFile(zip_path) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".tab"))
        raw = z.read(name)
    timing["unzip_to_memory_s"] = time.perf_counter() - t
    t = time.perf_counter()
    rows = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 210)[1:]  # the first record is the header
    out = {}
    for k in ("clon", "clat", "tavg", "tmax", "ice_depth"):
        out[k] = parse_column(rows, *COLUMNS[k])
    v = [np.stack([parse_column(rows, s, w) for s, w in COLUMNS[k]], axis=1) for k in ("v1", "v2", "v3")]
    out["area_km2"] = 0.5 * np.linalg.norm(np.cross(v[1] - v[0], v[2] - v[0]), axis=1)
    timing["parse_s"] = time.perf_counter() - t
    timing["bytes_unzipped"] = len(raw)
    return out, timing


def run_diviner(zip_path: Path) -> dict:
    prp, timing = read_prp(zip_path)
    x, y = ps_south_xy_m(prp["clat"], prp["clon"])
    south = prp["clat"] < -80.0
    ice = prp["ice_depth"]
    doc = {
        "timing_s": {k: (round(v, 2) if isinstance(v, float) else v) for k, v in timing.items()},
        "triangles": int(prp["tmax"].size),
        "triangle_area_km2": {"median": q(prp["area_km2"], 50), "p05": q(prp["area_km2"], 5), "p95": q(prp["area_km2"], 95)},
        "south_of_80": {
            "area_km2": round(float(prp["area_km2"][south].sum()), 1),
            "tmax_below_110K_km2": round(float(prp["area_km2"][south & (prp["tmax"] < 110.0)].sum()), 1),
            "ice_stable_at_surface_km2": round(float(prp["area_km2"][south & (ice == 0.0)].sum()), 1),
            "ice_stable_within_0p5m_km2": round(float(prp["area_km2"][south & (ice >= 0.0) & (ice <= 0.5)].sum()), 1),
            "tmax_below_100K_km2": round(float(prp["area_km2"][south & (prp["tmax"] < 100.0)].sum()), 1),
            "tmax_below_120K_km2": round(float(prp["area_km2"][south & (prp["tmax"] < 120.0)].sum()), 1),
            "tmax_K_min": q(prp["tmax"][south], 0),
        },
        "sites": [],
    }
    win_dir = config.RAW_DIR / "pgda90" / "windows"
    for site in [s for s in all_sites() if s.polar]:
        sx, sy = ps_south_xy_m(site.lat, site.lon)
        d = np.hypot(x - sx, y - sy)
        near10, near5 = d <= 10_000.0, d <= 5_000.0
        entry = {
            "site": site.id,
            "tmax_at_site_K": round(float(prp["tmax"][np.argmin(d)]), 1),
            "coldest_tmax_within_10km_K": round(float(prp["tmax"][near10].min()), 1) if near10.any() else None,
            "tmax_below_110K_within_5km_km2": round(float(prp["area_km2"][near5 & (prp["tmax"] < 110.0)].sum()), 2),
            "ice_at_surface_within_5km_km2": round(float(prp["area_km2"][near5 & (ice == 0.0)].sum()), 2),
            "ice_within_0p5m_within_5km_km2": round(float(prp["area_km2"][near5 & (ice >= 0.0) & (ice <= 0.5)].sum()), 2),
        }
        psr_path = win_dir / f"psr20_{site.lat:+.5f}_{site.lon:+.5f}_10000m.npz"
        if psr_path.exists():
            z = np.load(psr_path)
            data, x0, y0, sc = z["data"], float(z["x0"]), float(z["y0"]), float(z["scale"])
            rr, cc = np.mgrid[0 : data.shape[0] : 5, 0 : data.shape[1] : 5]  # every 100 m
            px, py = x0 + (cc + 0.5) * sc, y0 - (rr + 0.5) * sc
            inside = np.hypot(px - sx, py - sy) <= 5_000.0
            flag = np.nan_to_num(data[rr, cc]) > 0.5
            entry["psr_within_5km_km2"] = round(float((flag & inside).sum()) * (5 * sc) ** 2 / 1e6, 2)
            # Is permanently shadowed ground cold in Diviner's model? Nearest triangle centre of each shadowed sample.
            cand = np.flatnonzero(near10)
            ps = np.flatnonzero((flag & inside).ravel())
            if ps.size and cand.size:
                qx, qy = px.ravel()[ps], py.ravel()[ps]
                best = np.empty(ps.size, dtype=np.int64)
                for i in range(0, ps.size, 4000):
                    dd = (qx[i : i + 4000, None] - x[cand][None, :]) ** 2 + (qy[i : i + 4000, None] - y[cand][None, :]) ** 2
                    best[i : i + 4000] = cand[np.argmin(dd, axis=1)]
                entry["psr_samples_with_tmax_below_110K"] = round(float(np.mean(prp["tmax"][best] < 110.0)), 3)
            # And is cold ground shadowed? The 20 m pixel under each cold triangle centre within 5 km.
            cold = np.flatnonzero(near5 & (prp["tmax"] < 110.0))
            if cold.size:
                c = np.clip(((x[cold] - x0) / sc).astype(int), 0, data.shape[1] - 1)
                r = np.clip(((y0 - y[cold]) / sc).astype(int), 0, data.shape[0] - 1)
                entry["cold_triangles_in_psr"] = round(float(np.mean(np.nan_to_num(data[r, c]) > 0.5)), 3)
        doc["sites"].append(entry)
    return doc


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("ensemble")
    e.add_argument("--site", default="connecting_ridge")
    e.add_argument("--members", type=int, default=20)
    e.add_argument("--lengths", type=float, nargs="+", default=[250.0, 2500.0])
    e.add_argument("--seed", type=int, default=1)
    d = sub.add_parser("diviner")
    d.add_argument("--zip", type=Path, required=True)
    a = ap.parse_args()
    doc = run_ensemble(a.site, a.members, a.lengths, a.seed) if a.cmd == "ensemble" else run_diviner(a.zip)
    print(json.dumps(doc, indent=1))


if __name__ == "__main__":
    main()
