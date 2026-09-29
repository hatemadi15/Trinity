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
