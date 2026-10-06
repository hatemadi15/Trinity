import json
import zlib

import numpy as np
import pytest

from lunar_pipeline import config
from lunar_pipeline.terrain3d import encode_u16, window_for_site, write_all, write_site_window, write_south_cap
from lunar_pipeline.sites import Site, all_sites
from tests.conftest import needs_lola


def test_encode_u16_roundtrip_and_scale():
    h = np.array([[-1200.0, 0.0], [350.5, 2400.0]])
    payload, meta = encode_u16(h)
    dn = np.frombuffer(zlib.decompress(payload), dtype="<u2").reshape(2, 2)
    back = meta["min_m"] + dn.astype(np.float64) * meta["scale_m_per_unit"]
    assert meta["min_m"] == -1200.0 and meta["max_m"] == 2400.0
    assert np.allclose(back, h, atol=meta["scale_m_per_unit"])
    assert meta["scale_m_per_unit"] == pytest.approx(3600.0 / 65535.0)


@pytest.mark.data
@needs_lola
def test_window_for_site_picks_grid_by_latitude():
    from lunar_pipeline.masks import load_grids

    grids = load_grids()
    deep = next(s for s in all_sites() if s.id == "shackleton_center")
    g, row0, col0, size = window_for_site(deep, grids)
    assert g.label.map_scale_m == 20.0 and size == 1024
    mid = next(s for s in all_sites() if s.id == "im2_athena")
    g2, _, _, size2 = window_for_site(mid, grids)
    assert g2.label.map_scale_m == 80.0 and size2 == 512


@pytest.mark.data
@needs_lola
def test_site_window_has_site_at_centre_and_is_deep_for_shackleton(tmp_path):
    from lunar_pipeline.masks import load_grids

    grids = load_grids()
    site = next(s for s in all_sites() if s.id == "shackleton_center")
    path = write_site_window(site, grids, tmp_path)
    meta = json.loads(path.with_suffix(".json").read_text())
    dn = np.frombuffer(zlib.decompress(path.read_bytes()), dtype="<u2").reshape(meta["height"], meta["width"])
    h = meta["min_m"] + dn.astype(np.float64) * meta["scale_m_per_unit"]
    centre = h[meta["height"] // 2, meta["width"] // 2]
    assert abs(centre - meta["site_height_m"]) < 5.0
    assert h.max() - centre > 2000.0  # crater floor at the centre, rim inside a 10 km window
    assert meta["cell_m"] == 20.0 and meta["width"] == 1024


@pytest.mark.data
@needs_lola
def test_south_cap_downsample(tmp_path):
    path = write_south_cap(tmp_path, factor=4)
    meta = json.loads(path.with_suffix(".json").read_text())
    assert meta["width"] == 1940 and meta["cell_m"] == 960.0
    assert meta["lat"] == -90.0


@pytest.mark.data
@needs_lola
def test_write_all_manifest(tmp_path):
    manifest = json.loads(write_all(tmp_path).read_text())
    ids = {w["site_id"] for w in manifest["windows"]}
    assert {"shackleton_center", "im1_odysseus", "south_pole"} <= ids
    assert manifest["cap"]["file"] == "south_cap.u16"
    assert manifest["globe_texture"] == "lroc_color_2k.jpg"


def test_write_site_context_cuts_80_m_around_a_20_m_site(synthetic_grid_factory, tmp_path):
    from lunar_pipeline.terrain3d import CONTEXT_PX, write_site_context

    grids = {"L0": synthetic_grid_factory(2048, 20.0), "L1": synthetic_grid_factory(1024, 80.0), "L2": synthetic_grid_factory(512, 240.0)}
    site = Site(id="deep", name="Deep", lat=-89.9, lon=10.0, category="test", polar=True, source="test")
    path = write_site_context(site, grids, tmp_path)
    assert path is not None and path.name == "deep.context.u16"
    meta = json.loads(path.with_suffix(".json").read_text())
    assert meta["kind"] == "context" and meta["level"] == "L1" and meta["cell_m"] == 80.0
    assert meta["width"] == meta["height"] == CONTEXT_PX
    assert abs(meta["site_col_px"] - CONTEXT_PX // 2) <= 1 and abs(meta["site_row_px"] - CONTEXT_PX // 2) <= 1


def test_write_site_context_is_none_for_an_80_m_site(synthetic_grid_factory, tmp_path):
    from lunar_pipeline.terrain3d import write_site_context

    grids = {"L0": synthetic_grid_factory(256, 20.0), "L1": synthetic_grid_factory(256, 80.0), "L2": synthetic_grid_factory(256, 240.0)}
    site = Site(id="far", name="Far", lat=-85.0, lon=10.0, category="test", polar=True, source="test")
    assert write_site_context(site, grids, tmp_path) is None


def test_write_site_flight_cuts_240_m_round_the_site(synthetic_grid_factory, tmp_path):
    from lunar_pipeline.terrain3d import FLIGHT_PX, write_site_flight

    grids = {"L0": synthetic_grid_factory(256, 20.0), "L1": synthetic_grid_factory(256, 80.0), "L2": synthetic_grid_factory(2048, 240.0, fill_dn=300)}
    site = Site(id="hero", name="Hero", lat=-88.28, lon=-64.31, category="test", polar=True, source="test")
    path = write_site_flight(site, grids, tmp_path)
    assert path.name == "hero.flight.u16"
    meta = json.loads(path.with_suffix(".json").read_text())
    assert meta["kind"] == "flight" and meta["level"] == "L2" and meta["cell_m"] == 240.0
    assert meta["width"] == meta["height"] == FLIGHT_PX
    assert abs(meta["site_col_px"] - FLIGHT_PX // 2) <= 1 and abs(meta["site_row_px"] - FLIGHT_PX // 2) <= 1
    heights = np.frombuffer(zlib.decompress(path.read_bytes()), dtype="<u2")
    assert heights.size == FLIGHT_PX * FLIGHT_PX
    # 300 DN at 0.5 m a unit: the whole cut lies inside the synthetic grid, so every cell is measured.
    assert meta["fill_px"] == 0
    assert meta["min_m"] == pytest.approx(150.0) and meta["max_m"] == pytest.approx(150.0)


def test_flight_sites_are_the_arrivals():
    from lunar_pipeline.home_assets import HERO_SITE
    from lunar_pipeline.terrain3d import FLIGHT_SITES

    assert FLIGHT_SITES == (HERO_SITE,)


@pytest.mark.data
@needs_lola
def test_write_all_names_the_flight_level_of_the_arrivals_site(tmp_path):
    manifest = json.loads(write_all(tmp_path).read_text())
    assert manifest["version"] == 3
    hero = next(w for w in manifest["windows"] if w["site_id"] == "de_gerlache_rim_2")
    assert hero["flight"]["file"] == "de_gerlache_rim_2.flight.u16"
    assert hero["flight"]["cell_m"] == 240.0
    assert all("flight" not in w for w in manifest["windows"] if w["site_id"] != "de_gerlache_rim_2")
