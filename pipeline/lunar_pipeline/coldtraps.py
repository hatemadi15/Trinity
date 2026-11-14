"""Modelled cold traps near each polar site: LRO Diviner's polar resource product beside PGDA product 90.

What it measures, for every polar catalogue site, within 1 km and 5 km (docs/method.md, "Modelled cold traps"):
- cold ground: the annual maximum surface temperature of Diviner's thermal model below 110 K (and 100 K, 120 K,
  so the weight of the threshold shows);
- ground where the model puts water ice stable to sublimation at the surface, or buried within 0.5 m or 1 m;
- permanently shadowed ground (product 90's LPSR map at 20 m);
- the nearest ground of each kind and the steepest slope on the straight way to it (product 90's 20 m slope map).

The source is the Diviner Polar Resource Product (LRO-L-DLRE-5-PRP-V2.0, Paige et al. 2010, Science 330, 479): a
thermal model fitted to Diviner's first mapping year on 2,880,000 triangles of a Kaguya elevation model, a square
around the pole to 80° at its sides. Its `ice_depth` is the depth at which water ice would sublimate at 1 kg per
square metre per billion years. The labels and the SIS define 0 (stable at the surface) and -999 (deeper than
2.8738 m). The table also holds -1, which no document explains. It is not missing data: in all 2,880,000 triangles,
-1 is exactly the ground whose annual maximum surface temperature is below 101.3 K (the warmest -1 is 101.299 K,
the coldest 0 is 101.301 K), and 101.3 K is where exposed ice sublimates at that same rate, 1 kg m^-2 per 10^9
years (Hertz-Knudsen with the Marti and Mauersberger 1993 vapour pressure gives 101.27 K). So -1 marks ground whose
surface never gets warm enough, even at its yearly peak, to lose ice faster than the product's rate: the white
"surface cold traps" of Paige et al.'s depth map, beside the coloured depths of the permafrost below. Here -1 counts
as stable at the surface. Every figure is a model's, never a finding of ice.
"""

from __future__ import annotations

import base64
import json
import math
import time
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from . import config
from .geometry import ps_south_latlon_deg, ps_south_xy_m

PRP_BASE = "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/"
PRP_ZIP_URL = PRP_BASE + "extras/prp/dlre_prp_south.zip"
PRP_LABEL_URL = PRP_BASE + "data_derived_prp/dlre_prp_south.xml"
PRP_CATALOG_URL = PRP_BASE + "catalog/prpds.cat"
PRP_SIS_URL = PRP_BASE + "document/Diviner_RDR_SIS.pdf"
DIVINER_DIR = config.RAW_DIR / "diviner"
PRP_ZIP = DIVINER_DIR / "dlre_prp_south.zip"
PRP_ZIP_BYTES = 116_583_332
OUT_DIR = config.DATA_DIR / "coldtraps"
CITATION = (
    "Paige et al. 2010, Science 330, 479, doi:10.1126/science.1187726; data: Paige et al., LRO DLRE Level 5 PRP V2.0, "
    "NASA Planetary Data System, LRO-L-DLRE-5-PRP-V2.0, 2018"
)

# The table's columns: 1-based start byte and width (dlre_prp_south.xml, label/dlre_prp.fmt). Records are 210 bytes
# with CRLF, the first record the column headings.
RECORD_BYTES = 210
COLUMNS = {
    "tri1_x": (1, 12), "tri1_y": (15, 12), "tri1_z": (29, 12),
    "tri2_x": (43, 12), "tri2_y": (57, 12), "tri2_z": (71, 12),
    "tri3_x": (85, 12), "tri3_y": (99, 12), "tri3_z": (113, 12),
    "tri_clon": (127, 15), "tri_clat": (144, 15), "tri_calt": (161, 15),
    "temp_avg": (178, 8), "temp_max": (188, 8), "ice_depth": (198, 11),
}

