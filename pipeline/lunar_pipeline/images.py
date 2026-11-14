"""Shadows in camera images: where the app's terrain puts sunlight and shadow at the moment a picture was taken,
against the picture.

Pictures, each map-projected by its makers into the south polar stereographic metres of the app's own grids (the
1737.4 km sphere, x = rho sin(lon), y = rho cos(lon)):

- LROC WAC polar movie frames (PDS volume LROLRC_2001, DATA/BDR/WAC_POLE/WAC_POLE_MOVIE_SOUTH): one Wide Angle
  Camera observation each, 100 m pixels from 80 to 90 S, with the observation's start and stop times. They are read
  as windows around a site, one HTTP byte range a row, and the windows are kept in data_raw/images/wac_movie.
- product 90's NAC images (Barker et al. 2023, https://pgda.gsfc.nasa.gov/products/90), Narrow Angle Camera images
  map-projected onto the 20 m adjusted elevation model, 20 m pixels; their times are from the LROC index (via ODE).

For each picture and site: the Sun's direction at the middle of the exposure (SPICE, DE440, as the app's table), the
app's own terrain levels for the site (a crop of the 960 m cap, the 80 m context, the 20 m or 80 m window) and the
shadow sweep (shadow.cast, the twin of the browser's engine). The app's pixels are gathered into the picture's (the
two are compared at the coarser pixel size), the picture's pixels are called lit or in shadow by a brightness
threshold (Otsu's, on the logarithm of the picture's values in the window), and the two calls are compared pixel by
pixel where the app's call is the same across the whole picture pixel.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

from . import config
from .lola import GridLabel, LolaGrid
from .shadow import Level

IMAGES_DIR = config.RAW_DIR / "images"
WAC_DIR = IMAGES_DIR / "wac_movie"
P90_DIR = IMAGES_DIR / "pgda90"
WAC_URL = (
    "https://pds.mcp.nasa.gov/data/store/img/lunar_reconnaissance_orbiter/pds4/lroc/lro-l-lroc-5-rdr/"
    "LROLRC_2001/DATA/BDR/WAC_POLE/WAC_POLE_MOVIE_SOUTH/"
)
CAP_FACTOR = 4  # the app's south cap: the 240 m grid block-averaged 4 x 4 (terrain3d.CAP_FACTOR)
CAP_SHADOW_HALF_PX = 240  # the app crops +-240 cap cells round a site for its shadows (web/src/lib/data/terrain.ts)
LOG_FLOOR = 1e-5  # brightness below this (noise around zero in deep shadow) is counted as this, before the logarithm

Fetch = Callable[[str, int, int], bytes]


def _utc(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "")).replace(tzinfo=UTC)


def mid_utc(start_utc: str, stop_utc: str) -> str:
    """The middle of an exposure, to the nearest millisecond when the times carry fractions and to the second otherwise."""
    a, b = _utc(start_utc), _utc(stop_utc)
    mid = a + timedelta(microseconds=((b - a) // timedelta(microseconds=1)) // 2)
    if "." in start_utc or "." in stop_utc:
        mid += timedelta(microseconds=500)  # rounds to the nearest millisecond once the rest is dropped
        return mid.strftime("%Y-%m-%dT%H:%M:%S.") + f"{mid.microsecond // 1000:03d}"
    return (mid + timedelta(microseconds=500_000)).strftime("%Y-%m-%dT%H:%M:%S")


def _number(value: str) -> float:
    """The number at the start of a PDS3 value such as '100.0 <METERS/PIXEL>'."""
    m = re.match(r"\s*([-+0-9.eE]+)", value)
    if not m:
        raise ValueError(f"no number in {value!r}")
    return float(m.group(1))


@dataclass(frozen=True)
class WacFrame:
    """One frame of the WAC south polar movie: its times, its source observation and where its pixels lie."""

    name: str
    start_utc: str
    stop_utc: str
    source: str
    lines: int
    samples: int
    record_bytes: int
    image_offset: int
    px_m: float
    line_offset: float  # LINE_PROJECTION_OFFSET: the pole lies this many pixels below the first pixel's centre
    sample_offset: float  # SAMPLE_PROJECTION_OFFSET: and this many to the right of it

    @property
    def x0_m(self) -> float:
        """Map x of the left edge of the first column."""
        return -self.sample_offset * self.px_m - self.px_m / 2

    @property
    def y0_m(self) -> float:
        """Map y of the top edge of the first row."""
        return self.line_offset * self.px_m + self.px_m / 2

    @property
    def url(self) -> str:
        return f"{WAC_URL}{self.name}.IMG"


def wac_frame_from_header(name: str, text: str) -> WacFrame:
    """A frame from its attached PDS3 header: 32-bit little-endian floats, one record a line, the image after the label."""
    from .validate import read_label

    lab = read_label(text)
    top, image, proj = lab.get("", {}), lab.get("IMAGE", {}), lab.get("IMAGE_MAP_PROJECTION", {})
    if image.get("SAMPLE_TYPE") != "PC_REAL" or int(_number(image.get("SAMPLE_BITS", "0"))) != 32:
        raise ValueError(f"{name}: expected 32-bit PC_REAL samples, got {image.get('SAMPLE_TYPE')} {image.get('SAMPLE_BITS')}")
    if proj.get("MAP_PROJECTION_TYPE") != "POLAR STEREOGRAPHIC" or _number(proj.get("CENTER_LATITUDE", "0")) != -90.0:
        raise ValueError(f"{name}: expected a south polar stereographic map")
    if _number(proj.get("CENTER_LONGITUDE", "0")) != 0.0 or _number(proj.get("A_AXIS_RADIUS", "0")) != config.R_MOON_M / 1000.0:
        raise ValueError(f"{name}: expected the 1737.4 km sphere with longitude 0 up")
    record_bytes = int(_number(top["RECORD_BYTES"]))
    first_record = int(_number(top["^IMAGE"]))
    return WacFrame(
        name=name,
        start_utc=top["START_TIME"],
        stop_utc=top["STOP_TIME"],
        source=top.get("SOURCE_PRODUCT_ID", ""),
        lines=int(_number(image["LINES"])),
        samples=int(_number(image["LINE_SAMPLES"])),
        record_bytes=record_bytes,
        image_offset=(first_record - 1) * record_bytes,
        px_m=_number(proj["MAP_SCALE"]),
        line_offset=_number(proj["LINE_PROJECTION_OFFSET"]),
        sample_offset=_number(proj["SAMPLE_PROJECTION_OFFSET"]),
    )


def window_pixels(frame: WacFrame, x_min: float, x_max: float, y_min: float, y_max: float) -> tuple[slice, slice]:
    """Rows and columns of the frame whose pixel centres fall in the box (edges included), clipped to the frame."""
    px = frame.px_m
    c0 = max(0, int(np.ceil(x_min / px + frame.sample_offset - 1e-9)))
    c1 = min(frame.samples - 1, int(np.floor(x_max / px + frame.sample_offset + 1e-9)))
    r0 = max(0, int(np.ceil(frame.line_offset - y_max / px - 1e-9)))
    r1 = min(frame.lines - 1, int(np.floor(frame.line_offset - y_min / px + 1e-9)))
    return slice(r0, r1 + 1), slice(c0, c1 + 1)


@dataclass(frozen=True)
class Picture:
    """A map-projected picture or a window of one: values (NaN where there are none) and where its pixels lie."""

    values: np.ndarray
    x0_m: float  # map x of the left edge of the first column
    y0_m: float  # map y of the top edge of the first row
    px_m: float


def _http_range(url: str, first: int, last: int) -> bytes:
    from .fetch import make_session

    session = _http_range.__dict__.setdefault("session", make_session())
    for attempt in range(4):
        try:
            r = session.get(url, headers={"Range": f"bytes={first}-{last}"}, timeout=60)
            if r.status_code == 206 and len(r.content) == last - first + 1:
                return r.content
        except Exception:  # noqa: BLE001 - a dropped connection is retried like a bad answer
            if attempt == 3:
                raise
    raise OSError(f"{url}: no complete answer for bytes {first}-{last}")


def read_wac_window(frame: WacFrame, x_min: float, x_max: float, y_min: float, y_max: float, fetch: Fetch = _http_range) -> Picture:
    """The frame's pixels in a box, read with one byte range from the window's first pixel to its last (whole rows in
    between: a few megabytes, and one request rather than one a row); ISIS's special pixels (the most negative floats)
    become NaN."""
    rows, cols = window_pixels(frame, x_min, x_max, y_min, y_max)
    n_rows, n_cols = rows.stop - rows.start, cols.stop - cols.start
    if n_rows <= 0 or n_cols <= 0:
        raise ValueError(f"{frame.name}: the box is outside the frame")
    first = frame.image_offset + rows.start * frame.record_bytes + cols.start * 4
    last = frame.image_offset + (rows.stop - 1) * frame.record_bytes + cols.stop * 4 - 1
    raw = np.frombuffer(fetch(frame.url, first, last), dtype="<f4")
    per_row = frame.record_bytes // 4
    padded = np.concatenate([raw, np.zeros(per_row - n_cols, dtype="<f4")]).reshape(n_rows, per_row)
    values = padded[:, :n_cols].astype(np.float64)
    values[values < -1e38] = np.nan
    px = frame.px_m
    return Picture(values, (cols.start - frame.sample_offset) * px - px / 2, (frame.line_offset - rows.start) * px + px / 2, px)


def read_geotiff_picture(path: Path) -> Picture:
    """A north-up GeoTIFF picture (product 90's NAC images): its first band, NaN where it has no data."""
    import rasterio

    with rasterio.open(path) as ds:
        t = ds.transform
        if abs(t.e + t.a) > 1e-9 or t.b != 0 or t.d != 0:
            raise ValueError(f"{path.name}: expected a north-up grid with square pixels")
        values = ds.read(1).astype(np.float64)
        if ds.nodata is not None:
            values[values == ds.nodata] = np.nan
        values[values < -1e30] = np.nan
    return Picture(values, float(t.c), float(t.f), float(t.a))


def otsu_threshold(values: np.ndarray, bins: int = 256) -> float:
    """Otsu's threshold: the value that splits the sample into two groups with the least spread within them."""
    v = np.asarray(values, dtype=np.float64)
    v = v[np.isfinite(v)]
    if v.size < 2 or v.min() == v.max():
        raise ValueError("otsu_threshold needs at least two different values")
    hist, edges = np.histogram(v, bins=bins)
    centres = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(hist)
    w1 = w0[-1] - w0
    s0 = np.cumsum(hist * centres)
    m0 = s0 / np.maximum(w0, 1)
    m1 = (s0[-1] - s0) / np.maximum(w1, 1)
    between = (w0 * w1 * (m0 - m1) ** 2)[:-1]
    # Between two well separated groups every cut in the empty gap scores the same: take the middle of the gap.
    best = np.flatnonzero(between >= between.max() * (1 - 1e-12))
    return float((edges[best[0] + 1] + edges[best[-1] + 1]) / 2)


def gather_lit_share(
    lit: np.ndarray, level: Level, site_x_m: float, site_y_m: float, x0_m: float, y0_m: float, px_m: float, shape: tuple[int, int]
) -> tuple[np.ndarray, np.ndarray]:
    """For each picture pixel, the share of the app's pixel centres in it that are lit, and how many there are.

    The level's pixel centres are placed by the site's map position and the site's fractional pixel; a picture
    pixel without any is NaN.
    """
    h, w = lit.shape
    rows, cols = np.indices((h, w), dtype=np.float64)
    x = site_x_m + (cols - level.site_col) * level.px_m
    y = site_y_m + (level.site_row - rows) * level.px_m
    pc = np.floor((x - x0_m) / px_m).astype(np.int64)
    pr = np.floor((y0_m - y) / px_m).astype(np.int64)
    inside = (pc >= 0) & (pc < shape[1]) & (pr >= 0) & (pr < shape[0])
    flat = pr[inside] * shape[1] + pc[inside]
    count = np.bincount(flat, minlength=shape[0] * shape[1]).reshape(shape)
    lit_count = np.bincount(flat, weights=lit[inside].astype(np.float64), minlength=shape[0] * shape[1]).reshape(shape)
    with np.errstate(invalid="ignore", divide="ignore"):
        share = np.where(count > 0, lit_count / np.maximum(count, 1), np.nan)
    return share, count


def compare_masks(pred_lit: np.ndarray, seen_lit: np.ndarray) -> dict:
    """How the app's call (lit or not) compares with the picture's over the same pixels.

    agree: the share of pixels where both say the same; shadow_found: of the pixels dark in the picture, the share
    the app puts in shadow; shadow_confirmed: of the app's shadow, the share dark in the picture; majority: the
    agreement of calling every pixel by the picture's commoner state, the score to beat.
    """
    p = np.asarray(pred_lit, dtype=bool).ravel()
    s = np.asarray(seen_lit, dtype=bool).ravel()
    n = int(p.size)
    if n == 0:
        raise ValueError("compare_masks needs at least one pixel")
    seen_dark, app_dark = ~s, ~p
    both_dark = int((seen_dark & app_dark).sum())
    seen_lit_share = float(s.mean())
    return {
        "pixels": n,
        "agree": float((p == s).mean()),
        "seen_lit": seen_lit_share,
        "app_lit": float(p.mean()),
        "shadow_found": both_dark / int(seen_dark.sum()) if seen_dark.any() else None,
        "shadow_confirmed": both_dark / int(app_dark.sum()) if app_dark.any() else None,
        "majority": max(seen_lit_share, 1.0 - seen_lit_share),
    }


def best_shift(pred_lit: np.ndarray, seen_lit: np.ndarray, valid: np.ndarray, max_px: int) -> tuple[int, int, float]:
    """The offset (dx right, dy up, in picture pixels) by which the picture's content sits from the prediction's.

    Every candidate offset up to max_px either way is scored on the same interior pixels of the prediction (max_px
    in from each edge), where both are valid; returns the best offset and the agreement once it is taken out.
    """
    m = max_px
    h, w = pred_lit.shape
    core = (slice(m, h - m), slice(m, w - m))
    p, pv = pred_lit[core], valid[core]
    best = (0, 0, -1.0)
    for dy in range(-m, m + 1):
        for dx in range(-m, m + 1):
            # the content at prediction (r, c) sits in the picture at (r - dy, c + dx)
            sl = (slice(m - dy, h - m - dy), slice(m + dx, w - m + dx))
            ok = pv & valid[sl]
            if not ok.any():
                continue
            agree = float((p[ok] == seen_lit[sl][ok]).mean())
            # ties go to the smaller offset, so no shift is preferred when it is as good
            if agree > best[2] + 1e-12 or (abs(agree - best[2]) <= 1e-12 and dx * dx + dy * dy < best[0] ** 2 + best[1] ** 2):
                best = (dx, dy, agree)
    return best


def parse_polygon(wkt: str) -> np.ndarray:
    """The outer ring of a POLYGON (or of a MULTIPOLYGON's first polygon) in well-known text, as (n, 2) coordinates."""
    m = re.search(r"\(\(+([^()]*)\)", wkt)
    if not m:
        raise ValueError(f"no polygon in {wkt[:60]!r}")
    return np.array([[float(v) for v in pair.split()] for pair in m.group(1).split(",")], dtype=np.float64)


def inside_polygon(points: np.ndarray, ring: np.ndarray) -> np.ndarray:
    """Whether each (x, y) point lies inside the ring, by the even-odd rule."""
    x, y = points[:, 0][:, None], points[:, 1][:, None]
    x1, y1, x2, y2 = ring[:-1, 0], ring[:-1, 1], ring[1:, 0], ring[1:, 1]
    crosses = (y1 > y) != (y2 > y)
    with np.errstate(divide="ignore", invalid="ignore"):
        at = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
    return ((crosses & (x < at)).sum(axis=1) % 2) == 1


def frame_name(start_utc: str) -> str:
    """The movie names a frame by the minute its observation starts: S20090920T0850."""
    return "S" + _utc(start_utc).strftime("%Y%m%dT%H%M")


def observations_from_ode(doc: dict) -> list[dict]:
    """The WAC observations in an ODE product search: source product, start and stop, movie frame name, footprint."""
    products = doc.get("ODEResults", {}).get("Products")
    if not isinstance(products, dict):
        return []
    items = products.get("Product", [])
    out = []
    for p in items if isinstance(items, list) else [items]:
        start = p["UTC_start_time"].replace("Z", "")
        stop = p["UTC_stop_time"].replace("Z", "")
        trim = lambda t: t[:23] if "." in t else t  # milliseconds are enough
        out.append(
            {
                "source": p["Product_name"].split(".")[0],
                "start_utc": trim(start),
                "stop_utc": trim(stop),
                "frame": frame_name(start),
                "footprint": p["Footprint_SP_geometry"],
            }
        )
    return out


def level_box(level: Level, site_x_m: float, site_y_m: float) -> tuple[float, float, float, float]:
    """The map box (x_min, x_max, y_min, y_max) of a level's pixels, out to their outer edges."""
    h, w = level.heights_m.shape
    px = level.px_m
    return (
        site_x_m - (level.site_col + 0.5) * px,
        site_x_m + (w - 0.5 - level.site_col) * px,
        site_y_m - (h - 0.5 - level.site_row) * px,
        site_y_m + (level.site_row + 0.5) * px,
    )


def pick_frames(candidates: list[dict], min_el_deg: float) -> list[dict]:
    """One frame for each quarter of the Sun's circle: the earliest that covers the site with the Sun this high or more."""
    picked: dict[int, dict] = {}
    for c in sorted(candidates, key=lambda c: c["start_utc"]):
        if not c["covered"] or c["sun_el"] < min_el_deg:
            continue
        q = int((c["sun_az"] % 360.0) // 90.0)
        picked.setdefault(q, c)
    return sorted(picked.values(), key=lambda c: c["start_utc"])


def sun_azel(utcs: list[str], lat_deg: float, lon_deg: float) -> tuple[np.ndarray, np.ndarray]:
    """The Sun's azimuth and elevation (deg) at a site at these moments: SPICE with the app's kernels, frame and corrections."""
    import spiceypy as spice

    from .ephemeris import ABCORR, FRAME
    from .geometry import azel_from_body_vectors
    from .spice_env import spice_kernels

    with spice_kernels():
        vecs = np.array([spice.spkpos("SUN", spice.str2et(u), FRAME, ABCORR, "MOON")[0] for u in utcs])
    az, el = azel_from_body_vectors(vecs, lat_deg, lon_deg)
    return np.atleast_1d(az), np.atleast_1d(el)


def south_cap(grids: dict[str, LolaGrid]) -> LolaGrid:
    """The app's south cap: the 240 m grid block-averaged 4 x 4 into 960 m cells (terrain3d.write_south_cap)."""
    grid = grids["L2"]
    lab = grid.label
    f = CAP_FACTOR
    rows, cols = lab.lines // f * f, lab.samples // f * f
    block = grid.data[:rows, :cols].reshape(rows // f, f, cols // f, f).mean(axis=(1, 3), dtype=np.float64) * lab.scaling_factor
    half = (f - 1) / 2
    label = GridLabel(
        lines=rows // f,
        samples=cols // f,
        map_scale_m=lab.map_scale_m * f,
        line_offset_px=(lab.line_offset_px - half) / f,
        sample_offset_px=(lab.sample_offset_px - half) / f,
        scaling_factor=1.0,
        offset=0.0,
        max_latitude_deg=lab.max_latitude_deg,
        sample_bits=32,
    )
    return LolaGrid(label, block.astype(np.float32))


def app_levels(site, grids: dict[str, LolaGrid], cap: LolaGrid) -> list[Level]:
    """The levels the app sweeps for a site's shadow map, coarse to fine: a crop of the cap, the 80 m context (20 m sites
    only) and the site's window, each with the site's own fractional pixel (web/src/lib/data/terrain.ts, shadowLevels)."""
    from .terrain3d import CONTEXT_PX, level_for_site, window_for_site, window_heights

    levels = []
    col, row = cap.pixel_from_latlon(site.lat, site.lon)
    size = min(2 * CAP_SHADOW_HALF_PX + 1, cap.label.samples, cap.label.lines)
    c0 = max(0, min(cap.label.samples - size, round(float(col)) - CAP_SHADOW_HALF_PX))
    r0 = max(0, min(cap.label.lines - size, round(float(row)) - CAP_SHADOW_HALF_PX))
    crop = cap.data[r0 : r0 + size, c0 : c0 + size].astype(np.float64)
    levels.append(Level(crop, float(cap.label.map_scale_m), float(col) - c0, float(row) - r0))
    if level_for_site(site) == "L0":
        ctx = grids["L1"]
        ccol, crow = ctx.pixel_from_latlon(site.lat, site.lon)
        cr0, cc0 = round(float(crow)) - CONTEXT_PX // 2, round(float(ccol)) - CONTEXT_PX // 2
        heights, _ = window_heights(ctx, cr0, cc0, CONTEXT_PX, grids["L2"])
        levels.append(Level(heights, float(ctx.label.map_scale_m), float(ccol) - cc0, float(crow) - cr0))
    grid, wr0, wc0, wsize = window_for_site(site, grids)
    order = ("L0", "L1", "L2")
    name = level_for_site(site)
    coarser = order[order.index(name) + 1] if name != "L2" else None
    heights, _ = window_heights(grid, wr0, wc0, wsize, grids[coarser] if coarser else None)
    wcol, wrow = grid.pixel_from_latlon(site.lat, site.lon)
    levels.append(Level(heights, float(grid.label.map_scale_m), float(wcol) - wc0, float(wrow) - wr0))
    return levels


def write_json(path: Path, doc: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    return path
