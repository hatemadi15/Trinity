"""Terrain rasters for the 3D view: per-site heightmap windows, the south cap and the globe texture.

Each raster is zlib-compressed little-endian uint16, row-major, north up (row 0 = smallest source
row), with a JSON sidecar; height_m = min_m + dn * scale_m_per_unit. Windows are centred on the
site so the web app can put the site at the origin: row0/col0 may fall outside the source grid
(IM-1 sits 4 km inside the edge of the 80 m grid) and those cells are filled from the next
coarser grid, which shares the projection.
"""

from __future__ import annotations

import json
import shutil
import zlib
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import config
from .lola import LolaGrid
from .masks import GRID_FILES, GRID_ORDER, load_grids
from .sites import Site, all_sites

TEXTURE_FILE = "lroc_color_2k.jpg"
TEXTURE_CREDIT = (
    "NASA's Scientific Visualization Studio, CGI Moon Kit (LRO LROC WAC colour mosaic), "
    "https://svs.gsfc.nasa.gov/4720"
)
DEEP_SOUTH_LAT_DEG = -87.55  # south of this the 20 m grid covers the site (same rule as masks)
WINDOW_PX = {"L0": 1024, "L1": 512}  # 20.48 km at 20 m; 40.96 km at 80 m
CAP_FACTOR = 4  # ldem_60s_240m block-averaged 4x -> 1940 x 1940 cells of 960 m
CONTEXT_PX = 512  # 40.96 km at 80 m around a 20 m window: hills beyond the window still cast their shadows into it
FLIGHT_PX = 1024  # 245.76 km at 240 m round the arrival's site: from 900 to 90 km up the measured ground stays sharp
FLIGHT_SITES = ("de_gerlache_rim_2",)  # the home page's arrival (home_assets.HERO_SITE)
ENCODING = "zlib(uint16 little-endian, row-major); height_m = min_m + dn * scale_m_per_unit"
PROJECTION = (
    "south polar stereographic, x = rho sin(lon), y = rho cos(lon), rho = 2R tan((90-|lat|)/2)"
)
PIXEL = (
    "raster cell (i, j) is source col = col0 + i = sample_offset_px + x/cell_m, "
    "source row = row0 + j = line_offset_px - y/cell_m (0-based pixel centres)"
)


def encode_u16(heights_m: np.ndarray) -> tuple[bytes, dict]:
    """Quantise metres to uint16 over [min, max] and zlib-compress (little-endian, row-major).

    Non-finite cells encode as 0 (= min_m).
    """
    finite = np.isfinite(heights_m)
    if not finite.any():
        raise ValueError("encode_u16: no finite heights")
    lo = float(heights_m[finite].min())
    hi = float(heights_m[finite].max())
    scale = (hi - lo) / 65535.0 if hi > lo else 1.0
    dn = np.zeros(heights_m.shape, dtype="<u2")
    dn[finite] = np.clip(np.round((heights_m[finite] - lo) / scale), 0, 65535).astype("<u2")
    payload = zlib.compress(np.ascontiguousarray(dn).tobytes(), 6)
    return payload, {"min_m": lo, "max_m": hi, "scale_m_per_unit": scale}


def level_for_site(site: Site) -> str:
    return "L0" if site.lat <= DEEP_SOUTH_LAT_DEG else "L1"


def window_for_site(site: Site, grids: dict[str, LolaGrid]) -> tuple[LolaGrid, int, int, int]:
    """Grid and top-left source pixel (row0, col0) of the square window centred on the site.

    20 m / 1024 px south of 87.55 S, else 80 m / 512 px. The window is not clamped to the grid:
    write_site_window fills cells outside it from the next coarser grid, so the site stays at the
    centre cell (size // 2, size // 2).
    """
    level = level_for_site(site)
    grid, size = grids[level], WINDOW_PX[level]
    col, row = grid.pixel_from_latlon(site.lat, site.lon)
    row0 = int(round(float(row))) - size // 2
    col0 = int(round(float(col))) - size // 2
    return grid, row0, col0, size


