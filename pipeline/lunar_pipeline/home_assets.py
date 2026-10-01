"""Pictures and numbers for the web home page and the site list: written once, committed with the web app.

- web/public/hero/de-gerlache-rim-2.jpg: the shadow map of the hero site at one hour (shadow.py).
- web/public/maps/south-pole-relief.jpg: a relief map of the south pole, 500 km across.
- web/src/lib/data/home.json: the hero site's month of Sun heights, the validation headline figures,
  the pin positions on the relief map.
"""

from __future__ import annotations

import json
import statistics
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

from . import config
from .ephemeris import load_table
from .geometry import azel_from_body_vectors, ps_south_xy_m
from .horizon import mask_at_azimuth
from .illumination import disk_fraction, sun_radius_deg
from .lola import LolaGrid
from .masks import load_grids, load_mask
from .shadow import Level, cast, shade, sun_bearing_deg
from .sites import Site, all_sites
from .terrain3d import window_heights

HERO_SITE = "de_gerlache_rim_2"
HERO_RIM = "de_gerlache_center_rim_high"
HERO_START = "2027-01-01T00:00:00"
HERO_HOURS = 720
HERO_FRAME_HOUR = 30
HERO_PX = 1024
RELIEF_HALF_KM = 250.0
SUN_DIAMETER_DEG = 0.533  # the Sun's mean angular width from the Moon


def _utc(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=UTC)


def sky_series(site: Site, mask: np.ndarray, table: np.ndarray, header: dict, start_utc: str, hours: int) -> dict:
    """Hourly Sun direction and the height of the hills in that direction, on the ephemeris grid."""
    i0 = round((_utc(start_utc) - _utc(header["t0_utc"])).total_seconds() / header["step_s"])
    if i0 < 0 or i0 + hours > header["n"]:
        raise ValueError("requested span is outside the ephemeris table")
    rows = table[i0 : i0 + hours].astype(np.float64)
    sun_az, sun_el = azel_from_body_vectors(rows[:, 0, :], site.lat, site.lon, 0.0)
    hill = mask_at_azimuth(mask, sun_az)
    frac = disk_fraction(sun_el - hill, sun_radius_deg(np.linalg.norm(rows[:, 0, :], axis=1)))
    lit = frac > 0.0
    r2 = lambda a: [round(float(v), 2) for v in a]
    return {"sun_az": r2(sun_az), "sun_el": r2(sun_el), "hill_el": r2(hill), "lit": [int(v) for v in lit], "sunlit_pct": round(100.0 * float(lit.mean()), 1)}


def night(lit) -> dict | None:
    """The longest run of unlit hours: where it starts, the first lit hour after it, its length."""
    best: tuple[int, int] | None = None
    start = -1
    flags = [bool(v) for v in lit] + [True]
    for h, v in enumerate(flags):
        if not v and start < 0:
            start = h
        if v and start >= 0:
            if best is None or h - start > best[1] - best[0]:
                best = (start, h)
            start = -1
    if best is None:
        return None
    return {"sunset_hour": best[0], "sunrise_hour": best[1], "hours": best[1] - best[0]}


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance on the Moon's reference sphere."""
    p1, p2, dl = np.radians(lat1), np.radians(lat2), np.radians(lon2 - lon1)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return float(2 * config.R_MOON_M / 1000.0 * np.arcsin(np.sqrt(a)))


def facts(horizons: dict, mazarico: dict, backcasts: dict) -> dict:
    """The three headline figures of the Accuracy page, for the home page."""
    covered = [abs(r["delta_points"]) for r in mazarico["rows"] if r.get("covered") and r.get("delta_points") is not None]
    ghost = next(r for r in backcasts["rows"] if r["site_id"] == "blue_ghost_m1")
    worst = float(horizons["max_abs_delta_el_deg"])
    return {
        "horizons_worst_el_deg": worst,
        "horizons_rows": int(horizons["n_rows"]),
        "sun_disc_ratio": round(SUN_DIAMETER_DEG / worst),
        "mazarico_median_points": round(float(statistics.median(covered)), 2),
        "mazarico_sites": len(covered),
        "mazarico_within5": sum(1 for d in covered if d <= 5.0),
        "mazarico_worst_points": round(max(covered), 2),
        "blue_ghost_end_minus_sunset_h": round(float(ghost["end_minus_sunset_h"]), 1),
    }


def relief_pins(sites: list[Site], half_km: float = RELIEF_HALF_KM) -> list[dict]:
    """Sites inside the map as fractions of its width (u, to the right) and height (v, downwards)."""
    out = []
    for s in sites:
        if not s.polar:
            continue
        x, y = ps_south_xy_m(s.lat, s.lon)
        u = 0.5 + (float(x) / 1000.0) / (2 * half_km)
        v = 0.5 - (float(y) / 1000.0) / (2 * half_km)
        if 0.02 < u < 0.98 and 0.02 < v < 0.98:
            out.append({"id": s.id, "u": round(u, 4), "v": round(v, 4)})
    return out


