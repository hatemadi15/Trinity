"""Read LOLA PDS3 polar-stereographic grids (local files or HTTP windows)."""

from __future__ import annotations

import dataclasses
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import config
from .geometry import ps_south_latlon_deg, ps_south_xy_m

_KEY = re.compile(r"^\s*(\^?[A-Z_]+)\s*=\s*([^\n]+?)\s*$", re.M)
_NUM = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


@dataclass(frozen=True)
class GridLabel:
    lines: int
    samples: int
    map_scale_m: float
    line_offset_px: float
    sample_offset_px: float
    scaling_factor: float
    offset: float
    max_latitude_deg: float
    sample_bits: int = 16


def parse_label(text: str) -> GridLabel:
    kv: dict[str, str] = {}
    for m in _KEY.finditer(text):
        kv.setdefault(m.group(1), m.group(2))

    def num(key: str) -> float:
        return float(_NUM.search(kv[key]).group(0))

    return GridLabel(
        lines=int(num("LINES")),
        samples=int(num("LINE_SAMPLES")),
        map_scale_m=num("MAP_SCALE"),
        line_offset_px=num("LINE_PROJECTION_OFFSET"),
        sample_offset_px=num("SAMPLE_PROJECTION_OFFSET"),
        scaling_factor=num("SCALING_FACTOR"),
        offset=num("OFFSET"),
        max_latitude_deg=num("MAXIMUM_LATITUDE"),
        sample_bits=int(num("SAMPLE_BITS")),
    )


class LolaGrid:
    """int16 south-polar grid. (col, row) are 0-based pixel-centre coordinates."""

    def __init__(self, label: GridLabel, data: np.ndarray):
        if data.shape != (label.lines, label.samples):
            raise ValueError(f"data shape {data.shape} != label {(label.lines, label.samples)}")
        self.label = label
        self.data = data

    @classmethod
    def from_pds(cls, lbl_path: Path, mmap: bool = True) -> "LolaGrid":
        label = parse_label(lbl_path.read_text())
        img = lbl_path.with_suffix(".img")
        shape = (label.lines, label.samples)
        if mmap:
            data = np.memmap(img, dtype="<i2", mode="r", shape=shape)
        else:
            data = np.fromfile(img, dtype="<i2").reshape(shape)
        return cls(label, data)

    def pixel_from_latlon(self, lat_deg, lon_deg):
        x, y = ps_south_xy_m(lat_deg, lon_deg)
        return (
            self.label.sample_offset_px + x / self.label.map_scale_m,
            self.label.line_offset_px - y / self.label.map_scale_m,
        )

    def latlon_from_pixel(self, col, row):
        x = (np.asarray(col, float) - self.label.sample_offset_px) * self.label.map_scale_m
        y = (self.label.line_offset_px - np.asarray(row, float)) * self.label.map_scale_m
        return ps_south_latlon_deg(x, y)

    def value_bilinear(self, col, row) -> np.ndarray:
        """DN * scaling_factor at fractional pixel positions; NaN where outside the grid."""
        col = np.asarray(col, dtype=np.float64)
        row = np.asarray(row, dtype=np.float64)
        out = np.full(col.shape, np.nan, dtype=np.float64)
        c0 = np.floor(col).astype(np.int64)
        r0 = np.floor(row).astype(np.int64)
        ok = (c0 >= 0) & (r0 >= 0) & (c0 < self.label.samples - 1) & (r0 < self.label.lines - 1)
        if not np.any(ok):
            return out
        cc, rr = c0[ok], r0[ok]
        fc, fr = col[ok] - cc, row[ok] - rr
        d = self.data
        top = d[rr, cc] * (1.0 - fc) + d[rr, cc + 1] * fc
        bottom = d[rr + 1, cc] * (1.0 - fc) + d[rr + 1, cc + 1] * fc
        out[ok] = (top * (1.0 - fr) + bottom * fr) * self.label.scaling_factor
        return out

    def value_at(self, lat_deg, lon_deg):
        col, row = self.pixel_from_latlon(lat_deg, lon_deg)
        v = self.value_bilinear(np.atleast_1d(col), np.atleast_1d(row))
        return float(v[0]) if np.ndim(lat_deg) == 0 else v

    def covers(self, lat_deg: float, lon_deg: float) -> bool:
        return not np.isnan(self.value_at(lat_deg, lon_deg))

    def subgrid(self, row0: int, col0: int, rows: int, cols: int) -> "LolaGrid":
        data = np.ascontiguousarray(self.data[row0 : row0 + rows, col0 : col0 + cols])
        label = dataclasses.replace(
            self.label,
            lines=data.shape[0],
            samples=data.shape[1],
            line_offset_px=self.label.line_offset_px - row0,
            sample_offset_px=self.label.sample_offset_px - col0,
        )
        return LolaGrid(label, data)


def remote_window(url: str, label: GridLabel, row0: int, col0: int, rows: int, cols: int) -> LolaGrid:
    """Read a window of a raw PDS .img over HTTP range requests via GDAL's /vsicurl/ and a raw-band VRT."""
    import os

    import rasterio
    from rasterio.windows import Window

    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
    # GDAL >= 3.10 refuses raw-band VRT sources outside the VRT's directory unless this is set.
    os.environ.setdefault("GDAL_VRT_RAWRASTERBAND_ALLOWED_SOURCE", "ALL")
    vrt_dir = config.OUT_DIR / "vrt"
    vrt_dir.mkdir(parents=True, exist_ok=True)
    vrt_path = vrt_dir / (Path(url).stem + ".vrt")
    vrt_path.write_text(
        f'<VRTDataset rasterXSize="{label.samples}" rasterYSize="{label.lines}">'
        f'<VRTRasterBand dataType="Int16" band="1" subClass="VRTRawRasterBand">'
        f'<SourceFilename relativeToVRT="0">/vsicurl/{url}</SourceFilename>'
        f"<ImageOffset>0</ImageOffset><PixelOffset>2</PixelOffset>"
        f"<LineOffset>{label.samples * 2}</LineOffset><ByteOrder>LSB</ByteOrder>"
        f"</VRTRasterBand></VRTDataset>"
    )
    with rasterio.open(vrt_path) as ds:
        data = ds.read(1, window=Window(col0, row0, cols, rows)).astype("<i2")
    sub = dataclasses.replace(
        label,
        lines=data.shape[0],
        samples=data.shape[1],
        line_offset_px=label.line_offset_px - row0,
        sample_offset_px=label.sample_offset_px - col0,
    )
    return LolaGrid(sub, data)
