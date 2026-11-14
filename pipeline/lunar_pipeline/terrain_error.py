"""An error model for the terrain behind the skylines, fitted to two generations of NASA's south-pole heights.

The app traces its skylines through the LOLA polar grids at PDS (data_raw/lola). PGDA product 90 (Barker et al. 2023)
re-fits the same laser tracks to each other and states a height error (ERR, one sigma) for every pixel of its adjusted
models. Around every polar site the app's heights minus product 90's, on the same pixels, show how far two careful
models of the same ground disagree:
- the size of the differences, as a function of the slope (a shift between the models moves heights most on steep
  ground) and of the stated error (sparse laser tracks leave both models less sure);
- the distance over which they stay correlated, from their semivariogram (half the mean square difference between
  two points that far apart), after dividing by the fitted size so steep and flat ground count alike.

The fit, per grid resolution (20, 80 and 240 m), is a Gaussian error with standard deviation
    sigma(x) = sqrt(a^2 + (b tan slope(x))^2 + (c ERR(x))^2)
and an exponential correlation exp(-distance / L). Its size is set by the binned mean squares of the differences
(non-negative least squares), its length by the semivariogram at short lags.

What it cannot capture: errors the two generations share (both come from the same laser shots, so a hill neither
resolves, or a track error both inherit, is absent from the differences); the slow part of the differences, a few
tenths of a metre over tens of kilometres, which moves a site and its skyline together and is left out; and the
differences' own shape, which is heavier-tailed than a Gaussian and lines up along the laser tracks. The differences
are the older grids' error if product 90 is right; used as the error of product 90 itself, the model is cautious.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from itertools import combinations
from pathlib import Path

import numpy as np

from . import config

OUT_DIR = config.DATA_DIR / "ensemble"
# Window half-widths around each site: the 20 m model's cached windows, 30 km on the 80 m grids, 90 km on the 240 m grids.
HALF_M = {20: 6_500.0, 80: 30_000.0, 240: 90_000.0}
APP_GRIDS = {20: "ldem_875s_20m", 80: "ldem_80s_80m", 240: "ldem_60s_240m"}
ADJ_FILES = {20: ("LDEM_80S_20MPP_ADJ.TIF", "LDEM_80S_20MPP_ADJ_ERR.TIF"), 80: ("LDEM_80S_80MPP_ADJ.TIF", "LDEM_80S_80MPP_ADJ_ERR.TIF"), 240: ("LDEM_60S_240MPP_ADJ.TIF", "LDEM_60S_240MPP_ADJ_ERR.TIF")}
SLOPE_EDGES = np.array([0.0, 2.5, 5.0, 7.5, 10.0, 12.5, 15.0, 17.5, 20.0, 25.0, 30.0, 40.0, 90.0])
ERR_QUANTILES = np.array([0.0, 0.25, 0.5, 0.75, 0.9, 0.97, 1.0])
# Lags of the semivariogram: one pixel to the short sill (the length is read below 1 km), then on to 20 km for the slow part.
SHORT_LAG_M = 1_000.0
LONG_LAG_M = 20_000.0


# ---------------------------------------------------------------- pieces


def slope_deg(h: np.ndarray, scale_m: float) -> np.ndarray:
    """Slope of a height grid in degrees, from central differences (one-sided at the edges)."""
    gy, gx = np.gradient(np.asarray(h, dtype=np.float64), scale_m)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


@dataclass(frozen=True)
class Sigma:
    """The fitted size of the error at one resolution: sigma^2 = a^2 + (b tan slope)^2 + (c ERR)^2, in metres."""

    a_m: float
    b_m: float
    c: float

    def at(self, slope: np.ndarray, err: np.ndarray) -> np.ndarray:
        t = np.tan(np.radians(np.asarray(slope, dtype=np.float64)))
        e = np.nan_to_num(np.asarray(err, dtype=np.float64))
        return np.sqrt(self.a_m**2 + (self.b_m * t) ** 2 + (self.c * e) ** 2)


def binned_squares(d: np.ndarray, slope: np.ndarray, err: np.ndarray, err_edges: np.ndarray) -> dict:
    """Count, sum of squares, and mean tan^2 slope and ERR^2 of the differences in cells of slope by stated error."""
    ok = np.isfinite(d) & np.isfinite(slope) & np.isfinite(err)
    d, s, e = d[ok], slope[ok], err[ok]
    i = np.clip(np.searchsorted(SLOPE_EDGES, s, side="right") - 1, 0, SLOPE_EDGES.size - 2)
    j = np.clip(np.searchsorted(err_edges, e, side="right") - 1, 0, err_edges.size - 2)
    cell = i * (err_edges.size - 1) + j
    n_cells = (SLOPE_EDGES.size - 1) * (err_edges.size - 1)
    t2 = np.tan(np.radians(s)) ** 2
    return {
        "n": np.bincount(cell, minlength=n_cells).astype(np.float64),
        "sum_d2": np.bincount(cell, weights=d * d, minlength=n_cells),
        "sum_t2": np.bincount(cell, weights=t2, minlength=n_cells),
        "sum_e2": np.bincount(cell, weights=e * e, minlength=n_cells),
    }


def add_cells(a: dict | None, b: dict) -> dict:
    return dict(b) if a is None else {k: a[k] + b[k] for k in a}


def fit_sigma(cells: dict, min_count: int = 200) -> Sigma:
    """a^2, b^2, c^2 >= 0 that best give each cell's mean square difference from its mean tan^2 slope and ERR^2.

    Weighted by each cell's count, on the cells with at least `min_count` differences; the three unknowns are few enough
    to try every subset of them and keep the best fit whose values are all non-negative.
    """
    n = cells["n"]
    use = n >= min_count
    w = np.sqrt(n[use])
    y = cells["sum_d2"][use] / n[use]
    x = np.stack([np.ones(use.sum()), cells["sum_t2"][use] / n[use], cells["sum_e2"][use] / n[use]], axis=1)
    best, best_res = np.zeros(3), np.inf
    for k in range(1, 4):
        for cols in combinations(range(3), k):
            sol, *_ = np.linalg.lstsq(x[:, cols] * w[:, None], y * w, rcond=None)
            if np.any(sol < 0):
                continue
            full = np.zeros(3)
            full[list(cols)] = sol
            res = float(np.sum((w * (x @ full - y)) ** 2))
            if res < best_res:
                best, best_res = full, res
    return Sigma(*(float(np.sqrt(v)) for v in best))


def semivariogram_sums(z: np.ndarray, valid: np.ndarray, scale_m: float, edges_m: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Over every pair of valid pixels of a window, by the distance between them: the number of pairs and the sum of (z(x) - z(y))^2.

    Worked out with Fourier transforms (zero-padded, so no pair wraps round): for each lag, the pairs' squares
    z(x+lag)^2 + z(x)^2 - 2 z(x) z(x+lag) summed over x are three correlations of z and of the valid mask.
    """
    m = valid.astype(np.float64)
    v = np.where(valid, np.asarray(z, dtype=np.float64), 0.0)
    shape = (2 * v.shape[0], 2 * v.shape[1])
    fm, fz, fz2 = (np.fft.rfft2(a, s=shape) for a in (m, v, v * v))
    pairs = np.fft.irfft2(np.conj(fm) * fm, s=shape)
    sq = np.fft.irfft2(np.conj(fm) * fz2 + np.conj(fz2) * fm - 2.0 * np.conj(fz) * fz, s=shape)
    ky = np.fft.fftfreq(shape[0]) * shape[0]
    kx = np.fft.fftfreq(shape[1]) * shape[1]
    lag = np.hypot(ky[:, None], kx[None, :]) * scale_m
    k = np.searchsorted(edges_m, lag, side="right") - 1
    inside = (k >= 0) & (k < edges_m.size - 1) & (pairs > 0.5)
    n = np.bincount(k[inside], weights=pairs[inside], minlength=edges_m.size - 1)
    s = np.bincount(k[inside], weights=sq[inside], minlength=edges_m.size - 1)
    return n, s


