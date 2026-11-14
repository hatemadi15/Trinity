"""How far the app's event times and durations can be off, with the three sources kept apart.

The app samples the sky once an hour and reports an event at the first hourly sample in the new state.
- Sampling: the same events are found at one-minute steps, from SPICE positions at every minute (DE440,
  the app's frame and light-time correction, no interpolation), with the same skyline and the same lander
  model. The hourly time minus the one-minute time is the sampling error of each event.
- Terrain: the skyline is traced again through the adjusted LOLA models of PGDA product 90 (Barker et al.
  2023) with the app's method and bands, and that skyline is raised and lowered by the product's own height
  error at the skyline and at the site. The one-minute event times under those skylines, minus the times
  under the app's skyline, are the terrain spread.
- Ephemeris: the largest gap to JPL Horizons (data/validation/horizons.json), as a height, divided by the
  rate at which the body's height above the skyline changes at each event, is the ephemeris error in time.

A supported plus-or-minus adds the three 95th percentiles: the sources are not independent Gaussians (the
sampling error is one-sided and the terrain spread is not symmetric), so they are added, not root-summed.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from . import config
from .config import AU_KM, R_MOON_M
from .geometry import azel_from_body_vectors, enu_basis, site_vector_km
from .horizon import Band, mask_at_azimuth
from .illumination import disk_fraction, hourly_series, sun_radius_deg
from .power import PowerConfig, config_dict, power_series

OUT_DIR = config.DATA_DIR / "uncertainty"
SPAN_START = "2025-01-01T00:00:00"
SPAN_DAYS = 730
FINE_STEP_S = 60.0
EVENT_KINDS = ("sunset", "sunrise", "earthset", "earthrise", "battery_out", "power_back")
# Which flag each event changes, and in which direction (-1: on to off, +1: off to on).
EVENT_FLAG = {
    "sunset": ("lit", -1),
    "sunrise": ("lit", 1),
    "earthset": ("earth", -1),
    "earthrise": ("earth", 1),
    "battery_out": ("powered", -1),
    "power_back": ("powered", 1),
}
SAMPLING_WINDOW_H = 3.0  # an hourly event and the one-minute event it stands for are never further apart
TERRAIN_WINDOW_H = 24.0  # beyond this the other skyline has no such event: it appears or vanishes with the terrain
# The four conditions the review asks for, and the site that stands for each.
REPRESENTATIVE = {
    "connecting_ridge": "a grazing Sun at a polar ridge",
    "shackleton_center_rim_high": "a crater-rim high point",
    "im2_athena": "Earth skimming the horizon",
    "blue_ghost_m1": "far from the pole, flat horizon",
}


# ---------------------------------------------------------------- events


def flag_changes(flags, t_h) -> tuple[np.ndarray, np.ndarray]:
    """Times of the first sample in a new state, and the direction of each change (+1 on, -1 off)."""
    f = np.asarray(flags, dtype=bool)
    t = np.asarray(t_h, dtype=np.float64)
    idx = np.flatnonzero(f[1:] != f[:-1]) + 1
    return t[idx], np.where(f[idx], 1, -1)


def sign_changes(margin, t_h) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Where `margin` crosses zero (on means margin > 0): times refined linearly between samples, directions and rates (per hour)."""
    m = np.asarray(margin, dtype=np.float64)
    t = np.asarray(t_h, dtype=np.float64)
    on = m > 0.0
    idx = np.flatnonzero(on[1:] != on[:-1]) + 1
    m0, m1 = m[idx - 1], m[idx]
    dt = t[idx] - t[idx - 1]
    denom = np.where(m0 == m1, 1.0, m0 - m1)
    frac = np.clip(m0 / denom, 0.0, 1.0)
    return t[idx - 1] + frac * dt, np.where(on[idx], 1, -1), (m1 - m0) / dt


def match_offsets(t_a, dir_a, t_b, dir_b, window_h: float) -> np.ndarray:
    """For each event of `a`, its time minus the nearest event of `b` in the same direction; NaN when none lies within the window."""
    t_a = np.asarray(t_a, dtype=np.float64)
    out = np.full(t_a.shape, np.nan)
    for d in (-1, 1):
        sel = np.flatnonzero(np.asarray(dir_a) == d)
        tb = np.sort(np.asarray(t_b, dtype=np.float64)[np.asarray(dir_b) == d])
        if not sel.size or not tb.size:
            continue
        ta = t_a[sel]
        j = np.searchsorted(tb, ta)
        lo = tb[np.clip(j - 1, 0, tb.size - 1)]
        hi = tb[np.clip(j, 0, tb.size - 1)]
        near = np.where(np.abs(ta - lo) <= np.abs(ta - hi), lo, hi)
        off = ta - near
        out[sel] = np.where(np.abs(off) <= window_h, off, np.nan)
    return out


