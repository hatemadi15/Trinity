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
        return f"{WAC_URL}WAC_MOVIE_{self.name}.IMG"


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
    import time

    from .fetch import make_session

    session = _http_range.__dict__.setdefault("session", make_session())
    for attempt in range(6):
        try:
            r = session.get(url, headers={"Range": f"bytes={first}-{last}"}, timeout=120)
            if r.status_code == 404:
                raise FileNotFoundError(url)
            if r.status_code == 206 and len(r.content) == last - first + 1:
                return r.content
        except FileNotFoundError:
            raise
        except Exception:
            if attempt == 5:
                raise
        time.sleep(5.0 * (attempt + 1))  # the archive answers 429 to a burst: wait and ask again
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


def gather_mean(
    values: np.ndarray, level: Level, site_x_m: float, site_y_m: float, x0_m: float, y0_m: float, px_m: float, shape: tuple[int, int]
) -> tuple[np.ndarray, np.ndarray]:
    """For each picture pixel, the mean of a level's values over the level's pixel centres that fall in it, and how
    many there are; the centres are placed by the site's map position and its fractional pixel. NaN where none."""
    h, w = values.shape
    rows, cols = np.indices((h, w), dtype=np.float64)
    x = site_x_m + (cols - level.site_col) * level.px_m
    y = site_y_m + (level.site_row - rows) * level.px_m
    pc = np.floor((x - x0_m) / px_m).astype(np.int64)
    pr = np.floor((y0_m - y) / px_m).astype(np.int64)
    inside = (pc >= 0) & (pc < shape[1]) & (pr >= 0) & (pr < shape[0])
    flat = pr[inside] * shape[1] + pc[inside]
    count = np.bincount(flat, minlength=shape[0] * shape[1]).reshape(shape)
    total = np.bincount(flat, weights=np.asarray(values, dtype=np.float64)[inside], minlength=shape[0] * shape[1]).reshape(shape)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = np.where(count > 0, total / np.maximum(count, 1), np.nan)
    return mean, count


def gather_lit_share(
    lit: np.ndarray, level: Level, site_x_m: float, site_y_m: float, x0_m: float, y0_m: float, px_m: float, shape: tuple[int, int]
) -> tuple[np.ndarray, np.ndarray]:
    """For each picture pixel, the share of the app's pixel centres in it that are lit, and how many there are."""
    return gather_mean(np.asarray(lit, dtype=np.float64), level, site_x_m, site_y_m, x0_m, y0_m, px_m, shape)


def compare_masks(pred_lit: np.ndarray, seen_lit: np.ndarray) -> dict:
    """How the app's call (lit or not) compares with the picture's over the same pixels.

    agree: the share of pixels where both say the same; light_found: of the pixels lit in the picture, the share the
    app has lit; shadow_found: of the pixels dark in the picture, the share the app puts in shadow; shadow_confirmed:
    of the app's shadow, the share dark in the picture; majority: the agreement of calling every pixel by the
    picture's commoner state.
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
        "light_found": int((s & p).sum()) / int(s.sum()) if s.any() else None,
        "shadow_found": both_dark / int(seen_dark.sum()) if seen_dark.any() else None,
        "shadow_confirmed": both_dark / int(app_dark.sum()) if app_dark.any() else None,
        "majority": max(seen_lit_share, 1.0 - seen_lit_share),
    }


def edge_pixels(mask: np.ndarray) -> np.ndarray:
    """Pixels with both states among themselves and their eight neighbours: a shadow's edge, one pixel either side."""
    m = np.asarray(mask, dtype=bool)
    h, w = m.shape
    pad_lit = np.pad(m, 1, constant_values=False)
    pad_dark = np.pad(~m, 1, constant_values=False)
    any_lit = np.zeros_like(m)
    any_dark = np.zeros_like(m)
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            any_lit |= pad_lit[dy : dy + h, dx : dx + w]
            any_dark |= pad_dark[dy : dy + h, dx : dx + w]
    return any_lit & any_dark


def near_edge_share(pred_lit: np.ndarray, seen_lit: np.ndarray, usable: np.ndarray, picture_edges: bool = True) -> float | None:
    """Of the usable pixels the two calls disagree on, the share on a shadow's edge in the app's map (or the picture's)."""
    differ = usable & (pred_lit != seen_lit)
    if not differ.any():
        return None
    edge = edge_pixels(pred_lit)
    if picture_edges:
        edge |= edge_pixels(seen_lit)
    return float((differ & edge).sum()) / float(differ.sum())


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


