import numpy as np
import pytest

from lunar_pipeline.horizon import Band, horizon_mask
from lunar_pipeline.power import PowerConfig, simulate_battery
from lunar_pipeline.uncertainty import (
    Profile,
    ceil_half,
    ephemeris_seconds,
    flag_changes,
    horizon_profile,
    longest_run_h,
    match_offsets,
    plus_minus_h,
    powered_flags,
    sampling_offsets,
    short_episodes,
    sign_changes,
    skyline_error_deg,
    stats,
    terrain_offsets,
)


def test_flag_changes_reports_the_first_sample_in_each_new_state():
    t, d = flag_changes([1, 1, 0, 0, 1, 1, 1, 0], np.arange(8.0))
    assert t.tolist() == [2.0, 4.0, 7.0]
    assert d.tolist() == [-1, 1, -1]


def test_sign_changes_refines_the_crossing_between_samples_and_gives_its_rate():
    # A margin falling 0.5 a step through zero at t = 2.4, then rising through zero at t = 6.25.
    t_h = np.arange(10.0)
    margin = np.array([1.2, 0.7, 0.2, -0.3, -0.8, -0.5, -0.1, 0.3, 0.7, 1.1])
    t, d, r = sign_changes(margin, t_h)
    assert d.tolist() == [-1, 1]
    assert t == pytest.approx([2.4, 6.25])
    assert r == pytest.approx([-0.5, 0.4])


def test_sign_changes_counts_a_margin_of_exactly_zero_as_off_like_the_app():
    # The app counts the Sun as up only when some of it is strictly above the skyline.
    t, d, _ = sign_changes([0.5, 0.0, 0.5], np.arange(3.0))
    assert d.tolist() == [-1, 1]
    assert t == pytest.approx([1.0, 1.0])


def test_match_offsets_pairs_each_event_with_the_nearest_one_in_the_same_direction():
    a_t, a_d = np.array([10.0, 20.0, 40.0]), np.array([-1, 1, -1])
    b_t, b_d = np.array([9.4, 19.9, 10.2, 70.0]), np.array([-1, 1, 1, -1])
    off = match_offsets(a_t, a_d, b_t, b_d, window_h=3.0)
    # The rise at 10.2 is nearer to the set at 10 but goes the other way; the set at 40 has no partner within 3 h.
    assert off[:2] == pytest.approx([0.6, 0.1])
    assert np.isnan(off[2])


def test_stats_gives_plain_percentiles_of_the_offsets_and_their_size():
    s = stats([0.1, -0.2, 0.3, np.nan, 0.9])
    assert s["n"] == 4
    assert s["max_abs_h"] == pytest.approx(0.9)
    assert s["median_h"] == pytest.approx(0.2)
    assert stats([])["n"] == 0 and stats([])["p95_abs_h"] is None


def test_powered_flags_match_the_app_battery_walk_hour_by_hour():
    cfg = PowerConfig(load_w=200.0, battery_wh=500.0)
    power = np.array([400.0, 400.0, 0.0, 0.0, 0.0, 300.0, 0.0, 0.0, 0.0, 0.0])
    flags = powered_flags(power, cfg, 1.0)
    ref = simulate_battery(power, cfg)
    # The 300 W hour leaves 100 Wh, which the next hour's 200 W deficit overdraws.
    assert flags.tolist() == [True, True, True, True, False, True, False, False, False, False]
    assert int((~flags).sum()) == ref["brownout_hours"]
    assert int(np.argmax(~flags)) == ref["first_brownout_hour"]


def test_powered_flags_at_a_finer_step_hold_the_same_energy():
    # Ten minutes at a time, the same 500 Wh last 2.5 h at a 200 W deficit: off from the 15th step.
    cfg = PowerConfig(load_w=200.0, battery_wh=500.0)
    flags = powered_flags(np.zeros(30), cfg, 1.0 / 6.0)
    assert int(np.argmax(~flags)) == 15


