import json

import numpy as np
import pytest

from lunar_pipeline import config
from lunar_pipeline.masks import bands_for_site, load_grids, load_mask, mask_for_site, write_masks
from lunar_pipeline.sites import Site, all_sites
from tests.conftest import needs_lola


def _site(sid):
    return next(s for s in all_sites() if s.id == sid)


@pytest.mark.data
@needs_lola
def test_band_selection_by_latitude():
    grids = load_grids()
    deep = bands_for_site(_site("shackleton_center"), grids)
    assert [b.grid.label.map_scale_m for b in deep] == [20.0, 80.0, 240.0]
    mid = bands_for_site(_site("im2_athena"), grids)  # -84.79: outside the 87.5S 20 m grid
    assert [b.grid.label.map_scale_m for b in mid] == [80.0, 240.0]
    assert mid[0].r_min_m == 40.0 and mid[0].step_m == 20.0


@pytest.mark.data
@needs_lola
def test_crater_floor_sees_high_horizon_and_rim_sees_low(tmp_path):
    grids = load_grids()
    floor = mask_for_site(_site("shackleton_center"), grids)
    rim = mask_for_site(_site("shackleton_center_rim_high"), grids)
    assert len(floor["elevation_deg"]) == 720
    assert float(np.mean(floor["elevation_deg"])) > 8.0
    assert float(np.mean(rim["elevation_deg"])) < 4.0
    assert max(rim["elevation_deg"]) < 15.0 and min(rim["elevation_deg"]) > -5.0


@pytest.mark.data
@needs_lola
def test_write_and_load_mask_roundtrip(tmp_path):
    paths = write_masks(["south_pole"], out_dir=tmp_path)
    doc = json.loads(paths[0].read_text())
    assert doc["site_id"] == "south_pole" and doc["az_step_deg"] == 0.5 and doc["mast_m"] == 2.0
    mask = load_mask("south_pole", masks_dir=tmp_path)
    assert mask.shape == (720,) and np.all(np.isfinite(mask))


@pytest.mark.data
@needs_lola
def test_site_near_grid_edge_gets_coarser_fallback_band():
    # Review Focus 1: IM-1 sits 4 km inside the 80S grid; the 80 m band runs off its grid to the
    # north, so those distances must be re-marched on the 240 m grid instead of dropping to -90.
    grids = load_grids()
    doc = mask_for_site(_site("im1_odysseus"), grids)
    fallback = doc["fallback_bands"]
    assert fallback and fallback[0]["grid"] == "ldem_60s_240m" and fallback[0]["r_max_m"] == 100000.0
    assert 3000.0 < fallback[0]["r_min_m"] < 6000.0
    assert min(doc["elevation_deg"]) > -0.5  # -1.016 without the fallback
    assert mask_for_site(_site("shackleton_center"), grids)["fallback_bands"] == []


def test_write_masks_rejects_unknown_site(tmp_path):
    with pytest.raises(ValueError, match="no_such_site"):
        write_masks(["no_such_site"], out_dir=tmp_path)
