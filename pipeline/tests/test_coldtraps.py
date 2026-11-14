"""The cold-trap layer: Diviner's polar resource product read and measured around each polar site."""

from __future__ import annotations

import json
import zipfile

import numpy as np
import pytest

from lunar_pipeline import coldtraps as ct
from lunar_pipeline.config import R_MOON_M
from lunar_pipeline.geometry import ps_south_latlon_deg, ps_south_xy_m


def record(v1, v2, v3, clon, clat, calt, tavg, tmax, ice) -> str:
    """One 210-byte record laid out as the product's label says: fixed widths joined by ", ", CRLF at the end."""
    fields = [f"{a:12.5f}" for a in (*v1, *v2, *v3)]
    fields += [f"{clon:15.9f}", f"{clat:15.9f}", f"{calt:15.9f}", f"{tavg:8.3f}", f"{tmax:8.3f}", f"{ice:11.5f}"]
    line = ", ".join(fields) + "\r\n"
    assert len(line) == 210
    return line


def vertex_km(x_m: float, y_m: float, height_km: float = 0.0) -> tuple[float, float, float]:
    """A Moon-centred vertex (km) at a polar stereographic point."""
    lat, lon = ps_south_latlon_deg(x_m, y_m)
    lat, lon = np.radians(float(lat)), np.radians(float(lon))
    r = R_MOON_M / 1000.0 + height_km
    return (r * np.cos(lat) * np.cos(lon), r * np.cos(lat) * np.sin(lon), r * np.sin(lat))


def prp_zip(tmp_path, triangles) -> str:
    """A zip holding a table of `triangles`, each ((x, y) three times in metres, tavg, tmax, ice), after a header record."""
    header = ("header".rjust(208) + "\r\n")
    lines = [header]
    for (a, b, c), tavg, tmax, ice in triangles:
        cx, cy = (a[0] + b[0] + c[0]) / 3.0, (a[1] + b[1] + c[1]) / 3.0
        clat, clon = ps_south_latlon_deg(cx, cy)
        lines.append(record(vertex_km(*a), vertex_km(*b), vertex_km(*c), float(clon), float(clat), 0.0, tavg, tmax, ice))
    path = tmp_path / "dlre_prp_south.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("dlre_prp_south.tab", "".join(lines))
    return str(path)


def square(x0, y0, side, tavg, tmax, ice):
    """Two triangles that tile a square whose lower-left corner is (x0, y0), both with the same values."""
    a, b, c, d = (x0, y0), (x0 + side, y0), (x0 + side, y0 + side), (x0, y0 + side)
    return [((a, b, c), tavg, tmax, ice), ((a, c, d), tavg, tmax, ice)]


class TestIceDepthCodes:
    def test_minus_one_counts_as_stable_at_the_surface_all_year(self):
        depth = np.array([-1.0, 0.0, 0.3, 0.7, 2.0, -999.0])
        assert ct.at_surface(depth).tolist() == [True, True, False, False, False, False]
        assert ct.at_surface_all_year(depth).tolist() == [True, False, False, False, False, False]

    def test_buried_within_a_depth_includes_the_surface_and_never_the_too_deep_code(self):
        depth = np.array([-1.0, 0.0, 0.3, 0.5, 0.7, 2.0, -999.0])
        assert ct.within_depth(depth, 0.5).tolist() == [True, True, True, True, False, False, False]
        assert ct.within_depth(depth, 1.0).tolist() == [True, True, True, True, True, False, False]

    def test_a_missing_value_is_never_counted(self):
        depth = np.array([np.nan, -1.0])
        assert ct.at_surface(depth).tolist() == [False, True]
        assert ct.within_depth(depth, 0.5).tolist() == [False, True]


class TestSublimation:
    def test_exposed_ice_loses_one_kilogram_a_square_metre_per_billion_years_near_101_k(self):
        # The product's own rate; with Marti and Mauersberger's vapour pressure it is reached at 101.27 K.
        assert ct.stability_temperature_k() == pytest.approx(101.27, abs=0.02)
        assert ct.sublimation_kg_m2_per_gyr(101.27) == pytest.approx(1.0, rel=0.01)

    def test_the_rate_grows_steeply_with_temperature(self):
        # At the 110 K cold-trap convention ice already sublimates about a hundred times faster.
        assert 100.0 < ct.sublimation_kg_m2_per_gyr(110.0) < 150.0