def stats(values) -> dict:
    """Plain numbers for a set of offsets in hours: count, median, 5th and 95th percentiles, the 95th percentile and largest of their size."""
    v = np.asarray(values, dtype=np.float64)
    v = v[np.isfinite(v)]
    if not v.size:
        return {"n": 0, "median_h": None, "p05_h": None, "p95_h": None, "p95_abs_h": None, "max_abs_h": None}
    a = np.abs(v)
    return {
        "n": int(v.size),
        "median_h": round(float(np.median(v)), 4),
        "p05_h": round(float(np.percentile(v, 5)), 4),
        "p95_h": round(float(np.percentile(v, 95)), 4),
        "p95_abs_h": round(float(np.percentile(a, 95)), 4),
        "max_abs_h": round(float(a.max()), 4),
    }


def powered_flags(power_w, cfg: PowerConfig, dt_h: float) -> np.ndarray:
    """The app's battery walk at any step: 1 while the lander has power, 0 for each step the deficit exceeds the stored energy."""
    p = np.asarray(power_w, dtype=np.float64)
    cap = max(0.0, cfg.battery_wh)
    e = min(cap, max(0.0, cfg.initial_soc_fraction) * cap)
    out = np.ones(p.size, dtype=bool)
    load = cfg.load_w
    for i in range(p.size):
        nxt = e + (p[i] - load) * dt_h
        if nxt < 0.0:
            out[i] = False
            nxt = 0.0
        e = nxt if nxt < cap else cap
    return out


def longest_run_h(flags, step_h: float) -> float:
    """The longest run of True samples, in hours."""
    f = np.asarray(flags, dtype=bool)
    if not f.any():
        return 0.0
    edges = np.diff(np.concatenate([[0], f.astype(np.int8), [0]]))
    starts, ends = np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)
    return float((ends - starts).max()) * step_h


def short_episodes(flags, step_h: float, shorter_than_h: float = 1.0) -> dict:
    """Runs of either state shorter than `shorter_than_h`: those an hourly series can skip. Count and total hours of each."""
    f = np.asarray(flags, dtype=bool)
    out = {}
    for name, state in (("on", True), ("off", False)):
        g = f == state
        edges = np.diff(np.concatenate([[0], g.astype(np.int8), [0]]))
        starts, ends = np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)
        # A run that touches either end of the span is cut short by the span, not by the sky.
        inner = (starts > 0) & (ends < f.size)
        n = (ends - starts)[inner] * step_h
        short = n[n < shorter_than_h]
        out[name] = {"count": int(short.size), "hours": round(float(short.sum()), 3)}
    return out


# ---------------------------------------------------------------- sky at any step


def sky(vectors: np.ndarray, lat: float, lon: float, mask: np.ndarray, min_earth_el_deg: float = 0.0) -> dict:
    """The app's sky at each sample of `vectors` ((n, 2, 3) km, Sun then Earth, MOON_ME from the Moon's centre)."""
    sun, earth = vectors[:, 0, :], vectors[:, 1, :]
    sun_az, sun_el = azel_from_body_vectors(sun, lat, lon, 0.0)
    earth_az, earth_el = azel_from_body_vectors(earth, lat, lon, 0.0)
    dist = np.linalg.norm(sun, axis=1)
    radius = sun_radius_deg(dist)
    centre = sun_el - mask_at_azimuth(mask, sun_az)
    return {
        "sun_az": sun_az,
        "sun_el": sun_el,
        "sun_au": dist / AU_KM,
        "sun_fraction": disk_fraction(centre, radius),
        # Any part of the Sun above the skyline: the upper limb's height above it is positive.
        "sun_limb": centre + radius,
        "earth_margin": earth_el - mask_at_azimuth(mask, earth_az) - min_earth_el_deg,
    }


def fine_vectors(start_utc: str, n: int, step_s: float = FINE_STEP_S, kernel_dir: Path = config.KERNEL_DIR) -> np.ndarray:
    """SPICE positions of the Sun and Earth seen from the Moon's centre every `step_s` seconds, as the hourly table is made."""
    import spiceypy as spice

    from .ephemeris import ABCORR, BODIES, FRAME
    from .spice_env import spice_kernels

    out = np.empty((n, 2, 3), dtype=np.float64)
    with spice_kernels(kernel_dir):
        et0 = spice.str2et(start_utc)
        ets = et0 + np.arange(n, dtype=np.float64) * step_s
        chunk = 100_000
        for b, body in enumerate(BODIES):
            for i in range(0, n, chunk):
                pos, _lt = spice.spkpos(body, ets[i : i + chunk], FRAME, ABCORR, "MOON")
                out[i : i + chunk, b, :] = pos
    return out


def table_rounding_deg(fine: np.ndarray, table: np.ndarray, per_hour: int) -> dict:
    """Largest angle between the hourly table's float32 rows and the one-minute SPICE positions at the same hours."""
    at_hours = fine[::per_hour][: table.shape[0]]
    rows = table[: at_hours.shape[0]].astype(np.float64)
    out = {}
    for b, name in ((0, "sun"), (1, "earth")):
        u = at_hours[:, b, :] / np.linalg.norm(at_hours[:, b, :], axis=1, keepdims=True)
        v = rows[:, b, :] / np.linalg.norm(rows[:, b, :], axis=1, keepdims=True)
        ang = np.degrees(np.arccos(np.clip(np.sum(u * v, axis=1), -1.0, 1.0)))
        out[name] = float(ang.max())
    return out


# ---------------------------------------------------------------- skylines


