import numpy as np
import pytest

from lunar_pipeline import illumination as il
from tests.conftest import needs_illum, needs_kernels, needs_lola


def test_disk_fraction_endpoints_and_middle():
    assert il.disk_fraction(np.array([-1.0]), 0.2665)[0] == pytest.approx(0.0)
    assert il.disk_fraction(np.array([1.0]), 0.2665)[0] == pytest.approx(1.0)
    assert il.disk_fraction(np.array([0.0]), 0.2665)[0] == pytest.approx(0.5)
    assert il.disk_fraction(np.array([0.13325]), 0.2665)[0] == pytest.approx(0.8045, abs=1e-3)


def test_sun_radius_at_one_au():
    assert il.sun_radius_deg(np.array([149_597_870.7]))[0] == pytest.approx(0.2665, abs=1e-3)


def test_longest_run():
    assert il.longest_run(np.array([0, 1, 1, 0, 1, 1, 1, 0], dtype=bool)) == 3
    assert il.longest_run(np.zeros(5, dtype=bool)) == 0
    assert il.longest_run(np.ones(5, dtype=bool)) == 5


def test_summarize_on_synthetic_series():
    series = {
        "sun_fraction": np.r_[np.ones(60), np.zeros(40)],
        "earth_visible": np.r_[np.ones(50, dtype=bool), np.zeros(50, dtype=bool)],
    }
    s = il.summarize(series)
    assert s["illum_fraction"] == pytest.approx(0.6) and s["longest_dark_h"] == 40
    assert s["earth_vis_fraction"] == pytest.approx(0.5) and s["longest_earth_gap_h"] == 50
    assert s["joint_fraction"] == pytest.approx(0.5)


@pytest.mark.data
@needs_kernels
@needs_lola
@needs_illum
def test_shackleton_floor_is_dark_and_rim_is_bright():
    floor = il.report("shackleton_center", "2025-01-01", 730)
    rim = il.report("shackleton_center_rim_high", "2025-01-01", 730)
    assert floor["metrics"]["illum_fraction"] < 0.02 and floor["mazarico_avgvisib"] < 0.02
    assert rim["metrics"]["illum_fraction"] > 0.5
    assert abs(rim["metrics"]["illum_fraction"] - rim["mazarico_avgvisib"]) < 0.15
    assert 0.3 < rim["metrics"]["earth_vis_fraction"] < 0.8


def test_report_rejects_unknown_site_with_known_ids():
    with pytest.raises(ValueError, match="shackleton_center"):
        il.report("no_such_site", "2025-01-01", 1)


def test_contact_windows_half_open_runs():
    assert il.contact_windows([0, 1, 1, 0, 0, 1, 0, 1, 1, 1]) == [(1, 3), (5, 6), (7, 10)]
    assert il.contact_windows(np.zeros(3, dtype=bool)) == []


@pytest.mark.data
@needs_kernels
def test_min_el_threshold_reduces_visibility_and_sun_au_is_near_one():
    table, header = il.load_table()
    site = next(s for s in il.all_sites() if s.id == "shackleton_center_rim_high")
    mask = il.load_mask(site.id)
    base = il.hourly_series(site, mask, table, header, "2025-01-01T00:00:00", 24 * 60)
    strict = il.hourly_series(site, mask, table, header, "2025-01-01T00:00:00", 24 * 60, min_el_deg=5.0)
    assert strict["earth_visible"].sum() < base["earth_visible"].sum()
    assert 0.98 < base["sun_au"].min() < base["sun_au"].max() < 1.02