def lag_edges(scale_m: float, max_m: float = LONG_LAG_M, per_decade: int = 8) -> np.ndarray:
    """Lag bins from just under one pixel, spaced evenly in log distance up to `max_m`."""
    lo = 0.9 * scale_m
    n = int(np.ceil(np.log10(max_m / lo) * per_decade))
    return np.geomspace(lo, max_m, n + 1)


def fit_length(lag_m: np.ndarray, gamma: np.ndarray, pairs: np.ndarray, max_lag_m: float = SHORT_LAG_M) -> tuple[float, float]:
    """The exponential correlation length L and sill s that best give gamma(h) = s (1 - exp(-h / L)) at lags up to `max_lag_m`.

    L is searched on a fine logarithmic grid from 2 m to 20 km; for each, the sill is the weighted least-squares value.
    Each lag bin counts by the square root of its pairs, so the many long-lag pairs do not drown the short lags.
    """
    use = (lag_m <= max_lag_m) & (pairs > 0) & np.isfinite(gamma)
    h, g, w = lag_m[use], gamma[use], np.sqrt(pairs[use])
    best = (np.nan, np.nan, np.inf)
    for length in np.geomspace(2.0, 20_000.0, 801):
        f = 1.0 - np.exp(-h / length)
        sill = float(np.sum(w * w * f * g) / np.sum(w * w * f * f))
        res = float(np.sum((w * (sill * f - g)) ** 2))
        if res < best[2]:
            best = (float(length), sill, res)
    return best[0], best[1]