@dataclass(frozen=True)
class Profile:
    """A skyline with, for each azimuth, how far away the point that makes it lies and where that point is."""

    elevation_deg: np.ndarray
    distance_m: np.ndarray
    lat_deg: np.ndarray
    lon_deg: np.ndarray


def horizon_profile(lat_deg: float, lon_deg: float, bands: list[Band], site_height_m: float, n_az: int = 720, mast_m: float = 2.0) -> Profile:
    """horizon.horizon_mask's march, keeping the distance and place of the highest sample in each direction."""
    r_o = R_MOON_M + site_height_m + mast_m
    p = site_vector_km(lat_deg, lon_deg)
    p_hat = p / np.linalg.norm(p)
    east, north, _up = enu_basis(lat_deg, lon_deg)
    az = np.radians(np.arange(n_az) * (360.0 / n_az))
    t_hat = np.cos(az)[:, None] * north[None, :] + np.sin(az)[:, None] * east[None, :]
    best = np.full(n_az, -90.0)
    dist = np.zeros(n_az)
    plat = np.full(n_az, lat_deg)
    plon = np.full(n_az, lon_deg)
    for band in bands:
        d = np.arange(band.r_min_m, band.r_max_m, band.step_m, dtype=np.float64)
        delta = d / R_MOON_M
        cos_d, sin_d = np.cos(delta), np.sin(delta)
        q = cos_d[None, :, None] * p_hat[None, None, :] + sin_d[None, :, None] * t_hat[:, None, :]
        lat_q = np.degrees(np.arcsin(np.clip(q[..., 2], -1.0, 1.0)))
        lon_q = np.degrees(np.arctan2(q[..., 1], q[..., 0]))
        h = band.grid.value_bilinear(*band.grid.pixel_from_latlon(lat_q, lon_q))
        r_t = R_MOON_M + h
        el = np.degrees(np.arctan2(r_t * cos_d[None, :] - r_o, r_t * sin_d[None, :]))
        el = np.where(np.isnan(el), -90.0, el)
        k = el.argmax(axis=1)
        top = el[np.arange(n_az), k]
        better = top > best
        best = np.where(better, top, best)
        dist = np.where(better, d[k], dist)
        plat = np.where(better, lat_q[np.arange(n_az), k], plat)
        plon = np.where(better, lon_q[np.arange(n_az), k], plon)
    return Profile(best, dist, plat, plon)


def skyline_error_deg(profile: Profile, err_at, site_err_m: float) -> np.ndarray:
    """One-sigma error of the skyline in each direction: the height errors at the skyline point and at the site, over its distance.

    `err_at(lat, lon)` gives the stated height error (m) at points; where it has none the median of the others is used.
    """
    err = np.asarray(err_at(profile.lat_deg, profile.lon_deg), dtype=np.float64)
    if np.all(np.isnan(err)):
        err = np.zeros_like(err)
    err = np.where(np.isnan(err), np.nanmedian(err), err)
    sigma_m = np.sqrt(err**2 + float(site_err_m) ** 2)
    return np.degrees(np.arctan2(sigma_m, np.maximum(profile.distance_m, 1.0)))


# ---------------------------------------------------------------- per-site budget


def fine_events(sk: dict, powered: np.ndarray, t_h: np.ndarray) -> dict:
    """Every event at the fine step: crossing times (h) refined between samples, directions and the rate of the crossing."""
    out = {}
    t, d, r = sign_changes(sk["sun_limb"], t_h)
    out["lit"] = (t, d, r)
    t, d, r = sign_changes(sk["earth_margin"], t_h)
    out["earth"] = (t, d, r)
    t, d = flag_changes(powered, t_h)
    out["powered"] = (t, d, np.full(t.shape, np.nan))
    return out


def hourly_events(series: dict, powered: np.ndarray) -> dict:
    t = np.arange(len(series["sun_fraction"]), dtype=np.float64)
    return {
        "lit": flag_changes(np.asarray(series["sun_fraction"]) > 0.0, t),
        "earth": flag_changes(series["earth_visible"], t),
        "powered": flag_changes(powered, t),
    }


def _of_kind(events: dict, kind: str):
    flag, direction = EVENT_FLAG[kind]
    ev = events[flag]
    sel = ev[1] == direction
    return tuple(x[sel] for x in ev)


def sampling_offsets(hourly: dict, fine: dict, kind: str) -> np.ndarray:
    """The hourly time of each event minus the one-minute time of the same event (hours)."""
    th, dh = _of_kind(hourly, kind)[:2]
    tf, df = _of_kind(fine, kind)[:2]
    return match_offsets(th, dh, tf, df, SAMPLING_WINDOW_H)


def terrain_offsets(base: dict, others: list[dict], kind: str) -> tuple[np.ndarray, int]:
    """For each event under the app's skyline, the largest shift under any other skyline, and how many events another skyline loses."""
    tb, db = _of_kind(base, kind)[:2]
    worst = np.zeros(tb.shape)
    lost = np.zeros(tb.shape, dtype=bool)
    for other in others:
        to, do = _of_kind(other, kind)[:2]
        off = -match_offsets(tb, db, to, do, TERRAIN_WINDOW_H)  # the other skyline's time minus the app's
        lost |= np.isnan(off)
        worst = np.where(np.abs(np.nan_to_num(off)) > np.abs(worst), np.nan_to_num(off), worst)
    return np.where(lost, np.nan, worst), int(lost.sum())


