from types import SimpleNamespace

import numpy as np
import pytest

from lunar_pipeline.ensemble import FieldMaker, Perturbable, decode, encode, site_versions, spread
from lunar_pipeline.terrain_error import Sigma


def test_fields_have_unit_variance_and_the_asked_correlation_one_pixel_away():
    rng = np.random.default_rng(5)
    z = np.stack([FieldMaker().draw((256, 256), 2.0, rng) for _ in range(4)])
    assert z.mean() == pytest.approx(0.0, abs=0.02)
    assert z.var() == pytest.approx(1.0, rel=0.03)
    lag1 = np.mean(z[:, :, 1:] * z[:, :, :-1])
    assert lag1 == pytest.approx(np.exp(-1.0 / 2.0), abs=0.03)


def test_a_field_with_a_length_under_one_pixel_is_almost_white():
    z = FieldMaker().draw((256, 256), 0.25, np.random.default_rng(6))
    assert np.mean(z[:, 1:] * z[:, :-1]) == pytest.approx(np.exp(-4.0), abs=0.03)


def test_skylines_are_stored_to_a_thousandth_of_a_degree():
    sky = np.array([[0.1234, -1.5, 3.0004], [12.3456, 0.0, -0.0004]])
    back = decode(encode(sky), n_az=3)
    assert back.shape == (2, 3)
    assert np.max(np.abs(back - sky)) <= 0.0005 + 1e-12


def _hill_grids(synthetic_grid_factory):
    """A hill 2 km from the pole on a 20 m grid of heights in metres, as every band of a deep site."""
    import dataclasses

    from lunar_pipeline.lola import LolaGrid

    g = synthetic_grid_factory(size=401, scale_m=20.0)
    rr, cc = np.mgrid[0:401, 0:401]
    y, x = (200 - rr) * 20.0, (cc - 200) * 20.0
    h = 300.0 * np.exp(-(x**2 + (y - 2_000.0) ** 2) / (2 * 600.0**2))
    grid = LolaGrid(dataclasses.replace(g.label, scaling_factor=1.0), h.astype(np.float32))
    return {"L0": grid, "L1": grid, "L2": grid}


def _site():
    return SimpleNamespace(id="test_pole", lat=-90.0, lon=0.0)


def _bands(monkeypatch):
    from lunar_pipeline import masks
    from lunar_pipeline.horizon import Band

    monkeypatch.setattr(masks, "bands_for_site", lambda site, grids: [Band(grids["L0"], 40.0, 3_900.0, 10.0)])
    monkeypatch.setattr(masks, "fallback_bands", lambda site, bands, grids, n_az=720: [])


def test_versions_without_error_are_product_90s_skyline(synthetic_grid_factory, monkeypatch):
    _bands(monkeypatch)
    grids = _hill_grids(synthetic_grid_factory)
    model = {20: (Sigma(0.0, 0.0, 0.0), 30.0)}
    r = site_versions(_site(), grids, {"L0": None}, model, n=3, n_az=72)
    assert r["versions"].shape == (3, 72)
    assert np.max(np.abs(r["versions"] - r["adjusted"][None, :])) == pytest.approx(0.0, abs=1e-9)
    # The hill stands above the skyline of the flat ground round the rest of the site.
    assert r["adjusted"].max() > 3.0 and np.median(r["adjusted"]) < 0.5


def test_versions_spread_round_the_skyline_and_repeat_with_the_same_seed(synthetic_grid_factory, monkeypatch):
    _bands(monkeypatch)
    grids = _hill_grids(synthetic_grid_factory)
    model = {20: (Sigma(2.0, 0.0, 0.0), 30.0)}
    a = site_versions(_site(), grids, {"L0": None}, model, n=8, seed=7, n_az=72)
    b = site_versions(_site(), grids, {"L0": None}, model, n=8, seed=7, n_az=72)
    c = site_versions(_site(), grids, {"L0": None}, model, n=8, seed=8, n_az=72)
    assert np.array_equal(a["versions"], b["versions"])
    assert not np.array_equal(a["versions"], c["versions"])
    sd = a["versions"].std(axis=0)
    assert np.all(sd > 0.0)
    # Two metres of error at the hill's top, 2 km away, move its skyline by a few hundredths of a degree.
    toward = np.argsort(a["adjusted"])[-5:]
    assert 0.005 < np.median(sd[toward]) < 0.2
    # The site stands on its own version: its height moves too.
    assert np.std(a["site_heights_m"]) > 0.5


def test_a_grid_without_ground_is_left_as_it_is():
    from lunar_pipeline.lola import GridLabel, LolaGrid

    label = GridLabel(lines=3, samples=3, map_scale_m=80.0, line_offset_px=1.0, sample_offset_px=1.0, scaling_factor=1.0, offset=0.0, max_latitude_deg=-90.0)
    blank = LolaGrid(label, np.full((3, 3), np.nan, dtype=np.float32))
    p = Perturbable(blank, None, Sigma(1.0, 1.0, 1.0), 50.0)
    assert p.version(FieldMaker(), np.random.default_rng(0)) is blank


def test_spread_says_how_wide_the_versions_are_and_who_falls_inside_them():
    adjusted = np.zeros(4)
    versions = np.array([[-0.2, -0.1, 0.0, 1.0], [0.2, 0.1, 0.0, 1.2], [0.0, 0.0, 0.0, 1.1]])
    app = np.array([0.1, 0.5, 0.0, 0.0])
    s = spread(adjusted, versions, app, np.full(4, 0.05))
    assert s["sd_deg"]["max"] == pytest.approx(np.std([-0.2, 0.2, 0.0]), abs=1e-4)
    # Product 90's own skyline lies outside the versions in the last direction, where they all sit above it.
    assert s["adjusted_inside_p05_p95"] == pytest.approx(0.75)
    assert s["app_inside_p05_p95"] == pytest.approx(0.5)
    assert s["mean_minus_adjusted_deg"]["p95_abs"] > 0.9  # the versions sit 1.1 degrees above it there
