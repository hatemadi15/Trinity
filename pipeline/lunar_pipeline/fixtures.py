"""Golden fixtures for the TypeScript engine port."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import config
from .ephemeris import load_table
from .illumination import hourly_series, summarize
from .masks import load_mask
from .power import PowerConfig, config_dict, power_budget
from .sites import all_sites
from .spice_env import spice_kernels, utc_to_et

SAMPLE_INDEXES = list(range(48)) + list(range(48, 17520, 500))


def time_pairs(n: int = 50) -> list[dict]:
    """UTC strings spread over the table span at odd offsets, with SPICE's TDB seconds past J2000."""
    t0 = datetime(2024, 1, 1, tzinfo=timezone.utc)
    out: list[dict] = []
    with spice_kernels():
        for i in range(n):
            t = t0 + timedelta(days=(97 * i) % 4700, hours=(3 * i) % 24, minutes=17, seconds=5 + (i % 50))
            utc = t.strftime("%Y-%m-%dT%H:%M:%S")
            out.append({"utc": utc, "et": utc_to_et(utc)})
    return out


def write_time_fixture(out: Path = config.DATA_DIR / "fixtures" / "time" / "utc_et.json", n: int = 50) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"tdb_minus_utc_s": 69.184, "pairs": time_pairs(n)}, indent=1) + "\n")
    return out


def metrics_fixture(site_id: str, start_utc: str, days: int) -> dict:
    site = next(s for s in all_sites() if s.id == site_id)
    table, header = load_table()
    mask = load_mask(site_id)
    series = hourly_series(site, mask, table, header, start_utc, days * 24)
    idx = [i for i in SAMPLE_INDEXES if i < days * 24]
    return {
        "site_id": site_id,
        "lat": site.lat,
        "lon": site.lon,
        "start_utc": start_utc,
        "days": days,
        "start_index": int(series["utc_index"][0]),
        "metrics": summarize(series),
        "sample_indexes": idx,
        "samples": {
            key: [float(series[key][i]) for i in idx]
            for key in ("sun_az", "sun_el", "earth_az", "earth_el", "sun_fraction", "sun_au")
        },
        "earth_visible": [bool(series["earth_visible"][i]) for i in idx],
    }


def write_metrics_fixture(
    site_id: str,
    start_utc: str = "2025-01-01T00:00:00",
    days: int = 730,
    out_dir: Path = config.DATA_DIR / "fixtures" / "metrics",
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = metrics_fixture(site_id, start_utc, days)
    path = out_dir / f"{site_id}_{start_utc[:10]}_{days}d.json"
    path.write_text(json.dumps(doc, indent=1) + "\n")
    return path


POWER_SAMPLE_INDEXES = [0, 1, 5, 23, 24, 100, 240, 500, 720, 1000, 1439]


def power_fixture(site_id: str, start_utc: str, days: int, cfg: PowerConfig) -> dict:
    site = next(s for s in all_sites() if s.id == site_id)
    table, header = load_table()
    mask = load_mask(site_id)
    series = hourly_series(site, mask, table, header, start_utc, days * 24)
    r = power_budget(series, cfg)
    idx = [i for i in POWER_SAMPLE_INDEXES if i < days * 24]
    return {
        "site_id": site_id,
        "lat": site.lat,
        "lon": site.lon,
        "start_utc": start_utc,
        "days": days,
        "config": config_dict(cfg),
        "summary": {k: r[k] for k in ("soc_min", "brownout_hours", "first_brownout_hour", "survives", "mean_power_w")},
        "sample_indexes": idx,
        "samples": {
            "power_w": [float(r["power_w"][i]) for i in idx],
            "energy_wh": [float(r["energy_wh"][i]) for i in idx],
        },
    }


def write_power_fixture(
    site_id: str,
    start_utc: str = "2025-01-01T00:00:00",
    days: int = 60,
    panel: str = "vertical_tracking",
    out_dir: Path = config.DATA_DIR / "fixtures" / "power",
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg = PowerConfig(panel=panel, panel_azimuth_deg=90.0 if panel == "vertical" else 0.0)
    doc = power_fixture(site_id, start_utc, days, cfg)
    path = out_dir / f"{site_id}_{start_utc[:10]}_{days}d_{panel}.json"
    path.write_text(json.dumps(doc, indent=1) + "\n")
    return path
