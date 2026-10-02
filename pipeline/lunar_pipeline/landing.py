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