COLD_K = 110.0  # the usual cold-trap convention for water ice (an annual maximum surface temperature below about 110 K)
ALSO_K = (100.0, 120.0)
RADII_KM = (1.0, 5.0)
SEARCH_KM = 10.0  # the nearest ground of each kind is looked for this far, the reach of product 90's cached windows
DEPTHS_M = (0.5, 1.0)
SURFACE_ALL_YEAR = -1.0  # see the module's docstring
TOO_DEEP = -999.0  # deeper than 2.8738 m, or not stable within the model at all
MODEL_DEPTH_M = 2.8738
SPLIT_K = 101.3  # the annual maximum that separates -1 from 0 in the table
PATH_STEP_M = 10.0
WINDOW_HALF_M = 10_000.0
OVERLAY_CELLS = 128  # cells across the cold-ground layer drawn on Explore's shadow map

# Water ice exposed to vacuum (Hertz-Knudsen), with the vapour pressure of Marti and Mauersberger (1993).
_WATER_KG = 18.015e-3 / 6.02214076e23
_BOLTZMANN = 1.380649e-23
_GYR_S = 1e9 * 365.25 * 86400.0


def sublimation_kg_m2_per_gyr(t_k: float) -> float:
    """Free sublimation of water ice at `t_k` kelvin, in kg per square metre per billion years."""
    p_pa = 10.0 ** (12.537 - 2663.5 / t_k)
    return p_pa * math.sqrt(_WATER_KG / (2.0 * math.pi * _BOLTZMANN * t_k)) * _GYR_S


def stability_temperature_k(rate_kg_m2_per_gyr: float = 1.0) -> float:
    """The temperature at which exposed ice sublimates at the given rate (the product uses 1 kg m^-2 per 10^9 years)."""
    lo, hi = 50.0, 150.0
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if sublimation_kg_m2_per_gyr(mid) < rate_kg_m2_per_gyr else (lo, mid)
    return round(0.5 * (lo + hi), 3)


# ---------------------------------------------------------------- the ice-depth codes


def at_surface_all_year(depth) -> np.ndarray:
    """Code -1: the surface stays below the stability temperature at its warmest, so ice could last on it all year."""
    return np.asarray(depth) == SURFACE_ALL_YEAR


def at_surface(depth) -> np.ndarray:
    """Ice stable to sublimation at the surface: code -1, or a computed depth of zero."""
    d = np.asarray(depth)
    return (d == SURFACE_ALL_YEAR) | (d == 0.0)


def within_depth(depth, metres: float) -> np.ndarray:
    """Ice stable at the surface or buried no deeper than `metres`; the too-deep code and missing values never count."""
    d = np.asarray(depth)
    with np.errstate(invalid="ignore"):
        return (d == SURFACE_ALL_YEAR) | ((d >= 0.0) & (d <= metres))


def ice_class(depth: float) -> str | None:
    if depth is None or not np.isfinite(depth):
        return None
    if depth == SURFACE_ALL_YEAR:
        return "surface_all_year"
    if depth == 0.0:
        return "surface"
    if depth == TOO_DEEP:
        return "deeper_or_none"
    return "buried"


# ---------------------------------------------------------------- reading the product


@dataclass
class Prp:
    """The product's triangles: centres and corners in south polar stereographic metres, and the model's values."""

    x: np.ndarray
    y: np.ndarray
    tmax: np.ndarray
    tavg: np.ndarray
    ice: np.ndarray
    vx: np.ndarray | None = None
    vy: np.ndarray | None = None
    area_km2: np.ndarray | None = None

    @classmethod
    def of(cls, tmax, ice, **rest) -> Prp:
        n = len(tmax)
        zeros = np.zeros(n)
        return cls(x=rest.get("x", zeros), y=rest.get("y", zeros), tmax=np.asarray(tmax, float), tavg=np.asarray(rest.get("tavg", zeros), float), ice=np.asarray(ice, float))

    def subset(self, sel: np.ndarray) -> Prp:
        def pick(a):
            return None if a is None else a[sel]

        return Prp(self.x[sel], self.y[sel], self.tmax[sel], self.tavg[sel], self.ice[sel], pick(self.vx), pick(self.vy), pick(self.area_km2))


def _column(rows: np.ndarray, name: str) -> np.ndarray:
    start, width = COLUMNS[name]
    block = np.ascontiguousarray(rows[:, start - 1 : start - 1 + width])
    text = np.concatenate([block, np.full((block.shape[0], 1), 32, np.uint8)], axis=1).tobytes().decode("ascii")
    return np.array(text.split(), dtype=np.float64)