class TestReadPrp:
    def test_reads_the_fixed_width_table_from_its_zip(self, tmp_path):
        tri = ((0.0, 3000.0), (500.0, 3000.0), (0.0, 3500.0))
        path = prp_zip(tmp_path, [(tri, 45.5, 66.25, -1.0), (tri, 120.0, 250.0, 0.125)])
        prp = ct.read_prp(path)
        assert prp.tmax.tolist() == [66.25, 250.0]
        assert prp.tavg.tolist() == [45.5, 120.0]
        assert prp.ice.tolist() == [-1.0, 0.125]
        # The triangle's corners come back in polar stereographic metres, and its area from the 3D corners.
        np.testing.assert_allclose(prp.vx[0], [0.0, 500.0, 0.0], atol=0.01)
        np.testing.assert_allclose(prp.vy[0], [3000.0, 3000.0, 3500.0], atol=0.01)
        assert prp.area_km2[0] == pytest.approx(0.125, rel=1e-3)
        cx, cy = ps_south_xy_m(*ps_south_latlon_deg(500.0 / 3.0, 9500.0 / 3.0))
        assert prp.x[0] == pytest.approx(float(cx), abs=0.01)
        assert prp.y[0] == pytest.approx(float(cy), abs=0.01)

    def test_keeps_corners_only_for_the_triangles_asked_for(self, tmp_path):
        near, far = ((0.0, 0.0), (500.0, 0.0), (0.0, 500.0)), ((90_000.0, 0.0), (90_500.0, 0.0), (90_000.0, 500.0))
        path = prp_zip(tmp_path, [(near, 40.0, 60.0, -1.0), (far, 40.0, 60.0, -1.0)])
        prp = ct.read_prp(path, keep=lambda x, y: np.hypot(x, y) < 10_000.0)
        assert prp.tmax.size == 1
        assert prp.x[0] < 1000.0


class TestMinusOneEvidence:
    def test_says_whether_the_annual_maximum_temperature_alone_separates_minus_one_from_zero(self):
        prp = ct.Prp.of(tmax=np.array([60.0, 101.299, 101.301, 129.9, 150.0]), ice=np.array([-1.0, -1.0, 0.0, 0.0, 0.02]))
        ev = ct.minus_one_evidence(prp)
        assert ev["minus_one"] == {"triangles": 2, "tmax_min_K": 60.0, "tmax_max_K": 101.299}
        assert ev["zero"]["tmax_min_K"] == 101.301
        assert ev["separated_by_tmax"] is True
        assert ev["exceptions"] == 0
        assert ev["stability_temperature_K"] == pytest.approx(101.27, abs=0.02)

    def test_counts_the_triangles_that_break_the_rule(self):
        prp = ct.Prp.of(tmax=np.array([60.0, 105.0, 101.0]), ice=np.array([-1.0, -1.0, 0.0]))
        ev = ct.minus_one_evidence(prp)
        assert ev["separated_by_tmax"] is False
        assert ev["exceptions"] == 2


class TestRasterize:
    def test_fills_the_cells_whose_centres_lie_in_a_triangle_and_leaves_the_rest_empty(self, tmp_path):
        # A square of two triangles, 1 km on a side, on a 100 m grid of 2 km.
        path = prp_zip(tmp_path, square(0.0, 0.0, 1000.0, 50.0, 70.0, -1.0))
        prp = ct.read_prp(path)
        grid = ct.rasterize(prp, x0=-500.0, y0=1500.0, cell_m=100.0, shape=(20, 20))
        filled = np.isfinite(grid.tmax)
        assert filled.sum() == 100  # 10 by 10 cells of the square
        assert np.all(grid.tmax[filled] == 70.0)
        assert np.all(grid.ice[filled] == -1.0)
        assert np.all(grid.tavg[filled] == 50.0)
        # The square's columns 5 to 14 and rows 5 to 14 (y from 1000 m down to 0).
        assert filled[5:15, 5:15].all() and not filled[:5].any() and not filled[:, 15:].any()


def flat_site(**over):
    """A site at the pole on a 100 m grid of 12 km with no cold ground and no shadow, slope 2°."""
    n = 121
    base = {
        "x0": -6050.0,
        "y0": 6050.0,
        "cell_m": 100.0,
        "tmax": np.full((n, n), 250.0),
        "tavg": np.full((n, n), 150.0),
        "ice": np.full((n, n), -999.0),
        "psr": np.zeros((n, n), dtype=bool),
        "slope": np.full((n, n), 2.0),
    }
    base.update(over)
    return ct.SiteGrid(**base)


