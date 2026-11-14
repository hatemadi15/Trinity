import numpy as np
import pytest

from lunar_pipeline.ensemble import FieldMaker
from lunar_pipeline.terrain_error import (
    SLOPE_EDGES,
    Sigma,
    Window,
    binned_squares,
    fit_length,
    fit_sigma,
    lag_edges,
    semivariogram_sums,
    slope_deg,
    square,
)


def test_slope_reads_a_plane_tilted_by_a_known_angle():
    x = np.arange(50) * 20.0
    h = np.tile(x * np.tan(np.radians(12.0)), (40, 1))
    assert slope_deg(h, 20.0) == pytest.approx(np.full((40, 50), 12.0))


def test_the_fitted_size_grows_with_slope_and_stated_error():
    s = Sigma(a_m=0.5, b_m=6.0, c=1.5)
    assert s.at(np.array([0.0]), np.array([0.0]))[0] == pytest.approx(0.5)
    assert s.at(np.array([45.0]), np.array([0.0]))[0] == pytest.approx(np.hypot(0.5, 6.0))
    assert s.at(np.array([0.0]), np.array([2.0]))[0] == pytest.approx(np.hypot(0.5, 3.0))


def test_fit_sigma_recovers_the_size_of_differences_drawn_with_a_known_one():
    rng = np.random.default_rng(1)
    n = 400_000
    slope = rng.uniform(0.0, 35.0, n)
    err = rng.gamma(2.0, 0.15, n)
    true = Sigma(a_m=0.4, b_m=5.0, c=1.6)
    d = rng.standard_normal(n) * true.at(slope, err)
    edges = np.quantile(err, [0.0, 0.25, 0.5, 0.75, 0.9, 0.97, 1.0])
    edges[-1] = np.inf
    got = fit_sigma(binned_squares(d, slope, err, edges))
    assert got.a_m == pytest.approx(0.4, rel=0.15)
    assert got.b_m == pytest.approx(5.0, rel=0.05)
    assert got.c == pytest.approx(1.6, rel=0.1)


def test_fit_sigma_keeps_every_part_of_the_size_at_zero_or_more():
    # Differences that do not grow with slope at all: the slope part is left at zero rather than made negative.
    rng = np.random.default_rng(2)
    slope = rng.uniform(0.0, 30.0, 100_000)
    err = rng.uniform(0.1, 0.3, 100_000)
    d = rng.standard_normal(100_000) * 1.2
    edges = np.array([0.0, 0.15, 0.2, 0.25, np.inf])
    got = fit_sigma(binned_squares(d, slope, err, edges))
    assert min(got.a_m, got.b_m, got.c) >= 0.0
    assert got.at(np.array([10.0]), np.array([0.2]))[0] == pytest.approx(1.2, rel=0.05)


def test_the_cells_cover_every_slope():
    assert SLOPE_EDGES[0] == 0.0 and SLOPE_EDGES[-1] == 90.0


def test_the_semivariogram_of_white_noise_is_flat_at_its_variance():
    rng = np.random.default_rng(3)
    z = rng.standard_normal((120, 120)) * 2.0
    edges = lag_edges(10.0, max_m=300.0)
    n, s = semivariogram_sums(z, np.ones(z.shape, bool), 10.0, edges)
    gamma = 0.5 * s / n
    assert gamma == pytest.approx(np.full(gamma.shape, 4.0), rel=0.1)


def test_the_semivariogram_counts_only_pairs_of_valid_pixels():
    z = np.zeros((20, 20))
    z[:, 10:] = 100.0  # a cliff that lies wholly in the part left out
    valid = np.zeros((20, 20), bool)
    valid[:, :10] = True
    n, s = semivariogram_sums(z, valid, 1.0, lag_edges(1.0, max_m=8.0))
    assert np.all(s == pytest.approx(0.0, abs=1e-6)) and n.sum() > 0


def test_fit_length_finds_the_correlation_length_of_a_field_drawn_with_a_known_one():
    rng = np.random.default_rng(4)
    fields = FieldMaker()
    scale = 20.0
    edges = lag_edges(scale, max_m=2_000.0)
    n_sum, s_sum = np.zeros(edges.size - 1), np.zeros(edges.size - 1)
    for _ in range(6):
        z = fields.draw((200, 200), 3.0, rng)  # 3 pixels, 60 m
        n, s = semivariogram_sums(z, np.ones(z.shape, bool), scale, edges)
        n_sum += n
        s_sum += s
    lag = np.sqrt(edges[:-1] * edges[1:])
    length, sill = fit_length(lag, 0.5 * s_sum / n_sum, n_sum)
    assert length == pytest.approx(60.0, rel=0.2)
    assert sill == pytest.approx(1.0, rel=0.1)


def test_a_window_difference_drops_the_offset_two_models_share():
    app = np.full((5, 5), 12.0)
    app[2, 2] = 15.0
    w = Window("x", 20.0, app, np.full((5, 5), 10.0), np.full((5, 5), 0.2))
    d = w.difference()
    assert np.median(d) == 0.0 and d[2, 2] == pytest.approx(3.0)


def test_square_pads_ground_outside_the_grid_with_no_data(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=11, scale_m=20.0, fill_dn=8)
    # The pole is the grid's centre pixel; 200 m is 10 pixels, so half the square lies outside the grid.
    sq = square(grid, -90.0, 0.0, 200.0)
    assert sq.shape == (21, 21)
    assert np.isnan(sq[0, 0]) and sq[10, 10] == pytest.approx(4.0)  # int16 numbers times the label's scaling factor
