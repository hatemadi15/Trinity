"""Hourly illumination and Earth-visibility series for a site, plus the Mazarico map check."""

from __future__ import annotations

import numpy as np

from . import config
from .config import SUN_RADIUS_KM
from .ephemeris import load_table
from .geometry import azel_from_body_vectors
from .horizon import mask_at_azimuth
from .lola import LolaGrid
from .masks import load_mask
from .sites import all_sites
from .spice_env import spice_kernels, utc_to_et


def disk_fraction(delta_deg, disk_radius_deg) -> np.ndarray:
    """Fraction of a disk of angular radius disk_radius_deg lying above a straight skyline.

    delta_deg = disk centre elevation minus skyline elevation.
    """
    x = np.clip(np.asarray(delta_deg, dtype=np.float64) / np.asarray(disk_radius_deg, dtype=np.float64), -1.0, 1.0)
    return (np.arccos(-x) + x * np.sqrt(1.0 - x * x)) / np.pi


def sun_radius_deg(dist_km) -> np.ndarray:
    return np.degrees(np.arcsin(SUN_RADIUS_KM / np.asarray(dist_km, dtype=np.float64)))


def hourly_series(site, mask: np.ndarray, table: np.ndarray, header: dict, start_utc: str, hours: int) -> dict:
    with spice_kernels():
        et0 = utc_to_et(start_utc)
    i0 = int(round((et0 - header["t0_et"]) / header["step_s"]))
    if i0 < 0 or i0 + hours > header["n"]:
        raise ValueError("requested span is outside the ephemeris table")
    rows = table[i0 : i0 + hours].astype(np.float64)  # (hours, 2, 3)
    sun_az, sun_el = azel_from_body_vectors(rows[:, 0, :], site.lat, site.lon, 0.0)
    earth_az, earth_el = azel_from_body_vectors(rows[:, 1, :], site.lat, site.lon, 0.0)
    sun_dist = np.linalg.norm(rows[:, 0, :], axis=1)
    sun_fraction = disk_fraction(sun_el - mask_at_azimuth(mask, sun_az), sun_radius_deg(sun_dist))
    earth_visible = (earth_el - mask_at_azimuth(mask, earth_az)) > 0.0
    return {
        "utc_index": np.arange(hours) + i0,
        "sun_az": sun_az, "sun_el": sun_el, "earth_az": earth_az, "earth_el": earth_el,
        "sun_fraction": sun_fraction, "earth_visible": earth_visible,
    }


def longest_run(flags: np.ndarray) -> int:
    best = cur = 0
    for v in np.asarray(flags, dtype=bool):
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return int(best)


def summarize(series: dict) -> dict:
    lit = np.asarray(series["sun_fraction"]) > 0.0
    vis = np.asarray(series["earth_visible"], dtype=bool)
    return {
        "hours": int(lit.size),
        "illum_fraction": float(lit.mean()),
        "mean_sun_fraction": float(np.mean(series["sun_fraction"])),
        "longest_dark_h": longest_run(~lit),
        "earth_vis_fraction": float(vis.mean()),
        "longest_earth_gap_h": longest_run(~vis),
        "joint_fraction": float(np.mean(lit & vis)),
    }


def mazarico_fraction(lat: float, lon: float, product: str = "avgvisib_85s_060m_201608") -> float:
    grid = LolaGrid.from_pds(config.ILLUM_DIR / f"{product}.lbl")
    return float(grid.value_at(lat, lon))


def report(site_id: str, start_utc: str = "2025-01-01T00:00:00", days: int = 730) -> dict:
    site = next(s for s in all_sites() if s.id == site_id)
    if len(start_utc) == 10:
        start_utc += "T00:00:00"
    table, header = load_table()
    mask = load_mask(site_id)
    series = hourly_series(site, mask, table, header, start_utc, days * 24)
    out = {"site_id": site_id, "lat": site.lat, "lon": site.lon, "start_utc": start_utc, "days": days,
           "metrics": summarize(series)}
    if site.lat <= -82.9:
        out["mazarico_avgvisib"] = mazarico_fraction(site.lat, site.lon)
        out["mazarico_earth_visib"] = mazarico_fraction(site.lat, site.lon, "avgvisib_85s_060m_201608_earth")
    return out