def window_heights(
    grid: LolaGrid, row0: int, col0: int, size: int, fill: LolaGrid | None = None
) -> tuple[np.ndarray, int]:
    """Heights (m) of the size x size window whose top-left source pixel is (row0, col0).

    Cells outside `grid` are sampled bilinearly from `fill` (a coarser grid in the same
    projection) and stay NaN where neither grid covers them. Returns (heights, cells filled).
    """
    lab = grid.label
    out = np.full((size, size), np.nan, dtype=np.float64)
    r_lo, r_hi = max(row0, 0), min(row0 + size, lab.lines)
    c_lo, c_hi = max(col0, 0), min(col0 + size, lab.samples)
    if r_hi > r_lo and c_hi > c_lo:
        out[r_lo - row0 : r_hi - row0, c_lo - col0 : c_hi - col0] = (
            grid.data[r_lo:r_hi, c_lo:c_hi].astype(np.float64) * lab.scaling_factor
        )
    missing = np.isnan(out)
    n_fill = 0
    if fill is not None and missing.any():
        rows, cols = np.nonzero(missing)
        x = (col0 + cols - lab.sample_offset_px) * lab.map_scale_m
        y = (lab.line_offset_px - (row0 + rows)) * lab.map_scale_m
        fill_col = fill.label.sample_offset_px + x / fill.label.map_scale_m
        fill_row = fill.label.line_offset_px - y / fill.label.map_scale_m
        out[rows, cols] = fill.value_bilinear(fill_col, fill_row)
        n_fill = int(rows.size)
    return out, n_fill


