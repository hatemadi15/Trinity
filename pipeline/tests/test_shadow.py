import numpy as np
import pytest

from lunar_pipeline import config
from lunar_pipeline.shadow import (
    Level,
    cast,
    grid_xy,
    shade,
    sun_bearing_deg,
    sweep,
    tangent_heights,
)


def flat(h=64, w=80, px=20.0):
    z = np.zeros((h, w))
    x, y = grid_xy(z.shape, px, (w - 1) / 2, (h - 1) / 2)
    return z, x, y, px


def test_grid_xy_puts_the_site_at_the_origin_with_y_up():
    x, y = grid_xy((3, 5), 10.0, 2.0, 1.0)
    assert x[1, 2] == 0.0 and y[1, 2] == 0.0
    assert x[0, 4] == 20.0 and y[0, 4] == 10.0  # right and up
    assert y[2, 0] == -10.0


def test_flat_ground_is_lit_when_the_sun_is_up_and_dark_when_it_is_down():
    z, x, y, _ = flat()
    for bearing in (0.0, 45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0, 12.5, 298.0):
        lit, _, _ = sweep(z, x, y, bearing, 3.0)
        assert lit.all(), bearing
        dark, _, _ = sweep(z, x, y, bearing, -3.0)
        # every pixel with ground further towards the Sun on its line is in shadow
        assert dark.mean() < 0.06, bearing


def test_every_pixel_is_decided_exactly_once_for_any_bearing():
    z, x, y, _ = flat(37, 53)
    for bearing in np.arange(0.0, 360.0, 7.5):
        _, m_before, _ = sweep(z, x, y, float(bearing), 2.0)
        assert np.isfinite(m_before).sum() + np.isneginf(m_before).sum() == z.size
        assert not np.isnan(m_before).any()


@pytest.mark.parametrize("bearing,axis,sign", [(90.0, 1, -1), (270.0, 1, 1), (0.0, 0, 1), (180.0, 0, -1)])
def test_a_wall_casts_a_shadow_of_height_over_tan_elevation(bearing, axis, sign):
    z, x, y, px = flat(121, 121)
    wall = 60
    if axis == 1:
        z[:, wall] = 100.0
    else:
        z[wall, :] = 100.0
    lit, _, _ = sweep(z, x, y, bearing, 5.0)
    length_px = 100.0 / np.tan(np.radians(5.0)) / px  # 57.2 px
    line = lit[60, :] if axis == 1 else lit[:, 60]
    inside = wall + sign * int(length_px - 3)
    outside = wall + sign * int(length_px + 3)
    assert not line[inside], "just inside the shadow"
    assert line[outside], "just beyond the shadow"
    assert line[wall], "the wall top is lit"
    assert line[wall - sign * 5], "the sunward side is lit"


def test_diagonal_sun_casts_along_the_diagonal():
    z, x, y, _ = flat(121, 121)
    z[60, 60] = 200.0  # a spike
    lit, _, _ = sweep(z, x, y, 45.0, 5.0)  # Sun to the upper right: shadow to the lower left
    assert not lit[60 + 20, 60 - 20]
    assert lit[60 - 20, 60 + 20]
    assert lit[60 + 20, 60 + 20]


def test_seed_carries_terrain_from_outside_the_grid():
    z, x, y, px = flat(41, 81)
    el = 5.0
    # A 100 m wall 400 m beyond the right edge (the Sun is to the right): its sight-line intercept.
    edge_x = x[0, -1]
    wall_x = edge_x + 400.0
    g_wall = 100.0 - wall_x * np.tan(np.radians(el))
    lit, _, _ = sweep(z, x, y, 90.0, el, seed=lambda xs, ys: np.full(xs.shape, g_wall))
    reach = 100.0 / np.tan(np.radians(el))  # shadow ends this far left of the wall
    end_x = wall_x - reach
    col_end = round((end_x - x[0, 0]) / px)
    assert not lit[20, col_end + 3]
    assert lit[20, col_end - 3]


def test_cast_chains_a_coarse_level_into_a_fine_one():
    px_c, px_f = 80.0, 20.0
    coarse = np.zeros((101, 101))
    coarse[:, 80] = 300.0  # a ridge 2.4 km to the right of the site, outside the fine window
    fine = np.zeros((101, 101))  # 2 km across
    levels = [Level(coarse, px_c, 50.0, 50.0), Level(fine, px_f, 50.0, 50.0)]
    lit, margin = cast(levels, 90.0, 4.0)
    # shadow of the ridge reaches 300 / tan(4 deg) = 4290 m to the left: the whole fine window (x from -1000 to +1000) is in it
    assert not lit.any()
    lit_high, _ = cast(levels, 90.0, 12.0)  # reach 1411 m: ends at x = 2400 - 1411 = 989 m, the fine window's right edge
    assert lit_high[:, :95].all()
    assert margin.shape == fine.shape


def test_curvature_hides_the_sun_behind_the_bulge_of_the_moon():
    # 400 km of flat (constant radius) ground: with the Sun 0.5 deg up at the site, ground 300 km towards the Sun is below the sight line,
    # so it does not shadow the site; with the Sun 0.5 deg below the horizon the site is dark.
    z = np.zeros((1, 801))
    x, y = grid_xy(z.shape, 500.0, 400.0, 0.0)
    zt = tangent_heights(z, x, y)
    assert zt[0, 400] == 0.0 and zt[0, 800] == pytest.approx(-(200_000.0**2) / (2 * config.R_MOON_M))
    lit, _, _ = sweep(zt, x, y, 90.0, 0.5)
    assert lit[0, 400]
    dark, _, _ = sweep(zt, x, y, 90.0, -0.5)
    assert not dark[0, 400]


def test_sun_bearing_adds_the_longitude_on_the_south_polar_grid():
    assert sun_bearing_deg(0.0, 90.0) == 90.0
    assert sun_bearing_deg(-64.31, 312.18) == pytest.approx(247.87)
    assert sun_bearing_deg(170.0, 200.0) == pytest.approx(10.0)


def test_shade_is_bright_on_sunward_slopes_and_keeps_shape_in_shadow():
    h, w, px = 64, 64, 20.0
    cols = np.arange(w)
    z = np.tile(np.where(cols < 32, cols * 8.0, (63 - cols) * 8.0), (h, 1)).astype(float)  # a ridge running up-down
    x, y = grid_xy(z.shape, px, 31.5, 31.5)
    _, _, margin = sweep(z, x, y, 90.0, 10.0)
    img = shade(z, px, margin, 90.0, 10.0)
    assert img.dtype == np.uint8 and img.shape == z.shape
    assert img[32, 45] > img[32, 15] + 60  # the slope facing the Sun is much brighter than the one facing away
    assert img[32, 15] > 5  # shadowed ground is not pure black
