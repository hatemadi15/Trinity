"""Terrain versions: the ground at each polar site drawn many times from the fitted error model, each traced to a skyline.

For every polar site, product 90's adjusted models (the grids the uncertainty budget traces, cropped to what the bands
reach) plus sigma(x) z(x) on each band's grid: sigma is the fitted size of the error at that grid's resolution
(terrain_error, from product 90's slope and stated error there) and z a unit Gaussian field with the fitted exponential
correlation, drawn on the grid by circulant embedding, afresh for every version and grid, from a seed fixed per site.
The site's own height is read from the version it stands on, so its error moves every direction together. Each version
is marched with uncertainty.horizon_profile through the app's bands (masks.bands_for_site and fallback_bands) from the
app's 2 m mast.

Written to data/ensemble/<site>.json (each version's 720 directions as int16 thousandths of a degree, base64) with
data/ensemble/index.json: the model, and per site the spread of the versions, their bias, and how often the app's own
skyline and product 90's fall inside them.
"""

from __future__ import annotations

import base64
import json
import time
import zlib
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from . import config
from .horizon import Band, site_height_m
from .lola import LolaGrid
from .terrain_error import OUT_DIR, Sigma, load_model, slope_deg

VERSIONS = 32
SEED = 20261115
SCALE_DEG = 0.001  # one unit of the stored skylines
# How far out each grid is cropped: the bands reach 100 km on the 80 m model and 220 km on the 240 m one; the margin
# keeps the bilinear step and the band's last sample inside.
CROP_HALF_M = {80: 103_000.0, 240: 224_000.0}


# ---------------------------------------------------------------- random fields


class FieldMaker:
    """Unit-variance Gaussian fields on a grid with correlation exp(-distance / length), by circulant embedding.

    The covariance of the periodic grid is diagonal in Fourier space, so a field is white noise filtered by the square
    root of the covariance's transform; the grid is far wider than the length, so its wrapping changes nothing near the
    site. The filter is worked out once per grid shape and length.
    """

    def __init__(self):
        self._filters: dict[tuple, np.ndarray] = {}

    def filter(self, shape: tuple[int, int], length_px: float) -> np.ndarray:
        key = (shape, round(float(length_px), 6))
        if key not in self._filters:
            ny, nx = shape
            dy = np.minimum(np.arange(ny), ny - np.arange(ny)).astype(np.float64)
            dx = np.minimum(np.arange(nx), nx - np.arange(nx)).astype(np.float64)
            cov = np.exp(-np.hypot(dy[:, None], dx[None, :]) / max(length_px, 1e-9))
            lam = np.fft.rfft2(cov).real
            self._filters[key] = np.sqrt(np.clip(lam, 0.0, None))
        return self._filters[key]

    def draw(self, shape: tuple[int, int], length_px: float, rng: np.random.Generator) -> np.ndarray:
        w = rng.standard_normal(shape)
        return np.fft.irfft2(np.fft.rfft2(w) * self.filter(shape, length_px), s=shape)


# ---------------------------------------------------------------- grids


def crop(grid: LolaGrid, lat: float, lon: float, half_m: float) -> LolaGrid | None:
    """The part of a grid within `half_m` of a point (a LolaGrid of its own), or None when the grid does not reach it."""
    col, row = grid.pixel_from_latlon(lat, lon)
    n = int(np.ceil(half_m / grid.label.map_scale_m))
    r0, c0 = max(int(row) - n, 0), max(int(col) - n, 0)
    r1, c1 = min(int(row) + n + 1, grid.label.lines), min(int(col) + n + 1, grid.label.samples)
    if r1 - r0 < 3 or c1 - c0 < 3:
        return None
    return grid.subgrid(r0, c0, r1 - r0, c1 - c0)


