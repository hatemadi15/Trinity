"""NASA PGDA product 90: the adjusted LOLA south-pole elevation models of Barker et al. (2023).

"A New View of the Lunar South Pole from LOLA" (https://pgda.gsfc.nasa.gov/products/90) re-fits the LOLA
tracks to each other and publishes, beside each elevation model (LDEM_*_ADJ), its height error (ERR), its
effective resolution (EFFRES), slope and slope error (LDSM), roughness (LDRM) and permanent shadow (LPSR).
Every file is a cloud-optimized GeoTIFF in south polar stereographic metres on a 1737.4 km sphere, in the
MOON_ME frame of DE421, the frame of the LOLA grids the app already uses.

Two kinds of access, both cached under data_raw/pgda90:
- whole files for the horizon comparison: the 80 m and 240 m models and their height-error maps (890 MB);
- small windows around each site, read with HTTP range requests, for the 20 m and 50 m products, which are
  2.6 to 3.8 GB each when only a few hundred kilobytes near a site are needed.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import config
from .geometry import ps_south_xy_m
from .lola import GridLabel, LolaGrid

BASE_URL = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/"
PGDA_DIR = config.RAW_DIR / "pgda90"
WINDOW_DIR = PGDA_DIR / "windows"
CITATION = "Barker et al. 2023, Planet. Sci. J. 4, 183, doi:10.3847/PSJ/acf3e1; data doi:10.60903/gsfcpgda-lola-spole"

# Whole files: the adjusted models the horizon comparison traces, and their height error.
FULL_FILES = {
    "dem80": "LDEM_80S_80MPP_ADJ.TIF",
    "err80": "LDEM_80S_80MPP_ADJ_ERR.TIF",
    "dem240": "LDEM_60S_240MPP_ADJ.TIF",
    "err240": "LDEM_60S_240MPP_ADJ_ERR.TIF",
}
# Windowed files: the 20 m model for the near field and the products that describe the ground at a site.
WINDOW_FILES = {
    "dem20": "LDEM_80S_20MPP_ADJ.TIF",
    "err20": "LDEM_80S_20MPP_ADJ_ERR.TIF",
    "effres20": "LDEM_80S_20MPP_ADJ_EFFRES.TIF",
    "slope20": "LDSM_80S_20MPP_ADJ.TIF",
    "slope_err20": "LDSM_80S_20MPP_ADJ_ERR.TIF",
    "rough100": "LDRM_80S_50MPP_ADJ_ROUGH_100M.TIF",
    "psr20": "LPSR_80S_20MPP_ADJ.TIF",
}
# Sizes as the product page lists them, for the download log in docs/method.md.
LISTED_SIZE = {
    "LDEM_80S_80MPP_ADJ.TIF": "181M",
    "LDEM_80S_80MPP_ADJ_ERR.TIF": "244M",
    "LDEM_60S_240MPP_ADJ.TIF": "210M",
    "LDEM_60S_240MPP_ADJ_ERR.TIF": "255M",
}

# GDAL reads windows over HTTP; the server answers an occasional range request with 403, which a retry clears.
GDAL_HTTP_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_USE_HEAD": "NO",
    "GDAL_HTTP_MAX_RETRY": "6",
    "GDAL_HTTP_RETRY_DELAY": "2",
    "GDAL_HTTP_RETRY_CODES": "403,429,500,502,503,504",
    "GDAL_HTTP_USERAGENT": "lunar-pipeline/0.1 (Space Apps 2026)",
}


def url_for(name: str) -> str:
    return BASE_URL + name


def label_for_geotiff(width: int, height: int, x0_m: float, y0_m: float, scale_m: float) -> GridLabel:
    """A LolaGrid label for a north-up GeoTIFF whose top-left corner is (x0, y0) in polar stereographic metres.

    LolaGrid counts pixel centres from 0, with col = sample_offset + x / scale and row = line_offset - y / scale;
    the centre of GeoTIFF pixel (c, r) lies at x0 + (c + 0.5) scale, y0 - (r + 0.5) scale.
    """
    return GridLabel(
        lines=int(height),
        samples=int(width),
        map_scale_m=float(scale_m),
        line_offset_px=float(y0_m / scale_m - 0.5),
        sample_offset_px=float(-x0_m / scale_m - 0.5),
        scaling_factor=1.0,
        offset=0.0,
        max_latitude_deg=-90.0,
        sample_bits=32,
    )


def _geometry(transform) -> tuple[float, float, float]:
    scale = float(transform.a)
    if abs(float(transform.e) + scale) > 1e-9 or transform.b != 0 or transform.d != 0:
        raise ValueError(f"expected a north-up grid with square pixels, got {transform}")
    return float(transform.c), float(transform.f), scale


def grid_from_geotiff(path: Path) -> LolaGrid:
    """A whole GeoTIFF of heights (or errors) as a LolaGrid of float32, NaN where the file has no data."""
    import rasterio

    with rasterio.open(path) as ds:
        x0, y0, scale = _geometry(ds.transform)
        data = ds.read(1).astype(np.float32)
        if ds.nodata is not None and not np.isnan(ds.nodata):
            data[data == ds.nodata] = np.nan
    return LolaGrid(label_for_geotiff(data.shape[1], data.shape[0], x0, y0, scale), data)


@dataclass(frozen=True)
class Window:
    """A window of a product around one point, with what is needed to place it again."""

    product: str
    data: np.ndarray
    x0_m: float
    y0_m: float
    scale_m: float

    def grid(self) -> LolaGrid:
        return LolaGrid(label_for_geotiff(self.data.shape[1], self.data.shape[0], self.x0_m, self.y0_m, self.scale_m), self.data)


def _window_path(product: str, lat: float, lon: float, half_m: float, cache_dir: Path) -> Path:
    return cache_dir / f"{product}_{lat:+.5f}_{lon:+.5f}_{int(half_m)}m.npz"


def read_window(product: str, lat: float, lon: float, half_m: float, cache_dir: Path = WINDOW_DIR, attempts: int = 4) -> Window:
    """The square of `product` within `half_m` metres of (lat, lon), from the cache or read once over HTTP."""
    import rasterio
    from rasterio.windows import Window as RWindow

    path = _window_path(product, lat, lon, half_m, cache_dir)
    if path.exists():
        z = np.load(path)
        return Window(product, z["data"], float(z["x0"]), float(z["y0"]), float(z["scale"]))
    name = WINDOW_FILES[product]
    x, y = ps_south_xy_m(lat, lon)
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            with rasterio.Env(**GDAL_HTTP_ENV), rasterio.open("/vsicurl/" + url_for(name)) as ds:
                gx0, gy0, scale = _geometry(ds.transform)
                col = int(np.floor((float(x) - half_m - gx0) / scale))
                row = int(np.floor((gy0 - float(y) - half_m) / scale))
                n = int(np.ceil(2 * half_m / scale)) + 1
                col0, row0 = max(col, 0), max(row, 0)
                w, h = min(n, ds.width - col0), min(n, ds.height - row0)
                data = ds.read(1, window=RWindow(col0, row0, w, h)).astype(np.float32)
                if ds.nodata is not None and not np.isnan(ds.nodata):
                    data[data == ds.nodata] = np.nan
            win = Window(product, data, gx0 + col0 * scale, gy0 - row0 * scale, scale)
            cache_dir.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(path, data=win.data, x0=win.x0_m, y0=win.y0_m, scale=win.scale_m)
            return win
        except Exception as err:  # the server's occasional 403 surfaces as a read error
            last = err
            time.sleep(3.0 * (attempt + 1))
    raise OSError(f"could not read {name} near ({lat}, {lon}): {last}")


def full_path(key: str, raw_dir: Path = PGDA_DIR) -> Path:
    return raw_dir / FULL_FILES[key]


def fetch_full(raw_dir: Path = PGDA_DIR) -> list[Path]:
    """Download the whole files with the pipeline's resumable downloader, checking each size against the server's."""
    from .fetch import Asset, download, make_session

    session = make_session()
    out: list[Path] = []
    for name in FULL_FILES.values():
        print(f"[pgda90] {name}", flush=True)
        out.append(download(Asset(name, url_for(name), raw_dir, "pgda90"), session))
    return out


def write_manifest(entries: list[dict], raw_dir: Path = PGDA_DIR) -> Path:
    """Record what was read and from where, beside the cache."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / "manifest.json"
    path.write_text(json.dumps({"citation": CITATION, "base_url": BASE_URL, "entries": entries}, indent=1) + "\n")
    return path


def gdal_env_applied() -> dict:
    """The GDAL options as they are set for window reads (for the method notes)."""
    return {k: os.environ.get(k, v) for k, v in GDAL_HTTP_ENV.items()}
