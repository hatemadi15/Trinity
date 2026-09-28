"""Spherical-Moon geometry: local frames, azimuth/elevation, south polar stereographic projection."""

from __future__ import annotations

import numpy as np

from .config import R_MOON_M


def normalize_lon(lon_deg: float) -> float:
    """Wrap longitude into (-180, 180]."""
    lon = (float(lon_deg) + 180.0) % 360.0 - 180.0
    return 180.0 if lon == -180.0 else lon


def site_vector_km(lat_deg: float, lon_deg: float, height_m: float = 0.0) -> np.ndarray:
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    r = (R_MOON_M + height_m) / 1000.0
    return np.array([r * np.cos(lat) * np.cos(lon), r * np.cos(lat) * np.sin(lon), r * np.sin(lat)])


def enu_basis(lat_deg: float, lon_deg: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)])
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    return east, north, up


def azel_from_body_vectors(body_km: np.ndarray, lat_deg: float, lon_deg: float, height_m: float = 0.0):
    """Topocentric azimuth (deg, clockwise from north) and elevation (deg) of body vectors.

    body_km: array (..., 3) of body positions relative to the Moon centre, MOON_ME frame, km.
    The site offset is subtracted (parallax), so nearby bodies such as Earth are handled exactly.
    """
    body = np.asarray(body_km, dtype=np.float64)
    d = body - site_vector_km(lat_deg, lon_deg, height_m)
    east, north, up = enu_basis(lat_deg, lon_deg)
    de, dn, du = d @ east, d @ north, d @ up
    # fmod of a strictly positive argument is exact and strictly below the divisor, so az stays in
    # [0, 360); a plain `% 360.0` rounds tiny negative angles (a body due north) up to exactly 360.0.
    az = np.fmod(np.degrees(np.arctan2(de, dn)) + 360.0, 360.0)
    el = np.degrees(np.arctan2(du, np.hypot(de, dn)))
    return az, el


def ps_south_xy_m(lat_deg, lon_deg):
    """South polar stereographic (sphere, true scale at the pole): x = rho sin(lon), y = rho cos(lon)."""
    lat = np.asarray(lat_deg, dtype=np.float64)
    lon = np.radians(np.asarray(lon_deg, dtype=np.float64))
    rho = 2.0 * R_MOON_M * np.tan(np.radians((90.0 - np.abs(lat)) / 2.0))
    return rho * np.sin(lon), rho * np.cos(lon)


def ps_south_latlon_deg(x_m, y_m):
    x = np.asarray(x_m, dtype=np.float64)
    y = np.asarray(y_m, dtype=np.float64)
    rho = np.hypot(x, y)
    lat = -90.0 + 2.0 * np.degrees(np.arctan(rho / (2.0 * R_MOON_M)))
    lon = np.degrees(np.arctan2(x, y))
    return lat, lon
