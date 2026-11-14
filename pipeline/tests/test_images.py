import numpy as np
import pytest

from lunar_pipeline import images as im
from lunar_pipeline.shadow import Level
from tests.conftest import needs_kernels, needs_lola

WAC_HEADER = """PDS_VERSION_ID            = PDS3
RECORD_TYPE   = FIXED_LENGTH
RECORD_BYTES  = 24320
FILE_RECORDS  = 6081
LABEL_RECORDS = 1
^IMAGE        = 2
PRODUCT_ID                = WAC_MOVIE_S20090920T0850
SOURCE_PRODUCT_ID         = M108075922M
START_TIME                   = 2009-09-20T08:50:54
STOP_TIME                    = 2009-09-20T08:57:10
OBJECT = IMAGE_MAP_PROJECTION
    MAP_PROJECTION_TYPE          = "POLAR STEREOGRAPHIC"
    A_AXIS_RADIUS                = 1737.4 <KM>
    CENTER_LATITUDE              = -90.0 <DEG>
    CENTER_LONGITUDE             = 0.0 <DEG>
    MAP_SCALE                    = 100.0 <METERS/PIXEL>
    LINE_PROJECTION_OFFSET       = 3039.5
    SAMPLE_PROJECTION_OFFSET     = 3039.5
END_OBJECT = IMAGE_MAP_PROJECTION
OBJECT = IMAGE
    LINES                      = 6080
    LINE_SAMPLES               = 6080
    SAMPLE_TYPE                = PC_REAL
    SAMPLE_BITS                = 32
    FILTER_NAME                = 689
END_OBJECT = IMAGE
END
"""


def test_a_wac_frame_header_gives_its_times_its_source_and_where_its_pixels_lie():
    f = im.wac_frame_from_header("WAC_MOVIE_S20090920T0850", WAC_HEADER)
    assert f.start_utc == "2009-09-20T08:50:54" and f.stop_utc == "2009-09-20T08:57:10"
    assert f.source == "M108075922M"
    assert (f.lines, f.samples, f.record_bytes, f.image_offset) == (6080, 6080, 24320, 24320)
    # The projection origin (the pole) sits 3039.5 pixels right of and below the first pixel's centre, so the
    # first pixel's centre is at x = -303,950 m, y = +303,950 m, and its outer edges 50 m further out.
    assert f.px_m == 100.0
    assert f.x0_m == -304000.0 and f.y0_m == 304000.0


def test_the_middle_of_an_exposure_is_halfway_between_its_start_and_stop():
    assert im.mid_utc("2009-09-20T08:50:54", "2009-09-20T08:57:10") == "2009-09-20T08:54:02"
    assert im.mid_utc("2010-09-21T17:33:39.822", "2010-09-21T17:34:22.601") == "2010-09-21T17:34:01.212"


def test_a_window_covers_the_frame_pixels_whose_centres_fall_in_a_box():
    f = im.wac_frame_from_header("F", WAC_HEADER)
    rows, cols = im.window_pixels(f, x_min=-150.0, x_max=150.0, y_min=-50.0, y_max=250.0)
    # centres at x = (j - 3039.5) * 100: -150 < x < 150 for j = 3038..3041 (x = -150 and 150 sit on edges and
    # count, as the box's edges are inclusive); y = (3039.5 - i) * 100 from 250 down to -50: i = 3037..3040
    assert (rows.start, rows.stop) == (3037, 3041)
    assert (cols.start, cols.stop) == (3038, 3042)