VERSIONS_LOST_SHARE = 0.05  # an event lost in more than one version in twenty is counted as lost by the versions


def version_offsets(base: dict, versions: list[dict], kind: str) -> tuple[np.ndarray, int]:
    """For each event under the app's skyline, the 95th percentile of its shift over the terrain versions that keep it
    (signed as that version's shift; NaN when most versions lose it), and how many events more than one version in
    twenty loses. A lost event is a different outcome, not a shift, so it is counted apart and never narrows a margin."""
    tb, db = _of_kind(base, kind)[:2]
    if not versions or not tb.size:
        return np.zeros(tb.shape), 0
    shifts = np.stack([-match_offsets(tb, db, *_of_kind(v, kind)[:2], TERRAIN_WINDOW_H) for v in versions])  # versions x events
    gone = np.isnan(shifts)
    out = np.full(tb.shape, np.nan)
    for j in np.flatnonzero(gone.mean(axis=0) <= 0.5):
        s = shifts[:, j][~gone[:, j]]
        size = np.percentile(np.abs(s), 95)
        out[j] = s[np.argmin(np.abs(np.abs(s) - size))]
    return out, int(np.sum(gone.mean(axis=0) > VERSIONS_LOST_SHARE))


def combine_offsets(skylines: tuple[np.ndarray, int], versions: tuple[np.ndarray, int]) -> tuple[np.ndarray, int]:
    """The terrain spread of each event with the versions' added: the versions' shift where it is the larger, the three
    skylines' everywhere else, so the versions only ever widen it; an event the skylines lose stays lost, and the count
    of lost events stays theirs (the versions' own count is reported beside it)."""
    s, lost = skylines
    v = versions[0]
    out = np.array(s, dtype=np.float64)
    take = np.isfinite(s) & np.isfinite(v) & (np.abs(v) > np.abs(s))
    out[take] = v[take]
    return out, lost


def ephemeris_seconds(rates_per_h: np.ndarray, angle_deg: float) -> dict:
    """The largest gap to Horizons as a time at each crossing: angle over the rate of the height above the skyline."""
    r = np.abs(np.asarray(rates_per_h, dtype=np.float64))
    r = r[np.isfinite(r) & (r > 0)]
    if not r.size:
        return {"n": 0, "p95_s": None, "max_s": None}
    s = angle_deg / r * 3600.0
    return {"n": int(s.size), "p95_s": round(float(np.percentile(s, 95)), 3), "max_s": round(float(s.max()), 3)}


def plus_minus_h(sampling: dict, terrain: dict | None, ephemeris: dict, terrain_floor_h: float = 0.0) -> float | None:
    """The supported plus-or-minus: the three 95th percentiles added (hours), or None when the event never happens."""
    if not sampling["n"]:
        return None
    t = terrain["p95_abs_h"] if terrain and terrain.get("p95_abs_h") is not None else 0.0
    e = (ephemeris["p95_s"] or 0.0) / 3600.0
    return round(float(sampling["p95_abs_h"]) + max(float(t), terrain_floor_h) + e, 3)


def event_budget(hourly: dict, fine: dict, others: list[dict], kind: str, angle_deg: float, terrain_floor_h: float = 0.0, versions: list[dict] | None = None) -> dict:
    """One event kind at one site: the sampling error, the terrain spread and the ephemeris error, then their sum.

    `others` are the one-minute events under the other skylines; with none, the terrain is not measured and
    `terrain_floor_h` stands for it (a flat horizon's stated allowance). `versions`, the events under the terrain
    versions, widen the terrain spread of each event to their 95th percentile shift where that is larger.
    """
    sampling = stats(sampling_offsets(hourly, fine, kind))
    terrain = None
    if others:
        off, lost = terrain_offsets(fine, others, kind)
        if versions:
            v_off, v_lost = version_offsets(fine, versions, kind)
            skylines = {**stats(off), "lost": lost}
            off, lost = combine_offsets((off, lost), (v_off, v_lost))
            terrain = {**stats(off), "lost": lost, "skylines": skylines, "versions": {**stats(v_off), "lost": v_lost, "of": len(versions)}}
        else:
            terrain = {**stats(off), "lost": lost}
    flag = EVENT_FLAG[kind][0]
    # The battery's times follow the Sun's: its crossings carry the rate at which the planets' tables move them.
    rates = fine["lit"][2] if flag == "powered" else _of_kind(fine, kind)[2]
    ephemeris = ephemeris_seconds(rates, angle_deg)
    pm = plus_minus_h(sampling, terrain, ephemeris, terrain_floor_h)
    return {"sampling": sampling, "terrain": terrain, "ephemeris": ephemeris, "plus_minus_h": pm, "shown_h": ceil_half(pm)}


def horizon_difference(other_deg, base_deg) -> dict:
    """One skyline minus another, over all directions (degrees)."""
    d = np.asarray(other_deg, dtype=np.float64) - np.asarray(base_deg, dtype=np.float64)
    a = np.abs(d)
    return {
        "mean_deg": round(float(d.mean()), 4),
        "p95_abs_deg": round(float(np.percentile(a, 95)), 4),
        "max_abs_deg": round(float(a.max()), 4),
    }