def read_prp(path: Path | str, keep=None, corners: bool = True) -> Prp:
    """The table from its zip, never written out unzipped. `keep(x, y)` picks the triangles to keep, by centre."""
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".tab"))
        raw = z.read(name)
    rows = np.frombuffer(raw, dtype=np.uint8).reshape(-1, RECORD_BYTES)[1:]
    clat, clon = _column(rows, "tri_clat"), _column(rows, "tri_clon")
    x, y = ps_south_xy_m(clat, clon)
    if keep is not None:
        sel = np.flatnonzero(keep(x, y))
        rows, x, y = rows[sel], x[sel], y[sel]
    prp = Prp(x=x, y=y, tmax=_column(rows, "temp_max"), tavg=_column(rows, "temp_avg"), ice=_column(rows, "ice_depth"))
    if corners:
        v = [np.stack([_column(rows, f"tri{i}_{a}") for a in "xyz"], axis=1) for i in (1, 2, 3)]
        prp.area_km2 = 0.5 * np.linalg.norm(np.cross(v[1] - v[0], v[2] - v[0]), axis=1)
        vx, vy = [], []
        for p in v:
            lat = np.degrees(np.arcsin(p[:, 2] / np.linalg.norm(p, axis=1)))
            lon = np.degrees(np.arctan2(p[:, 1], p[:, 0]))
            px, py = ps_south_xy_m(lat, lon)
            vx.append(px)
            vy.append(py)
        prp.vx, prp.vy = np.stack(vx, axis=1), np.stack(vy, axis=1)
    return prp


def minus_one_evidence(prp: Prp) -> dict:
    """How the table's -1 relates to its annual maximum temperature: whether that temperature alone separates it from 0."""
    m1, z0, pos = prp.ice == SURFACE_ALL_YEAR, prp.ice == 0.0, prp.ice > 0.0

    def span(sel):
        return {"triangles": int(sel.sum()), "tmax_min_K": round(float(prp.tmax[sel].min()), 3), "tmax_max_K": round(float(prp.tmax[sel].max()), 3)} if sel.any() else {"triangles": 0}

    separated = bool(m1.any() and z0.any() and prp.tmax[m1].max() < prp.tmax[z0].min())
    return {
        "triangles": int(prp.ice.size),
        "minus_one": span(m1),
        "zero": span(z0),
        "positive": span(pos),
        "too_deep": span(prp.ice == TOO_DEEP),
        "separated_by_tmax": separated,
        "split_K": SPLIT_K,
        "exceptions": int(np.sum(m1 != (prp.tmax < SPLIT_K))),
        "stability_temperature_K": stability_temperature_k(),
    }


# ---------------------------------------------------------------- triangles onto a grid


@dataclass
class Raster:
    tmax: np.ndarray
    tavg: np.ndarray
    ice: np.ndarray


def rasterize(prp: Prp, x0: float, y0: float, cell_m: float, shape: tuple[int, int]) -> Raster:
    """The model's values at the centres of a grid's cells (top-left corner x0, y0): NaN where no triangle covers one."""
    rows, cols = shape
    out = Raster(*(np.full(shape, np.nan) for _ in range(3)))
    x1, y1 = x0 + cols * cell_m, y0 - rows * cell_m
    lo_x, hi_x, lo_y, hi_y = prp.vx.min(axis=1), prp.vx.max(axis=1), prp.vy.min(axis=1), prp.vy.max(axis=1)
    for i in np.flatnonzero((hi_x >= x0) & (lo_x <= x1) & (hi_y >= y1) & (lo_y <= y0)):
        c0 = max(int(np.floor((lo_x[i] - x0) / cell_m - 0.5)), 0)
        c1 = min(int(np.ceil((hi_x[i] - x0) / cell_m - 0.5)), cols - 1)
        r0 = max(int(np.floor((y0 - hi_y[i]) / cell_m - 0.5)), 0)
        r1 = min(int(np.ceil((y0 - lo_y[i]) / cell_m - 0.5)), rows - 1)
        if c1 < c0 or r1 < r0:
            continue
        cx = x0 + (np.arange(c0, c1 + 1) + 0.5) * cell_m
        cy = y0 - (np.arange(r0, r1 + 1) + 0.5) * cell_m
        px, py = np.meshgrid(cx, cy)
        (ax, bx, qx), (ay, by, qy) = prp.vx[i], prp.vy[i]
        det = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
        if det == 0.0:
            continue
        l1 = ((by - qy) * (px - qx) + (qx - bx) * (py - qy)) / det
        l2 = ((qy - ay) * (px - qx) + (ax - qx) * (py - qy)) / det
        inside = (l1 >= -1e-9) & (l2 >= -1e-9) & (1.0 - l1 - l2 >= -1e-9)
        if not inside.any():
            continue
        rr, cc = np.nonzero(inside)
        rr, cc = rr + r0, cc + c0
        out.tmax[rr, cc], out.tavg[rr, cc], out.ice[rr, cc] = prp.tmax[i], prp.tavg[i], prp.ice[i]
    return out


