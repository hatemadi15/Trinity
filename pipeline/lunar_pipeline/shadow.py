"""Exact Sun shadows on a height grid, by one sweep along the Sun's direction.

A pixel is lit when no terrain further towards the Sun on its line rises above the line from that
pixel to the Sun. With heights lowered by r^2/2R (r from the site) sight lines over the curved Moon
are straight, so along a line towards the Sun the test is a running maximum of

    g = tangent height - (distance towards the Sun) * tan(elevation).

Grids are north-up rasters of the south polar stereographic maps (row 0 at the top, map-up is the
longitude 0 direction). Lines follow the Sun's bearing with one pixel per step along the major axis;
every pixel belongs to exactly one line. Levels are chained from coarse to fine: a fine line starts
from the coarse level's running maximum where it enters the fine window, so hills outside the window
still cast their shadows into it. The browser engine mirrors this module (web/src/lib/engine/shadow.ts
from part 3 of the redesign).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import config

Seed = Callable[[np.ndarray, np.ndarray], np.ndarray]


@dataclass(frozen=True)
class Level:
    """One height grid: heights in metres, pixel size, and the site as a fractional pixel."""

    heights_m: np.ndarray
    px_m: float
    site_col: float
    site_row: float


def sun_bearing_deg(lon_deg: float, sun_az_deg: float) -> float:
    """Map bearing of the Sun, clockwise from map-up, for a site at this longitude.

    On the south polar grids x = rho sin(lon), y = rho cos(lon): true north at longitude L points
    along (sin L, cos L) and true east along (cos L, -sin L), so azimuth A maps to bearing L + A.
    """
    return float((lon_deg + sun_az_deg) % 360.0)


def grid_xy(shape: tuple[int, int], px_m: float, site_col: float, site_row: float) -> tuple[np.ndarray, np.ndarray]:
    """Map metres of every pixel centre: x to the right, y up, the site at the origin."""
    rows, cols = np.indices(shape, dtype=np.float64)
    return (cols - site_col) * px_m, (site_row - rows) * px_m


def tangent_heights(heights_m: np.ndarray, x_m: np.ndarray, y_m: np.ndarray, r_moon_m: float = config.R_MOON_M) -> np.ndarray:
    """Heights in the site's tangent plane: lowered by r^2/2R so that straight lines are sight lines."""
    return np.asarray(heights_m, dtype=np.float64) - (x_m * x_m + y_m * y_m) / (2.0 * r_moon_m)