# ---------------------------------------------------------------- the difference maps


@dataclass(frozen=True)
class Window:
    """A square of both generations on the same pixels, with product 90's stated error and slope."""

    site_id: str
    scale_m: float
    app: np.ndarray
    adjusted: np.ndarray
    err: np.ndarray

    def difference(self) -> np.ndarray:
        """The app's heights minus product 90's, less their median over the window (a common offset moves no skyline)."""
        d = self.app - self.adjusted
        ok = np.isfinite(d) & np.isfinite(self.err)
        return np.where(ok, d - np.median(d[ok]), np.nan) if ok.any() else np.full(d.shape, np.nan)


def square(grid, lat: float, lon: float, half_m: float) -> np.ndarray:
    """The square of a grid within `half_m` of a point, in metres, NaN outside the grid (int16 grids scaled to metres)."""
    col, row = grid.pixel_from_latlon(lat, lon)
    n = int(np.ceil(half_m / grid.label.map_scale_m))
    r, c = round(float(row)), round(float(col))
    out = np.full((2 * n + 1, 2 * n + 1), np.nan)
    r0, c0 = max(r - n, 0), max(c - n, 0)
    r1, c1 = min(r + n + 1, grid.label.lines), min(c + n + 1, grid.label.samples)
    if r1 <= r0 or c1 <= c0:
        return out
    # As LolaGrid reads values: the stored numbers times the label's scaling factor (1 for product 90's float grids).
    block = np.asarray(grid.data[r0:r1, c0:c1], dtype=np.float64) * grid.label.scaling_factor
    out[r0 - (r - n) : r1 - (r - n), c0 - (c - n) : c1 - (c - n)] = block
    return out


def app_window_20(site, lola20, read) -> Window | None:
    """The 20 m windows product 90 is read in around the sites south of 87.55 S, with the app's 20 m grid on the same pixels."""
    if site.lat > -87.55:
        return None
    dem, err = read("dem20", site.lat, site.lon, HALF_M[20]), read("err20", site.lat, site.lon, HALF_M[20])
    g = dem.grid()
    col, row = lola20.pixel_from_latlon(*g.latlon_from_pixel(0.0, 0.0))
    c0, r0 = round(float(col)), round(float(row))
    if abs(float(col) - c0) > 1e-3 or abs(float(row) - r0) > 1e-3:
        raise ValueError(f"the 20 m grids are not on the same pixels near {site.id}")
    rows, cols = dem.data.shape
    app = np.asarray(lola20.data[r0 : r0 + rows, c0 : c0 + cols], dtype=np.float64) * lola20.label.scaling_factor
    return Window(site.id, 20.0, app, np.asarray(dem.data, dtype=np.float64), np.asarray(err.data, dtype=np.float64))


# ---------------------------------------------------------------- the fit


def err_edges_of(windows: list[Window]) -> np.ndarray:
    """Bins of the stated error at its quantiles over the windows, the last one open."""
    err_all = np.concatenate([w.err[np.isfinite(w.err) & np.isfinite(w.app - w.adjusted)] for w in windows])
    edges = np.quantile(err_all, ERR_QUANTILES)
    edges[-1] = np.inf
    return edges


def window_cells(windows: list[Window], err_edges: np.ndarray) -> dict:
    """The cells of slope by stated error over the windows, a pixel two windows share counted in each."""
    cells = None
    for w in windows:
        cells = add_cells(cells, binned_squares(w.difference(), slope_deg(w.adjusted, w.scale_m), w.err, err_edges))
    return cells