# ---------------------------------------------------------------- one site


@dataclass
class SiteGrid:
    """Every layer on one grid around a site: cell (r, c) is centred at (x0 + (c + 0.5) cell, y0 - (r + 0.5) cell)."""

    x0: float
    y0: float
    cell_m: float
    tmax: np.ndarray
    tavg: np.ndarray
    ice: np.ndarray
    psr: np.ndarray
    slope: np.ndarray


def scale_factor(lat_deg: float) -> float:
    """How much the polar stereographic map enlarges the ground at a latitude (1 at the pole, 1.0077 at 80° S)."""
    return 2.0 / (1.0 + math.sin(math.radians(abs(lat_deg))))


def _path_slope_max(g: SiteGrid, sx: float, sy: float, tx: float, ty: float) -> float | None:
    """The steepest slope cell crossed on the straight line from (sx, sy) to (tx, ty), sampled every 10 m."""
    n = max(int(math.hypot(tx - sx, ty - sy) / PATH_STEP_M), 1)
    t = np.linspace(0.0, 1.0, n + 1)
    c = np.clip(((sx + t * (tx - sx)) - g.x0) / g.cell_m, 0, g.slope.shape[1] - 1e-9).astype(int)
    r = np.clip((g.y0 - (sy + t * (ty - sy))) / g.cell_m, 0, g.slope.shape[0] - 1e-9).astype(int)
    v = g.slope[r, c]
    return round(float(np.nanmax(v)), 1) if np.isfinite(v).any() else None