def sweep(
    z_t: np.ndarray, x_m: np.ndarray, y_m: np.ndarray, bearing_deg: float, el_deg: float, seed: Seed | None = None
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Lit mask, the running maximum before each pixel, and the shadow margin (m) for one grid.

    `seed(x, y)` gives the starting maximum of the lines that enter the grid at those map positions
    (their first pixel on the sunward side); without it lines start at -inf.
    """
    h, w = z_t.shape
    b = np.radians(bearing_deg)
    sx, sy = float(np.sin(b)), float(np.cos(b))  # towards the Sun in map x (right) and y (up)
    g = z_t - (x_m * sx + y_m * sy) * np.tan(np.radians(el_deg))
    m_before = np.full((h, w), -np.inf)
    ux, uy = sx, -sy  # the same direction in grid steps: columns to the right, rows downwards

    if abs(ux) >= abs(uy):
        slope = uy / ux  # rows per column
        start = w - 1 if ux > 0 else 0
        order = range(w - 1, -1, -1) if ux > 0 else range(w)
        span = int(np.ceil(abs(slope) * (w - 1))) + 1
        m = np.full(h + 2 * span, -np.inf)
        entered = np.zeros(h + 2 * span, dtype=bool)
        for c in order:
            lo = span - int(np.floor(slope * (c - start) + 0.5))  # line index of row 0 in this column
            view = slice(lo, lo + h)
            if seed is not None:
                new = ~entered[view]
                if new.any():
                    m[view][new] = seed(x_m[new, c], y_m[new, c])
            entered[view] = True
            gc = g[:, c]
            m_before[:, c] = m[view]
            m[view] = np.maximum(m[view], gc)
    else:
        slope = ux / uy  # columns per row
        start = h - 1 if uy > 0 else 0
        order = range(h - 1, -1, -1) if uy > 0 else range(h)
        span = int(np.ceil(abs(slope) * (h - 1))) + 1
        m = np.full(w + 2 * span, -np.inf)
        entered = np.zeros(w + 2 * span, dtype=bool)
        for r in order:
            lo = span - int(np.floor(slope * (r - start) + 0.5))
            view = slice(lo, lo + w)
            if seed is not None:
                new = ~entered[view]
                if new.any():
                    m[view][new] = seed(x_m[r, new], y_m[r, new])
            entered[view] = True
            gr = g[r, :]
            m_before[r, :] = m[view]
            m[view] = np.maximum(m[view], gr)

    margin = m_before - g
    return margin <= 0.0, m_before, margin


def _seed_from(level: Level, m_before: np.ndarray) -> Seed:
    """Starting maxima for a finer grid: the coarse running maximum at the coarse pixel under each entry point."""
    h, w = m_before.shape

    def seed(x: np.ndarray, y: np.ndarray) -> np.ndarray:
        col = np.floor(x / level.px_m + level.site_col + 0.5).astype(np.int64)
        row = np.floor(level.site_row - y / level.px_m + 0.5).astype(np.int64)
        ok = (col >= 0) & (col < w) & (row >= 0) & (row < h)
        out = np.full(x.shape, -np.inf)
        out[ok] = m_before[row[ok], col[ok]]
        return out

    return seed


def cast(levels: list[Level], bearing_deg: float, el_deg: float) -> tuple[np.ndarray, np.ndarray]:
    """Sweeps the levels from coarse to fine, each seeded from the one before; returns (lit, margin) of the finest."""
    if not levels:
        raise ValueError("cast needs at least one level")
    seed: Seed | None = None
    lit = margin = None
    for level in levels:
        x, y = grid_xy(level.heights_m.shape, level.px_m, level.site_col, level.site_row)
        z_t = tangent_heights(level.heights_m, x, y)
        lit, m_before, margin = sweep(z_t, x, y, bearing_deg, el_deg, seed)
        seed = _seed_from(level, m_before)
    return lit, margin


def shade(heights_m: np.ndarray, px_m: float, margin_m: np.ndarray, bearing_deg: float, el_deg: float, soft_m: float = 6.0) -> np.ndarray:
    """A north-up 8-bit picture: sunlit slopes by the angle to the Sun, shadows with a faint fixed fill so shape survives."""
    z = np.asarray(heights_m, dtype=np.float64)
    gy, gx = np.gradient(z, px_m)  # gy along rows (downwards), gx along columns
    nx, ny, nz = -gx, gy, np.ones_like(z)  # map x right, y up
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    b, el = np.radians(bearing_deg), np.radians(el_deg)
    lx, ly, lz = np.sin(b) * np.cos(el), np.cos(b) * np.cos(el), np.sin(el)
    direct = np.clip((nx * lx + ny * ly + nz * lz) / norm, 0.0, None)
    lit = np.clip(0.5 - margin_m / soft_m, 0.0, 1.0)  # soft edge over a few metres of margin
    fill_b = np.radians(40.0)
    fill = np.clip((nx * np.sin(fill_b) * 0.5 + ny * np.cos(fill_b) * 0.5 + nz * 0.866) / norm, 0.0, 1.0)
    sunlit = direct[lit > 0.5]
    k = 1.0 / max(float(np.percentile(sunlit, 92)), 1e-3) if sunlit.size else 1.0
    tone = 1.0 - np.exp(-1.9 * np.clip(direct * k, 0.0, 1.6) * lit)
    return np.clip(255.0 * (0.035 + 0.085 * fill + 0.9 * tone), 0, 255).astype(np.uint8)


def fixture_cases() -> dict[str, list[Level]]:
    """Small grids the browser's port is checked against: a ridge, and a coarse level chained into a fine one.

    Heights are rounded to 0.1 mm so that the numbers written to the fixture give exactly the same answers.
    """
    h, w = 24, 32
    rows, cols = np.indices((h, w), dtype=np.float64)
    ridge = np.round(300.0 * np.exp(-((cols - 20.0) ** 2) / 18.0) + 20.0 * np.sin(rows / 3.0), 4)
    coarse = np.zeros((16, 16))
    coarse[0:3, :] = 900.0  # a wall to the north of the fine grid, outside it
    frows, fcols = np.indices((20, 20), dtype=np.float64)
    fine = np.round(15.0 * np.cos(fcols / 4.0) * np.sin(frows / 5.0), 4)
    return {
        "ridge": [Level(ridge, 20.0, (w - 1) / 2, (h - 1) / 2)],
        "chain": [Level(coarse, 80.0, 7.5, 7.5), Level(fine, 20.0, 9.5, 9.5)],
    }


FIXTURE_SUNS = [(250.0, 2.0), (0.0, 1.0), (45.0, 4.0), (123.4, 0.5), (300.0, -0.5)]


def write_fixtures(out_dir: Path) -> list[Path]:
    """Writes one golden file per case grid: the levels, and for each Sun the finest level's lit mask, margin and picture."""
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, levels in fixture_cases().items():
        cases = []
        for bearing, el in FIXTURE_SUNS:
            lit, margin = cast(levels, bearing, el)
            fine = levels[-1]
            cases.append(
                {
                    "bearing_deg": bearing,
                    "el_deg": el,
                    "lit": lit.astype(int).ravel().tolist(),
                    "margin": [round(float(m), 4) if np.isfinite(m) else None for m in margin.ravel()],
                    "shade": shade(fine.heights_m, fine.px_m, margin, bearing, el).ravel().tolist(),
                }
            )
        doc = {
            "name": name,
            "levels": [
                {
                    "heights": lv.heights_m.ravel().tolist(),
                    "width": int(lv.heights_m.shape[1]),
                    "height": int(lv.heights_m.shape[0]),
                    "px_m": lv.px_m,
                    "site_col": lv.site_col,
                    "site_row": lv.site_row,
                }
                for lv in levels
            ],
            "cases": cases,
        }
        path = out_dir / f"{name}.json"
        path.write_text(json.dumps(doc) + "\n")
        paths.append(path)
    return paths