def duration_metrics(lit, earth, powered, step_h: float) -> dict:
    return {
        "sunlit_pct": round(100.0 * float(np.mean(lit)), 3),
        "earth_pct": round(100.0 * float(np.mean(earth)), 3),
        "powered_pct": round(100.0 * float(np.mean(powered)), 3),
        "longest_night_h": round(longest_run_h(~np.asarray(lit, bool), step_h), 3),
        "longest_earth_gap_h": round(longest_run_h(~np.asarray(earth, bool), step_h), 3),
    }


def first_run_h(flags, step_h: float) -> float:
    """Hours from the start of the span to the first sample without power (the app's "time with power")."""
    f = np.asarray(flags, dtype=bool)
    off = np.flatnonzero(~f)
    return float(off[0]) * step_h if off.size else float(f.size) * step_h


def iso(start_utc: str, hours: float) -> str:
    t = datetime.fromisoformat(start_utc).replace(tzinfo=timezone.utc) + timedelta(hours=float(hours))
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ceil_half(h: float | None) -> float | None:
    """Up to the next half hour, and never under half an hour: the plus-or-minus the app shows."""
    return None if h is None else max(0.5, math.ceil(h * 2.0 - 1e-9) / 2.0)


def skyline_doc(site_id: str, adjusted_deg, sigma_deg, site_height_m: float, mast_m: float = 2.0) -> dict:
    """The other skylines of a site in the app's mask layout: product 90's, and it raised and lowered by one stated error."""
    a = np.asarray(adjusted_deg, dtype=np.float64)
    s = np.asarray(sigma_deg, dtype=np.float64)
    r = lambda v: [round(float(x), 3) for x in v]
    return {
        "site_id": site_id,
        "n_az": int(a.size),
        "az0_deg": 0.0,
        "az_step_deg": 360.0 / a.size,
        "mast_m": mast_m,
        "site_height_adjusted_m": round(float(site_height_m), 2),
        "source": "PGDA product 90 adjusted LOLA models (Barker et al. 2023); raised and lowered by the ERR maps at the skyline and the site",
        "adjusted_deg": r(a),
        "raised_deg": r(a + s),
        "lowered_deg": r(a - s),
    }


def write_doc(doc: dict, out_dir: Path = OUT_DIR, name: str = "budget.json") -> Path:
    """The budget as budget.json, and each site's other skylines as skylines/<site>.json beside it."""
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = dict(doc)
    skylines = doc.pop("skylines", {})
    for site_id, sky_doc in skylines.items():
        (out_dir / "skylines").mkdir(exist_ok=True)
        (out_dir / "skylines" / f"{site_id}.json").write_text(json.dumps(sky_doc) + "\n", encoding="utf-8", newline="\n")
    path = out_dir / name
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return path




# ---------------------------------------------------------------- terrain from PGDA product 90


INNER_HALF_M = 6_500.0  # the app's 20 m band reaches 6 km; the window keeps a margin for the bilinear step
POINT_HALF_M = 200.0
PSR_HALF_M = 10_000.0


def terrain_quality(lat: float, lon: float, read=None) -> dict | None:
    """The ground at a site from product 90: height error, effective resolution, slope and its error, 100 m roughness, nearest permanent shadow.

    None north of 80 S, where product 90's 20 m and 50 m maps of the ground end.
    """
    from .pgda90 import read_window

    if lat > -80.0:
        return None
    read = read or read_window

    def at(product: str, half: float = POINT_HALF_M) -> float | None:
        v = read(product, lat, lon, half).grid().value_at(lat, lon)
        return None if v is None or not np.isfinite(v) else round(float(v), 3)

    out = {
        "height_error_m": at("err20"),
        "effective_resolution_m": at("effres20"),
        "slope_deg": at("slope20"),
        "slope_error_deg": at("slope_err20"),
        "roughness_100m_m": at("rough100", 300.0),
    }
    psr = read("psr20", lat, lon, PSR_HALF_M)
    out["nearest_psr_km"] = nearest_flag_km(psr.data, psr.x0_m, psr.y0_m, psr.scale_m, lat, lon)
    out["psr_search_km"] = PSR_HALF_M / 1000.0
    return out


def nearest_flag_km(data: np.ndarray, x0_m: float, y0_m: float, scale_m: float, lat: float, lon: float) -> float | None:
    """Distance (km) from the site to the centre of the nearest flagged pixel of a window; None when the window has none."""
    from .geometry import ps_south_xy_m

    rows, cols = np.nonzero(np.nan_to_num(data) > 0.5)
    if not rows.size:
        return None
    x, y = ps_south_xy_m(lat, lon)
    px = x0_m + (cols + 0.5) * scale_m
    py = y0_m - (rows + 0.5) * scale_m
    return round(float(np.hypot(px - float(x), py - float(y)).min()) / 1000.0, 3)