def measure(sx: float, sy: float, g: SiteGrid, radii_km=RADII_KM, search_km: float = SEARCH_KM, k: float = 1.0) -> dict:
    """Areas within each radius, the nearest ground of each kind with the slope on the way, and the site's own cell."""
    rows, cols = g.tmax.shape
    cx = g.x0 + (np.arange(cols) + 0.5) * g.cell_m
    cy = g.y0 - (np.arange(rows) + 0.5) * g.cell_m
    px, py = np.meshgrid(cx, cy)
    d = np.hypot(px - sx, py - sy) / k
    cell_km2 = (g.cell_m / k) ** 2 / 1e6
    known = np.isfinite(g.tmax)
    with np.errstate(invalid="ignore"):
        kinds = {
            "below_110K": known & (g.tmax < COLD_K),
            "ice_surface": at_surface(g.ice),
            "ice_within_0_5m": within_depth(g.ice, 0.5),
            "psr": g.psr.astype(bool),
        }
        extra = {f"below_{int(t)}K": known & (g.tmax < t) for t in ALSO_K}
    extra["ice_surface_all_year"] = at_surface_all_year(g.ice)
    extra["ice_within_1m"] = within_depth(g.ice, 1.0)
    out: dict = {"within_km": {}}
    for r_km in radii_km:
        inside = d <= r_km * 1000.0
        entry = {"covered_share": round(float(known[inside].mean()), 3) if inside.any() else 0.0}
        for name, mask in {**kinds, **extra}.items():
            entry[f"{name}_km2"] = round(float((mask & inside).sum()) * cell_km2, 2)
        out["within_km"][f"{r_km:g}"] = entry
    near = d <= search_km * 1000.0
    out["nearest"] = {}
    for name, mask in kinds.items():
        hit = mask & near
        if not hit.any():
            out["nearest"][name] = None
            continue
        i = int(np.argmin(np.where(hit, d, np.inf)))
        r, c = divmod(i, cols)
        out["nearest"][name] = {"km": round(float(d[r, c]) / 1000.0, 2), "slope_max_deg": _path_slope_max(g, sx, sy, float(px[r, c]), float(py[r, c]))}
    in5 = d <= 5000.0
    cold5, psr5 = kinds["below_110K"] & in5, kinds["psr"] & in5
    both = float((cold5 & psr5).sum())
    out["coldest_within_5km_K"] = round(float(np.nanmin(np.where(in5 & known, g.tmax, np.nan))), 1) if (in5 & known).any() else None
    out["cold_in_psr_share_5km"] = round(both / float(cold5.sum()), 2) if cold5.any() else None
    out["psr_cold_share_5km"] = round(both / float(psr5.sum()), 2) if psr5.any() else None
    i = int(np.argmin(d))
    r, c = divmod(i, cols)
    depth = float(g.ice[r, c])
    cls = ice_class(depth)
    out["at_site"] = {
        "tmax_K": round(float(g.tmax[r, c]), 1) if np.isfinite(g.tmax[r, c]) else None,
        "tavg_K": round(float(g.tavg[r, c]), 1) if np.isfinite(g.tavg[r, c]) else None,
        "ice_depth_m": 0.0 if cls in ("surface", "surface_all_year") else (round(depth, 3) if cls == "buried" else None),
        "ice": cls,
    }
    return out


def outside_entry(site_id: str, name: str, lat: float, lon: float) -> dict:
    return {
        "site_id": site_id,
        "name": name,
        "lat": lat,
        "lon": lon,
        "covered": False,
        "reason": "north of 80° S: outside Diviner's polar model (a square to 80° S at its sides) and product 90's 20 m maps",
    }


# ---------------------------------------------------------------- the shadow map's layer


def overlay_entry(site_id: str, mask: np.ndarray, x0: float, y0: float, cell_m: float) -> dict:
    """A mask as rows of bits (row 0 at the top, most significant bit first), with where its top-left corner lies."""
    h, w = mask.shape
    return {"site_id": site_id, "x0_m": round(x0, 2), "y0_m": round(y0, 2), "cell_m": round(cell_m, 4), "width": int(w), "height": int(h),
            "bits": base64.b64encode(np.packbits(mask.astype(bool).ravel()).tobytes()).decode("ascii")}


def unpack_overlay(entry: dict) -> np.ndarray:
    bits = np.unpackbits(np.frombuffer(base64.b64decode(entry["bits"]), dtype=np.uint8))
    return bits[: entry["width"] * entry["height"]].reshape(entry["height"], entry["width"]).astype(bool)


def terrain_window_extent(site_id: str, roots: list[Path] | None = None) -> tuple[float, float, float, float] | None:
    """The extent of the site's terrain window (x of its left edge, y of its top edge, width, height, in metres), if one was cut."""
    for root in roots or [config.REPO_ROOT / "web" / "public" / "data" / "terrain", config.OUT_DIR / "terrain"]:
        path = root / f"{site_id}.json"
        if path.exists():
            m = json.loads(path.read_text(encoding="utf-8"))
            if m.get("kind") != "window":
                continue
            s = float(m["cell_m"])
            return ((m["col0"] - 0.5 - m["sample_offset_px"]) * s, (m["line_offset_px"] - m["row0"] + 0.5) * s, m["width"] * s, m["height"] * s)
    return None


# ---------------------------------------------------------------- every site


def fetch_prp(dest: Path = PRP_ZIP) -> Path:
    """The Diviner zip (116.6 MB) into data_raw/diviner, resumable and size-checked, unless it is there already."""
    if dest.exists() and dest.stat().st_size == PRP_ZIP_BYTES:
        return dest
    from .fetch import Asset, download, make_session

    print(f"[coldtraps] downloading {PRP_ZIP_URL}", flush=True)
    return download(Asset(dest.name, PRP_ZIP_URL, dest.parent, "diviner"), make_session())