def relief_image(grid: LolaGrid, half_km: float = RELIEF_HALF_KM, block: int = 6) -> np.ndarray:
    """Hillshade of the cap around the pole: map lighting from the upper left, not the real Sun."""
    lab = grid.label
    half_px = round(half_km * 1000.0 / lab.map_scale_m)
    r0 = round(lab.line_offset_px) - half_px
    c0 = round(lab.sample_offset_px) - half_px
    n = (2 * half_px // block) * block
    win = np.asarray(grid.data[r0 : r0 + n, c0 : c0 + n], dtype=np.float32) * lab.scaling_factor
    z = win.reshape(n // block, block, n // block, block).mean(axis=(1, 3))
    gy, gx = np.gradient(z, lab.map_scale_m * block)
    exag = 2.2
    az, alt = np.radians(315.0), np.radians(32.0)
    lx, ly, lz = np.sin(az) * np.cos(alt), np.cos(az) * np.cos(alt), np.sin(alt)
    nx, ny, nz = -gx * exag, gy * exag, np.ones_like(z)
    shade_ = np.clip((nx * lx + ny * ly + nz * lz) / np.sqrt(nx * nx + ny * ny + nz * nz), 0.0, 1.0)
    lo, hi = np.percentile(z, 2), np.percentile(z, 98)
    tone = 0.62 * shade_ + 0.38 * np.clip((z - lo) / (hi - lo), 0.0, 1.0)
    return np.clip(255.0 * (0.10 + 0.86 * tone**0.9), 0, 255).astype(np.uint8)


def hero_levels(site: Site, grids: dict[str, LolaGrid], size: int = HERO_PX) -> list[Level]:
    """Three windows centred on the site, coarse to fine: 240 m, 80 m, 20 m, each `size` pixels across."""
    levels = []
    for name, fill in (("L2", None), ("L1", "L2"), ("L0", "L1")):
        grid = grids[name]
        col, row = grid.pixel_from_latlon(site.lat, site.lon)
        row0 = round(float(row)) - size // 2
        col0 = round(float(col)) - size // 2
        heights, _ = window_heights(grid, row0, col0, size, grids[fill] if fill else None)
        heights = np.where(np.isnan(heights), np.nanmin(heights), heights)
        levels.append(Level(heights, float(grid.label.map_scale_m), float(col) - col0, float(row) - row0))
    return levels


def hero_image(site: Site, grids: dict[str, LolaGrid], sun_az_deg: float, sun_el_deg: float) -> tuple[np.ndarray, dict]:
    levels = hero_levels(site, grids)
    bearing = sun_bearing_deg(site.lon, sun_az_deg)
    lit, margin = cast(levels, bearing, sun_el_deg)
    fine = levels[-1]
    image = shade(fine.heights_m, fine.px_m, margin, bearing, sun_el_deg)
    meta = {"window_km": round(fine.heights_m.shape[1] * fine.px_m / 1000.0, 2), "sun_bearing_deg": round(bearing, 1), "lit_fraction": round(float(lit.mean()), 3)}
    return image, meta


def write_jpeg(path: Path, image_u8: np.ndarray, quality: int = 86) -> Path:
    """Grayscale JPEG through GDAL (rasterio); removes the sidecar GDAL writes next to it."""
    import warnings

    import rasterio

    path.parent.mkdir(parents=True, exist_ok=True)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # "Dataset has no geotransform": a picture, not a map product
        with rasterio.open(path, "w", driver="JPEG", width=image_u8.shape[1], height=image_u8.shape[0], count=1, dtype="uint8", QUALITY=quality) as dst:
            dst.write(image_u8.astype(np.uint8), 1)
    aux = Path(str(path) + ".aux.xml")
    if aux.exists():
        aux.unlink()
    return path


def write_all(web_dir: Path = config.REPO_ROOT / "web") -> list[Path]:
    sites = {s.id: s for s in all_sites()}
    site, rim = sites[HERO_SITE], sites[HERO_RIM]
    table, header = load_table()
    grids = load_grids()
    sky = sky_series(site, load_mask(site.id), table, header, HERO_START, HERO_HOURS)
    rim_sky = sky_series(rim, load_mask(rim.id), table, header, HERO_START, HERO_HOURS)
    image, meta = hero_image(site, grids, sky["sun_az"][HERO_FRAME_HOUR], sky["sun_el"][HERO_FRAME_HOUR])
    hero_path = write_jpeg(web_dir / "public" / "hero" / "de-gerlache-rim-2.jpg", image)
    relief_path = write_jpeg(web_dir / "public" / "maps" / "south-pole-relief.jpg", relief_image(grids["L1"]))
    val = config.DATA_DIR / "validation"
    read = lambda name: json.loads((val / name).read_text(encoding="utf-8"))
    doc = {
        "generated_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "hero": {
            "site_id": site.id,
            "name": site.name.replace(" (Artemis III region)", ""),
            "image": "/hero/de-gerlache-rim-2.jpg",
            "frame_utc": (_utc(HERO_START) + timedelta(hours=HERO_FRAME_HOUR)).strftime("%Y-%m-%dT%H:%M:%S"),
            **meta,
        },
        "sky": {"start_utc": HERO_START, "hours": HERO_HOURS, **sky, "night": night(sky["lit"])},
        "pair": {
            "site_sun_pct": sky["sunlit_pct"],
            "rim_site_id": rim.id,
            "rim_sun_pct": rim_sky["sunlit_pct"],
            "distance_km": round(distance_km(site.lat, site.lon, rim.lat, rim.lon), 1),
        },
        "facts": facts(read("horizons.json"), read("mazarico.json"), read("backcasts.json")),
        "relief": {"image": "/maps/south-pole-relief.jpg", "half_km": RELIEF_HALF_KM, "sites": relief_pins(list(sites.values()))},
    }
    json_path = web_dir / "src" / "lib" / "data" / "home.json"
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(doc, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    return [hero_path, relief_path, json_path]
