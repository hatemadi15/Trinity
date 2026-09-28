"""Cut LOLA grids into 512x512 int16 zlib tiles for the browser horizon engine."""

from __future__ import annotations

import json
import zlib
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import config
from .lola import LolaGrid

TILE = 512
NODATA = -32768
LEVELS = [  # (level id, PDS stem, expected map scale m)
    ("L0", "ldem_875s_20m", 20.0),
    ("L1", "ldem_80s_80m", 80.0),
    ("L2", "ldem_60s_240m", 240.0),
]


def encode_tile(block: np.ndarray) -> bytes:
    if block.shape != (TILE, TILE):
        raise ValueError(f"tile must be {TILE}x{TILE}, got {block.shape}")
    return zlib.compress(np.ascontiguousarray(block, dtype="<i2").tobytes(), 6)


def decode_tile(buf: bytes) -> np.ndarray:
    return np.frombuffer(zlib.decompress(buf), dtype="<i2").reshape(TILE, TILE).copy()


def cut_grid(grid: LolaGrid, level_id: str, out_dir: Path) -> dict:
    lab = grid.label
    tiles_y = -(-lab.lines // TILE)
    tiles_x = -(-lab.samples // TILE)
    level_dir = out_dir / level_id
    level_dir.mkdir(parents=True, exist_ok=True)
    sizes: dict[str, int] = {}
    for ty in range(tiles_y):
        for tx in range(tiles_x):
            block = np.full((TILE, TILE), NODATA, dtype=np.int16)
            src = grid.data[ty * TILE : (ty + 1) * TILE, tx * TILE : (tx + 1) * TILE]
            block[: src.shape[0], : src.shape[1]] = src
            buf = encode_tile(block)
            (level_dir / f"{ty}_{tx}.bin").write_bytes(buf)
            sizes[f"{ty}_{tx}"] = len(buf)
    entry = {
        "id": level_id,
        "map_scale_m": lab.map_scale_m,
        "lines": lab.lines,
        "samples": lab.samples,
        "line_offset_px": lab.line_offset_px,
        "sample_offset_px": lab.sample_offset_px,
        "max_latitude_deg": lab.max_latitude_deg,
        "dn_scale_m": lab.scaling_factor,
        "tile_size": TILE,
        "tiles_x": tiles_x,
        "tiles_y": tiles_y,
        "nodata": NODATA,
        "path": f"{level_id}/{{y}}_{{x}}.bin",
        "bytes": sizes,
    }
    (level_dir / "level.json").write_text(json.dumps(entry, indent=1) + "\n")
    return entry


def write_all(out_dir: Path = config.OUT_DIR / "tiles") -> Path:
    levels = []
    for level_id, stem, scale in LEVELS:
        grid = LolaGrid.from_pds(config.LOLA_DIR / f"{stem}.lbl", mmap=False)
        if grid.label.map_scale_m != scale:
            raise ValueError(f"{stem}: expected {scale} m/px, label says {grid.label.map_scale_m}")
        print(f"[tiles] {level_id} <- {stem} ({grid.label.lines}x{grid.label.samples})", flush=True)
        entry = cut_grid(grid, level_id, out_dir)
        entry["source"] = f"{stem}.img"
        levels.append(entry)
    manifest = {
        "version": 1,
        "encoding": "zlib(int16 little-endian, row-major)",
        "reference_radius_m": config.R_MOON_M,
        "projection": "south polar stereographic, x = rho sin(lon), y = rho cos(lon), rho = 2R tan((90-|lat|)/2)",
        "pixel": "col = sample_offset_px + x/map_scale_m; row = line_offset_px - y/map_scale_m (0-based centres)",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "levels": levels,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "manifest.json"
    path.write_text(json.dumps(manifest, indent=1) + "\n")
    return path