def _same_grid(a, b) -> bool:
    return a.data.shape == b.data.shape and abs(a.x0_m - b.x0_m) < 1e-6 and abs(a.y0_m - b.y0_m) < 1e-6 and a.scale_m == b.scale_m


def site_grid(site, prp: Prp, read=None) -> SiteGrid:
    """Product 90's shadow and slope windows (10 km around the site, 20 m) and Diviner's model on the same cells."""
    from .pgda90 import read_window

    read = read or read_window
    psr = read("psr20", site.lat, site.lon, WINDOW_HALF_M)
    slope = read("slope20", site.lat, site.lon, WINDOW_HALF_M)
    if not _same_grid(psr, slope):
        raise ValueError(f"{site.id}: product 90's shadow and slope windows do not share a grid")
    div = rasterize(prp, psr.x0_m, psr.y0_m, psr.scale_m, psr.data.shape)
    return SiteGrid(psr.x0_m, psr.y0_m, psr.scale_m, div.tmax, div.tavg, div.ice, np.nan_to_num(psr.data) > 0.5, slope.data.astype(np.float64))


def now_utc() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def cap_summary(prp: Prp) -> dict:
    """Context for the whole cap south of 80° S: how much ground each class covers."""
    lat, _ = ps_south_latlon_deg(prp.x, prp.y)
    south = lat <= -80.0
    a = prp.area_km2

    def area(sel):
        return round(float(a[south & sel].sum()), 1)

    return {
        "area_km2": area(np.ones_like(south)),
        **{f"below_{int(t)}K_km2": area(prp.tmax < t) for t in (100.0, COLD_K, 120.0)},
        "ice_surface_all_year_km2": area(at_surface_all_year(prp.ice)),
        "ice_surface_km2": area(at_surface(prp.ice)),
        "ice_within_0_5m_km2": area(within_depth(prp.ice, 0.5)),
        "ice_within_1m_km2": area(within_depth(prp.ice, 1.0)),
        "triangle_km2_median": round(float(np.median(a)), 4),
    }


METHOD = {
    "cold_ground": "Diviner's modelled annual maximum surface temperature below 110 K, the usual convention for a cold trap for water ice; 100 K and 120 K are given beside it.",
    "ice_stable": (
        "Diviner's ice_depth: the depth at which water ice would sublimate at 1 kg per square metre per billion years. At the surface: code -1 "
        "(the surface stays below 101.3 K all year) or a depth of 0; buried: a depth no deeper than 0.5 m or 1 m; -999 means deeper than "
        "2.8738 m or not stable at all and never counts."
    ),
    "permanent_shadow": "Product 90's LPSR_80S_20MPP_ADJ: 20 m pixels the Sun never reaches over the Moon's 18.6-year cycle.",
    "slope": "Product 90's LDSM_80S_20MPP_ADJ, sampled every 10 m on the straight line from the site to the nearest ground of each kind; the steepest 20 m pixel crossed.",
    "grid": (
        "Every layer on product 90's 20 m grid within 10 km of the site: a cell takes the value of the Diviner triangle its centre lies in. "
        "Areas count the cells whose centres lie within 1 or 5 km; distances are to the nearest cell centre of each kind, both corrected for "
        "the map's scale (under 0.8 % south of 80° S)."
    ),
}
ASSUMPTIONS = (
    "Diviner's model is a fit to the first mapping year on a Kaguya elevation model of triangles about 0.13 km² in area (pairs about 500 m "
    "across), with uniform thermal and reflectance properties; it does not resolve the small cold traps that hide in shadows a few metres "
    "to a few hundred metres across, and its mesh is registered to a different elevation model than product 90's. It gives where ice could "
    "last if it arrived, not whether ice is there, how much or how deep. The slope is along a straight line, not a route."
)


