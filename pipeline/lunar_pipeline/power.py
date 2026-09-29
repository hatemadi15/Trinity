"""Solar power and battery reference model (mirrors web/src/lib/engine/power.ts)."""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

SOLAR_CONSTANT_WM2 = 1361.0
PANELS = ("horizontal", "vertical", "vertical_tracking", "full_tracking")


@dataclass(frozen=True)
class PowerConfig:
    panel: str = "vertical_tracking"
    panel_azimuth_deg: float = 0.0
    area_m2: float = 4.0
    efficiency: float = 0.3
    load_w: float = 200.0
    battery_wh: float = 2000.0
    initial_soc_fraction: float = 1.0


def panel_cosine(panel: str, panel_azimuth_deg: float, sun_az_deg, sun_el_deg) -> np.ndarray:
    """Cosine between the panel normal and the Sun, clamped at 0 (Sun behind the panel or below the horizon)."""
    az = np.asarray(sun_az_deg, dtype=np.float64)
    el = np.radians(np.asarray(sun_el_deg, dtype=np.float64))
    if panel == "horizontal":
        c = np.sin(el)
    elif panel == "vertical":
        c = np.cos(el) * np.cos(np.radians(az - panel_azimuth_deg))
    elif panel == "vertical_tracking":
        c = np.cos(el)
    elif panel == "full_tracking":
        c = np.ones_like(el)
    else:
        raise ValueError(f"unknown panel model {panel!r}; expected one of {PANELS}")
    # No cutoff at el = 0: high points see the Sun below the geometric horizon (skyline dip) and the
    # disk fraction already carries visibility; the horizontal panel goes dark by itself (sin el < 0).
    return np.clip(c, 0.0, None)


def irradiance_wm2(sun_au, sun_fraction) -> np.ndarray:
    """Solar constant scaled by 1/au² and the visible disk fraction."""
    au = np.asarray(sun_au, dtype=np.float64)
    return SOLAR_CONSTANT_WM2 / (au * au) * np.asarray(sun_fraction, dtype=np.float64)


def power_series(series: dict, cfg: PowerConfig) -> np.ndarray:
    return (
        cfg.efficiency
        * cfg.area_m2
        * irradiance_wm2(series["sun_au"], series["sun_fraction"])
        * panel_cosine(cfg.panel, cfg.panel_azimuth_deg, series["sun_az"], series["sun_el"])
    )


def simulate_battery(power_w: np.ndarray, cfg: PowerConfig, dt_h: float = 1.0) -> dict:
    """Hourly battery walk: charge with the surplus, discharge for the deficit, brownout when the deficit exceeds the stored energy."""
    power_w = np.asarray(power_w, dtype=np.float64)
    cap = max(0.0, cfg.battery_wh)
    e = min(cap, max(0.0, cfg.initial_soc_fraction) * cap)
    energy = np.zeros(power_w.size)
    soc_min = e / cap if cap > 0 else 0.0
    brownout = 0
    first = None
    for h, p in enumerate(power_w):
        nxt = e + (p - cfg.load_w) * dt_h
        if nxt < 0.0:
            brownout += 1
            if first is None:
                first = h
            nxt = 0.0
        e = min(cap, nxt)
        energy[h] = e
        soc = e / cap if cap > 0 else 0.0
        soc_min = min(soc_min, soc)
    return {
        "power_w": power_w,
        "energy_wh": energy,
        "soc_min": float(soc_min),
        "brownout_hours": int(brownout),
        "first_brownout_hour": first,
        "survives": brownout == 0,
        "mean_power_w": float(np.mean(power_w)) if power_w.size else 0.0,
    }


def power_budget(series: dict, cfg: PowerConfig) -> dict:
    return simulate_battery(power_series(series, cfg), cfg)


def config_dict(cfg: PowerConfig) -> dict:
    return asdict(cfg)