def _write_raster(path: Path, heights: np.ndarray, meta: dict) -> Path:
    payload, quant = encode_u16(heights)
    path.write_bytes(payload)
    doc = {
        **meta,
        **quant,
        "height": int(heights.shape[0]),
        "width": int(heights.shape[1]),
        "encoding": ENCODING,
        "bytes": len(payload),
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    path.with_suffix(".json").write_text(json.dumps(doc, indent=1) + "\n")
    return path


def write_site_window(site: Site, grids: dict[str, LolaGrid], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    grid, row0, col0, size = window_for_site(site, grids)
    level = level_for_site(site)
    order = GRID_ORDER.index(level)
    coarser = GRID_ORDER[order + 1] if order + 1 < len(GRID_ORDER) else None
    heights, n_fill = window_heights(grid, row0, col0, size, grids.get(coarser) if coarser else None)
    col, row = grid.pixel_from_latlon(site.lat, site.lon)
    meta = {
        "site_id": site.id,
        "lat": site.lat,
        "lon": site.lon,
        "kind": "window",
        "source": f"{GRID_FILES[level]}.img",
        "level": level,
        "cell_m": grid.label.map_scale_m,
        "row0": row0,
        "col0": col0,
        "line_offset_px": grid.label.line_offset_px,
        "sample_offset_px": grid.label.sample_offset_px,
        "site_row_px": float(row) - row0,
        "site_col_px": float(col) - col0,
        "site_height_m": float(grid.value_at(site.lat, site.lon)),
        "fill_source": f"{GRID_FILES[coarser]}.img" if n_fill else None,
        "fill_px": n_fill,
    }
    return _write_raster(out_dir / f"{site.id}.u16", heights, meta)


def write_site_context(site: Site, grids: dict[str, LolaGrid], out_dir: Path) -> Path | None:
    """The 80 m context grid centred on a 20 m site (None for a site whose window is already 80 m)."""
    if level_for_site(site) != "L0":
        return None
    out_dir.mkdir(parents=True, exist_ok=True)
    grid = grids["L1"]
    col, row = grid.pixel_from_latlon(site.lat, site.lon)
    row0 = round(float(row)) - CONTEXT_PX // 2
    col0 = round(float(col)) - CONTEXT_PX // 2
    heights, n_fill = window_heights(grid, row0, col0, CONTEXT_PX, grids.get("L2"))
    meta = {
        "site_id": site.id,
        "lat": site.lat,
        "lon": site.lon,
        "kind": "context",
        "source": f"{GRID_FILES['L1']}.img",
        "level": "L1",
        "cell_m": grid.label.map_scale_m,
        "row0": row0,
        "col0": col0,
        "line_offset_px": grid.label.line_offset_px,
        "sample_offset_px": grid.label.sample_offset_px,
        "site_row_px": float(row) - row0,
        "site_col_px": float(col) - col0,
        "site_height_m": float(grid.value_at(site.lat, site.lon)),
        "fill_source": f"{GRID_FILES['L2']}.img" if n_fill else None,
        "fill_px": n_fill,
    }
    return _write_raster(out_dir / f"{site.id}.context.u16", heights, meta)


def write_site_flight(site: Site, grids: dict[str, LolaGrid], out_dir: Path) -> Path:
    """The 240 m flight level centred on a site, at the grid's full resolution (the cap takes it by 4).

    The home page's arrival flies over it from 900 to 90 km up, where the 960 m cap reads soft.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    grid = grids["L2"]
    col, row = grid.pixel_from_latlon(site.lat, site.lon)
    row0 = round(float(row)) - FLIGHT_PX // 2
    col0 = round(float(col)) - FLIGHT_PX // 2
    heights, n_fill = window_heights(grid, row0, col0, FLIGHT_PX)
    meta = {
        "site_id": site.id,
        "lat": site.lat,
        "lon": site.lon,
        "kind": "flight",
        "source": f"{GRID_FILES['L2']}.img",
        "level": "L2",
        "cell_m": grid.label.map_scale_m,
        "row0": row0,
        "col0": col0,
        "line_offset_px": grid.label.line_offset_px,
        "sample_offset_px": grid.label.sample_offset_px,
        "site_row_px": float(row) - row0,
        "site_col_px": float(col) - col0,
        "site_height_m": float(grid.value_at(site.lat, site.lon)),
        "fill_source": None,
        "fill_px": n_fill,
    }
    return _write_raster(out_dir / f"{site.id}.flight.u16", heights, meta)


def write_south_cap(out_dir: Path, factor: int = CAP_FACTOR, grid: LolaGrid | None = None) -> Path:
    """Block-mean the 240 m south-polar grid by `factor` (4 -> 1940 x 1940 cells of 960 m)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    if grid is None:
        grid = LolaGrid.from_pds(config.LOLA_DIR / f"{GRID_FILES['L2']}.lbl", mmap=False)
    lab = grid.label
    rows, cols = lab.lines // factor * factor, lab.samples // factor * factor
    block = (
        grid.data[:rows, :cols]
        .reshape(rows // factor, factor, cols // factor, factor)
        .mean(axis=(1, 3), dtype=np.float64)
    )
    block *= lab.scaling_factor
    # The centre of a factor x factor block lies (factor - 1) / 2 source pixels past its first pixel.
    half = (factor - 1) / 2
    line_offset = (lab.line_offset_px - half) / factor
    sample_offset = (lab.sample_offset_px - half) / factor
    meta = {
        "site_id": "south_cap",
        "lat": -90.0,
        "lon": 0.0,
        "kind": "cap",
        "source": f"{GRID_FILES['L2']}.img",
        "level": "L2",
        "cell_m": lab.map_scale_m * factor,
        "factor": factor,
        "row0": 0,
        "col0": 0,
        "line_offset_px": line_offset,
        "sample_offset_px": sample_offset,
        "site_row_px": line_offset,
        "site_col_px": sample_offset,
        "site_height_m": float(grid.value_at(-90.0, 0.0)),
        "max_latitude_deg": lab.max_latitude_deg,
        "fill_source": None,
        "fill_px": 0,
    }
    return _write_raster(out_dir / "south_cap.u16", block, meta)


def write_all(out_dir: Path = config.OUT_DIR / "terrain") -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    grids = load_grids()
    windows = []
    for site in all_sites():
        if not site.polar:
            continue
        print(f"[terrain] {site.id}", flush=True)
        path = write_site_window(site, grids, out_dir)
        meta = json.loads(path.with_suffix(".json").read_text())
        entry = {
            "site_id": site.id,
            "lat": site.lat,
            "lon": site.lon,
            "file": path.name,
            "meta": path.with_suffix(".json").name,
            "level": meta["level"],
            "cell_m": meta["cell_m"],
            "width": meta["width"],
            "height": meta["height"],
            "bytes": meta["bytes"],
        }
        context = write_site_context(site, grids, out_dir)
        if context is not None:
            cmeta = json.loads(context.with_suffix(".json").read_text())
            entry["context"] = {
                "file": context.name,
                "meta": context.with_suffix(".json").name,
                "cell_m": cmeta["cell_m"],
                "width": cmeta["width"],
                "height": cmeta["height"],
            }
        if site.id in FLIGHT_SITES:
            flight = write_site_flight(site, grids, out_dir)
            fmeta = json.loads(flight.with_suffix(".json").read_text())
            entry["flight"] = {
                "file": flight.name,
                "meta": flight.with_suffix(".json").name,
                "cell_m": fmeta["cell_m"],
                "width": fmeta["width"],
                "height": fmeta["height"],
            }
        windows.append(entry)
    print("[terrain] south_cap", flush=True)
    cap = write_south_cap(out_dir, grid=grids["L2"])
    texture = config.RAW_DIR / "textures" / TEXTURE_FILE
    if texture.exists():
        shutil.copy2(texture, out_dir / TEXTURE_FILE)
    else:
        print(f"[terrain] {texture} missing; run: fetch --group textures", flush=True)
    manifest = {
        "version": 3,
        "encoding": ENCODING,
        "projection": PROJECTION,
        "pixel": PIXEL,
        "reference_radius_m": config.R_MOON_M,
        "windows": windows,
        "cap": {"file": cap.name, "meta": cap.with_suffix(".json").name},
        "globe_texture": TEXTURE_FILE,
        "globe_texture_present": texture.exists(),
        "globe_texture_credit": TEXTURE_CREDIT,
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    path = out_dir / "manifest.json"
    path.write_text(json.dumps(manifest, indent=1) + "\n")
    return path