def test_longest_run_and_short_episodes_read_runs_in_hours():
    flags = np.array([1, 1, 0, 1, 1, 1, 0, 0, 0, 1], dtype=bool)
    assert longest_run_h(flags, 0.5) == 1.5
    assert longest_run_h(~flags, 0.5) == 1.5
    short = short_episodes(flags, 0.5, shorter_than_h=1.0)
    # The lone dark sample at index 2 lasts half an hour; the runs at either end of the span do not count.
    assert short["off"] == {"count": 1, "hours": 0.5}
    assert short["on"] == {"count": 0, "hours": 0.0}


def test_sampling_offsets_find_the_hourly_lag_of_a_sunset():
    hourly = {"lit": (np.array([5.0]), np.array([-1])), "earth": (np.array([]), np.array([])), "powered": (np.array([]), np.array([]))}
    fine = {"lit": (np.array([4.25]), np.array([-1]), np.array([-0.3])), "earth": (np.array([]), np.array([]), np.array([])), "powered": (np.array([]), np.array([]), np.array([]))}
    assert sampling_offsets(hourly, fine, "sunset") == pytest.approx([0.75])
    assert sampling_offsets(hourly, fine, "sunrise").size == 0


def test_terrain_offsets_keep_the_largest_shift_and_count_events_another_skyline_loses():
    empty = (np.array([]), np.array([]), np.array([]))
    base = {"lit": (np.array([10.0, 50.0]), np.array([-1, -1]), np.zeros(2)), "earth": empty, "powered": empty}
    lower = {"lit": (np.array([11.0, 50.5]), np.array([-1, -1]), np.zeros(2)), "earth": empty, "powered": empty}
    higher = {"lit": (np.array([8.5]), np.array([-1]), np.zeros(1)), "earth": empty, "powered": empty}
    off, lost = terrain_offsets(base, [lower, higher], "sunset")
    # The first sunset moves 1 h later on one skyline and 1.5 h earlier on the other; the second has no match on the higher one.
    assert off[0] == pytest.approx(-1.5)
    assert np.isnan(off[1]) and lost == 1


def test_ephemeris_seconds_divides_the_angle_by_the_rate_of_the_crossing():
    e = ephemeris_seconds(np.array([0.5, -0.25, 0.0, np.nan]), 3e-5)
    assert e["n"] == 2
    assert e["max_s"] == pytest.approx(3e-5 / 0.25 * 3600)


def test_plus_minus_adds_the_three_sources_and_is_empty_without_events():
    sampling = {"n": 10, "p95_abs_h": 0.95}
    terrain = {"p95_abs_h": 1.2}
    assert plus_minus_h(sampling, terrain, {"p95_s": 36.0}) == pytest.approx(2.16)
    assert plus_minus_h(sampling, None, {"p95_s": None}, terrain_floor_h=2.5) == pytest.approx(3.45)
    assert plus_minus_h({"n": 0, "p95_abs_h": None}, terrain, {"p95_s": 1.0}) is None


def test_ceil_half_rounds_a_plus_minus_up_to_the_next_half_hour():
    assert [ceil_half(x) for x in (0.2, 0.5, 0.51, 2.0, 2.01)] == [0.5, 0.5, 1.0, 2.0, 2.5]
    assert ceil_half(None) is None


def test_ceil_half_never_shows_less_than_half_an_hour():
    # A battery draining with no Sun runs out at the same minute at any step: the margin still shows the half-hour grain.
    assert ceil_half(0.0) == 0.5


def test_horizon_profile_gives_the_app_skyline_and_where_it_is_made(synthetic_grid_factory):
    # A 100 m wall 3 km east of the pole on a flat plain.
    grid = synthetic_grid_factory(size=600, scale_m=20.0)
    cols = np.arange(600)
    wall = (cols >= 449) & (cols <= 451)
    grid.data[:, wall] = 200  # 0.5 m per count
    bands = [Band(grid, 40.0, 5_500.0, 10.0)]
    prof = horizon_profile(-90.0, 0.0, bands, site_height_m=0.0, n_az=8, mast_m=2.0)
    ref = horizon_mask(-90.0, 0.0, bands, n_az=8, mast_m=2.0, site_height_m_=0.0)
    assert prof.elevation_deg == pytest.approx(ref)
    # At the pole, azimuth 90° (index 2 of 8) runs along +x; the wall stands about 3 km away there.
    assert 2_900.0 < prof.distance_m[2] < 3_100.0


