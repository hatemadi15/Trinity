import numpy as np
import pytest

from lunar_pipeline import geometry as g
from lunar_pipeline.config import R_MOON_M


def test_normalize_lon():
    assert g.normalize_lon(200.0) == pytest.approx(-160.0)
    assert g.normalize_lon(-160.0) == pytest.approx(-160.0)
    assert g.normalize_lon(180.0) == pytest.approx(180.0)
    assert g.normalize_lon(-180.0) == pytest.approx(180.0)
    assert g.normalize_lon(360.0) == pytest.approx(0.0)


def test_enu_basis_is_orthonormal():
    e, n, u = g.enu_basis(-85.0, 30.0)
    for v in (e, n, u):
        assert np.linalg.norm(v) == pytest.approx(1.0)
    assert abs(np.dot(e, n)) < 1e-12 and abs(np.dot(e, u)) < 1e-12 and abs(np.dot(n, u)) < 1e-12
    assert np.allclose(np.cross(e, n), u)


def test_azel_cardinal_directions():
    lat, lon = -85.0, 30.0
    p = g.site_vector_km(lat, lon)
    e, n, u = g.enu_basis(lat, lon)
    az, el = g.azel_from_body_vectors(p + 1e6 * u, lat, lon)
    assert el == pytest.approx(90.0, abs=1e-6)
    az, el = g.azel_from_body_vectors(p + 1e6 * e, lat, lon)
    assert az == pytest.approx(90.0, abs=1e-6) and el == pytest.approx(0.0, abs=1e-6)
    az, el = g.azel_from_body_vectors(p + 1e6 * n, lat, lon)
    assert az == pytest.approx(0.0, abs=1e-6)
    az, el = g.azel_from_body_vectors(p - 1e6 * n, lat, lon)
    assert az == pytest.approx(180.0, abs=1e-6)


def test_earth_parallax_dip_at_limb():
    # Site on the equator at lon 90 sees a body lying along +X (lon 0 direction) exactly 0.259 deg below the horizon.
    body = np.array([384_400.0, 0.0, 0.0])
    az, el = g.azel_from_body_vectors(body, 0.0, 90.0)
    expected = -np.degrees(np.arctan2(R_MOON_M / 1000.0, 384_400.0))
    assert el == pytest.approx(expected, abs=1e-6)
    assert az == pytest.approx(270.0, abs=1e-6)


def test_azel_broadcasts_over_time_axis():
    body = np.tile(np.array([384_400.0, 0.0, 0.0]), (5, 1))
    az, el = g.azel_from_body_vectors(body, -89.0, 10.0)
    assert az.shape == (5,) and el.shape == (5,)


def test_polar_stereographic_scale_at_875():
    x, y = g.ps_south_xy_m(-87.5, 0.0)
    assert abs(x) < 1e-6
    assert y == pytest.approx(2 * R_MOON_M * np.tan(np.radians(1.25)), abs=1e-3)
    assert y == pytest.approx(75_820.4, abs=5.0)
    x, y = g.ps_south_xy_m(-87.5, 90.0)
    assert x == pytest.approx(75_820.4, abs=5.0) and abs(y) < 1e-6


def test_polar_stereographic_roundtrip():
    rng = np.random.default_rng(0)
    lat = rng.uniform(-90.0, -60.0, 200)
    lon = rng.uniform(-180.0, 180.0, 200)
    x, y = g.ps_south_xy_m(lat, lon)
    lat2, lon2 = g.ps_south_latlon_deg(x, y)
    assert np.allclose(lat, lat2, atol=1e-9)
    dlon = (np.asarray(lon2) - lon + 180.0) % 360.0 - 180.0
    assert np.allclose(dlon, 0.0, atol=1e-7)
