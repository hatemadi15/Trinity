"""The Moon from space for the home page's arrival: NASA's CGI Moon Kit colour map (the 2019 version, whose
poles are filled) and LOLA's heights at 16 pixels a degree, resampled for the web.

- moon_color_1k.jpg, moon_color_4k.jpg: the colour map at 1024 x 512 and 4096 x 2048.
- moon_normal_1k.jpg, moon_normal_4k.jpg: the slope of the ground as a normal map at the same sizes,
  rgb = (n + 1) / 2 for the unit normal n = (east, north, up).
- moon_heights_1440.u16 (+ .json): heights at 4 pixels a degree, metres above the 1737.4 km sphere, in the
  terrain rasters' encoding, for the globe's outline and its long shadows.
- manifest.json: the files, their layout, the albedo scale that brings the south cap's mean brightness to
  the stand view's regolith albedo, and the credit.

Every map is equirectangular: longitude -180 to 180 left to right, latitude 90 to -90 top to bottom.
"""

from __future__ import annotations

import json
import warnings
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from . import config
from .terrain3d import ENCODING, encode_u16

SVS = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
COLOR_SRC = "lroc_color_poles_4k.tif"  # 4096 x 2048, 12.5 MB: the 2019 colour map, its poles filled
LDEM_SRC = "ldem_16_uint.tif"  # 5760 x 2880, 31.7 MB: half-metres above 1727.4 km
RAW = config.RAW_DIR / "globe"
OUT = config.OUT_DIR / "globe"
LDEM_BASE_M = 1727400.0
REGOLITH_ALBEDO = 0.17  # the stand view's ground (GROUND_FRAG): the globe matches it round the south pole
CAP_LAT_DEG = -80.0
SIZES = {"1k": (512, 1024), "4k": (2048, 4096)}  # rows, columns
HEIGHTS_SHAPE = (720, 1440)
CREDIT = (
    "NASA's Scientific Visualization Studio, CGI Moon Kit (LRO LROC WAC colour mosaic with the poles filled; "
    "LOLA elevation), https://svs.gsfc.nasa.gov/4720"
)


def lat_of_rows(n_rows: int) -> np.ndarray:
    """Latitude (degrees) of each row's centre, north first."""
    return 90.0 - (np.arange(n_rows) + 0.5) * 180.0 / n_rows


def heights_from_dn(dn: np.ndarray) -> np.ndarray:
    """ldem_*_uint values (half-metres above 1727.4 km) as metres above the 1737.4 km sphere."""
    return np.asarray(dn, dtype=np.float64) * 0.5 + LDEM_BASE_M - config.R_MOON_M