def test_skyline_error_divides_the_height_errors_by_the_distance():
    prof = Profile(np.zeros(3), np.array([1000.0, 10_000.0, 100_000.0]), np.zeros(3), np.zeros(3))
    sig = skyline_error_deg(prof, lambda lat, lon: np.array([3.0, np.nan, 3.0]), site_err_m=4.0)
    # sqrt(3² + 4²) = 5 m over each distance; the missing error takes the median of the others (3 m).
    assert sig == pytest.approx(np.degrees(np.arctan2(5.0, np.array([1000.0, 10_000.0, 100_000.0]))))


def _events(**by_flag):
    empty = (np.array([]), np.array([]), np.array([]))
    out = {"lit": empty, "earth": empty, "powered": empty}
    for flag, (t, d, r) in by_flag.items():
        out[flag] = (np.asarray(t, float), np.asarray(d), np.asarray(r, float))
    return out


def test_event_budget_keeps_sampling_terrain_and_ephemeris_apart_and_adds_them():
    from lunar_pipeline.uncertainty import event_budget

    hourly = _events(lit=([5.0, 30.0], [-1, -1], [np.nan, np.nan]))
    fine = _events(lit=([4.5, 29.2], [-1, -1], [-0.5, -0.25]))
    other = _events(lit=([5.5, 28.2], [-1, -1], [-0.5, -0.25]))
    b = event_budget(hourly, fine, [other], "sunset", angle_deg=2.7e-5)
    assert b["sampling"]["n"] == 2 and b["sampling"]["max_abs_h"] == pytest.approx(0.8)
    assert b["terrain"]["max_abs_h"] == pytest.approx(1.0) and b["terrain"]["lost"] == 0
    assert b["ephemeris"]["max_s"] == pytest.approx(2.7e-5 / 0.25 * 3600, abs=1e-3)
    assert b["plus_minus_h"] == pytest.approx(b["sampling"]["p95_abs_h"] + b["terrain"]["p95_abs_h"] + b["ephemeris"]["p95_s"] / 3600, abs=1e-3)
    # The app shows it rounded up to the half hour.
    assert b["shown_h"] == 2.0


def test_event_budget_without_terrain_models_uses_the_stated_floor():
    from lunar_pipeline.uncertainty import event_budget

    hourly = _events(lit=([5.0], [-1], [np.nan]))
    fine = _events(lit=([4.4], [-1], [-0.5]))
    b = event_budget(hourly, fine, [], "sunset", angle_deg=0.0, terrain_floor_h=2.5)
    assert b["terrain"] is None
    assert b["plus_minus_h"] == pytest.approx(0.6 + 2.5)


def test_horizon_difference_summarises_one_skyline_against_another():
    from lunar_pipeline.uncertainty import horizon_difference

    a = np.zeros(720)
    b = np.zeros(720)
    b[:10] = 0.4
    b[10:20] = -0.1
    d = horizon_difference(b, a)
    assert d["max_abs_deg"] == pytest.approx(0.4)
    assert d["mean_deg"] == pytest.approx((10 * 0.4 - 10 * 0.1) / 720, abs=1e-4)
    assert d["p95_abs_deg"] <= 0.4


def test_skyline_doc_keeps_the_three_other_skylines_at_the_app_resolution():
    from lunar_pipeline.uncertainty import skyline_doc

    base = np.linspace(0.0, 1.0, 720)
    sigma = np.full(720, 0.1)
    doc = skyline_doc("connecting_ridge", base, sigma, site_height_m=1653.3, mast_m=2.0)
    assert doc["site_id"] == "connecting_ridge" and doc["n_az"] == 720 and doc["az_step_deg"] == 0.5 and doc["mast_m"] == 2.0
    assert len(doc["adjusted_deg"]) == 720
    assert doc["raised_deg"][10] == pytest.approx(doc["adjusted_deg"][10] + 0.1, abs=1e-3)
    assert doc["lowered_deg"][10] == pytest.approx(doc["adjusted_deg"][10] - 0.1, abs=1e-3)