def fit_resolution(windows: list[Window], cells: dict, err_edges: np.ndarray) -> dict:
    """The fitted size (from `cells`) and length (from the windows) at one resolution, how well the size fits, and the stated error beside it."""
    sigma = fit_sigma(cells)
    # The length, from the differences divided by the fitted size, pooled over the windows.
    edges = lag_edges(windows[0].scale_m)
    n_sum = np.zeros(edges.size - 1)
    s_sum = np.zeros(edges.size - 1)
    within1, within2, count, rms, err_rms = 0, 0, 0, [], []
    per_site = {}
    for w in windows:
        d = w.difference()
        sd = sigma.at(slope_deg(w.adjusted, w.scale_m), w.err)
        z = d / sd
        ok = np.isfinite(z)
        n, s = semivariogram_sums(np.where(ok, z, 0.0), ok, w.scale_m, edges)
        n_sum += n
        s_sum += s
        a = np.abs(z[ok])
        within1 += int(np.sum(a <= 1.0))
        within2 += int(np.sum(a <= 2.0))
        count += int(ok.sum())
        dv, ev = d[ok], w.err[ok]
        rms.append(float(np.sqrt(np.mean(dv * dv))))
        err_rms.append(float(np.sqrt(np.mean(ev * ev))))
        per_site[w.site_id] = {
            "pixels": int(ok.sum()),
            "difference_rms_m": round(rms[-1], 3),
            "difference_p95_abs_m": round(float(np.percentile(np.abs(dv), 95)), 3),
            "stated_error_median_m": round(float(np.median(ev)), 3),
            "stated_error_rms_m": round(err_rms[-1], 3),
            "difference_over_stated_error": round(rms[-1] / max(err_rms[-1], 1e-6), 2),
            "within_fitted_sigma": round(float(np.mean(a <= 1.0)), 3),
        }
    lag = np.sqrt(edges[:-1] * edges[1:])
    gamma = np.where(n_sum > 0, 0.5 * s_sum / np.maximum(n_sum, 1.0), np.nan)
    length, sill = fit_length(lag, gamma, n_sum)
    far = (lag > 5_000.0) & (n_sum > 0)
    return {
        "scale_m": windows[0].scale_m,
        "windows": len(windows),
        "sigma": asdict(sigma),
        "length_m": round(length, 1),
        "sill": round(sill, 3),
        "within_1_sigma": round(within1 / max(count, 1), 3),
        "within_2_sigma": round(within2 / max(count, 1), 3),
        "difference_rms_m": {"median": round(float(np.median(rms)), 3), "min": round(min(rms), 3), "max": round(max(rms), 3)},
        "stated_error_rms_m": {"median": round(float(np.median(err_rms)), 3), "min": round(min(err_rms), 3), "max": round(max(err_rms), 3)},
        "difference_over_stated_error": {"median": round(float(np.median(np.array(rms) / np.maximum(err_rms, 1e-6))), 2)},
        # The slow part: how far the semivariogram of the scaled differences climbs past its short sill by 5 to 20 km.
        "slow_rise": round(float(np.nanmean(gamma[far]) - sill), 3) if far.any() else None,
        "semivariogram": [[round(float(h)), round(float(g), 4), int(n)] for h, g, n in zip(lag, gamma, n_sum) if n > 0],
        "cells": {"slope_edges_deg": SLOPE_EDGES.tolist(), "err_edges_m": [round(float(e), 4) for e in err_edges[:-1]] + [None],
                  "count": cells["n"].astype(int).tolist(), "rms_m": np.sqrt(cells["sum_d2"] / np.maximum(cells["n"], 1)).round(3).tolist()},
        "sites": per_site,
    }


def union_cells(sites, scale: int, grids: tuple, err_edges: np.ndarray) -> dict:
    """The cells of slope by stated error over the union of the sites' windows on one whole grid, each pixel once."""
    app, adj, err = grids
    lab = adj.label
    taken = np.zeros((lab.lines, lab.samples), dtype=bool)
    cells = None
    for s in sites:
        col, row = adj.pixel_from_latlon(s.lat, s.lon)
        n = int(np.ceil(HALF_M[scale] / lab.map_scale_m))
        r, c = round(float(row)), round(float(col))
        r0, c0, r1, c1 = max(r - n, 0), max(c - n, 0), min(r + n + 1, lab.lines), min(c + n + 1, lab.samples)
        if r1 <= r0 or c1 <= c0:
            continue
        fresh = ~taken[r0:r1, c0:c1]
        taken[r0:r1, c0:c1] = True
        w = Window(s.id, lab.map_scale_m, square(app, s.lat, s.lon, HALF_M[scale]), square(adj, s.lat, s.lon, HALF_M[scale]), square(err, s.lat, s.lon, HALF_M[scale]))
        d = w.difference()
        sl = slope_deg(w.adjusted, w.scale_m)
        # Keep only the pixels no earlier window took, cut to the part of the square inside the grid.
        rr, cc = slice(r0 - (r - n), r1 - (r - n)), slice(c0 - (c - n), c1 - (c - n))
        keep = np.full(d.shape, False)
        keep[rr, cc] = fresh
        cells = add_cells(cells, binned_squares(np.where(keep, d, np.nan), sl, w.err, err_edges))
    return cells