def build(zip_path: Path | None = None, site_ids: list[str] | None = None, read=None) -> tuple[dict, dict]:
    """The per-site layer and the shadow map's overlay, for every polar catalogue site (or `site_ids`)."""
    from .sites import all_sites

    t0 = time.perf_counter()
    zip_path = zip_path or fetch_prp()
    sites = [s for s in all_sites() if s.polar and (site_ids is None or s.id in site_ids)]
    inside = [s for s in sites if s.lat <= -80.0]
    print(f"[coldtraps] reading {zip_path.name}", flush=True)
    prp_all = read_prp(zip_path)
    evidence = minus_one_evidence(prp_all)
    cap = cap_summary(prp_all)
    # Keep the triangles near the sites: 30 km covers the widest terrain window (41 km across) round each one.
    centres = np.array([ps_south_xy_m(s.lat, s.lon) for s in inside]) if inside else np.zeros((0, 2))
    near = np.zeros(prp_all.x.size, dtype=bool)
    for sx, sy in centres:
        near |= np.hypot(prp_all.x - sx, prp_all.y - sy) <= 30_000.0
    prp = prp_all.subset(near)
    del prp_all
    entries, overlays = [], []
    for site in sites:
        if site.lat > -80.0:
            entries.append(outside_entry(site.id, site.name, site.lat, site.lon))
            continue
        print(f"[coldtraps] {site.id}", flush=True)
        sx, sy = ps_south_xy_m(site.lat, site.lon)
        g = site_grid(site, prp, read)
        m = measure(float(sx), float(sy), g, k=scale_factor(site.lat))
        entries.append({"site_id": site.id, "name": site.name, "label": site.label, "lat": site.lat, "lon": site.lon, "kind": site.kind, "covered": True, **m})
        extent = terrain_window_extent(site.id)
        if extent:
            x0, y0, w, h = extent
            cell = w / OVERLAY_CELLS
            shape = (round(h / cell), OVERLAY_CELLS)
            ras = rasterize(prp, x0, y0, cell, shape)
            with np.errstate(invalid="ignore"):
                overlays.append(overlay_entry(site.id, np.nan_to_num(ras.tmax, nan=999.0) < COLD_K, x0, y0, cell))
    doc = {
        "version": 1,
        "generated_utc": now_utc(),
        "about": "Modelled cold traps near each polar site: where models of temperature and shadow say water ice could last. Modelled conditions, never a finding of ice.",
        "sources": {
            "diviner": {"citation": CITATION, "zip": PRP_ZIP_URL, "zip_bytes": PRP_ZIP_BYTES, "label": PRP_LABEL_URL, "catalog": PRP_CATALOG_URL, "sis": PRP_SIS_URL},
            "product90": {"shadow": "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ.TIF", "slope": "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDSM_80S_20MPP_ADJ.TIF",
                          "citation": "Barker et al. 2023, Planet. Sci. J. 4, 183, doi:10.3847/PSJ/acf3e1"},
        },
        "method": METHOD,
        "assumptions": ASSUMPTIONS,
        "thresholds": {"cold_K": COLD_K, "also_K": list(ALSO_K), "depths_m": list(DEPTHS_M), "radii_km": list(RADII_KM), "search_km": SEARCH_KM},
        "minus_one": evidence,
        "cap_south_of_80": cap,
        "sites": entries,
        "seconds": round(time.perf_counter() - t0, 1),
    }
    overlay = {"version": 1, "about": "Diviner's modelled annual maximum below 110 K, as a mask on each terrain window's ground (row 0 at the top, north of the grid up).",
               "cold_K": COLD_K, "sites": overlays}
    return doc, overlay


def write_doc(doc: dict, out_dir: Path = OUT_DIR, name: str = "coldtraps.json", indent: int | None = 1) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / name
    text = json.dumps(doc, indent=indent, ensure_ascii=False, separators=None if indent else (",", ":"))
    path.write_text(text + "\n", encoding="utf-8", newline="\n")
    return path


def write_all(zip_path: Path | None = None, site_ids: list[str] | None = None, out_dir: Path = OUT_DIR) -> list[Path]:
    doc, overlay = build(zip_path, site_ids)
    return [write_doc(doc, out_dir), write_doc(overlay, out_dir, "overlay.json", indent=None)]