def test_write_doc_puts_the_skylines_beside_the_budget(tmp_path):
    import json

    from lunar_pipeline.uncertainty import write_doc

    path = write_doc({"version": 1, "sites": [], "skylines": {"x": {"site_id": "x"}}}, out_dir=tmp_path)
    assert json.loads(path.read_text()) == {"version": 1, "sites": []}
    assert json.loads((tmp_path / "skylines" / "x.json").read_text()) == {"site_id": "x"}
    assert path.read_bytes().count(b"\r\n") == 0


def _have_product90_for(site_id: str) -> bool:
    from lunar_pipeline import config
    from lunar_pipeline.pgda90 import FULL_FILES, PGDA_DIR, WINDOW_DIR
    from lunar_pipeline.sites import all_sites

    if not (config.KERNEL_DIR / "de440s.bsp").exists() or not all((PGDA_DIR / f).exists() for f in FULL_FILES.values()):
        return False
    site = next(s for s in all_sites() if s.id == site_id)
    return bool(list(WINDOW_DIR.glob(f"*_{site.lat:+.5f}_{site.lon:+.5f}_*.npz")))


@pytest.mark.data
def test_build_measures_a_site_with_the_three_sources_apart():
    # IM-2 Athena, ten days from 2025-01-01: the cached product 90 windows mean no download.
    if not _have_product90_for("im2_athena"):
        pytest.skip("run: uv run python -m lunar_pipeline.cli pgda90-fetch, then the uncertainty command once")
    from lunar_pipeline.uncertainty import EVENT_KINDS, build

    doc = build(site_ids=["im2_athena"], days=10)
    site = doc["sites"][0]
    assert site["site_id"] == "im2_athena" and site["condition"] == "Earth skimming the horizon"
    assert set(site["events"]) == set(EVENT_KINDS)
    assert site["hour_agreement"]["lit"] == 1.0
    assert site["terrain_quality"]["height_error_m"] > 0
    assert set(doc["skylines"]["im2_athena"]) >= {"adjusted_deg", "raised_deg", "lowered_deg"}
    for e in site["events"].values():
        if e["sampling"]["n"]:
            assert 0.0 <= e["sampling"]["max_abs_h"] <= 1.0
            assert e["plus_minus_h"] >= e["sampling"]["p95_abs_h"]


def test_version_offsets_take_each_events_95th_percentile_shift_and_count_events_too_many_versions_lose():
    from lunar_pipeline.uncertainty import version_offsets

    empty = (np.array([]), np.array([]), np.array([]))
    base = {"lit": (np.array([10.0, 50.0]), np.array([-1, -1]), np.zeros(2)), "earth": empty, "powered": empty}
    # Twenty versions: the first sunset moves by up to 0.95 h either way, the second is lost in two of them.
    versions = []
    for i in range(20):
        shift = (i - 9.5) / 10.0
        times = [10.0 + shift] + ([] if i < 2 else [50.0 + 0.1])
        versions.append({"lit": (np.array(times), np.full(len(times), -1), np.zeros(len(times))), "earth": empty, "powered": empty})
    off, lost = version_offsets(base, versions, "sunset")
    assert abs(off[0]) == pytest.approx(np.percentile(np.abs((np.arange(20) - 9.5) / 10.0), 95), abs=0.06)
    # Lost in 2 of 20 versions, more than one in twenty: counted apart, as a skyline that loses it is.
    assert np.isnan(off[1]) and lost == 1


def test_combined_terrain_offsets_keep_the_larger_of_the_skylines_shift_and_the_versions():
    from lunar_pipeline.uncertainty import combine_offsets

    off, lost = combine_offsets((np.array([0.5, -0.2, np.nan]), 1), (np.array([-0.3, 0.9, 0.1]), 0))
    assert off[:2].tolist() == [0.5, 0.9] and np.isnan(off[2]) and lost == 1