def fit(sites=None, read=None, out: Path | None = None) -> dict:
    """The error model at the three resolutions from every polar site (or `sites`), written to data/ensemble/error_model.json."""
    from .lola import LolaGrid
    from .pgda90 import full_path, grid_from_geotiff, read_window
    from .sites import all_sites

    read = read or read_window
    sites = sites or [s for s in all_sites() if s.polar]
    lola = {k: LolaGrid.from_pds(config.LOLA_DIR / f"{v}.lbl", mmap=True) for k, v in APP_GRIDS.items()}
    adj = {80: grid_from_geotiff(full_path("dem80")), 240: grid_from_geotiff(full_path("dem240"))}
    err = {80: grid_from_geotiff(full_path("err80")), 240: grid_from_geotiff(full_path("err240"))}
    resolutions = {}
    for scale in (20, 80, 240):
        print(f"[error-model] {scale} m", flush=True)
        if scale == 20:
            windows = [w for w in (app_window_20(s, lola[20], read) for s in sites) if w is not None]
            edges = err_edges_of(windows)
            # The 20 m windows of sites a few km apart overlap; there each window counts its own pixels.
            cells = window_cells(windows, edges)
        else:
            windows = []
            for s in sites:
                w = Window(s.id, float(scale), square(lola[scale], s.lat, s.lon, HALF_M[scale]), square(adj[scale], s.lat, s.lon, HALF_M[scale]), square(err[scale], s.lat, s.lon, HALF_M[scale]))
                if np.isfinite(w.app - w.adjusted).sum() > 1000:
                    windows.append(w)
            edges = err_edges_of(windows)
            cells = union_cells([s for s in sites if any(w.site_id == s.id for w in windows)], scale, (lola[scale], adj[scale], err[scale]), edges)
        resolutions[str(scale)] = fit_resolution(windows, cells, edges)
    doc = {
        "version": 1,
        "generated_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "about": "The app's LOLA heights minus PGDA product 90's adjusted heights around the polar sites: their fitted size and correlation length, beside product 90's stated error.",
        "app_grids": {str(k): v for k, v in APP_GRIDS.items()},
        "adjusted_files": {str(k): list(v) for k, v in ADJ_FILES.items()},
        "windows_half_km": {str(k): v / 1000.0 for k, v in HALF_M.items()},
        "model": "sigma(x) = sqrt(a^2 + (b tan slope)^2 + (c ERR)^2) m; correlation exp(-distance / length)",
        "method": METHOD,
        "not_captured": NOT_CAPTURED,
        "resolutions": resolutions,
    }
    out = out or OUT_DIR / "error_model.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8", newline="\n")
    return doc


def load_model(path: Path | None = None) -> dict[int, tuple[Sigma, float]]:
    """The fitted size and correlation length at each resolution, from data/ensemble/error_model.json."""
    doc = json.loads((path or OUT_DIR / "error_model.json").read_text(encoding="utf-8"))
    return {int(k): (Sigma(**v["sigma"]), float(v["length_m"])) for k, v in doc["resolutions"].items()}


METHOD = (
    "Around every polar site, the app's LOLA heights (ldem_875s_20m, ldem_80s_80m, ldem_60s_240m) minus product 90's adjusted "
    "heights on the same pixels, less their median over the window: 6.5 km squares at 20 m round the sites south of 87.55 S, 30 km "
    "squares at 80 m and 90 km squares at 240 m round every site, each pixel counted once where squares overlap (not at 20 m). "
    "The size: the mean square difference in cells of slope (product 90's, 2.5 to 10 degree bins) by stated error (quantile bins), "
    "fitted by non-negative weighted least squares with sigma^2 = a^2 + (b tan slope)^2 + (c ERR)^2. The length: the semivariogram "
    "of the differences divided by that sigma, pooled over the windows, fitted with s (1 - exp(-h / L)) at lags up to 1 km."
)
NOT_CAPTURED = (
    "Errors both generations share, since both come from the same laser shots (a hill neither resolves, a track error both inherit); "
    "the slow part of the differences (a few tenths of a metre over tens of kilometres), which moves a site and its skyline together "
    "and is left out; the differences' heavier-than-Gaussian tails and their alignment along laser tracks; and anything under one pixel."
)
