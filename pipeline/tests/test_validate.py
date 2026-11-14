import numpy as np
import pytest

from lunar_pipeline import config
from lunar_pipeline import validate as va
from lunar_pipeline.lola import GridLabel, LolaGrid
from tests.conftest import needs_illum, needs_kernels, needs_lola

needs_dem85 = pytest.mark.skipif(
    not (config.LOLA_DIR / f"{va.MATCHED_DEM}.img").exists(),
    reason="run: uv run python -m lunar_pipeline.cli validate (it downloads LDEM_85S_20M)",
)

LABEL = '''PDS_VERSION_ID            = "PDS3"
PRODUCT_ID                = "AVGVISIB_TEST"
MISSION_PHASE_NAME        = {"COMMISSIONING","SCIENCE
                              MISSION"}
START_TIME                = 2009-07-13T17:33:17.246
DESCRIPTION               = "This data product is a map of the average
   illumination, by any fraction of the solar
   disc."
OBJECT                    = IMAGE
  DESCRIPTION             = "Each sample is a value."
  MAP_SCALE_NOT_HERE      = 1
  SCALING_FACTOR          = 0.00004
END_OBJECT                = IMAGE
/* A comment line, not a keyword.                                          */
OBJECT                    = IMAGE_MAP_PROJECTION
 MAP_SCALE                    = 60 <m/pix>
 COORDINATE_SYSTEM_NAME       = "MEAN EARTH/POLAR AXIS OF DE421"
END_OBJECT                    = IMAGE_MAP_PROJECTION
END
'''


def test_sunset_sunrise_from_flags():
    # hours 0-4 lit, 5-9 dark, 10-12 lit
    lit = np.array([1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1], dtype=bool)
    assert va.first_transition(lit, start=0, to_dark=True) == 5
    assert va.first_transition(lit, start=5, to_dark=False) == 10
    assert va.first_transition(np.ones(4, dtype=bool), start=0, to_dark=True) is None


def test_a_pds3_label_is_read_by_object_with_multi_line_values_joined():
    lab = va.read_label(LABEL)
    assert lab[""]["PRODUCT_ID"] == "AVGVISIB_TEST"
    assert lab[""]["DESCRIPTION"] == "This data product is a map of the average illumination, by any fraction of the solar disc."
    assert lab[""]["MISSION_PHASE_NAME"] == '{"COMMISSIONING","SCIENCE MISSION"}'
    assert lab[""]["START_TIME"] == "2009-07-13T17:33:17.246"
    # The image's own description does not replace the product's.
    assert lab["IMAGE"]["DESCRIPTION"] == "Each sample is a value."
    assert lab["IMAGE_MAP_PROJECTION"]["MAP_SCALE"] == "60 <m/pix>"
    assert lab["IMAGE_MAP_PROJECTION"]["COORDINATE_SYSTEM_NAME"] == "MEAN EARTH/POLAR AXIS OF DE421"


@pytest.mark.data
@needs_illum
def test_the_reference_label_says_any_part_of_the_disc_counts_and_names_its_frame():
    lab = va.label_summary(config.ILLUM_DIR / f"{va.MAZARICO_PRODUCT}.lbl")
    assert lab["product_id"] == "AVGVISIB_85S_060M_201608"
    assert "by any fraction of the solar disc" in lab["description"]
    assert lab["map_scale"] == "60 <m/pix>" and lab["center_longitude"] == "0 <deg>"
    assert lab["coordinate_system_name"] == "MEAN EARTH/POLAR AXIS OF DE421"
    # The label's START_TIME and STOP_TIME are the span of the altimetry, not the averaging period.
    assert (lab["start_time"], lab["stop_time"]) == ("2009-07-13T17:33:17.246", "2013-07-18T14:12:13")
    assert len(lab["label_sha256"]) == 64 and len(lab["image_sha256"]) == 64
    earth = va.label_summary(config.ILLUM_DIR / f"{va.EARTH_PRODUCT}.lbl")
    assert "Earth disc" in earth["description"]


def test_sixty_metre_posts_are_three_by_three_means_centred_on_the_map_pixels():
    data = np.arange(144, dtype=np.int16).reshape(12, 12)
    label = GridLabel(lines=12, samples=12, map_scale_m=20.0, line_offset_px=5.5, sample_offset_px=5.5,
                      scaling_factor=0.5, offset=1737400.0, max_latitude_deg=-89.9)
    fine = LolaGrid(label, data)
    coarse = va.coarser_grid(fine, 3)
    assert coarse.data.shape == (4, 4) and coarse.label.map_scale_m == 60.0
    assert coarse.data[1, 2] == pytest.approx(data[3:6, 6:9].mean())
    # Each 60 m post sits where the middle 20 m pixel of its block sits, so it lands on a pixel centre of the map.
    for b in range(4):
        assert np.allclose(coarse.latlon_from_pixel(b, b), fine.latlon_from_pixel(3 * b + 1, 3 * b + 1))
    assert coarse.label.sample_offset_px == pytest.approx(1.5)


def test_earth_counts_when_any_part_of_its_disc_clears_the_skyline_and_the_app_waits_for_its_centre():
    above = np.array([-1.2, -0.5, 0.0, 0.3])  # Earth's centre above the skyline (degrees)
    radius = np.full(4, 0.95)
    assert va.earth_any_part(above, radius).tolist() == [False, True, True, True]
    assert va.earth_centre(above).tolist() == [False, False, False, True]


