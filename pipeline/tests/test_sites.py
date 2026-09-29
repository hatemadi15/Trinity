import numpy as np
import pytest

from lunar_pipeline import config
from lunar_pipeline.lola import LolaGrid
from lunar_pipeline.sites import Site, derive_rim_points, load_sites, polar_sites
from tests.conftest import needs_lola


def test_catalog_is_valid():
    sites = load_sites()
    ids = [s.id for s in sites]
    assert len(ids) == len(set(ids))
    for s in sites:
        assert -90.0 <= s.lat <= 90.0 and -180.0 < s.lon <= 180.0
        assert s.polar == (s.lat <= -80.0)
        assert s.category in {"reference", "classic", "clps_landed", "clps_planned", "artemis3"}
    assert {"shackleton_center", "im1_odysseus", "blue_ghost_m1"} <= set(ids)
    assert all(s.lat <= -80.0 for s in polar_sites())


def test_derive_rim_on_synthetic_crater(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=1024, scale_m=20.0)
    centre = Site("c", "c", -89.9, 45.0, "classic", True, "test", derive_rim={"r_min_km": 4.0, "r_max_km": 6.0})
    col, row = grid.pixel_from_latlon(centre.lat, centre.lon)
    rows, cols = np.mgrid[0:1024, 0:1024]
    dist = np.hypot(cols - col, rows - row) * 20.0
    grid.data[(dist > 4500) & (dist < 4700)] = 3000  # rim 1500 m high
    grid.data[int(row) + 230, int(col)] = 4000  # single peak 4.6 km south, 2000 m high
    derived = derive_rim_points(grid, [centre])
    assert derived[0].id == "c_rim_high"
    dcol, drow = grid.pixel_from_latlon(derived[0].lat, derived[0].lon)
    assert abs(dcol - col) < 1.5 and abs(drow - (row + 230)) < 1.5


@pytest.mark.data
@needs_lola
def test_shackleton_rim_high_is_above_centre():
    grid = LolaGrid.from_pds(config.LOLA_DIR / "ldem_875s_20m.lbl")
    centre = next(s for s in load_sites() if s.id == "shackleton_center")
    rim = derive_rim_points(grid, [centre])[0]
    assert grid.value_at(rim.lat, rim.lon) - grid.value_at(centre.lat, centre.lon) > 2000.0


ARTEMIS_2024 = {
    "peak_near_cabeus_b", "haworth", "malapert_massif", "mons_mouton_plateau", "mons_mouton",
    "nobile_rim_1", "nobile_rim_2", "de_gerlache_rim_2", "slater_plain",
}


def test_artemis_iii_regions_are_catalogued():
    sites = {s.id: s for s in load_sites()}
    assert ARTEMIS_2024 <= set(sites)
    for sid in ARTEMIS_2024:
        s = sites[sid]
        assert s.category == "artemis3" and s.polar
        assert -89.0 <= s.lat <= -83.0
    assert sites["nobile_rim_2"].lat == pytest.approx(-84.20156) and sites["nobile_rim_2"].lon == pytest.approx(60.69989)
    assert sites["malapert_massif"].approximate is False
    assert sites["haworth"].approximate is True
    assert {"connecting_ridge", "peak_near_shackleton"} <= set(sites)
    assert sites["peak_near_shackleton"].lat == pytest.approx(-89.01701)