class TestMeasure:
    def test_counts_areas_within_each_radius_and_the_nearest_ground_of_each_kind(self):
        g = flat_site()
        # A cold patch 2 km east of the site: 3 by 3 cells (0.09 km²), stable at the surface all year, shadowed.
        g.tmax[59:62, 79:82] = 80.0
        g.ice[59:62, 79:82] = -1.0
        g.psr[59:62, 79:82] = True
        # Buried ice 300 m west, 0.2 m down, under warm ground.
        g.ice[60, 57] = 0.2
        m = ct.measure(0.0, 0.0, g, radii_km=(1.0, 5.0), search_km=6.0)
        assert m["within_km"]["1"]["below_110K_km2"] == 0.0
        assert m["within_km"]["5"]["below_110K_km2"] == pytest.approx(0.09)
        assert m["within_km"]["5"]["psr_km2"] == pytest.approx(0.09)
        assert m["within_km"]["5"]["ice_surface_km2"] == pytest.approx(0.09)
        assert m["within_km"]["5"]["ice_surface_all_year_km2"] == pytest.approx(0.09)
        assert m["within_km"]["1"]["ice_within_0_5m_km2"] == pytest.approx(0.01)
        assert m["within_km"]["5"]["ice_within_0_5m_km2"] == pytest.approx(0.10)
        assert m["nearest"]["below_110K"]["km"] == pytest.approx(1.9)
        assert m["nearest"]["ice_within_0_5m"]["km"] == pytest.approx(0.3)
        assert m["nearest"]["psr"]["km"] == pytest.approx(1.9)
        assert m["coldest_within_5km_K"] == 80.0
        # All the cold ground is shadowed, and all the shadow cold.
        assert m["cold_in_psr_share_5km"] == 1.0
        assert m["psr_cold_share_5km"] == 1.0
        assert m["within_km"]["5"]["covered_share"] == 1.0

    def test_gives_the_steepest_slope_on_the_straight_way_to_the_nearest_cold_ground(self):
        g = flat_site()
        g.tmax[60, 80] = 90.0
        g.slope[60, 70] = 24.0  # one steep cell half way, on the line from the site
        g.slope[10, 10] = 40.0  # and a steeper one elsewhere, off the line
        m = ct.measure(0.0, 0.0, g, radii_km=(1.0, 5.0), search_km=6.0)
        assert m["nearest"]["below_110K"]["km"] == pytest.approx(2.0)
        assert m["nearest"]["below_110K"]["slope_max_deg"] == pytest.approx(24.0)

    def test_says_none_when_no_such_ground_lies_within_the_search(self):
        m = ct.measure(0.0, 0.0, flat_site(), radii_km=(1.0, 5.0), search_km=6.0)
        assert m["nearest"]["below_110K"] is None
        assert m["cold_in_psr_share_5km"] is None
        assert m["within_km"]["5"]["below_110K_km2"] == 0.0

    def test_describes_the_ground_at_the_site_itself(self):
        g = flat_site()
        g.tmax[60, 60], g.tavg[60, 60], g.ice[60, 60] = 104.0, 70.0, 0.0
        m = ct.measure(0.0, 0.0, g, radii_km=(1.0, 5.0), search_km=6.0)
        assert m["at_site"] == {"tmax_K": 104.0, "tavg_K": 70.0, "ice_depth_m": 0.0, "ice": "surface"}
        assert m["nearest"]["below_110K"]["km"] == 0.0

    def test_reports_the_share_of_each_circle_the_model_covers(self):
        g = flat_site()
        g.tmax[:, 90:] = np.nan  # the model stops 3 km east of the site
        m = ct.measure(0.0, 0.0, g, radii_km=(1.0, 5.0), search_km=6.0)
        assert m["within_km"]["1"]["covered_share"] == 1.0
        assert 0.8 < m["within_km"]["5"]["covered_share"] < 0.95


class TestDoc:
    def test_names_the_ice_classes_by_their_codes(self):
        assert ct.ice_class(-1.0) == "surface_all_year"
        assert ct.ice_class(0.0) == "surface"
        assert ct.ice_class(0.3) == "buried"
        assert ct.ice_class(-999.0) == "deeper_or_none"

    def test_a_site_outside_the_model_is_listed_with_the_reason(self):
        entry = ct.outside_entry("chandrayaan3_vikram", "Chandrayaan-3 Vikram", -69.3741, 32.32)
        assert entry["covered"] is False
        assert "80° S" in entry["reason"]

    def test_the_overlay_packs_a_mask_into_rows_of_bits(self):
        mask = np.zeros((3, 10), dtype=bool)
        mask[1, 2:5] = True
        entry = ct.overlay_entry("x", mask, x0=-15.0, y0=15.0, cell_m=10.0)
        assert entry["width"] == 10 and entry["height"] == 3 and entry["cell_m"] == 10.0
        back = ct.unpack_overlay(entry)
        assert back.tolist() == mask.tolist()

    def test_writes_compact_json(self, tmp_path):
        path = ct.write_doc({"version": 1, "sites": []}, tmp_path, "coldtraps.json")
        assert json.loads(path.read_text()) == {"version": 1, "sites": []}
        assert path.read_text().endswith("\n")


@pytest.mark.data
@pytest.mark.skipif(not ct.PRP_ZIP.exists(), reason="run: uv run python -m lunar_pipeline.cli coldtraps (downloads the Diviner zip)")
def test_in_the_real_table_minus_one_is_exactly_the_ground_below_101_3_k_at_its_warmest():
    prp = ct.read_prp(ct.PRP_ZIP, corners=False)
    ev = ct.minus_one_evidence(prp)
    assert ev["triangles"] == 2_880_000
    assert ev["separated_by_tmax"] is True and ev["exceptions"] == 0
    assert ev["minus_one"]["tmax_max_K"] < 101.3 < ev["zero"]["tmax_min_K"]