def test_four_pixel_values_combine_with_the_map_readers_own_weights(synthetic_grid_factory):
    grid = synthetic_grid_factory(size=8, scale_m=60.0)
    grid.data[:] = np.arange(64, dtype=np.int16).reshape(8, 8)
    lat, lon = grid.latlon_from_pixel(3.25, 4.6)
    (c0, r0), weights = va.pixel_weights(grid, float(lat), float(lon))
    values = [float(grid.data[r0 + dr, c0 + dc]) * grid.label.scaling_factor for dc, dr in va.CORNERS]
    assert (c0, r0) == (3, 4)
    assert sum(w * v for w, v in zip(weights, values)) == pytest.approx(grid.value_at(float(lat), float(lon)))
    assert sum(weights) == pytest.approx(1.0)


def test_a_zero_map_pixel_among_lit_ones_is_found_and_the_gap_without_it_given():
    map_px, ours = [0.0, 0.27, 0.30, 0.275], [0.29, 0.265, 0.303, 0.271]
    assert va.zero_pixel(map_px, ours) == 0
    # The other three, weighted as before and scaled back to a whole: here plain means.
    assert va.gap_without(map_px, ours, [0.25] * 4, 0) == pytest.approx((np.mean(ours[1:]) - np.mean(map_px[1:])) * 100.0)
    # A dark corner the map and we agree on is no artefact; nor is a zero beside dark neighbours.
    assert va.zero_pixel([0.0, 0.27, 0.30, 0.275], [0.01, 0.265, 0.303, 0.271]) is None
    assert va.zero_pixel([0.0, 0.0, 0.30, 0.275], [0.29, 0.0, 0.303, 0.271]) is None


def test_the_worked_power_cases_agree_with_their_hand_arithmetic():
    doc = va.power_doc(fixtures=False)
    cases = {c["id"]: c for c in doc["cases"]}
    assert len(cases) >= 8
    # 0.3 x 4 m2 x 1361 W/m2: the headline sum anyone can redo.
    assert cases["full_sun"]["expected"]["power_w"][0] == pytest.approx(1633.2, abs=1e-9)
    assert cases["half_disc"]["expected"]["power_w"][0] == pytest.approx(816.6, abs=1e-9)
    night = cases["night_on_a_full_battery"]["expected"]
    assert night["energy_wh"][:3] == pytest.approx([1800.0, 1600.0, 1400.0])
    assert (night["brownout_hours"], night["first_brownout_hour"], night["soc_min"]) == (2, 10, 0.0)
    for c in doc["cases"]:
        assert c["agrees"], c["id"]
        assert c["max_abs_diff_w"] <= doc["evidence"]["criteria"]["tolerance_w"]
        assert c["hand"]
    assert doc["summary"]["cases_agreeing"] == len(doc["cases"])


def test_every_kind_of_evidence_states_what_it_shows_its_coverage_and_its_limits():
    for kind in ("directions", "terrain", "sums", "missions"):
        ev = va.EVIDENCE[kind]
        assert ev["establishes"].endswith(".") and len(ev["limitations"]) >= 2
        assert all(line.endswith(".") for line in ev["limitations"])
    for kind in ("directions", "terrain", "sums"):
        assert va.EVIDENCE[kind]["criteria"]["rule"]
    # The missions are context: no pass rule, and they say what they cannot tell.
    assert va.EVIDENCE["missions"]["criteria"] is None
    assert va.EVIDENCE["missions"]["cannot_tell"]
    assert "not observed sunsets" in " ".join(va.EVIDENCE["missions"]["limitations"])


@pytest.mark.data
@needs_kernels
def test_backcast_for_a_non_polar_site_uses_a_flat_skyline():
    row = va.backcast_row_for("blue_ghost_m1")
    assert row["skyline"] == "flat"
    assert row["sunset_utc"].startswith("2025-03-1")
    assert 300 < row["daylight_hours_after_landing"] < 360
    assert abs(row["end_minus_sunset_h"]) < 12


@pytest.mark.data
@needs_kernels
def test_backcast_im1_ended_before_its_predicted_sunset():
    # Odysseus landed on its side with the panels tilted away and lost power as the Sun got low,
    # about three days before local sunset at the planned site.
    row = va.backcast_row_for("im1_odysseus")
    assert row["skyline"] == "lola"
    assert -96 < row["end_minus_sunset_h"] < 0


@pytest.mark.data
@needs_kernels
@needs_lola
@needs_illum
@needs_dem85
def test_mazarico_rows_skip_uncovered_sites_and_give_every_step_of_the_comparison():
    rows = va.mazarico_rows(days=30, cycle_days=30, site_ids=["im1_odysseus", "shackleton_center", "haworth"])
    by_id = {r["site_id"]: r for r in rows}
    assert by_id["im1_odysseus"]["covered"] is False and "map_fraction" not in by_id["im1_odysseus"]
    floor = by_id["shackleton_center"]
    assert floor["covered"] is True and floor["map_fraction"] < 0.02
    assert floor["sun"]["matched"] == 0.0 and floor["earth"]["matched_any"] == 0.0
    haworth = by_id["haworth"]
    for step in ("app", "surface", "cycle", "matched", "matched_disc_mean", "map"):
        assert 0.0 <= haworth["sun"][step] <= 1.0, step
    assert len(haworth["sun"]["map_pixels"]) == 4 and len(haworth["sun"]["matched_pixels"]) == 4
    # The old field keeps its meaning: the app's own share against the map, in points.
    assert haworth["delta_points"] == pytest.approx((haworth["ours_fraction"] - haworth["map_fraction"]) * 100.0)
    # Any part of Earth's disc is never less often in view than its centre.
    assert haworth["earth"]["matched_any"] >= haworth["earth"]["matched_centre"]


@pytest.mark.data
@needs_kernels
def test_backcast_rows_carry_mission_notes():
    for sid in ("im1_odysseus", "im2_athena", "blue_ghost_m1"):
        row = va.backcast_row_for(sid)
        assert isinstance(row["mission_note"], str) and len(row["mission_note"]) > 20
