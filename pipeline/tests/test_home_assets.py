import json

import numpy as np
import pytest

from lunar_pipeline import home_assets
from lunar_pipeline.cli import build_parser
from lunar_pipeline.home_assets import distance_km, facts, night, relief_pins, write_jpeg
from lunar_pipeline.sites import Site
from tests.conftest import needs_kernels, needs_lola


def _due_north_of_the_pole(el_deg: float, dist_km: float) -> np.ndarray:
    """A body seen from the south pole due north (along +x) at this elevation, Moon-centred km."""
    e = np.radians(el_deg)
    return np.array([dist_km * np.cos(e), 0.0, -1737.4 - dist_km * np.sin(e)])


def test_sky_series_carries_earth_against_the_hills_in_its_direction():
    site = Site("pole", "Pole", -90.0, 0.0, "reference", True, "x")
    earth_el = [5.0, 1.5, -1.0]
    table = np.array([[_due_north_of_the_pole(3.0, 1.496e8), _due_north_of_the_pole(e, 384400.0)] for e in earth_el], dtype=np.float32)
    header = {"t0_utc": "2027-01-01T00:00:00", "step_s": 3600.0, "n": 3}
    sky = home_assets.sky_series(site, np.full(720, 2.0), table, header, "2027-01-01T00:00:00", 3)
    assert sky["earth_el"] == pytest.approx(earth_el, abs=0.01)
    assert sky["earth_hill_el"] == [2.0, 2.0, 2.0]
    # Earth counts as in view only above the hills in its direction.
    assert sky["earth_visible"] == [1, 0, 0]
    assert sky["earth_pct"] == pytest.approx(33.3, abs=0.05)
    assert len(sky["earth_az"]) == 3
    assert sky["lit"] == [1, 1, 1]
    # The Sun's distance in AU and Earth's in km, hour by hour, for the arrival's light and Earth's place.
    assert sky["sun_au"] == pytest.approx([1.496e8 / 149_597_870.7] * 3, abs=1e-5)
    assert sky["earth_km"] == [384400, 384400, 384400]


def test_battery_facts_give_the_time_with_power_now_and_on_the_best_day():
    from lunar_pipeline.power import PowerConfig, config_dict

    # 1361 W while any Sun shows, 100 W load, 1000 Wh battery: ten hours in the dark.
    cfg = PowerConfig(panel="full_tracking", area_m2=1.0, efficiency=1.0, load_w=100.0, battery_wh=1000.0)
    sun = np.array([0] * 10 + [1] * 20 + [0] * 30 + [1] * 5 + [0] * 40, dtype=np.float64)
    n = sun.size
    series = {"sun_az": np.zeros(n), "sun_el": np.full(n, 5.0), "sun_fraction": sun, "sun_au": np.ones(n), "earth_visible": np.zeros(n, dtype=bool)}
    # Landing at hour 0: ten dark hours on the battery, twenty sunlit, then the battery runs out ten hours into the next night.
    assert home_assets.battery_facts(series, cfg, n) == {"lander": config_dict(cfg), "now_hours": 40, "best_hour": 10, "best_hours": 30, "best_earth_fraction": 0.0}
    dark = dict(series, sun_fraction=np.zeros(n))
    assert home_assets.battery_facts(dark, cfg, n) == {"lander": config_dict(cfg), "now_hours": 10, "best_hour": None, "best_hours": None, "best_earth_fraction": None}


def test_mask_block_gives_the_skyline_by_direction_to_a_hundredth_of_a_degree():
    from lunar_pipeline.home_assets import mask_block

    block = mask_block([1.234567] * 720)
    assert block["az0"] == 0.0 and block["step"] == 0.5 and len(block["el"]) == 720 and block["el"][0] == 1.23


def test_night_finds_the_longest_unlit_run_and_the_sunrise_after_it():
    lit = [1, 1, 0, 0, 0, 1, 0, 1, 1]
    assert night(lit) == {"sunset_hour": 2, "sunrise_hour": 5, "hours": 3}
    assert night([1, 1, 1]) is None
    assert night([1, 0, 0]) == {"sunset_hour": 1, "sunrise_hour": 3, "hours": 2}


def test_distance_on_the_moon_between_the_hero_site_and_the_crater_rim():
    assert distance_km(-88.28, -64.31, -88.66401, -68.40606) == pytest.approx(12.1, abs=0.2)
    assert distance_km(-90.0, 0.0, -89.0, 123.0) == pytest.approx(30.32, abs=0.05)


