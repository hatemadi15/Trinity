"""Compute and store per-site terrain horizon masks."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import config
from .config import R_MOON_M
from .geometry import enu_basis, site_vector_km
from .horizon import Band, horizon_mask, site_height_m
from .lola import LolaGrid
from .sites import Site, all_sites

GRID_FILES = {"L0": "ldem_875s_20m", "L1": "ldem_80s_80m", "L2": "ldem_60s_240m"}
GRID_ORDER = ("L0", "L1", "L2")  # finest to coarsest
NATIVE_STEP_M = {"L0": 10.0, "L1": 40.0, "L2": 120.0}  # half a pixel of each grid
METHOD = (
    "Barker et al. 2021 nested-grid horizon; great-circle march; exact spherical curvature; "
    "bilinear DEM sampling"
)


def load_grids() -> dict[str, LolaGrid]:
    return {k: LolaGrid.from_pds(config.LOLA_DIR / f"{v}.lbl", mmap=False) for k, v in GRID_FILES.items()}


def bands_for_site(site: Site, grids: dict[str, LolaGrid]) -> list[Band]:
    l0, l1, l2 = grids["L0"], grids["L1"], grids["L2"]
    if site.lat <= -87.55:  # 20 m grid covers the site and its first 6 km
        return [Band(l0, 40.0, 6_000.0, 10.0), Band(l1, 6_000.0, 100_000.0, 40.0), Band(l2, 100_000.0, 220_000.0, 120.0)]
    return [Band(l1, 40.0, 100_000.0, 20.0), Band(l2, 100_000.0, 220_000.0, 120.0)]


def _first_missing_distance_m(
    lat_deg: float, lon_deg: float, band: Band, n_az: int, probe_step_m: float
) -> float | None:
    """Distance (m) just before the first ring sample of `band` that lies outside its grid.

    Probes every azimuth at `probe_step_m` along the same great circles horizon_mask marches.
    Returns None when the whole band is covered.
    """
    p_hat = site_vector_km(lat_deg, lon_deg)
    p_hat = p_hat / np.linalg.norm(p_hat)
    east, north, _up = enu_basis(lat_deg, lon_deg)
    az = np.radians(np.arange(n_az) * (360.0 / n_az))
    t_hat = np.cos(az)[:, None] * north[None, :] + np.sin(az)[:, None] * east[None, :]
    d = np.arange(band.r_min_m, band.r_max_m, probe_step_m, dtype=np.float64)
    delta = d / R_MOON_M
    q = np.cos(delta)[None, :, None] * p_hat[None, None, :] + np.sin(delta)[None, :, None] * t_hat[:, None, :]
    lat_q = np.degrees(np.arcsin(np.clip(q[..., 2], -1.0, 1.0)))
    lon_q = np.degrees(np.arctan2(q[..., 1], q[..., 0]))
    missing = np.isnan(band.grid.value_bilinear(*band.grid.pixel_from_latlon(lat_q, lon_q))).any(axis=0)
    if not missing.any():
        return None
    return float(d[max(int(np.argmax(missing)) - 1, 0)])


def fallback_bands(site: Site, bands: list[Band], grids: dict[str, LolaGrid], n_az: int = 720) -> list[Band]:
    """Coarser-grid bands for the distances at which a primary band runs off its own grid.

    IM-1 sits 4 km inside the 80 S grid: its 80 m band has no data north of 4 km, and
    horizon_mask drops missing samples as -90 deg, so the skyline there came out up to 1.1 deg
    too low. Marching those distances again on the next coarser grid restores them (the mask
    is the max over bands, so the coarse copy only matters where the fine grid is blank).
    The fallback starts at the first missing sample, never at r_min: coarse-grid interpolation
    error in the near field raises the skyline by more than a degree on steep terrain.
    """
    keys = {id(g): k for k, g in grids.items()}
    out: list[Band] = []
    for band in bands:
        probe = band
        for coarser in GRID_ORDER[GRID_ORDER.index(keys[id(band.grid)]) + 1 :]:
            step = max(band.step_m, NATIVE_STEP_M[coarser])
            d0 = _first_missing_distance_m(site.lat, site.lon, probe, n_az, step)
            if d0 is None:
                break
            probe = Band(grids[coarser], d0, band.r_max_m, step)
            out.append(probe)
    return out


def mask_for_site(site: Site, grids: dict[str, LolaGrid], mast_m: float = 2.0, n_az: int = 720) -> dict:
    bands = bands_for_site(site, grids)
    fallback = fallback_bands(site, bands, grids, n_az=n_az)
    h_site = site_height_m(site.lat, site.lon, [b.grid for b in bands])
    mask = horizon_mask(
        site.lat, site.lon, bands + fallback, n_az=n_az, mast_m=mast_m, site_height_m_=h_site
    )
    names = {id(g): name for name, g in zip(GRID_FILES.values(), grids.values())}
    return {
        "site_id": site.id,
        "lat": site.lat,
        "lon": site.lon,
        "n_az": n_az,
        "az0_deg": 0.0,
        "az_step_deg": 360.0 / n_az,
        "mast_m": mast_m,
        "site_height_m": round(float(h_site), 2),
        "elevation_deg": [round(float(v), 3) for v in mask],
        "bands": [
            {"grid": names[id(b.grid)], "r_min_m": b.r_min_m, "r_max_m": b.r_max_m, "step_m": b.step_m}
            for b in bands
        ],
        "fallback_bands": [
            {"grid": names[id(b.grid)], "r_min_m": b.r_min_m, "r_max_m": b.r_max_m, "step_m": b.step_m}
            for b in fallback
        ],
        "method": METHOD,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def write_masks(site_ids: list[str] | None = None, out_dir: Path = config.DATA_DIR / "masks") -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    grids = load_grids()
    paths: list[Path] = []
    for site in all_sites():
        if not site.polar or (site_ids and site.id not in site_ids):
            continue
        print(f"[masks] {site.id}", flush=True)
        doc = mask_for_site(site, grids)
        path = out_dir / f"{site.id}.json"
        path.write_text(json.dumps(doc) + "\n")
        paths.append(path)
    return paths


def load_mask(site_id: str, masks_dir: Path = config.DATA_DIR / "masks") -> np.ndarray:
    doc = json.loads((masks_dir / f"{site_id}.json").read_text())
    return np.asarray(doc["elevation_deg"], dtype=np.float64)