def direct_cosine(level: Level, bearing_deg: float, el_deg: float) -> np.ndarray:
    """The cosine of the Sun's angle from each pixel's upright (0 where the ground faces away), from the level's
    slopes; the Sun stands higher by d / R radians at a pixel d metres towards it, as the Moon curves away."""
    from .shadow import grid_xy

    z = np.asarray(level.heights_m, dtype=np.float64)
    gy, gx = np.gradient(z, level.px_m)  # gy runs down the rows
    nx, ny = -gx, gy
    norm = np.sqrt(nx * nx + ny * ny + 1.0)
    x, y = grid_xy(z.shape, level.px_m, level.site_col, level.site_row)
    b = np.radians(bearing_deg)
    sx, sy = np.sin(b), np.cos(b)
    el = np.radians(el_deg) + (x * sx + y * sy) / config.R_MOON_M
    return np.clip((nx * sx * np.cos(el) + ny * sy * np.cos(el) + np.sin(el)) / norm, 0.0, None)


def classify_by_ratio(
    values: np.ndarray, expected: np.ndarray, min_expected: float, sunlit: np.ndarray | None = None
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """Lit or not by brightness against what direct sunlight would give each pixel.

    expected: the cosine of the Sun's angle from upright (the app's slopes, as if nothing shaded them). The scale k of
    sunlight (brightness per unit of that cosine) is the median over the `sunlit` pixels when given; otherwise the
    median of the bright group, above Otsu's cut on the logarithm of brightness per unit (which fails when faint
    light from surrounding slopes outnumbers the sunlit ground). A pixel counts as lit when at least half as bright as
    sunlight would make it, the same half way the app's sweep marks (the middle of the Sun's disc in view). Pixels
    whose ground meets the Sun at under min_expected are dark lit or not, and are left out. Returns (lit, ratio,
    usable, k).
    """
    usable = np.isfinite(values) & (expected >= min_expected)
    if usable.sum() < 2:
        raise ValueError("too few pixels to scale sunlight by")
    with np.errstate(divide="ignore", invalid="ignore"):
        per_unit = np.where(usable, values / expected, np.nan)
    if sunlit is not None and (usable & sunlit).any():
        k = float(np.median(per_unit[usable & sunlit]))
    else:
        logs = np.log10(np.clip(per_unit[usable], LOG_FLOOR, None))
        k = float(np.median(per_unit[usable][logs > otsu_threshold(logs)]))
    ratio = per_unit / k
    return usable & (ratio >= 0.5), ratio, usable, k


def frames_in_listing(xml: str) -> list[str]:
    """The movie frames (S20090920T0850, ...) named in an S3-style bucket listing, once each, in order."""
    return sorted(set(re.findall(r"WAC_MOVIE_(S\d{8}T\d{4})\.IMG</Key>", xml)))


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


ODE_URL = "https://oderest.rsl.wustl.edu/live2/"
ODE_DIR = IMAGES_DIR / "ode"
HEADER_BYTES = 24320  # one record: the movie frames' attached PDS3 header


def ode_wac_observations(site, start_utc: str, stop_utc: str, cache_dir: Path = ODE_DIR) -> list[dict]:
    """The WAC monochrome observations whose footprint (LROC's index, via ODE) holds the site, between two dates;
    the answer is kept as JSON so a rerun reads it again rather than asking."""
    path = cache_dir / f"wac_{site.id}_{start_utc[:10]}_{stop_utc[:10]}.json"
    if not path.exists():
        from .fetch import make_session

        lon360 = site.lon % 360.0
        params = {
            "query": "product",
            "results": "m",
            "output": "JSON",
            "target": "moon",
            "ihid": "LRO",
            "iid": "LROC",
            "pt": "EDRWAM4",
            "minlat": f"{site.lat - 0.005:.4f}",
            "maxlat": f"{site.lat + 0.005:.4f}",
            "westlon": f"{max(0.0, lon360 - 0.05):.4f}",
            "eastlon": f"{min(360.0, lon360 + 0.05):.4f}",
            "minobtime": start_utc,
            "maxobtime": stop_utc,
            "limit": "2000",
        }
        r = make_session().get(ODE_URL, params=params, timeout=180)
        r.raise_for_status()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(r.text, encoding="utf-8")
    return observations_from_ode(json.loads(path.read_text(encoding="utf-8")))


def wac_frame(name: str, cache_dir: Path = WAC_DIR, fetch: Fetch = _http_range) -> WacFrame | None:
    """A movie frame's header, kept as text; None when the movie has no such frame."""
    path = cache_dir / "headers" / f"{name}.lbl"
    if not path.exists():
        try:
            raw = fetch(f"{WAC_URL}WAC_MOVIE_{name}.IMG", 0, HEADER_BYTES - 1)
        except OSError:
            return None
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw.rstrip(b" \r\n\x00"))
    return wac_frame_from_header(name, path.read_text(encoding="latin-1"))