def err_on(dem: LolaGrid, err: LolaGrid) -> np.ndarray:
    """The stated error on the model's pixels: the same pixels when the grids coincide, else read at the model's pixel centres."""
    a, b = dem.label, err.label
    same = (a.lines, a.samples, a.map_scale_m, a.line_offset_px, a.sample_offset_px) == (b.lines, b.samples, b.map_scale_m, b.line_offset_px, b.sample_offset_px)
    if same:
        e = np.asarray(err.data, dtype=np.float64)
    else:
        rr, cc = np.mgrid[0 : a.lines, 0 : a.samples]
        lat, lon = dem.latlon_from_pixel(cc.astype(np.float64), rr.astype(np.float64))
        e = np.asarray(err.value_at(lat.ravel(), lon.ravel()), dtype=np.float64).reshape(a.lines, a.samples)
    finite = np.isfinite(e)
    return np.where(finite, e, np.nanmedian(e) if finite.any() else 0.0)


class Perturbable:
    """One grid a site's bands read, with the size of its error at every pixel, ready to draw versions of."""

    def __init__(self, grid: LolaGrid, err: np.ndarray | None, sigma: Sigma, length_m: float):
        self.grid = grid
        data = np.asarray(grid.data, dtype=np.float64)
        self.base = data
        self.has_data = bool(np.isfinite(data).any())
        if self.has_data:
            slope = slope_deg(np.where(np.isfinite(data), data, np.nanmedian(data)), grid.label.map_scale_m)
            self.sd = sigma.at(slope, err if err is not None else np.zeros_like(data))
        else:
            self.sd = np.zeros_like(data)
        self.length_px = length_m / grid.label.map_scale_m

    def version(self, fields: FieldMaker, rng: np.random.Generator) -> LolaGrid:
        if not self.has_data:
            return self.grid
        z = fields.draw(self.base.shape, self.length_px, rng)
        return LolaGrid(self.grid.label, (self.base + self.sd * z).astype(np.float32))


# ---------------------------------------------------------------- one site


def site_grids(site, full: dict) -> tuple[dict, dict]:
    """The site's adjusted grids as the budget traces them (cropped) and the stated error on each, by band level."""
    from .uncertainty import adjusted_grids, read_err_window

    sub = {k: crop(full[k], site.lat, site.lon, CROP_HALF_M[80 if k.endswith("80") else 240]) for k in ("dem80", "err80", "dem240", "err240")}
    # North of 80 S the 80 m model has no ground: its band reaches nothing, as the app's own 80 m grid does there.
    dem80 = sub["dem80"] if sub["dem80"] is not None else _blank_like(full["dem80"])
    grids = adjusted_grids(site, dem80, sub["dem240"])
    errs = {"L1": None if sub["err80"] is None else err_on(grids["L1"], sub["err80"]), "L2": err_on(grids["L2"], sub["err240"])}
    if grids["L0"] is not grids["L1"]:
        errs["L0"] = err_on(grids["L0"], read_err_window(site))
    return grids, errs


def _blank_like(grid: LolaGrid) -> LolaGrid:
    """A 3 by 3 grid of no data in a corner of the same lattice."""
    corner = grid.subgrid(0, 0, 3, 3)
    return LolaGrid(corner.label, np.full((3, 3), np.nan, dtype=np.float32))


def resolution_of(grid: LolaGrid) -> int:
    return round(grid.label.map_scale_m)