def test_a_wac_window_is_read_with_one_byte_range_across_its_rows_and_its_null_pixels_become_nan():
    f = im.wac_frame_from_header("F", WAC_HEADER)
    asked = []
    null = np.frombuffer(bytes.fromhex("fbff7fff"), dtype="<f4")[0]  # 0xFF7FFFFB, ISIS's null

    def fetch(url, first, last):
        # every float of the frame holds 1000 x its row + its column (exact in 32 bits), except one null pixel
        asked.append((first, last))
        offsets = np.arange(first, last + 1, 4) - f.image_offset
        values = (offsets // f.record_bytes) * 1000.0 + (offsets % f.record_bytes) // 4
        values[(offsets // f.record_bytes == 3038) & ((offsets % f.record_bytes) // 4 == 3039)] = null
        return values.astype("<f4").tobytes()

    pic = im.read_wac_window(f, x_min=-150.0, x_max=150.0, y_min=-50.0, y_max=250.0, fetch=fetch)
    assert asked == [(f.image_offset + 3037 * 24320 + 3038 * 4, f.image_offset + 3040 * 24320 + 3042 * 4 - 1)]
    assert pic.values.shape == (4, 4)
    assert pic.values[0, 0] == 1000.0 * 3037 + 3038
    assert pic.values[3, 3] == 1000.0 * 3040 + 3041
    assert np.isnan(pic.values[1, 1])
    assert pic.x0_m == (3038 - 3039.5) * 100.0 - 50.0
    assert pic.y0_m == (3039.5 - 3037) * 100.0 + 50.0
    assert pic.px_m == 100.0


def test_otsu_splits_a_dark_mode_from_a_bright_one():
    rng = np.random.default_rng(1)
    dark = rng.normal(-3.4, 0.1, 4000)
    bright = rng.normal(-1.8, 0.2, 6000)
    t = im.otsu_threshold(np.concatenate([dark, bright]))
    assert -3.0 < t < -2.2


def test_the_app_pixels_are_gathered_into_the_picture_pixel_their_centre_falls_in():
    # A 4 x 4 grid of 20 m cells, the site at its centre (map metres of cell centres -30, -10, 10, 30), into a
    # picture of 40 m pixels whose top-left corner is (-40, 40): each picture pixel takes a 2 x 2 block.
    level = Level(np.zeros((4, 4)), 20.0, 1.5, 1.5)
    lit = np.array([[1, 1, 0, 0], [1, 1, 0, 1], [0, 0, 1, 1], [0, 0, 1, 1]], dtype=bool)
    share, count = im.gather_lit_share(lit, level, site_x_m=0.0, site_y_m=0.0, x0_m=-40.0, y0_m=40.0, px_m=40.0, shape=(2, 2))
    assert count.tolist() == [[4, 4], [4, 4]]
    assert share.tolist() == [[1.0, 0.25], [0.0, 1.0]]


def test_picture_pixels_without_an_app_pixel_centre_have_no_share():
    level = Level(np.zeros((2, 2)), 20.0, 0.5, 0.5)
    lit = np.ones((2, 2), dtype=bool)
    share, count = im.gather_lit_share(lit, level, site_x_m=1000.0, site_y_m=0.0, x0_m=-40.0, y0_m=40.0, px_m=40.0, shape=(2, 2))
    assert count.sum() == 0
    assert np.isnan(share).all()


def test_the_comparison_counts_agreement_and_both_ways_of_missing_a_shadow():
    pred = np.array([1, 1, 1, 0, 0, 0, 1, 1], dtype=bool)
    seen = np.array([1, 1, 0, 0, 0, 1, 1, 1], dtype=bool)
    r = im.compare_masks(pred, seen)
    assert r["pixels"] == 8
    assert r["agree"] == pytest.approx(6 / 8)
    assert r["seen_lit"] == pytest.approx(5 / 8)
    assert r["app_lit"] == pytest.approx(5 / 8)
    # Ground dark in the picture: 3 pixels, 2 of them in the app's shadow; the app's shadow: 3 pixels, 2 dark.
    assert r["shadow_found"] == pytest.approx(2 / 3)
    assert r["shadow_confirmed"] == pytest.approx(2 / 3)
    # Calling every pixel by the picture's commoner state would be right at 5 of 8.
    assert r["majority"] == pytest.approx(5 / 8)


def test_a_comparison_without_shadow_in_it_says_so_rather_than_divide_by_zero():
    r = im.compare_masks(np.ones(5, dtype=bool), np.ones(5, dtype=bool))
    assert r["agree"] == 1.0 and r["shadow_found"] is None and r["shadow_confirmed"] is None


def test_the_best_shift_recovers_a_known_offset_of_the_picture():
    rng = np.random.default_rng(3)
    base = rng.random((40, 50)) > 0.5
    base = np.repeat(np.repeat(base, 3, axis=0), 3, axis=1)  # blobs a few pixels wide
    pred = base[10:100, 10:130]
    seen = base[12:102, 9:129]  # the picture's content sits 1 column right of and 2 rows above the prediction's
    valid = np.ones_like(pred)
    dx, dy, agree = im.best_shift(pred, seen, valid, max_px=3)
    assert agree == 1.0
    # map x is to the right and y is up
    assert (dx, dy) == (1, 2)


@needs_kernels
def test_the_sun_at_a_moment_agrees_with_the_apps_hourly_table_on_the_hour():
    from datetime import datetime

    from lunar_pipeline.ephemeris import load_table
    from lunar_pipeline.geometry import azel_from_body_vectors

    table, header = load_table()
    lat, lon = -89.53432, -150.05233
    az, el = im.sun_azel(["2025-03-01T05:00:00"], lat, lon)
    i = round((datetime.fromisoformat("2025-03-01T05:00:00") - datetime.fromisoformat(header["t0_utc"])).total_seconds() / header["step_s"])
    taz, tel = azel_from_body_vectors(table[i, 0].astype(np.float64), lat, lon)
    assert el[0] == pytest.approx(float(tel), abs=2e-4)
    assert az[0] == pytest.approx(float(taz), abs=2e-3)


def test_frames_are_picked_one_per_quarter_of_the_suns_circle_earliest_first_and_never_twice():
    cands = [
        {"frame": "a", "start_utc": "2010-01-01T00:00:00", "sun_az": 10.0, "sun_el": 1.0, "covered": True},
        {"frame": "b", "start_utc": "2010-01-02T00:00:00", "sun_az": 20.0, "sun_el": 1.0, "covered": True},
        {"frame": "c", "start_utc": "2010-01-03T00:00:00", "sun_az": 100.0, "sun_el": 0.1, "covered": True},
        {"frame": "d", "start_utc": "2010-01-04T00:00:00", "sun_az": 120.0, "sun_el": 1.5, "covered": False},
        {"frame": "e", "start_utc": "2010-01-05T00:00:00", "sun_az": 130.0, "sun_el": 1.5, "covered": True},
        {"frame": "f", "start_utc": "2010-01-06T00:00:00", "sun_az": 350.0, "sun_el": 2.0, "covered": True},
    ]
    picked = im.pick_frames(cands, min_el_deg=0.5)
    assert [c["frame"] for c in picked] == ["a", "e", "f"]


@needs_lola
def test_the_apps_levels_for_a_site_near_the_pole_run_from_the_cap_to_its_20_m_window():
    from lunar_pipeline.masks import load_grids
    from lunar_pipeline.sites import all_sites

    site = next(s for s in all_sites() if s.id == "connecting_ridge")
    grids = load_grids()
    levels = im.app_levels(site, grids, im.south_cap(grids))
    assert [lv.px_m for lv in levels] == [960.0, 80.0, 20.0]
    fine = levels[-1]
    assert fine.heights_m.shape == (1024, 1024)
    assert abs(fine.site_col - 512) <= 1 and abs(fine.site_row - 512) <= 1
    assert np.isfinite(fine.heights_m).all()


def test_a_footprint_polygon_is_read_from_its_well_known_text_and_tells_inside_from_outside():
    ring = im.parse_polygon("POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))")
    assert ring.shape == (5, 2)
    pts = np.array([[5.0, 5.0], [11.0, 5.0], [-1.0, -1.0], [9.9, 0.1]])
    assert im.inside_polygon(pts, ring).tolist() == [True, False, False, True]
    multi = im.parse_polygon("MULTIPOLYGON (((0 0, 4 0, 4 4, 0 0)), ((10 10, 12 10, 12 12, 10 10)))")
    assert multi.tolist()[0] == [0.0, 0.0] and multi.shape == (4, 2)


def test_a_movie_frame_is_named_by_the_minute_its_observation_starts():
    assert im.frame_name("2009-09-20T08:50:54.152000Z") == "S20090920T0850"


def test_the_observations_ode_lists_carry_their_times_and_footprints():
    doc = {
        "ODEResults": {
            "Products": {
                "Product": {
                    "Product_name": "M108075922ME.IMG",
                    "UTC_start_time": "2009-09-20T08:50:54.152000Z",
                    "UTC_stop_time": "2009-09-20T08:57:10.027000Z",
                    "Footprint_SP_geometry": "POLYGON ((0 0, 10 0, 10 10, 0 0))",
                }
            }
        }
    }
    obs = im.observations_from_ode(doc)
    assert obs == [
        {
            "source": "M108075922ME",
            "start_utc": "2009-09-20T08:50:54.152",
            "stop_utc": "2009-09-20T08:57:10.027",
            "frame": "S20090920T0850",
            "footprint": "POLYGON ((0 0, 10 0, 10 10, 0 0))",
        }
    ]
    assert im.observations_from_ode({"ODEResults": {"Products": "No Products Found"}}) == []


def test_a_sites_map_runs_half_a_pixel_beyond_its_outer_pixel_centres():
    level = Level(np.zeros((4, 6)), 20.0, 2.5, 1.5)
    x_min, x_max, y_min, y_max = im.level_box(level, site_x_m=1000.0, site_y_m=-500.0)
    assert (x_min, x_max) == (1000.0 - 60.0, 1000.0 + 60.0)
    assert (y_min, y_max) == (-500.0 - 40.0, -500.0 + 40.0)


def test_flat_ground_meets_the_sun_at_its_height_and_higher_towards_it_as_the_moon_curves_away():
    level = Level(np.zeros((3, 201)), 20.0, 100.0, 1.0)
    d = im.direct_cosine(level, bearing_deg=90.0, el_deg=1.0)  # the Sun to the right
    assert d[1, 100] == pytest.approx(np.sin(np.radians(1.0)), rel=1e-9)
    # 2 km towards the Sun the ground's own horizon has tipped 2000 / 1737400 rad towards it
    assert d[1, 200] == pytest.approx(np.sin(np.radians(1.0) + 2000.0 / 1737400.0), rel=1e-9)
    assert d[1, 0] < d[1, 100] < d[1, 200]


def test_a_slope_facing_away_from_a_low_sun_gets_no_direct_light():
    z = np.tile(np.arange(10, dtype=np.float64) * 20.0 * np.tan(np.radians(10.0)), (3, 1))  # rises to the right
    level = Level(z, 20.0, 4.5, 1.0)
    assert (im.direct_cosine(level, bearing_deg=90.0, el_deg=2.0)[:, 1:-1] == 0.0).all()  # the Sun to the right, behind the rise
    assert (im.direct_cosine(level, bearing_deg=270.0, el_deg=2.0)[:, 1:-1] > 0.2).all()


def test_a_pixel_counts_as_lit_when_at_least_half_as_bright_as_sunlight_would_make_it():
    # Sunlit pixels give 0.2 of brightness per unit of the Sun's cosine, shadowed ones a hundredth of that; one pixel
    # is three quarters lit, one a third, and one faces the Sun too obliquely to tell.
    expected = np.array([0.1, 0.2, 0.05, 0.3, 0.1, 0.2, 0.05, 0.1, 0.1, 0.001])
    per_unit = np.array([0.2, 0.2, 0.2, 0.2, 0.002, 0.002, 0.003, 0.15, 0.0667, 0.2])
    seen, ratio, usable, k = im.classify_by_ratio(expected * per_unit, expected, min_expected=0.01)
    assert k == pytest.approx(0.2)
    assert usable.tolist() == [True] * 9 + [False]
    assert ratio[:9] == pytest.approx([1.0, 1.0, 1.0, 1.0, 0.01, 0.01, 0.015, 0.75, 0.3335])
    assert seen.tolist() == [True, True, True, True, False, False, False, True, False, False]


def test_the_scale_of_sunlight_can_be_taken_from_ground_known_to_be_sunlit():
    # Faint light from the slopes around a deep shadow (0.01 a unit) outnumbers the sunlit ground (0.15): told which
    # pixels are sunlit, the scale is theirs whatever the rest look like.
    expected = np.full(10, 0.05)
    per_unit = np.array([0.15, 0.14, 0.16, 0.01, 0.012, 0.011, 0.009, 0.01, 0.0005, 0.0004])
    sunlit = np.array([1, 1, 1, 0, 0, 0, 0, 0, 0, 0], dtype=bool)
    seen, _, _, k = im.classify_by_ratio(expected * per_unit, expected, min_expected=0.01, sunlit=sunlit)
    assert k == pytest.approx(0.15)
    assert seen.tolist() == [True] * 3 + [False] * 7


def test_the_scale_of_sunlight_comes_from_the_bright_group_even_when_most_ground_is_dark():
    # A low Sun: three sunlit pixels against seven in shadow lit faintly by the slopes around them.
    expected = np.full(10, 0.05)
    per_unit = np.array([0.15, 0.14, 0.16, 0.01, 0.012, 0.011, 0.009, 0.01, 0.013, 0.008])
    seen, _, _, k = im.classify_by_ratio(expected * per_unit, expected, min_expected=0.01)
    assert k == pytest.approx(0.15)
    assert seen.sum() == 3


def test_an_edge_pixel_has_both_lit_and_dark_ground_next_to_it():
    m = np.zeros((5, 5), dtype=bool)
    m[:, 3:] = True
    e = im.edge_pixels(m)
    assert e[:, 2].all() and e[:, 3].all()
    assert not e[:, 0].any() and not e[:, 4].any()


def test_the_comparison_also_says_how_much_of_the_lit_ground_the_app_finds():
    pred = np.array([1, 1, 1, 0, 0, 0, 1, 1], dtype=bool)
    seen = np.array([1, 1, 0, 0, 0, 1, 1, 1], dtype=bool)
    assert im.compare_masks(pred, seen)["light_found"] == pytest.approx(4 / 5)


def test_disagreement_next_to_a_shadows_edge_is_told_apart_from_disagreement_inside_one():
    # The app's shadow edge one column out: every pixel they disagree on sits on an edge.
    pred = np.zeros((6, 6), dtype=bool)
    pred[:, 3:] = True
    seen = pred.copy()
    seen[:, 2] = True
    usable = np.ones_like(pred)
    assert im.near_edge_share(pred, seen, usable) == pytest.approx(1.0)
    # A band two pixels wide lit in the picture, deep inside the app's shadow: its inner column touches the band's own
    # edge in the picture, its outer column touches no edge at all.
    pred = np.zeros((6, 8), dtype=bool)
    pred[:, 6:] = True
    seen = pred.copy()
    seen[:, 0:2] = True
    usable = np.ones_like(pred)
    assert im.near_edge_share(pred, seen, usable) == pytest.approx(6 / 12)
    assert im.near_edge_share(pred, seen, usable, picture_edges=False) == pytest.approx(0.0)


def test_the_movie_listing_gives_the_frame_names_in_a_month():
    xml = (
        "<ListBucketResult><Contents><Key>a/WAC_POLE_MOVIE_SOUTH/WAC_MOVIE_S20090920T0850.IMG</Key></Contents>"
        "<Contents><Key>a/WAC_POLE_MOVIE_SOUTH/WAC_MOVIE_S20090920T0850.xml</Key></Contents>"
        "<Contents><Key>a/WAC_POLE_MOVIE_SOUTH/WAC_MOVIE_S20090920T1237.IMG</Key></Contents></ListBucketResult>"
    )
    assert im.frames_in_listing(xml) == ["S20090920T0850", "S20090920T1237"]


def test_a_picture_meets_the_rule_with_enough_agreement_and_enough_of_both_kinds_of_ground_found():
    good = {"agree": 0.9, "light_found": 0.85, "shadow_found": 0.95}
    assert im.passes(good)
    assert not im.passes({**good, "agree": 0.84})
    assert not im.passes({**good, "light_found": 0.79})
    assert not im.passes({**good, "shadow_found": 0.5})
    # a picture with no dark ground in it is judged on the rest
    assert im.passes({**good, "shadow_found": None})


def _row(site, agree, light, shadow, el=1.0, camera="WAC"):
    return {
        "site_id": site, "camera": camera, "mid_utc": "2009-09-20T08:54:02", "sun_el_deg": el, "pixels": 100, "km2": 1.0,
        "agree": agree, "light_found": light, "shadow_found": shadow, "shadow_confirmed": 0.8, "majority": 0.6,
        "disagree_on_edges": 0.95, "agree_sun_turned_90": 0.5,
    }


def test_the_table_says_whether_every_picture_meets_the_rule_and_counts_what_it_covers():
    sites = [{"site_id": "a"}, {"site_id": "b"}, {"site_id": "c"}]
    rows = [_row("a", 0.9, 0.9, 0.99), _row("b", 0.95, 0.95, 0.97, el=4.0), _row("a", 0.86, 0.74, 0.96, el=0.54, camera="NAC")]
    doc = im.build_doc(rows, sites, {})
    ev = doc["evidence"]
    assert ev["kind"] == "check" and ev["meets_criteria"] is False
    assert ev["coverage"]["sites"] == ["a", "b"]
    assert (ev["coverage"]["pictures"], ev["coverage"]["wac_pictures"], ev["coverage"]["nac_pictures"]) == (3, 2, 1)
    assert ev["coverage"]["sun_el_deg"] == [0.54, 4.0]
    assert doc["summary"]["pictures_meeting_rule"] == 2
    assert doc["summary"]["median_agree"] == 0.9
    assert ev["criteria"]["min_agree"] == im.RULE_AGREE and ev["criteria"]["min_found"] == im.RULE_FOUND
    assert im.build_doc(rows[:2], sites, {})["evidence"]["meets_criteria"] is True