def cached_wac_window(frame: WacFrame, site_id: str, box: tuple[float, float, float, float], cache_dir: Path = WAC_DIR, fetch: Fetch = _http_range) -> Picture:
    """A site's window of a frame, kept as a small .npz beside the headers."""
    path = cache_dir / "windows" / f"{frame.name}_{site_id}.npz"
    if path.exists():
        z = np.load(path)
        return Picture(z["values"], float(z["x0_m"]), float(z["y0_m"]), float(z["px_m"]))
    pic = read_wac_window(frame, *box, fetch=fetch)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, values=pic.values.astype(np.float32), x0_m=pic.x0_m, y0_m=pic.y0_m, px_m=pic.px_m)
    return pic


MIN_COS = float(np.sin(np.radians(0.5)))  # ground meeting the Sun at under half a degree is dark lit or not
MAX_SHIFT_PX = 3


def _r(x, n=4):
    return None if x is None else round(float(x), n)


def compare_picture(site, levels: list[Level], picture: Picture, sun_az_deg: float, sun_el_deg: float) -> dict:
    """The app's shadow map for the site at this Sun against a picture, on the picture's pixels.

    The app's lit share and the cosine of the Sun's angle from upright are gathered into each picture pixel; the
    picture's pixels are called lit at half the brightness sunlight would give them (classify_by_ratio, its scale
    matched over the ground the app calls sunlit); the app's call is its lit share at a half. Also: the same with the Sun a quarter turn away (a control: how much agreement the terrain's slopes
    give without the right shadows), the calls at a quarter and three quarters of sunlight, the share of the
    disagreement on a shadow's edge, and the offset that lines the two up best.
    """
    from .geometry import ps_south_xy_m
    from .shadow import cast, sun_bearing_deg

    finest = levels[-1]
    bearing = sun_bearing_deg(site.lon, sun_az_deg)
    sx, sy = (float(v) for v in ps_south_xy_m(site.lat, site.lon))
    shape = picture.values.shape
    where = (sx, sy, picture.x0_m, picture.y0_m, picture.px_m, shape)
    lit, _ = cast(levels, bearing, sun_el_deg)
    share, count = gather_lit_share(lit, finest, *where)
    expected, _ = gather_mean(direct_cosine(finest, bearing, sun_el_deg), finest, *where)
    v = picture.values
    valid = (count > 0) & np.isfinite(v)
    values, cosines = np.where(valid, v, np.nan), np.where(valid, expected, 0.0)
    _, _, _, k_alone = classify_by_ratio(values, cosines, MIN_COS)
    # The scale of sunlight is matched once a picture over the ground the app calls sunlit: one number, a median.
    seen, ratio, usable, k = classify_by_ratio(values, cosines, MIN_COS, sunlit=share == 1.0)
    pred = share >= 0.5
    main = compare_masks(pred[usable], seen[usable])
    unanimous = usable & ((share == 0.0) | (share == 1.0))
    away = compare_masks(pred[unanimous], seen[unanimous])
    quarter = compare_masks(pred[usable], (ratio >= 0.25)[usable])
    three_quarters = compare_masks(pred[usable], (ratio >= 0.75)[usable])
    dx, dy, shifted = best_shift(pred, seen, usable, MAX_SHIFT_PX)
    turned, _ = cast(levels, (bearing + 90.0) % 360.0, sun_el_deg)
    control = compare_masks((gather_lit_share(turned, finest, *where)[0] >= 0.5)[usable], seen[usable])
    return {
        "bearing_deg": round(bearing, 2),
        "picture_px_m": picture.px_m,
        "app_px_m": finest.px_m,
        "picture_pixels": int(valid.sum()),
        "pixels": main["pixels"],
        "km2": round(main["pixels"] * picture.px_m**2 / 1e6, 2),
        "brightness_scale": _r(k, 5),
        "brightness_scale_picture_alone": _r(k_alone, 5),
        "agree": _r(main["agree"]),
        "seen_lit": _r(main["seen_lit"]),
        "app_lit": _r(main["app_lit"]),
        "light_found": _r(main["light_found"]),
        "shadow_found": _r(main["shadow_found"]),
        "shadow_confirmed": _r(main["shadow_confirmed"]),
        "majority": _r(main["majority"]),
        "disagree_on_edges": _r(near_edge_share(pred, seen, usable)),
        "agree_away_from_edges": _r(away["agree"]),
        "away_from_edges_share": _r(away["pixels"] / main["pixels"]),
        "agree_at_quarter_sunlight": _r(quarter["agree"]),
        "agree_at_three_quarters_sunlight": _r(three_quarters["agree"]),
        "best_offset_m": [dx * picture.px_m, dy * picture.px_m],
        "agree_at_best_offset": _r(shifted),
        "agree_sun_turned_90": _r(control["agree"]),
        "_maps": {"share": share, "seen": seen, "usable": usable, "values": v},
    }


