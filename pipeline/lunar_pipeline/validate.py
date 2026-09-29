"""Validation artifacts: JPL Horizons cross-check rows, Mazarico illumination-map agreement, CLPS mission backcasts."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from . import config
from .ephemeris import interp_vectors, load_table
from .geometry import azel_from_body_vectors
from .illumination import hourly_series
from .lola import LolaGrid
from .masks import load_mask
from .sites import Site, all_sites
from .spice_env import spice_kernels, utc_to_et

OUT_DIR = config.DATA_DIR / "validation"
FULL_START = "2024-01-01T00:00:00"
MAZARICO_PRODUCT = "avgvisib_85s_060m_201608"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def horizons_doc(fixtures_dir: Path = config.DATA_DIR / "fixtures" / "horizons") -> dict:
    """Every stored Horizons row next to our own az/el, with the worst differences per file and overall."""
    table, header = load_table()
    names = {s.id: s.name for s in all_sites()}
    sites, worst_el, worst_az, n = [], 0.0, 0.0, 0
    with spice_kernels():
        for path in sorted(fixtures_dir.glob("*_sun.json")) + sorted(fixtures_dir.glob("*_earth.json")):
            doc = json.loads(path.read_text())
            idx = 0 if doc["body"] == "SUN" else 1
            rows, d_el, d_az = [], 0.0, 0.0
            for r in doc["rows"]:
                vec = interp_vectors(table, header["t0_et"], header["step_s"], utc_to_et(r["utc"]))[idx]
                az, el = azel_from_body_vectors(vec, doc["lat"], doc["lon"], 0.0)
                az, el = float(az), float(el)
                daz = (az - r["az"] + 180.0) % 360.0 - 180.0
                d_az = max(d_az, abs(daz * np.cos(np.radians(r["el"]))))
                d_el = max(d_el, abs(el - r["el"]))
                rows.append({"utc": r["utc"], "az_jpl": r["az"], "el_jpl": r["el"], "az_ours": round(az, 6), "el_ours": round(el, 6)})
            n += len(rows)
            worst_el, worst_az = max(worst_el, d_el), max(worst_az, d_az)
            sites.append({
                "site_id": doc["site_id"], "name": names.get(doc["site_id"], doc["site_id"]), "lat": doc["lat"], "lon": doc["lon"],
                "body": doc["body"], "query_url": doc["query_url"], "n_rows": len(rows),
                "max_abs_delta_el_deg": d_el, "max_abs_delta_az_cos_el_deg": d_az, "rows": rows,
            })
    return {"generated_utc": _now(), "n_rows": n, "max_abs_delta_el_deg": worst_el, "max_abs_delta_az_cos_el_deg": worst_az, "sites": sites}


def mazarico_rows(days: int | None = None, product: str = MAZARICO_PRODUCT) -> list[dict]:
    """Our sunlit fraction (2024-2036 hourly, or `days` from 2024-01-01) against the LOLA illumination map at every polar site."""
    table, header = load_table()
    grid = LolaGrid.from_pds(config.ILLUM_DIR / f"{product}.lbl")
    hours = int(header["n"]) if days is None else days * 24
    rows = []
    for site in all_sites():
        if not site.polar:
            continue
        covered = bool(grid.covers(site.lat, site.lon))
        row: dict = {"site_id": site.id, "name": site.name, "lat": site.lat, "lon": site.lon, "covered": covered}
        if covered:
            series = hourly_series(site, load_mask(site.id), table, header, FULL_START, hours)
            ours = float(np.mean(np.asarray(series["sun_fraction"]) > 0.0))
            mapv = float(grid.value_at(site.lat, site.lon))
            row.update({"ours_fraction": ours, "map_fraction": mapv, "delta_points": (ours - mapv) * 100.0})
        rows.append(row)
    return rows


def first_transition(lit, start: int, to_dark: bool) -> int | None:
    """Index of the first hour at or after `start` that is dark (to_dark) or lit (not to_dark); None when it never happens."""
    flags = np.asarray(lit, dtype=bool)
    for h in range(max(0, start), flags.size):
        if flags[h] != to_dark:
            return h
    return None


def _iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def backcast_row_for(site_id: str, days: int = 45) -> dict:
    """Predicted local sunset/sunrise after a landing against the reported end of the mission."""
    site: Site = next(s for s in all_sites() if s.id == site_id)
    if not site.landed_utc:
        raise ValueError(f"{site_id} has no landed_utc")
    table, header = load_table()
    mask_path = config.DATA_DIR / "masks" / f"{site_id}.json"
    skyline = "lola" if mask_path.exists() else "flat"
    mask = load_mask(site_id) if skyline == "lola" else np.zeros(720)
    landed = site.landed_utc.replace("Z", "")
    start = landed[:13] + ":00:00"  # the hour containing the landing
    series = hourly_series(site, mask, table, header, start, days * 24)
    lit = np.asarray(series["sun_fraction"]) > 0.0
    sunset_h = first_transition(lit, 0, to_dark=True)
    sunrise_h = first_transition(lit, sunset_h, to_dark=False) if sunset_h is not None else None
    t0 = datetime.fromisoformat(start)
    end = datetime.fromisoformat(site.mission_end_utc.replace("Z", "")) if site.mission_end_utc else None
    end_minus_sunset = None
    if end is not None and sunset_h is not None:
        end_minus_sunset = (end - (t0 + timedelta(hours=int(sunset_h)))).total_seconds() / 3600.0
    return {
        "site_id": site.id,
        "name": site.name,
        "lat": site.lat,
        "lon": site.lon,
        "landed_utc": site.landed_utc,
        "mission_end_utc": site.mission_end_utc,
        "mission_end_source": site.mission_end_source,
        "skyline": skyline,
        "sun_el_at_landing_deg": float(series["sun_el"][0]),
        "sunset_utc": _iso(t0 + timedelta(hours=int(sunset_h))) if sunset_h is not None else None,
        "sunrise_utc": _iso(t0 + timedelta(hours=int(sunrise_h))) if sunrise_h is not None else None,
        "daylight_hours_after_landing": int(sunset_h) if sunset_h is not None else None,
        "end_minus_sunset_h": end_minus_sunset,
    }


def backcasts_doc() -> dict:
    return {"generated_utc": _now(), "rows": [backcast_row_for(s.id) for s in all_sites() if s.landed_utc]}


def write_all(out_dir: Path = OUT_DIR) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    table, header = load_table()
    last = datetime.fromisoformat(FULL_START) + timedelta(hours=int(header["n"]) - 1)
    docs = {
        "horizons.json": horizons_doc(),
        "mazarico.json": {"generated_utc": _now(), "period": [FULL_START, last.strftime("%Y-%m-%dT%H:%M:%S")], "product": MAZARICO_PRODUCT, "rows": mazarico_rows()},
        "backcasts.json": backcasts_doc(),
    }
    paths: list[Path] = []
    for name, doc in docs.items():
        p = out_dir / name
        p.write_text(json.dumps(doc, indent=1) + "\n")
        paths.append(p)
    return paths
