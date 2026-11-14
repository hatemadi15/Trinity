import re

import numpy as np
import pytest

from lunar_pipeline import config
from lunar_pipeline.lola import LolaGrid
from lunar_pipeline.sites import Site, all_sites, derive_rim_points, load_sites, polar_sites
from tests.conftest import needs_lola

CATEGORIES = {"reference", "classic", "clps_landed", "clps_planned", "artemis3", "apollo", "international"}
KINDS = {"surveyed", "target", "region_centre", "derived", "reference"}


def test_catalog_is_valid():
    sites = load_sites()
    ids = [s.id for s in sites]
    assert len(ids) == len(set(ids))
    for s in sites:
        assert -90.0 <= s.lat <= 90.0 and -180.0 < s.lon <= 180.0
        # A polar site lies on the LOLA grids, which reach 60 S, and its 220 km skyline stays on them.
        assert s.polar == (s.lat <= -60.0)
        assert s.lat <= -67.3 or not s.polar
        assert s.category in CATEGORIES
    assert {"shackleton_center", "im1_odysseus", "blue_ghost_m1"} <= set(ids)
    assert all(s.lat <= -67.3 for s in polar_sites())


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


def test_landed_missions_carry_reported_ends():
    sites = {s.id: s for s in load_sites()}
    for sid in ("im1_odysseus", "im2_athena", "blue_ghost_m1"):
        s = sites[sid]
        assert s.landed_utc and s.mission_end_utc and s.mission_end_source
        assert s.mission_end_utc > s.landed_utc
    assert sites["blue_ghost_m1"].mission_end_utc == "2025-03-16T23:25:00Z"


def test_every_site_has_a_short_label_and_one_plain_line():
    sites = all_sites()
    assert len(sites) == 34
    for s in sites:
        assert s.label and len(s.label) <= 28, s.id
        assert s.blurb and len(s.blurb) <= 72, s.id
        assert not re.search(r"LOLA|DE440|CLPS|Horizons|Artemis III", f"{s.label} {s.blurb}"), s.id
    assert len({s.label for s in sites}) == len(sites)


def test_derived_rim_point_takes_its_label_and_blurb_from_the_parent(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=1024, scale_m=20.0)
    centre = Site(
        "c", "c", -89.9, 45.0, "classic", True, "test",
        derive_rim={"r_min_km": 4.0, "r_max_km": 6.0, "label": "Test rim summit", "blurb": "The highest point of the rim"},
    )
    derived = derive_rim_points(grid, [centre])[0]
    assert derived.label == "Test rim summit"
    assert derived.blurb == "The highest point of the rim"


APOLLO = {"apollo_11", "apollo_12", "apollo_14", "apollo_15", "apollo_16", "apollo_17"}
OTHER_COUNTRIES = {"chandrayaan3_vikram", "change3", "change4", "change5", "change6", "slim", "luna25_target"}
COMING = {"im3_reiner_gamma", "cp12_schrodinger"}


def test_the_catalogue_holds_the_apollo_landings_other_countries_landers_and_coming_landings():
    sites = {s.id: s for s in load_sites()}
    assert {s.id for s in sites.values() if s.category == "apollo"} == APOLLO
    assert {s.id for s in sites.values() if s.category == "international"} == OTHER_COUNTRIES
    assert {s.id for s in sites.values() if s.category == "clps_planned"} == COMING
    # Measured positions of the landers (NSSDCA's table from LRO images, LROC's own posts), south and west negative.
    assert (sites["apollo_11"].lat, sites["apollo_11"].lon) == pytest.approx((0.67416, 23.47314))
    assert (sites["apollo_12"].lat, sites["apollo_12"].lon) == pytest.approx((-3.0128, -23.4219))
    assert (sites["apollo_17"].lat, sites["apollo_17"].lon) == pytest.approx((20.1911, 30.7723))
    assert (sites["change4"].lat, sites["change4"].lon) == pytest.approx((-45.457, 177.589))
    assert (sites["change6"].lat, sites["change6"].lon) == pytest.approx((-41.6385, -153.9852))
    assert (sites["chandrayaan3_vikram"].lat, sites["chandrayaan3_vikram"].lon) == pytest.approx((-69.3741, 32.32))
    # Inside the 60 S grid: these three get a horizon mask and terrain; the rest have a flat horizon.
    assert {s.id for s in sites.values() if s.polar and s.lat > -80.0} == {"chandrayaan3_vikram", "luna25_target", "cp12_schrodinger"}
    for s in sites.values():
        assert s.source and s.source != "definition" or s.id == "south_pole", s.id


def test_every_site_says_what_kind_of_point_it_is():
    sites = {s.id: s for s in all_sites()}
    for s in sites.values():
        assert s.kind in KINDS, s.id
        assert s.uncertainty_km is None or s.uncertainty_km > 0, s.id
        # A lander that came down is a surveyed point: its hardware is seen in images from orbit.
        assert (s.kind == "surveyed") == (s.landed_utc is not None), s.id
        # The regions read off NASA's map are centres known to about 5 km, the only ones flagged approximate.
        assert s.approximate == (s.kind == "region_centre" and s.uncertainty_km == 5.0), s.id
    assert {s.id for s in sites.values() if s.kind == "derived"} == {"shackleton_center_rim_high", "de_gerlache_center_rim_high"}
    assert {s.id for s in sites.values() if s.kind == "reference"} == {"south_pole", "shackleton_center", "de_gerlache_center"}
    assert sites["luna25_target"].kind == "target" and sites["im3_reiner_gamma"].kind == "target"
    assert sites["haworth"].kind == "region_centre" and sites["haworth"].uncertainty_km == 5.0
    assert sites["malapert_massif"].kind == "region_centre" and sites["malapert_massif"].uncertainty_km is None
    assert sites["cp12_schrodinger"].kind == "region_centre" and sites["cp12_schrodinger"].uncertainty_km > 100.0


def test_a_derived_rim_point_is_marked_as_derived(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=1024, scale_m=20.0)
    centre = Site("c", "c", -89.9, 45.0, "classic", True, "test", derive_rim={"r_min_km": 4.0, "r_max_km": 6.0})
    rim = derive_rim_points(grid, [centre])[0]
    assert rim.kind == "derived" and rim.uncertainty_km is None


def test_far_side_sites_never_see_earth_and_every_other_site_does():
    from lunar_pipeline.ephemeris import load_table
    from lunar_pipeline.geometry import azel_from_body_vectors

    table, _ = load_table()
    earth = table[:, 1, :].astype(np.float64)
    far = set()
    for s in all_sites():
        _, el = azel_from_body_vectors(earth, s.lat, s.lon, 0.0)
        if s.far_side:
            far.add(s.id)
            # Over every hour of 2024 to 2036 even the top of Earth's disc, about 1 degree above its centre, stays below a flat horizon.
            assert el.max() < -1.0, s.id
        else:
            assert el.max() > 0.0, s.id
    assert far == {"change4", "change6", "cp12_schrodinger"}