# ---- The check: which sites and pictures, and the table it writes --------------------------------------------------

# One site per stretch of ground (no two maps overlap), the app's landing targets and region centres near the pole:
# two on 20 m terrain and six on 80 m. The order is the table's.
SITES = (
    "connecting_ridge",
    "peak_near_shackleton",
    "de_gerlache_rim_2",
    "malapert_massif",
    "slater_plain",
    "im2_athena",
    "nobile_rim_2",
    "peak_near_cabeus_b",
)
# The movie's first 29.5 days (one turn of the Sun round the pole), near the most southern Sun of the year.
PERIOD = ("2009-09-20T00:00:00", "2009-10-19T12:00:00")
MIN_EL_DEG = 0.5  # a frame is used when the Sun's centre stands at least this high at the site
MIN_DATA = 0.9  # and the frame has data on at least this share of the site's map
# Product 90's two NAC pictures beside Connecting Ridge (the left and right cameras of one observation).
NAC_PICTURES = (("M139729686LE", "connecting_ridge"), ("M139729686RE", "connecting_ridge"))
# The rule, set after a first look at five WAC pictures of Connecting Ridge, Malapert Massif and IM-2 Athena.
RULE_AGREE = 0.85
RULE_FOUND = 0.80
CITATIONS = [
    "LROC WAC polar movie frames: LRO-L-LROC-5-RDR-V1.0, volume LROLRC_2001, DATA/BDR/WAC_POLE/WAC_POLE_MOVIE_SOUTH (Arizona State University); Speyerer and Robinson 2013, Icarus 222, 122, doi:10.1016/j.icarus.2012.10.010",
    "Observation times and footprints: the LROC index through the PDS Geosciences Node's Orbital Data Explorer (oderest.rsl.wustl.edu)",
    "Product 90's NAC pictures on its 20 m model: Barker et al. 2023, Planet. Sci. J. 4, 183, doi:10.3847/PSJ/acf3e1; https://pgda.gsfc.nasa.gov/products/90",
]


def movie_frames(month: str, cache_dir: Path = WAC_DIR) -> set[str]:
    """The movie's frames in a month (yyyymm), from one bucket listing, kept as text."""
    path = cache_dir / f"frames_{month}.txt"
    if not path.exists():
        from .fetch import make_session

        prefix = "lunar_reconnaissance_orbiter/pds4/lroc/lro-l-lroc-5-rdr/LROLRC_2001/DATA/BDR/WAC_POLE/WAC_POLE_MOVIE_SOUTH/WAC_MOVIE_S" + month
        r = make_session().get("https://pds.mcp.nasa.gov/data/store/img/", params={"list-type": "2", "prefix": prefix, "max-keys": "1000"}, timeout=120)
        r.raise_for_status()
        if "<IsTruncated>true</IsTruncated>" in r.text:
            raise RuntimeError(f"the listing for {month} is longer than one page")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(frames_in_listing(r.text)) + "\n", encoding="utf-8")
    return {line for line in path.read_text(encoding="utf-8").split() if line}