def adjusted_grids(site, adj80, adj240, read=None) -> dict:
    """The app's bands with product 90's grids in place of LOLA's: the 20 m model near the deepest sites, then 80 m and 240 m."""
    from .pgda90 import read_window

    read = read or read_window
    inner = read("dem20", site.lat, site.lon, INNER_HALF_M).grid() if site.lat <= -87.55 else adj80
    return {"L0": inner, "L1": adj80, "L2": adj240}


def adjusted_profile(site, grids: dict, mast_m: float = 2.0, n_az: int = 720) -> tuple[Profile, float]:
    from .horizon import site_height_m
    from .masks import bands_for_site, fallback_bands

    bands = bands_for_site(site, grids)
    bands = bands + fallback_bands(site, bands, grids, n_az=n_az)
    h = site_height_m(site.lat, site.lon, [b.grid for b in bands])
    return horizon_profile(site.lat, site.lon, bands, h, n_az=n_az, mast_m=mast_m), h


def error_lookup(grids: list):
    """Height error (m) at points from the first grid that has a value there."""

    def at(lat, lon):
        lat = np.asarray(lat, dtype=np.float64)
        lon = np.asarray(lon, dtype=np.float64)
        out = np.full(lat.shape, np.nan)
        for g in grids:
            miss = np.isnan(out)
            if not miss.any():
                break
            out[miss] = g.value_at(lat[miss], lon[miss])
        return out

    return at


# ---------------------------------------------------------------- the whole budget


def horizons_angles(path: Path = config.DATA_DIR / "validation" / "horizons.json") -> dict:
    """The largest gaps to JPL Horizons for each body, height plus direction (degrees): the ephemeris error the budget carries."""
    doc = json.loads(path.read_text())
    out = {}
    for body in ("SUN", "EARTH"):
        rows = [s for s in doc["sites"] if s["body"] == body]
        el = max(s["max_abs_delta_el_deg"] for s in rows)
        az = max(s["max_abs_delta_az_cos_el_deg"] for s in rows)
        out[body.lower()] = {"el_deg": el, "az_cos_el_deg": az, "angle_deg": el + az, "rows": sum(s["n_rows"] for s in rows)}
    return out