def site_versions(site, grids: dict, errs: dict, model: dict, n: int = VERSIONS, seed: int = SEED, mast_m: float = 2.0, n_az: int = 720) -> dict:
    """The adjusted skyline and `n` versions of it, with the time each part took."""
    from .masks import bands_for_site, fallback_bands
    from .uncertainty import horizon_profile

    t0 = time.perf_counter()
    bands = bands_for_site(site, grids)
    bands = bands + fallback_bands(site, bands, grids, n_az=n_az)
    h0 = site_height_m(site.lat, site.lon, [b.grid for b in bands])
    adjusted = horizon_profile(site.lat, site.lon, bands, h0, n_az=n_az, mast_m=mast_m).elevation_deg
    key = {id(g): k for k, g in grids.items()}
    levels = sorted({key[id(b.grid)] for b in bands})
    parts = {k: Perturbable(grids[k], errs.get(k), *model[resolution_of(grids[k])]) for k in levels}
    fields = FieldMaker()
    rng = np.random.default_rng([seed, zlib.crc32(site.id.encode())])
    out = np.empty((n, n_az))
    heights = np.empty(n)
    field_s = march_s = 0.0
    for i in range(n):
        t = time.perf_counter()
        version = {k: p.version(fields, rng) for k, p in parts.items()}
        field_s += time.perf_counter() - t
        t = time.perf_counter()
        vb = [Band(version[key[id(b.grid)]], b.r_min_m, b.r_max_m, b.step_m) for b in bands]
        h = site_height_m(site.lat, site.lon, [b.grid for b in vb])
        out[i] = horizon_profile(site.lat, site.lon, vb, h, n_az=n_az, mast_m=mast_m).elevation_deg
        heights[i] = h
        march_s += time.perf_counter() - t
    return {
        "adjusted": adjusted,
        "versions": out,
        "site_height_adjusted_m": h0,
        "site_heights_m": heights,
        "seconds": {"setup": round(time.perf_counter() - t0 - field_s - march_s, 2), "fields": round(field_s, 2), "march": round(march_s, 2)},
    }


# ---------------------------------------------------------------- storage


def encode(skylines: np.ndarray) -> str:
    """Skylines (versions by directions, degrees) as base64 of little-endian int16 thousandths of a degree."""
    q = np.clip(np.round(np.asarray(skylines, dtype=np.float64) / SCALE_DEG), -32767, 32767).astype("<i2")
    return base64.b64encode(q.tobytes()).decode("ascii")


def decode(text: str, n_az: int = 720) -> np.ndarray:
    q = np.frombuffer(base64.b64decode(text), dtype="<i2").astype(np.float64)
    return (q * SCALE_DEG).reshape(-1, n_az)


def spread(adjusted: np.ndarray, versions: np.ndarray, app: np.ndarray | None, stated_sigma: np.ndarray | None) -> dict:
    """How widely the versions spread in each direction, how far their middle sits from product 90's, and who falls inside them."""
    sd = versions.std(axis=0)
    lo, hi = np.percentile(versions, 5, axis=0), np.percentile(versions, 95, axis=0)
    bias = versions.mean(axis=0) - adjusted
    r = lambda v: round(float(v), 4)
    out = {
        "sd_deg": {"median": r(np.median(sd)), "p95": r(np.percentile(sd, 95)), "max": r(sd.max())},
        "p05_p95_width_deg": {"median": r(np.median(hi - lo)), "p95": r(np.percentile(hi - lo, 95))},
        "mean_minus_adjusted_deg": {"median": r(np.median(bias)), "p95_abs": r(np.percentile(np.abs(bias), 95))},
        "adjusted_inside_p05_p95": r(np.mean((adjusted >= lo) & (adjusted <= hi))),
    }
    if app is not None:
        out["app_inside_p05_p95"] = r(np.mean((app >= lo) & (app <= hi)))
        out["app_inside_min_max"] = r(np.mean((app >= versions.min(axis=0)) & (app <= versions.max(axis=0))))
        out["app_minus_adjusted_p95_abs_deg"] = r(np.percentile(np.abs(app - adjusted), 95))
    if stated_sigma is not None:
        s = np.maximum(stated_sigma, 1e-6)
        out["stated_sigma_deg"] = {"median": r(np.median(stated_sigma)), "p95": r(np.percentile(stated_sigma, 95))}
        out["sd_over_stated_sigma"] = {"median": round(float(np.median(sd / s)), 2), "p95": round(float(np.percentile(sd / s, 95)), 2)}
    return out