def _months(start_utc: str, stop_utc: str) -> list[str]:
    a, b = _utc(start_utc), _utc(stop_utc)
    out, y, m = [], a.year, a.month
    while (y, m) <= (b.year, b.month):
        out.append(f"{y:04d}{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def box_points(box: tuple[float, float, float, float]) -> np.ndarray:
    """The corners and edge midpoints of a map box."""
    x0, x1, y0, y1 = box
    xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
    return np.array([[x0, y0], [x0, y1], [x1, y0], [x1, y1], [xm, y0], [xm, y1], [x0, ym], [x1, ym]])


def wac_candidates(site, box, period=PERIOD) -> list[dict]:
    """The movie frames of the period whose observation's footprint holds the whole of the site's map, with the Sun."""
    movie = set().union(*(movie_frames(m) for m in _months(*period)))
    obs = [o for o in ode_wac_observations(site, *period) if o["frame"] in movie]
    if not obs:
        return []
    mids = [mid_utc(o["start_utc"], o["stop_utc"]) for o in obs]
    az, el = sun_azel(mids, site.lat, site.lon)
    pts = box_points(box)
    return [
        {**o, "mid_utc": m, "sun_az": float(a), "sun_el": float(e), "covered": bool(inside_polygon(pts, parse_polygon(o["footprint"])).all())}
        for o, m, a, e in zip(obs, mids, az, el)
    ]


def nac_picture(product: str) -> tuple[Picture, dict]:
    """A product 90 NAC picture and its observation (times from the LROC index via ODE, kept as JSON)."""
    path = ODE_DIR / f"{product}.json"
    if not path.exists():
        from .fetch import make_session

        params = {"query": "product", "results": "m", "output": "JSON", "target": "moon", "ihid": "LRO", "iid": "LROC", "pt": "EDRNAC4", "pdsid": f"nac.{product.lower()}"}
        r = make_session().get(ODE_URL, params=params, timeout=180)
        r.raise_for_status()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(r.text, encoding="utf-8")
    (obs,) = observations_from_ode(json.loads(path.read_text(encoding="utf-8")))
    tif = P90_DIR / f"{product}_20MPP.TIF"
    if not tif.exists():
        from .fetch import make_session

        r = make_session().get(f"https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/{tif.name}", timeout=600)
        r.raise_for_status()
        tif.parent.mkdir(parents=True, exist_ok=True)
        tif.write_bytes(r.content)
    return read_geotiff_picture(tif), obs


def crop_picture(picture: Picture, box: tuple[float, float, float, float]) -> Picture:
    """The part of a picture whose pixel centres fall in a map box."""
    x0, x1, y0, y1 = box
    px = picture.px_m
    h, w = picture.values.shape
    c0 = max(0, int(np.ceil((x0 - picture.x0_m) / px - 0.5)))
    c1 = min(w, int(np.floor((x1 - picture.x0_m) / px - 0.5)) + 1)
    r0 = max(0, int(np.ceil((picture.y0_m - y1) / px - 0.5)))
    r1 = min(h, int(np.floor((picture.y0_m - y0) / px - 0.5)) + 1)
    return Picture(picture.values[r0:r1, c0:c1], picture.x0_m + c0 * px, picture.y0_m - r0 * px, px)


def product90_levels(site, adj80: LolaGrid, adj240: LolaGrid, cap90: LolaGrid) -> list[Level]:
    """The same levels cut from product 90's adjusted models (Barker et al. 2023): the 20 m model read as a window near
    the deepest sites, its 80 m model, and its 240 m model block-averaged into the cap."""
    from .pgda90 import read_window

    inner = read_window("dem20", site.lat, site.lon, 10_400.0).grid() if site.lat <= -87.55 else adj80
    return app_levels(site, {"L0": inner, "L1": adj80, "L2": adj240}, cap90)


def with_other_terrain(row: dict, other: dict) -> dict:
    """A row with the agreement the same picture gives with product 90's terrain beside the app's."""
    return {**row, "product90": {k: other[k] for k in ("agree", "light_found", "shadow_found", "shadow_confirmed", "app_lit")}}


def site_rows(site, levels: list[Level], box, others: list[Level] | None = None) -> tuple[list[dict], dict]:
    """The WAC comparisons at one site: frames picked one per quarter of the Sun's circle, each compared."""
    cands = wac_candidates(site, box)
    rejected: list[str] = []
    while True:
        picked = pick_frames(cands, MIN_EL_DEG)
        retry = False
        for c in picked:
            frame = wac_frame(c["frame"])
            pic = cached_wac_window(frame, site.id, box) if frame else None
            data = float(np.isfinite(pic.values).mean()) if pic is not None else 0.0
            if data < MIN_DATA:
                c["covered"] = False  # the footprint promised more than the frame holds: take the next in its quarter
                rejected.append(c["frame"])
                retry = True
                break
            c["_picture"], c["_frame"], c["data_share"] = pic, frame, data
        if not retry:
            break
    rows = []
    for c in picked:
        r = compare_picture(site, levels, c["_picture"], c["sun_az"], c["sun_el"])
        if others:
            r = with_other_terrain(r, compare_picture(site, others, c["_picture"], c["sun_az"], c["sun_el"]))
        rows.append(
            {
                "site_id": site.id,
                "camera": "WAC",
                "picture": f"WAC_MOVIE_{c['frame']}",
                "observation": c["_frame"].source or c["source"],
                "start_utc": c["start_utc"],
                "stop_utc": c["stop_utc"],
                "mid_utc": c["mid_utc"],
                "sun_az_deg": round(c["sun_az"], 2),
                "sun_el_deg": round(c["sun_el"], 2),
                "data_share": round(c["data_share"], 4),
                **r,
            }
        )
    summary = {
        "candidates": len(cands),
        "covered": sum(1 for c in cands if c["covered"]),
        "sun_high_enough": sum(1 for c in cands if c["covered"] and c["sun_el"] >= MIN_EL_DEG),
        "rejected_for_gaps": rejected,
    }
    return rows, summary


def _median(xs: list[float]) -> float | None:
    xs = [x for x in xs if x is not None]
    return round(float(np.median(xs)), 4) if xs else None


def passes(row: dict) -> bool:
    """A picture meets the rule: enough agreement, and enough of both the lit and the dark ground found."""
    found = [row["light_found"], row["shadow_found"]]
    return row["agree"] >= RULE_AGREE and all(f is None or f >= RULE_FOUND for f in found)


def build_doc(rows: list[dict], sites: list[dict], downloads: dict) -> dict:
    """The table the Accuracy page reads: the evidence block, a summary, every picture and every site."""
    meets = bool(rows) and all(passes(r) for r in rows)
    wac = [r for r in rows if r["camera"] == "WAC"]
    nac = [r for r in rows if r["camera"] == "NAC"]
    used_sites = [s["site_id"] for s in sites if any(r["site_id"] == s["site_id"] for r in rows)]
    els = [r["sun_el_deg"] for r in rows]
    mids = sorted(r["mid_utc"] for r in rows)
    return {
        "generated_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "evidence": {
            "kind": "check",
            "title": "Terrain shadows against LRO camera pictures",
            "establishes": (
                "At the moment each picture was taken, the app's shadow sweep over its own terrain, with the Sun's direction "
                "from its kernels, puts sunlight and shadow where the Lunar Reconnaissance Orbiter's cameras saw them, compared "
                "on the pictures' pixels at featured polar sites."
            ),
            "criteria": {
                "rule": (
                    f"In every picture the two calls agree on at least {RULE_AGREE:.0%} of the ground the Sun could light, and the "
                    f"app finds at least {RULE_FOUND:.0%} of the ground the picture shows lit and {RULE_FOUND:.0%} of the ground it "
                    "shows dark. Set after a first look at five WAC pictures of three sites, before the rest were compared."
                ),
                "min_agree": RULE_AGREE,
                "min_found": RULE_FOUND,
            },
            "limitations": [
                "WAC pixels are 100 m across, five of the app's 20 m pixels: detail inside a pixel is averaged, so a shadow's edge is only checked to within a pixel. The NAC pictures check 20 m pixels, but they are one observation, beside Connecting Ridge.",
                "Whether a pixel of a picture is lit is a judgement: at least half as bright as direct sunlight would make that slope, with the slope from the app's terrain and the scale of sunlight matched once a picture over the ground the app calls sunlit. Calling it at a quarter or at three quarters of sunlight moves each picture's agreement by a few points; both are in the table.",
                "Ground that meets the Sun at under half a degree (facing away from it) is dark whether in shadow or not, and is left out.",
                "The WAC pictures come from one turn of the Sun round the pole, 20 September to 19 October 2009, near the most southern Sun of the year: 0.5 to 7 degrees up at these sites. A lower Sun, with longer shadows, is not tested; the misses come from the lowest Suns tested.",
                "The pictures are placed on the map by the camera team and taken as they are; the offset that would line them up best, within three pixels, is reported, not used.",
                "The app calls a pixel lit when the middle of the Sun's disc is in view; a picture shows a partly hidden Sun as dimmer ground. The half-sunlight rule matches this on average, not pixel by pixel.",
                "The app's terrain is from LRO's laser altimeter and the pictures are from its cameras: independent instruments on one spacecraft. This checks shadows at the moments pictured, not sunlight over years (the LOLA map comparison does that).",
            ],
            "coverage": {
                "sites": used_sites,
                "pictures": len(rows),
                "wac_pictures": len(wac),
                "nac_pictures": len(nac),
                "pixels": int(sum(r["pixels"] for r in rows)),
                # summed over pictures: pictures of one site cover much the same ground
                "km2": round(sum(r["km2"] for r in rows), 1),
                "first_utc": mids[0] if mids else None,
                "last_utc": mids[-1] if mids else None,
                "sun_el_deg": [round(min(els), 2), round(max(els), 2)] if els else None,
                "period": list(PERIOD),
                "min_sun_el_deg": MIN_EL_DEG,
                "min_data_share": MIN_DATA,
            },
            "meets_criteria": meets,
            "command": "cd pipeline && uv run python -m lunar_pipeline.cli images",
        },
        "method": {
            "terrain": "the app's own levels for each site: a crop of the 960 m south cap, the 80 m context (20 m sites only) and the site's window (20 m south of 87.55 S, else 80 m), swept by shadow.cast, the twin of the browser's engine",
            "sun": "SPICE (DE440, MOON_ME, LT+S, the app's kernels) at the middle of each exposure; one direction for the whole map, the Moon's curvature in the sweep",
            "gathering": "the app's lit share in each picture pixel is the share of its own pixel centres in it that are lit; it calls the pixel lit at a half",
            "picture": "lit when at least half as bright as direct sunlight would make it: the cosine of the Sun's angle from the app's slopes times the picture's scale of sunlight, one number a picture, the median brightness per unit cosine over the ground the app calls sunlit. The scale was first taken from the picture alone (the median of its bright group, above Otsu's cut on the logarithm of brightness per unit cosine); in one picture (Peak near Shackleton, 10 October 2009, the Sun 0.6 degrees up) faint light from the slopes round a deep shadow outnumbered the sunlit ground and gave a scale 15 times too small, so the scale is matched instead; the picture-alone scale stays in each row, and agrees within 10 % in every other picture",
            "terrain_versions": "each row also gives the agreement with product 90's adjusted terrain (Barker et al. 2023) cut into the same levels, the same sweep and the same picture",
            "left_out": "picture pixels without data, outside the site's map, or whose ground meets the Sun at under 0.5 degrees",
            "control": "the same comparison with the Sun turned a quarter of the way round (same height): the agreement the terrain's slopes give without the right shadows",
            "frames": f"for each site, the movie frames between {PERIOD[0][:10]} and {PERIOD[1][:10]} whose observation's footprint (the LROC index, via ODE) holds the whole map and whose frame has data on at least {MIN_DATA:.0%} of it, with the Sun at least {MIN_EL_DEG} degrees up: the earliest in each quarter of the compass",
        },
        "sources": CITATIONS,
        "downloads": downloads,
        "summary": {
            "median_agree": _median([r["agree"] for r in rows]),
            "min_agree": round(min(r["agree"] for r in rows), 4) if rows else None,
            "median_light_found": _median([r["light_found"] for r in rows]),
            "median_shadow_found": _median([r["shadow_found"] for r in rows]),
            "median_shadow_confirmed": _median([r["shadow_confirmed"] for r in rows]),
            "median_majority": _median([r["majority"] for r in rows]),
            "median_disagree_on_edges": _median([r["disagree_on_edges"] for r in rows]),
            "median_agree_sun_turned_90": _median([r["agree_sun_turned_90"] for r in rows]),
            "pictures_meeting_rule": sum(1 for r in rows if passes(r)),
        },
        "rows": rows,
        "sites": sites,
    }


