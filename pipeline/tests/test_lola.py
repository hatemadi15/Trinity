import dataclasses

import numpy as np
import pytest

from lunar_pipeline import config
from lunar_pipeline.lola import GridLabel, LolaGrid, parse_label
from tests.conftest import needs_lola

LABEL_875S_20M = """
PDS_VERSION_ID            = PDS3
RECORD_TYPE               = FIXED_LENGTH
RECORD_BYTES              = 15168
FILE_RECORDS              = 7584
^IMAGE                    = "LDEM_875S_20M.IMG"
OBJECT                    = IMAGE
    LINES                 = 7584
    LINE_SAMPLES          = 7584
    SAMPLE_TYPE           = LSB_INTEGER
    SAMPLE_BITS           = 16
    UNIT                  = METER
    SCALING_FACTOR        = 0.5
    OFFSET                = 1737400.
END_OBJECT                = IMAGE
OBJECT                       = IMAGE_MAP_PROJECTION
 MAP_PROJECTION_TYPE          = "POLAR STEREOGRAPHIC"
 MAP_RESOLUTION               = 1516.17 <pix/deg>
 A_AXIS_RADIUS                = 1737.4 <km>
 CENTER_LATITUDE              = -90 <deg>
 CENTER_LONGITUDE             = 0 <deg>
 MAP_SCALE                    = 20 <m/pix>
 MAXIMUM_LATITUDE             = -87.5 <deg>
 MINIMUM_LATITUDE             = -90 <deg>
 LINE_PROJECTION_OFFSET       = 3791.5 <pix>
 SAMPLE_PROJECTION_OFFSET     = 3791.5 <pix>
END_OBJECT                   = IMAGE_MAP_PROJECTION
END
"""


def test_parse_label_reads_projection_fields():
    lab = parse_label(LABEL_875S_20M)
    assert lab == GridLabel(7584, 7584, 20.0, 3791.5, 3791.5, 0.5, 1737400.0, -87.5, 16)


def test_pixel_mapping_matches_label_extent():
    lab = parse_label(LABEL_875S_20M)
    # Same projection constants, tiny data array: pixel mapping only depends on the label.
    grid = LolaGrid(dataclasses.replace(lab, lines=8, samples=8), np.zeros((8, 8), dtype=np.int16))
    col, row = grid.pixel_from_latlon(-90.0, 0.0)
    assert col == pytest.approx(3791.5) and row == pytest.approx(3791.5)
    # 2R tan(1.25 deg) = 75,820.4 m = 3791.02 px
    col, row = grid.pixel_from_latlon(-87.5, 0.0)  # lon 0 points up (row 0)
    assert col == pytest.approx(3791.5, abs=1e-6) and row == pytest.approx(0.48, abs=0.05)
    col, row = grid.pixel_from_latlon(-87.5, 90.0)  # lon 90E points right (last column)
    assert col == pytest.approx(7582.52, abs=0.05) and row == pytest.approx(3791.5, abs=1e-6)
    lat, lon = grid.latlon_from_pixel(*grid.pixel_from_latlon(-88.7, 123.4))
    assert lat == pytest.approx(-88.7, abs=1e-9) and lon == pytest.approx(123.4, abs=1e-7)


def test_bilinear_and_nan_outside(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=4, scale_m=20.0)
    grid.data[:] = np.array([[0, 2, 4, 6], [10, 12, 14, 16], [20, 22, 24, 26], [30, 32, 34, 36]], dtype=np.int16)
    v = grid.value_bilinear(np.array([0.5, 1.0, -1.0, 3.5]), np.array([0.5, 2.0, 0.0, 0.0]))
    assert v[0] == pytest.approx(0.5 * (0 + 2 + 10 + 12) / 4)  # DN mean 6 -> 3.0 m
    assert v[1] == pytest.approx(0.5 * 22)
    assert np.isnan(v[2]) and np.isnan(v[3])


def test_subgrid_keeps_georeferencing(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=64, scale_m=20.0)
    grid.data[:] = np.arange(64 * 64, dtype=np.int16).reshape(64, 64)
    sub = grid.subgrid(row0=10, col0=20, rows=8, cols=8)
    lat, lon = grid.latlon_from_pixel(23.0, 13.0)
    assert sub.value_at(lat, lon) == pytest.approx(grid.value_at(lat, lon))
    assert sub.data.shape == (8, 8)


@pytest.mark.data
@needs_lola
def test_shackleton_is_a_deep_hole_in_real_data():
    grid = LolaGrid.from_pds(config.LOLA_DIR / "ldem_875s_20m.lbl")
    centre = grid.value_at(-89.66, 129.20)
    rim = []
    for az in range(0, 360, 15):
        col, row = grid.pixel_from_latlon(-89.66, 129.20)
        col += 525 * np.sin(np.radians(az))  # 10.5 km ring in pixels (20 m)
        row -= 525 * np.cos(np.radians(az))
        rim.append(grid.value_bilinear(np.array([col]), np.array([row]))[0])
    assert max(rim) - centre > 2000.0