def site_doc(site_id: str, result: dict, n_az: int = 720, mast_m: float = 2.0, seed: int = SEED) -> dict:
    return {
        "site_id": site_id,
        "n_versions": int(result["versions"].shape[0]),
        "n_az": n_az,
        "az0_deg": 0.0,
        "az_step_deg": 360.0 / n_az,
        "mast_m": mast_m,
        "scale_deg": SCALE_DEG,
        "encoding": "base64 of little-endian int16, thousandths of a degree; versions one after another, each its 720 directions from north clockwise",
        "seed": [seed, zlib.crc32(site_id.encode())],
        "site_height_adjusted_m": round(float(result["site_height_adjusted_m"]), 2),
        "site_height_m": {"p05": round(float(np.percentile(result["site_heights_m"], 5)), 2), "p95": round(float(np.percentile(result["site_heights_m"], 95)), 2)},
        "adjusted": encode(result["adjusted"][None, :]),
        "versions": encode(result["versions"]),
    }


def load_versions(site_id: str, out_dir: Path = OUT_DIR) -> tuple[np.ndarray, np.ndarray] | None:
    """A site's adjusted skyline and its versions from data/ensemble, or None when it has none."""
    path = out_dir / f"{site_id}.json"
    if not path.exists():
        return None
    doc = json.loads(path.read_text(encoding="utf-8"))
    return decode(doc["adjusted"], doc["n_az"])[0], decode(doc["versions"], doc["n_az"])


# ---------------------------------------------------------------- every site


def build(site_ids: list[str] | None = None, n: int = VERSIONS, seed: int = SEED, out_dir: Path = OUT_DIR) -> dict:
    """Terrain versions for every polar site (or `site_ids`), written beside the error model; returns the index."""
    from .masks import load_mask
    from .pgda90 import full_path, grid_from_geotiff
    from .sites import all_sites

    model = load_model(out_dir / "error_model.json")
    model_doc = json.loads((out_dir / "error_model.json").read_text(encoding="utf-8"))
    sites = [s for s in all_sites() if s.polar and (site_ids is None or s.id in site_ids)]
    print("[ensemble] loading product 90 grids", flush=True)
    full = {k: grid_from_geotiff(full_path(k)) for k in ("dem80", "err80", "dem240", "err240")}
    index_path = out_dir / "index.json"
    previous = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {"sites": []}
    entries = {e["site_id"]: e for e in previous.get("sites", [])}
    for site in sites:
        t = time.perf_counter()
        grids, errs = site_grids(site, full)
        result = site_versions(site, grids, errs, model, n=n, seed=seed)
        doc = site_doc(site.id, result, seed=seed)
        path = out_dir / f"{site.id}.json"
        path.write_text(json.dumps(doc) + "\n", encoding="utf-8", newline="\n")
        app = load_mask(site.id)
        stated = _stated_sigma(site.id)
        stored = _stored_adjusted(site.id)
        entry = {
            "site_id": site.id,
            "file": f"ensemble/{site.id}.json",
            "bytes": path.stat().st_size,
            **spread(result["adjusted"], result["versions"], app, stated),
            "site_height_sd_m": round(float(np.std(result["site_heights_m"])), 3),
            "seconds": result["seconds"],
        }
        if stored is not None:
            entry["adjusted_matches_budget_deg"] = round(float(np.max(np.abs(result["adjusted"] - stored))), 4)
        entries[site.id] = entry
        print(f"[ensemble] {site.id}: {n} versions in {time.perf_counter() - t:.1f} s, sd median {entry['sd_deg']['median']} deg, app inside {entry.get('app_inside_p05_p95')}", flush=True)
    return write_index(entries, n, seed, out_dir, model_doc)