def test_facts_summarise_the_three_validation_tables():
    horizons = {"n_rows": 300, "max_abs_delta_el_deg": 2.7e-5}
    mazarico = {"rows": [
        {"site_id": "a", "covered": True, "delta_points": 1.0},
        {"site_id": "b", "covered": True, "delta_points": -4.0},
        {"site_id": "c", "covered": True, "delta_points": 10.8},
        {"site_id": "d", "covered": False},
    ]}
    backcasts = {"rows": [{"site_id": "im2_athena", "end_minus_sunset_h": -299.0}, {"site_id": "blue_ghost_m1", "end_minus_sunset_h": 2.41}]}
    f = facts(horizons, mazarico, backcasts)
    assert f["horizons_worst_el_deg"] == 2.7e-5 and f["horizons_rows"] == 300
    assert f["sun_disc_ratio"] == pytest.approx(0.533 / 2.7e-5, rel=0.01)
    assert f["mazarico_sites"] == 3 and f["mazarico_within5"] == 2
    assert f["mazarico_median_points"] == 4.0 and f["mazarico_worst_points"] == 10.8
    assert f["blue_ghost_end_minus_sunset_h"] == 2.4


def test_relief_pins_place_the_pole_at_the_centre_and_east_longitudes_to_the_right():
    sites = [
        Site("south_pole", "Pole", -90.0, 0.0, "reference", True, "x"),
        Site("east", "East", -88.0, 90.0, "classic", True, "x"),
        Site("zero", "Zero", -88.0, 0.0, "classic", True, "x"),
        Site("far", "Far", 18.0, 61.0, "clps_landed", False, "x"),
    ]
    pins = {p["id"]: p for p in relief_pins(sites, 250.0)}
    assert pins["south_pole"]["u"] == 0.5 and pins["south_pole"]["v"] == 0.5
    assert pins["east"]["u"] > 0.6 and pins["east"]["v"] == pytest.approx(0.5, abs=1e-6)
    assert pins["zero"]["v"] < 0.4 and pins["zero"]["u"] == pytest.approx(0.5, abs=1e-6)  # longitude 0 is up
    assert "far" not in pins


def test_write_jpeg_writes_a_grayscale_jpeg(tmp_path):
    img = (np.arange(64 * 48) % 256).astype(np.uint8).reshape(48, 64)
    path = write_jpeg(tmp_path / "x.jpg", img)
    data = path.read_bytes()
    assert data[:2] == b"\xff\xd8" and len(data) > 200
    assert not (tmp_path / "x.jpg.aux.xml").exists()


def test_cli_lists_the_home_assets_command():
    args = build_parser().parse_args(["home-assets"])
    assert args.cmd == "home-assets"


@pytest.mark.data
@needs_lola
@needs_kernels  # the month at the site comes from the ephemeris, which reads the SPICE kernels
def test_write_all_produces_the_picture_the_map_and_the_facts(tmp_path):
    (tmp_path / "public").mkdir()
    (tmp_path / "src" / "lib" / "data").mkdir(parents=True)
    paths = home_assets.write_all(tmp_path)
    names = sorted(p.name for p in paths)
    assert names == ["de-gerlache-rim-2.jpg", "home.json", "south-pole-relief.jpg"]
    doc = json.loads((tmp_path / "src" / "lib" / "data" / "home.json").read_text(encoding="utf-8"))
    sky = doc["sky"]
    assert sky["hours"] == 720 and len(sky["sun_el"]) == 720 and len(sky["hill_el"]) == 720 and len(sky["lit"]) == 720
    assert sky["sunlit_pct"] == pytest.approx(44.6, abs=0.2)
    assert sky["night"]["hours"] == 399 and sky["night"]["sunset_hour"] == 67 and sky["night"]["sunrise_hour"] == 466
    assert len(sky["earth_el"]) == 720 and len(sky["earth_hill_el"]) == 720 and len(sky["earth_visible"]) == 720
    assert 0.0 < sky["earth_pct"] < 100.0
    assert doc["pair"]["rim_sun_pct"] == 100.0 and doc["pair"]["distance_km"] == pytest.approx(12.1, abs=0.2)
    rim = doc["rim"]
    assert rim["site_id"] == "de_gerlache_center_rim_high" and rim["sunlit_pct"] == 100.0
    assert len(rim["sun_az"]) == 720 and len(rim["sun_el"]) == 720 and all(rim["lit"]) and len(rim["mask"]["el"]) == 720
    assert 0.3 < doc["hero"]["lit_fraction"] < 0.8
    assert doc["hero"]["frame_utc"] == "2027-01-02T06:00:00"
    ids = {s["id"] for s in doc["relief"]["sites"]}
    assert {"south_pole", "de_gerlache_rim_2", "malapert_massif"} <= ids and "blue_ghost_m1" not in ids
    assert doc["facts"]["horizons_rows"] == 300
    # The figures of data/fixtures/landing/de_gerlache_rim_2_2027-01-01_30d.json.
    assert doc["battery"]["now_hours"] == 76 and doc["battery"]["best_hour"] == 466 and doc["battery"]["best_hours"] == 303
