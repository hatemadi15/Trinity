import json

import numpy as np

from lunar_pipeline.tiles import NODATA, TILE, cut_grid, decode_tile, encode_tile


def test_encode_decode_roundtrip():
    block = (np.arange(TILE * TILE, dtype=np.int32) % 5000 - 2500).astype(np.int16).reshape(TILE, TILE)
    assert np.array_equal(decode_tile(encode_tile(block)), block)


def test_cut_grid_pads_and_indexes(synthetic_grid_factory, tmp_path):
    grid = synthetic_grid_factory(size=1100, scale_m=20.0)
    grid.data[:] = (np.arange(1100 * 1100) % 3000).astype(np.int16).reshape(1100, 1100)
    entry = cut_grid(grid, "L9", tmp_path)
    assert entry["tiles_x"] == 3 and entry["tiles_y"] == 3 and entry["map_scale_m"] == 20.0
    assert entry["line_offset_px"] == 549.5 and entry["sample_offset_px"] == 549.5
    tile = decode_tile((tmp_path / "L9" / "2_2.bin").read_bytes())
    assert np.array_equal(tile[:76, :76], grid.data[1024:1100, 1024:1100])
    assert np.all(tile[76:, :] == NODATA) and np.all(tile[:, 76:] == NODATA)
    tile0 = decode_tile((tmp_path / "L9" / "0_1.bin").read_bytes())
    assert np.array_equal(tile0, grid.data[0:512, 512:1024])
    assert json.loads((tmp_path / "L9" / "level.json").read_text())["id"] == "L9"