def normal_map(heights_m: np.ndarray) -> np.ndarray:
    """(rows, cols, 3) uint8 normal map of an equirectangular height grid: rgb = (n + 1) / 2 * 255.

    Slopes by central differences, wrapping in longitude; a row's east spacing never falls below its north
    spacing, so the rows at the poles, where a degree of longitude shrinks to nothing, stay calm.
    """
    h = np.asarray(heights_m, dtype=np.float64)
    n_rows, n_cols = h.shape
    north_m = config.R_MOON_M * np.pi / n_rows
    east_m = np.maximum(config.R_MOON_M * np.cos(np.radians(lat_of_rows(n_rows))) * 2.0 * np.pi / n_cols, north_m)[:, None]
    to_north = np.vstack([h[:1], h[:-1]])  # each row's northern neighbour (the first row stands in for its own)
    to_south = np.vstack([h[1:], h[-1:]])
    rows_apart = np.full((n_rows, 1), 2.0)
    rows_apart[0] = rows_apart[-1] = 1.0
    s_north = (to_north - to_south) / (rows_apart * north_m)
    s_east = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2.0 * east_m)
    n = np.stack([-s_east, -s_north, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.clip(np.round((n + 1.0) * 127.5), 0, 255).astype(np.uint8)


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    v = np.asarray(c, dtype=np.float64) / 255.0
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def albedo_scale(rgb_u8: np.ndarray, cap_lat_deg: float = CAP_LAT_DEG) -> float:
    """The factor that brings the mean linear brightness south of `cap_lat_deg` to the regolith albedo."""
    lin = srgb_to_linear(rgb_u8)
    lum = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    rows = lat_of_rows(rgb_u8.shape[0]) <= cap_lat_deg
    return round(REGOLITH_ALBEDO / float(lum[rows].mean()), 4)


def read_resampled(path: Path, shape: tuple[int, int], bands: int | None = None) -> np.ndarray:
    """A raster read at `shape` (rows, cols) by area averaging: (rows, cols) for one band, else (rows, cols, bands)."""
    import rasterio
    from rasterio.enums import Resampling

    with rasterio.open(path) as src:
        idx = list(range(1, (bands or 1) + 1))
        data = src.read(idx, out_shape=(len(idx), *shape), resampling=Resampling.average, out_dtype="float64")
    return data[0] if bands is None else np.moveaxis(data, 0, -1)


def write_rgb_jpeg(path: Path, rgb: np.ndarray, quality: int) -> Path:
    """An RGB JPEG through GDAL (rasterio); removes the sidecar GDAL writes next to it."""
    import rasterio

    path.parent.mkdir(parents=True, exist_ok=True)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # "Dataset has no geotransform": a picture, not a map product
        with rasterio.open(path, "w", driver="JPEG", width=rgb.shape[1], height=rgb.shape[0], count=3, dtype="uint8", QUALITY=quality) as dst:
            dst.write(np.moveaxis(rgb.astype(np.uint8), -1, 0))
    aux = Path(str(path) + ".aux.xml")
    if aux.exists():
        aux.unlink()
    return path


def build(raw: Path = RAW, out: Path = OUT) -> Path:
    """Writes the arrival's Moon into `out` from the two sources in `raw`; returns the manifest's path."""
    out.mkdir(parents=True, exist_ok=True)
    files: dict[str, dict[str, str]] = {"color": {}, "normal": {}}
    scale = None
    for size, shape in SIZES.items():
        rgb = np.clip(np.round(read_resampled(raw / COLOR_SRC, shape, bands=3)), 0, 255).astype(np.uint8)
        files["color"][size] = write_rgb_jpeg(out / f"moon_color_{size}.jpg", rgb, 88).name
        if size == "1k":
            scale = albedo_scale(rgb)
        heights = heights_from_dn(read_resampled(raw / LDEM_SRC, shape))
        files["normal"][size] = write_rgb_jpeg(out / f"moon_normal_{size}.jpg", normal_map(heights), 92).name
    heights = heights_from_dn(read_resampled(raw / LDEM_SRC, HEIGHTS_SHAPE))
    payload, quant = encode_u16(heights)
    (out / "moon_heights_1440.u16").write_bytes(payload)
    meta = {"width": HEIGHTS_SHAPE[1], "height": HEIGHTS_SHAPE[0], **quant, "encoding": ENCODING, "bytes": len(payload)}
    (out / "moon_heights_1440.json").write_text(json.dumps(meta, indent=1) + "\n")
    manifest = {
        "version": 1,
        "color": files["color"],
        "normal": files["normal"],
        "heights": {"file": "moon_heights_1440.u16", "meta": "moon_heights_1440.json"},
        "albedo_scale": scale,
        "radius_m": config.R_MOON_M,
        "layout": "equirectangular: longitude -180 to 180 left to right, latitude 90 to -90 top to bottom, pixel centres",
        "normal_encoding": "rgb = (n + 1) / 2 for the unit normal n = (east, north, up)",
        "heights_reference": "metres above the 1737.4 km sphere",
        "sources": {"color": SVS + COLOR_SRC, "heights": SVS + LDEM_SRC},
        "credit": CREDIT,
        "generated_utc": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    path = out / "manifest.json"
    path.write_text(json.dumps(manifest, indent=1) + "\n")
    return path