def run(site_ids: tuple[str, ...] = SITES, out_dir: Path = config.DATA_DIR / "validation") -> Path:
    """Compares every picked picture with the app's shadows and writes data/validation/images.json."""
    from .geometry import ps_south_xy_m
    from .masks import load_grids
    from .pgda90 import full_path, grid_from_geotiff
    from .sites import all_sites

    by_id = {s.id: s for s in all_sites()}
    grids = load_grids()
    cap = south_cap(grids)
    adj80, adj240 = grid_from_geotiff(full_path("dem80")), grid_from_geotiff(full_path("dem240"))
    cap90 = south_cap({"L2": adj240})
    rows, sites = [], []
    for sid in site_ids:
        site = by_id[sid]
        levels = app_levels(site, grids, cap)
        sx, sy = (float(v) for v in ps_south_xy_m(site.lat, site.lon))
        box = level_box(levels[-1], sx, sy)
        others = product90_levels(site, adj80, adj240, cap90)
        site_wac, picking = site_rows(site, levels, box, others)
        site_nac = []
        for product, at in NAC_PICTURES:
            if at != sid:
                continue
            whole, obs = nac_picture(product)
            pic = crop_picture(whole, box)
            mid = mid_utc(obs["start_utc"], obs["stop_utc"])
            az, el = sun_azel([mid], site.lat, site.lon)
            r = with_other_terrain(compare_picture(site, levels, pic, float(az[0]), float(el[0])), compare_picture(site, others, pic, float(az[0]), float(el[0])))
            site_nac.append(
                {
                    "site_id": sid,
                    "camera": "NAC",
                    "picture": f"{product}_20MPP.TIF",
                    "observation": product,
                    "start_utc": obs["start_utc"],
                    "stop_utc": obs["stop_utc"],
                    "mid_utc": mid,
                    "sun_az_deg": round(float(az[0]), 2),
                    "sun_el_deg": round(float(el[0]), 2),
                    "data_share": round(float(np.isfinite(pic.values).mean()), 4),
                    **r,
                }
            )
        for r in site_wac + site_nac:
            r.pop("_maps", None)
        rows += site_wac + site_nac
        sites.append(
            {
                "site_id": sid,
                "name": site.name,
                "lat": site.lat,
                "lon": site.lon,
                "app_px_m": levels[-1].px_m,
                "map_km": round(levels[-1].heights_m.shape[0] * levels[-1].px_m / 1000.0, 2),
                **picking,
                "pictures": len(site_wac) + len(site_nac),
            }
        )
        print(f"{sid}: {len(site_wac)} WAC + {len(site_nac)} NAC pictures", flush=True)
    windows = sorted((WAC_DIR / "windows").glob("*.npz")) if (WAC_DIR / "windows").exists() else []
    shapes = [np.load(w)["values"].shape for w in windows]
    downloads = {
        "wac_frame_headers": len(list((WAC_DIR / "headers").glob("*.lbl"))) if (WAC_DIR / "headers").exists() else 0,
        "wac_header_bytes_each": HEADER_BYTES,
        "wac_windows": len(windows),
        # each window is one byte range from its first pixel to its last, whole rows of 6,080 floats in between
        "wac_window_bytes_read": int(sum((h - 1) * 24320 + w * 4 for h, w in shapes)),
        "wac_window_bytes_kept": int(sum(w.stat().st_size for w in windows)),
        "nac_pictures": [f"{p}_20MPP.TIF" for p, _ in NAC_PICTURES],
        "nac_bytes": int(sum((P90_DIR / f"{p}_20MPP.TIF").stat().st_size for p, _ in NAC_PICTURES if (P90_DIR / f"{p}_20MPP.TIF").exists())),
    }
    return write_json(out_dir / "images.json", build_doc(rows, sites, downloads))
