"""Featured-site catalog and derived rim points."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from . import config
from .lola import LolaGrid


@dataclass(frozen=True)
class Site:
    id: str
    name: str
    lat: float
    lon: float
    category: str
    polar: bool
    source: str
    landed_utc: str | None = None
    derive_rim: dict | None = None
    approximate: bool = False
    mission_end_utc: str | None = None
    mission_end_source: str | None = None
    mission_note: str | None = None
    # Short display name for lists, titles and map pins, and one plain line that says what the place is.
    label: str | None = None
    blurb: str | None = None
    # What kind of point the coordinate is: "surveyed" (hardware located in orbital images), "target" (a planned or
    # attempted landing point), "region_centre" (the rough centre of a wider region), "derived" (worked out here from
    # LOLA heights, not a checked landing spot) or "reference" (the pole, a crater's centre).
    kind: str | None = None
    # Radius of the uncertainty the source states for the point (km), or None when it states none.
    uncertainty_km: float | None = None
    # True on the far side, where Earth never rises above the horizon: no direct radio contact, ever.
    far_side: bool = False


def load_sites(path: Path = config.DATA_DIR / "sites.json") -> list[Site]:
    raw = json.loads(path.read_text(encoding="utf-8"))["sites"]
    return [Site(**{k: v for k, v in s.items() if k in Site.__dataclass_fields__}) for s in raw]


def polar_sites(path: Path = config.DATA_DIR / "sites.json") -> list[Site]:
    return [s for s in load_sites(path) if s.polar]


def derive_rim_points(grid: LolaGrid, sites: list[Site]) -> list[Site]:
    out: list[Site] = []
    for s in sites:
        if not s.derive_rim:
            continue
        r_min = s.derive_rim["r_min_km"] * 1000.0
        r_max = s.derive_rim["r_max_km"] * 1000.0
        col_c, row_c = grid.pixel_from_latlon(s.lat, s.lon)
        half = int(np.ceil(r_max / grid.label.map_scale_m)) + 1
        r0, c0 = int(row_c) - half, int(col_c) - half
        r0c, c0c = max(r0, 0), max(c0, 0)
        window = grid.data[r0c : int(row_c) + half, c0c : int(col_c) + half].astype(np.float64)
        rows, cols = np.mgrid[r0c : r0c + window.shape[0], c0c : c0c + window.shape[1]]
        dist = np.hypot(cols - col_c, rows - row_c) * grid.label.map_scale_m
        window[(dist < r_min) | (dist > r_max)] = -np.inf
        k = int(np.argmax(window))
        rr, cc = np.unravel_index(k, window.shape)
        lat, lon = grid.latlon_from_pixel(float(cols[rr, cc]), float(rows[rr, cc]))
        out.append(
            Site(
                id=f"{s.id}_rim_high",
                name=f"{s.name.replace(' centre', '')} rim, highest point {s.derive_rim['r_min_km']}–{s.derive_rim['r_max_km']} km",
                lat=round(float(lat), 5),
                lon=round(float(lon), 5),
                category="classic",
                polar=True,
                source=f"derived: argmax LOLA {grid.label.map_scale_m:.0f} m height in annulus around {s.id}",
                label=s.derive_rim.get("label"),
                blurb=s.derive_rim.get("blurb"),
                kind="derived",
            )
        )
    return out


def write_derived(out: Path = config.DATA_DIR / "sites_derived.json") -> Path:
    grid = LolaGrid.from_pds(config.LOLA_DIR / "ldem_875s_20m.lbl")
    derived = derive_rim_points(grid, load_sites())
    out.write_text(json.dumps({"version": 1, "sites": [asdict(s) for s in derived]}, indent=2) + "\n")
    return out


def all_sites() -> list[Site]:
    sites = load_sites()
    derived = config.DATA_DIR / "sites_derived.json"
    if derived.exists():
        sites += load_sites(derived)
    return sites
