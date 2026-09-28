"""Terrain horizon mask by great-circle ray marching over nested DEM grids (Barker et al. 2021 method)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .config import R_MOON_M
from .geometry import enu_basis, site_vector_km
from .lola import LolaGrid


@dataclass(frozen=True)
class Band:
    grid: LolaGrid
    r_min_m: float
    r_max_m: float
    step_m: float


def site_height_m(lat_deg: float, lon_deg: float, grids: list[LolaGrid]) -> float:
    for grid in grids:
        h = grid.value_at(lat_deg, lon_deg)
        if not np.isnan(h):
            return float(h)
    raise ValueError(f"no grid covers site ({lat_deg}, {lon_deg})")


def horizon_mask(
    lat_deg: float,
    lon_deg: float,
    bands: list[Band],
    n_az: int = 720,
    mast_m: float = 2.0,
    site_height_m_: float | None = None,
) -> np.ndarray:
    """Elevation angle (deg) of the terrain skyline for n_az azimuths (0 = north, clockwise)."""
    if site_height_m_ is None:
        site_height_m_ = site_height_m(lat_deg, lon_deg, [b.grid for b in bands])
    r_o = R_MOON_M + site_height_m_ + mast_m
    p_hat = site_vector_km(lat_deg, lon_deg) / np.linalg.norm(site_vector_km(lat_deg, lon_deg))
    east, north, _up = enu_basis(lat_deg, lon_deg)
    az = np.radians(np.arange(n_az) * (360.0 / n_az))
    t_hat = np.cos(az)[:, None] * north[None, :] + np.sin(az)[:, None] * east[None, :]  # (n_az, 3)

    mask = np.full(n_az, -90.0)
    for band in bands:
        d = np.arange(band.r_min_m, band.r_max_m, band.step_m, dtype=np.float64)  # (k,)
        delta = d / R_MOON_M
        cos_d, sin_d = np.cos(delta), np.sin(delta)
        q = cos_d[None, :, None] * p_hat[None, None, :] + sin_d[None, :, None] * t_hat[:, None, :]
        lat_q = np.degrees(np.arcsin(np.clip(q[..., 2], -1.0, 1.0)))
        lon_q = np.degrees(np.arctan2(q[..., 1], q[..., 0]))
        col, row = band.grid.pixel_from_latlon(lat_q, lon_q)
        h = band.grid.value_bilinear(col, row)  # (n_az, k), NaN outside coverage
        r_t = R_MOON_M + h
        el = np.degrees(np.arctan2(r_t * cos_d[None, :] - r_o, r_t * sin_d[None, :]))
        el = np.where(np.isnan(el), -90.0, el)
        mask = np.maximum(mask, el.max(axis=1))
    return mask


def mask_at_azimuth(mask: np.ndarray, az_deg) -> np.ndarray | float:
    n = mask.shape[0]
    step = 360.0 / n
    x = (np.asarray(az_deg, dtype=np.float64) % 360.0) / step
    i0 = np.floor(x).astype(int) % n
    i1 = (i0 + 1) % n
    f = x - np.floor(x)
    v = mask[i0] * (1.0 - f) + mask[i1] * f
    return float(v) if np.ndim(az_deg) == 0 else v