def _flags(sk: dict, cfg: PowerConfig, step_h: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    lit = np.asarray(sk["sun_fraction"]) > 0.0
    earth = np.asarray(sk["earth_margin"]) > 0.0
    powered = powered_flags(power_series(sk, cfg), cfg, step_h)
    return lit, earth, powered


def site_budget(
    site,
    vectors: np.ndarray,
    hourly: dict,
    app_mask: np.ndarray,
    others: dict[str, np.ndarray],
    cfg: PowerConfig,
    step_s: float,
    angles: dict,
    terrain_floor_h: float = 0.0,
    versions: np.ndarray | None = None,
) -> dict:
    """Every event kind and duration at one site, from the hourly series, the one-minute sky, the other skylines and the terrain versions."""
    step_h = step_s / 3600.0
    per_hour = int(round(3600.0 / step_s))
    t_fine = np.arange(vectors.shape[0], dtype=np.float64) * step_h
    hp = powered_flags(power_series(hourly, cfg), cfg, 1.0)
    h_ev = hourly_events(hourly, hp)
    sk = sky(vectors, site.lat, site.lon, app_mask)
    lit, earth, powered = _flags(sk, cfg, step_h)
    f_ev = fine_events(sk, powered, t_fine)
    other_ev: list[dict] = []
    other_dur: dict[str, dict] = {}
    for name, mask in others.items():
        sk_o = sky(vectors, site.lat, site.lon, mask)
        lit_o, earth_o, pow_o = _flags(sk_o, cfg, step_h)
        other_ev.append(fine_events(sk_o, pow_o, t_fine))
        other_dur[name] = duration_metrics(lit_o, earth_o, pow_o, step_h)
    version_ev: list[dict] = []
    version_dur: list[dict] = []
    for mask in versions if versions is not None else []:
        sk_v = sky(vectors, site.lat, site.lon, mask)
        lit_v, earth_v, pow_v = _flags(sk_v, cfg, step_h)
        version_ev.append(fine_events(sk_v, pow_v, t_fine))
        version_dur.append(duration_metrics(lit_v, earth_v, pow_v, step_h))
    events = {}
    for kind in EVENT_KINDS:
        angle = angles["earth" if EVENT_FLAG[kind][0] == "earth" else "sun"]["angle_deg"]
        events[kind] = event_budget(h_ev, f_ev, other_ev, kind, angle, terrain_floor_h, version_ev)
    h_lit = np.asarray(hourly["sun_fraction"]) > 0.0
    h_earth = np.asarray(hourly["earth_visible"], dtype=bool)
    hours = h_lit.size
    fine_dur = duration_metrics(lit, earth, powered, step_h)
    durations = {"hourly": duration_metrics(h_lit, h_earth, hp, 1.0), "fine": fine_dur, "other_skylines": other_dur}
    if other_dur:
        durations["terrain_max_abs"] = {k: round(max(abs(d[k] - fine_dur[k]) for d in other_dur.values()), 3) for k in fine_dur}
    if version_dur:
        # Each duration over the versions: its 5th, 50th and 95th percentiles, and the 95th of its change from the app's.
        durations["versions"] = {
            k: {"p05": round(float(np.percentile([d[k] for d in version_dur], 5)), 3), "median": round(float(np.median([d[k] for d in version_dur])), 3),
                "p95": round(float(np.percentile([d[k] for d in version_dur], 95)), 3), "p95_abs_change": round(float(np.percentile([abs(d[k] - fine_dur[k]) for d in version_dur], 95)), 3)}
            for k in fine_dur
        }
        durations["versions_count"] = len(version_dur)
    agreement = {
        "lit": float(np.mean(lit[::per_hour][:hours] == h_lit)),
        "earth": float(np.mean(earth[::per_hour][:hours] == h_earth)),
    }
    return {"events": events, "durations": durations, "hour_agreement": agreement, "short_episodes": {"sun": short_episodes(lit, step_h), "earth": short_episodes(earth, step_h)}}


def _pooled(entries: list[dict], kinds=EVENT_KINDS) -> dict:
    """Across sites: the largest shown plus-or-minus of each event kind, for points the budget has not measured."""
    out = {}
    for kind in kinds:
        vals = [e["events"][kind]["shown_h"] for e in entries if e["events"][kind]["shown_h"] is not None]
        med = [e["events"][kind]["plus_minus_h"] for e in entries if e["events"][kind]["plus_minus_h"] is not None]
        out[kind] = {"sites": len(vals), "largest_shown_h": max(vals) if vals else None, "median_plus_minus_h": round(float(np.median(med)), 3) if med else None}
    return out


def build(
    site_ids: list[str] | None = None,
    start_utc: str = SPAN_START,
    days: int = SPAN_DAYS,
    step_s: float = FINE_STEP_S,
    cfg: PowerConfig | None = None,
    kernel_dir: Path = config.KERNEL_DIR,
) -> dict:
    """The uncertainty budget for every featured site (or `site_ids`) over `days` from `start_utc`."""
    from .ephemeris import load_table
    from .masks import load_mask
    from .pgda90 import (
        CITATION,
        FULL_FILES,
        LISTED_SIZE,
        WINDOW_FILES,
        full_path,
        grid_from_geotiff,
        url_for,
    )
    from .sites import all_sites
    from .spice_env import spice_kernels, utc_to_et

    cfg = cfg or PowerConfig()
    sites = [s for s in all_sites() if (s.polar or s.id == "blue_ghost_m1") and (site_ids is None or s.id in site_ids)]
    n = int(round(days * 86400.0 / step_s))
    hours = days * 24
    print(f"[uncertainty] SPICE positions every {step_s:.0f} s for {days} days ({n} epochs)", flush=True)
    vectors = fine_vectors(start_utc, n, step_s, kernel_dir)
    table, header = load_table()
    with spice_kernels(kernel_dir):
        i0 = int(round((utc_to_et(start_utc) - header["t0_et"]) / header["step_s"]))
    rounding = table_rounding_deg(vectors, table[i0 : i0 + hours], int(round(3600.0 / step_s)))
    angles = horizons_angles()
    print("[uncertainty] loading product 90 grids", flush=True)
    adj80 = grid_from_geotiff(full_path("dem80"))
    adj240 = grid_from_geotiff(full_path("dem240"))
    err80 = grid_from_geotiff(full_path("err80"))
    err240 = grid_from_geotiff(full_path("err240"))
    entries = []
    skylines: dict[str, dict] = {}
    for site in sites:
        print(f"[uncertainty] {site.id}", flush=True)
        app_mask = load_mask(site.id) if site.polar else np.zeros(720)
        hourly = hourly_series(site, app_mask, table, header, start_utc, hours)
        entry = {"site_id": site.id, "name": site.name, "label": site.label, "lat": site.lat, "lon": site.lon, "polar": site.polar, "condition": REPRESENTATIVE.get(site.id)}
        others: dict[str, np.ndarray] = {}
        floor = 0.0
        if site.polar:
            grids = adjusted_grids(site, adj80, adj240)
            prof, h_adj = adjusted_profile(site, grids)
            inner_err = [read_err_window(site)] if site.lat <= -87.55 else []
            err_at = error_lookup(inner_err + [err80, err240])
            site_err = float(np.nan_to_num(err_at(np.array([site.lat]), np.array([site.lon]))[0]))
            sigma = skyline_error_deg(prof, err_at, site_err)
            others = {"adjusted": prof.elevation_deg, "adjusted_raised": prof.elevation_deg + sigma, "adjusted_lowered": prof.elevation_deg - sigma}
            skylines[site.id] = skyline_doc(site.id, prof.elevation_deg, sigma, h_adj)
            mask_doc = json.loads((config.DATA_DIR / "masks" / f"{site.id}.json").read_text())
            entry["skyline"] = {
                "adjusted_minus_app": horizon_difference(prof.elevation_deg, app_mask),
                "error_1sigma_deg": {"median": round(float(np.median(sigma)), 4), "p95": round(float(np.percentile(sigma, 95)), 4), "max": round(float(sigma.max()), 4)},
                "skyline_distance_km": {"median": round(float(np.median(prof.distance_m)) / 1000.0, 2), "min": round(float(prof.distance_m.min()) / 1000.0, 3)},
                "site_height_app_m": mask_doc["site_height_m"],
                "site_height_adjusted_m": round(h_adj, 2),
                "site_height_error_m": round(site_err, 3),
            }
            entry["terrain_quality"] = terrain_quality(site.lat, site.lon)
        else:
            # Far from the pole the app assumes a flat horizon; Blue Ghost's own report puts its sunset about 2.5 h earlier.
            floor = FLAT_HORIZON_ALLOWANCE_H
            entry["skyline"] = {"flat": True, "allowance_h": floor, "allowance_source": FLAT_HORIZON_SOURCE}
            entry["terrain_quality"] = None
        versions = None
        if site.polar:
            from .ensemble import load_versions

            got = load_versions(site.id)
            versions = got[1] if got is not None else None
            entry["terrain_versions"] = 0 if versions is None else int(versions.shape[0])
        entry.update(site_budget(site, vectors, hourly, app_mask, others, cfg, step_s, angles, floor, versions))
        entries.append(entry)
    polar = [e for e in entries if e["polar"]]
    sources = [
        {"name": FULL_FILES[k], "url": url_for(FULL_FILES[k]), "listed_size": LISTED_SIZE[FULL_FILES[k]], "access": "whole file", "use": USE[k]} for k in FULL_FILES
    ] + [{"name": WINDOW_FILES[k], "url": url_for(WINDOW_FILES[k]), "access": "windows around each site (HTTP range requests)", "use": USE[k]} for k in WINDOW_FILES]
    return {
        "version": 1,
        "generated_utc": now_utc(),
        "span": {"start_utc": start_utc + "Z", "days": days, "fine_step_s": step_s, "hourly_step_s": 3600.0},
        "lander": config_dict(cfg),
        "method": METHOD,
        "ephemeris": {"source": "data/validation/horizons.json", **angles, "table_rounding_deg": rounding},
        "product90": {"citation": CITATION, "sources": sources},
        "sites": entries,
        "pooled": {"polar": _pooled(polar)},
        "skylines": skylines,
    }


def read_err_window(site):
    from .pgda90 import read_window

    return read_window("err20", site.lat, site.lon, INNER_HALF_M).grid()


FLAT_HORIZON_ALLOWANCE_H = 2.5
FLAT_HORIZON_SOURCE = (
    "Firefly's Blue Ghost Mission 1 report (16 Mar 2025): the lander fell silent at 23:25 UTC about 5 h after the sunset it saw, "
    "so its sunset came about 2.5 h before the app's flat-horizon sunset (data/validation/backcasts.json)"
)
USE = {
    "dem80": "skyline, 40 m to 100 km (and the near field north of 87.55° S)",
    "err80": "height error at the skyline, to 100 km",
    "dem240": "skyline, 100 to 220 km",
    "err240": "height error at the skyline beyond 100 km",
    "dem20": "skyline within 6 km of the sites south of 87.55° S",
    "err20": "height error at the site and within 6 km",
    "effres20": "effective resolution at the site",
    "slope20": "slope at the site",
    "slope_err20": "slope error at the site",
    "rough100": "roughness at a 100 m baseline at the site",
    "psr20": "nearest permanently shadowed ground within 10 km",
}
METHOD = {
    "sampling": (
        "The app's hourly series (the ephemeris table's rows at the top of each hour) against the same sky every minute from SPICE "
        "(DE440, MOON_ME, LT+S from the Moon's centre, as the table was made) with the same skyline, Sun disk test and battery walk. "
        "An event's sampling error is its hourly time (the first hourly sample in the new state) minus the one-minute crossing, "
        "refined linearly between minutes; battery times are to the minute."
    ),
    "terrain": (
        "Skylines traced through PGDA product 90's adjusted models (20 m within 6 km south of 87.55° S, 80 m to 100 km, 240 m to 220 km, "
        "the app's bands, march and 2 m mast), and the same skylines raised and lowered by one stated height error (the ERR maps, at the "
        "point that makes the skyline and at the site, over its distance); and the site's terrain versions (data/ensemble), product 90's "
        "models with errors drawn from the model fitted to the app's grids minus product 90's, which differ by several times the stated "
        "error. An event's terrain spread is the larger of its largest shift under those three skylines and the 95th percentile of its "
        "shifts over the versions that keep it, so the versions only ever widen it; an event one of the three skylines loses is counted "
        "apart, and the events more than one version in twenty loses are counted beside it. The raised and lowered skylines stay as a "
        "stand-in for the slow, coherent part of the error that the versions leave out."
    ),
    "ephemeris": (
        "The largest gap to JPL Horizons in height plus direction, for each body, divided by the rate of the body's height above the "
        "skyline at each one-minute crossing."
    ),
    "combination": (
        "The supported plus-or-minus is the sum of the three 95th percentiles of the size of each error over the span: sampling, terrain "
        "(or, on a flat horizon, a stated allowance) and ephemeris. They are added rather than root-summed because the sampling error is "
        "one-sided and the terrain spread is not symmetric. The app shows it rounded up to the next half hour."
    ),
    "not_covered": (
        "Not in the budget: the lander's own height and tilt, hills smaller than the models resolve, the skyline between its 720 directions, "
        "the battery's temperature and age, and anything about the lander keeping warm or starting again after the night."
    ),
}