def write_index(entries: dict, n: int, seed: int, out_dir: Path, model_doc: dict) -> dict:
    """data/ensemble/index.json: the model in short and each site's entry, in catalogue order."""
    from .pgda90 import CITATION
    from .sites import all_sites

    order = [s.id for s in all_sites() if s.polar]
    doc = {
        "version": 1,
        "generated_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "versions_per_site": n,
        "seed": seed,
        "n_az": 720,
        "mast_m": 2.0,
        "source": f"PGDA product 90 adjusted LOLA models ({CITATION}), perturbed with the error model in ensemble/error_model.json",
        "model": {k: {"scale_m": v["scale_m"], "sigma": v["sigma"], "length_m": v["length_m"], "within_1_sigma": v["within_1_sigma"], "within_2_sigma": v["within_2_sigma"],
                      "difference_rms_m": v["difference_rms_m"], "stated_error_rms_m": v["stated_error_rms_m"], "difference_over_stated_error": v["difference_over_stated_error"],
                      "slow_rise": v["slow_rise"]} for k, v in model_doc["resolutions"].items()},
        "model_generated_utc": model_doc["generated_utc"],
        "method": METHOD,
        "not_captured": NOT_CAPTURED,
        "sites": [entries[i] for i in order if i in entries],
    }
    doc["bytes"] = int(sum(e["bytes"] for e in doc["sites"]))
    (out_dir / "index.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return doc


def reindex(out_dir: Path = OUT_DIR) -> dict:
    """The index again from the stored versions, without tracing anything: after the budget has stated skylines for more sites."""
    from .masks import load_mask

    model_doc = json.loads((out_dir / "error_model.json").read_text(encoding="utf-8"))
    previous = json.loads((out_dir / "index.json").read_text(encoding="utf-8"))
    entries = {}
    for old in previous["sites"]:
        site_id = old["site_id"]
        got = load_versions(site_id, out_dir)
        if got is None:
            continue
        adjusted, versions = got
        stated, stored = _stated_sigma(site_id), _stored_adjusted(site_id)
        entry = {**old, "bytes": (out_dir / f"{site_id}.json").stat().st_size, **spread(adjusted, versions, load_mask(site_id), stated)}
        if stored is not None:
            entry["adjusted_matches_budget_deg"] = round(float(np.max(np.abs(adjusted - stored))), 4)
        entries[site_id] = entry
    return write_index(entries, previous["versions_per_site"], previous["seed"], out_dir, model_doc)


def _stated_sigma(site_id: str) -> np.ndarray | None:
    path = config.DATA_DIR / "uncertainty" / "skylines" / f"{site_id}.json"
    if not path.exists():
        return None
    doc = json.loads(path.read_text(encoding="utf-8"))
    return np.asarray(doc["raised_deg"]) - np.asarray(doc["adjusted_deg"])


def _stored_adjusted(site_id: str) -> np.ndarray | None:
    path = config.DATA_DIR / "uncertainty" / "skylines" / f"{site_id}.json"
    return np.asarray(json.loads(path.read_text(encoding="utf-8"))["adjusted_deg"]) if path.exists() else None


METHOD = (
    "Each version is product 90's adjusted model plus a Gaussian error field on every grid the site's skyline is traced through "
    "(20 m within 6 km of the sites south of 87.55 S, 80 m to 100 km, 240 m to 220 km): at each pixel the fitted size for that grid's "
    "resolution, sqrt(a^2 + (b tan slope)^2 + (c ERR)^2) with product 90's slope and stated error there, times a unit field with the "
    "fitted exponential correlation length, drawn by circulant embedding from a seed fixed per site. The site's height is read from "
    "the version itself. Every version is traced with the pipeline's own march (uncertainty.horizon_profile) through the app's bands "
    "from the 2 m mast, as the budget traces product 90's skyline."
)
NOT_CAPTURED = (
    "The versions show how the skyline moves if the ground is off by as much, and as patchily, as the two generations of NASA's maps "
    "differ. They do not show errors both generations share, the slow part of those differences (a few tenths of a metre over tens of "
    "kilometres), hills smaller than a pixel, the lander's own height, tilt and placement, or anything about the battery; and the highest "
    "point of a noisy profile is on average a little higher than that of the smooth one, so the versions sit slightly above product 90's skyline."
)
