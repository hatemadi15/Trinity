import numpy as np
import pytest

from lunar_pipeline.config import R_MOON_M
from lunar_pipeline.horizon import Band, horizon_mask, mask_at_azimuth, site_height_m

SITE = (-89.9, 45.0)  # 3.0 km from the pole, well inside a 1024 px x 20 m synthetic grid


def _paint_ring(grid, lat, lon, r_in_m, r_out_m, dn):
    col_c, row_c = grid.pixel_from_latlon(lat, lon)
    rows, cols = np.mgrid[0 : grid.label.lines, 0 : grid.label.samples]
    dist = np.hypot(cols - col_c, rows - row_c) * grid.label.map_scale_m
    grid.data[(dist >= r_in_m) & (dist <= r_out_m)] = dn


def test_flat_terrain_gives_slightly_negative_horizon(synthetic_grid_factory):
    # Flat sphere seen from a 2 m mast: skyline sits just below 0 deg (mast height and curvature).
    grid = synthetic_grid_factory(size=1024, scale_m=20.0)
    mask = horizon_mask(*SITE, [Band(grid, 40.0, 8000.0, 10.0)], mast_m=2.0)
    d = np.arange(40.0, 8000.0, 10.0)
    expected = np.max(np.degrees(np.arctan2(R_MOON_M * np.cos(d / R_MOON_M) - (R_MOON_M + 2.0),
                                            R_MOON_M * np.sin(d / R_MOON_M))))
    assert -0.12 < expected < -0.05
    assert mask.shape == (720,)
    assert np.allclose(mask, expected, atol=0.01)


def test_ring_wall_matches_analytic_elevation(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=1024, scale_m=20.0)
    _paint_ring(grid, *SITE, 5000.0, 5100.0, dn=2000)  # 1000 m wall, 5 km away, all azimuths
    mask = horizon_mask(*SITE, [Band(grid, 40.0, 8000.0, 10.0)], mast_m=2.0)
    delta = 5000.0 / R_MOON_M
    expected = np.degrees(np.arctan2((R_MOON_M + 1000.0) * np.cos(delta) - (R_MOON_M + 2.0),
                                     (R_MOON_M + 1000.0) * np.sin(delta)))
    assert expected == pytest.approx(11.2, abs=0.1)
    assert np.all(np.abs(mask - expected) < 0.15)


def test_band_fallback_outside_fine_grid(synthetic_grid_factory):
    fine = synthetic_grid_factory(size=256, scale_m=20.0)  # covers only +-2.56 km around the pole
    coarse = synthetic_grid_factory(size=1024, scale_m=20.0)
    _paint_ring(coarse, *SITE, 5000.0, 5100.0, dn=2000)
    bands = [Band(fine, 40.0, 8000.0, 10.0), Band(coarse, 40.0, 8000.0, 10.0)]
    mask = horizon_mask(*SITE, bands, mast_m=2.0)
    assert np.all(mask > 10.9) and np.all(mask < 11.5)


def test_site_height_uses_first_covering_grid(synthetic_grid_factory):
    tiny = synthetic_grid_factory(size=8, scale_m=20.0, fill_dn=100)
    big = synthetic_grid_factory(size=1024, scale_m=20.0, fill_dn=-400)
    assert site_height_m(*SITE, [tiny, big]) == pytest.approx(-200.0)
    assert site_height_m(-90.0, 0.0, [tiny, big]) == pytest.approx(50.0)


def test_mask_at_azimuth_wraps():
    mask = np.zeros(720)
    mask[0] = 10.0
    assert mask_at_azimuth(mask, 359.75) == pytest.approx(5.0)
    assert mask_at_azimuth(mask, 0.25) == pytest.approx(5.0)
