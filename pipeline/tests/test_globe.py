import json
import zlib

import numpy as np
import pytest

from lunar_pipeline import config, globe
from lunar_pipeline.cli import build_parser
from lunar_pipeline.fetch import assets


def test_heights_from_dn_are_metres_above_the_reference_sphere():
    # ldem_*_uint: half-metres above 1727.4 km; the reference sphere is 1737.4 km.
    assert globe.heights_from_dn(np.array([20000, 0])) == pytest.approx([0.0, -10000.0])


def test_normal_map_points_up_on_level_ground_and_away_from_a_rise():
    flat = globe.normal_map(np.zeros((90, 180)))
    assert (flat[..., 0] == 128).all() and (flat[..., 1] == 128).all() and (flat[..., 2] == 255).all()
    # A rise of 1 in 2 to the east at the equator: n = (-0.447, 0, 0.894), so red = (1 - 0.447) * 127.5.
    east_m = config.R_MOON_M * 2 * np.pi / 180
    ramp = np.tile(np.arange(180) * 0.5 * east_m, (90, 1))
    assert globe.normal_map(ramp)[45, 90, 0] == pytest.approx(70.5, abs=1.5)
    # A rise of 1 in 2 to the north tips it south: green falls the same way.
    north_m = config.R_MOON_M * np.pi / 90
    north = np.tile((np.arange(90)[::-1] * 0.5 * north_m)[:, None], (1, 180))
    assert globe.normal_map(north)[45, 90, 1] == pytest.approx(70.5, abs=1.5)


def test_normal_map_keeps_the_polar_rows_calm():
    # 50 m of noise: near the poles a degree of longitude is a few hundred metres, so without a floor on the
    # east spacing the first and last rows would tilt by several degrees.
    n = globe.normal_map(np.random.default_rng(1).normal(0, 50, (90, 180))).astype(float) / 127.5 - 1.0
    assert np.isfinite(n).all()
    assert np.abs(n[[0, -1], :, 0]).max() < 0.02


def test_albedo_scale_brings_the_south_cap_to_the_regolith_albedo():
    rgb = np.full((180, 360, 3), 200, dtype=np.uint8)
    rgb[-20:] = 120  # rows 160 to 179: every row south of 80 S is 120
    expected = 0.17 / globe.srgb_to_linear(np.array([120]))[0]
    assert globe.albedo_scale(rgb) == pytest.approx(expected, rel=1e-3)


def _tif(path, data):
    import rasterio

    bands = data[None] if data.ndim == 2 else np.moveaxis(data, -1, 0)
    with rasterio.open(path, "w", driver="GTiff", width=bands.shape[2], height=bands.shape[1], count=bands.shape[0], dtype=bands.dtype) as dst:
        dst.write(bands)


def test_build_writes_the_maps_the_heights_and_the_manifest(tmp_path, monkeypatch):
    raw, out = tmp_path / "raw", tmp_path / "out"
    raw.mkdir()
    _tif(raw / globe.COLOR_SRC, np.full((256, 512, 3), 150, dtype=np.uint8))
    _tif(raw / globe.LDEM_SRC, np.full((360, 720), 20000, dtype=np.uint16))
    monkeypatch.setattr(globe, "SIZES", {"1k": (64, 128), "4k": (128, 256)})
    monkeypatch.setattr(globe, "HEIGHTS_SHAPE", (90, 180))
    m = json.loads(globe.build(raw, out).read_text())
    assert m["color"] == {"1k": "moon_color_1k.jpg", "4k": "moon_color_4k.jpg"}
    assert m["normal"] == {"1k": "moon_normal_1k.jpg", "4k": "moon_normal_4k.jpg"}
    assert m["albedo_scale"] > 0 and m["radius_m"] == config.R_MOON_M
    meta = json.loads((out / m["heights"]["meta"]).read_text())
    dn = np.frombuffer(zlib.decompress((out / m["heights"]["file"]).read_bytes()), dtype="<u2")
    assert (meta["width"], meta["height"]) == (180, 90) and dn.size == 180 * 90
    assert meta["min_m"] == pytest.approx(0.0, abs=1e-6)
    import rasterio

    with rasterio.open(out / "moon_color_4k.jpg") as ds:
        assert (ds.width, ds.height, ds.count) == (256, 128, 3)
    assert not list(out.glob("*.aux.xml"))


def test_fetch_and_the_command_line_know_the_globe():
    found = [a for a in assets() if a.group == "globe"]
    assert {a.name for a in found} == {globe.COLOR_SRC, globe.LDEM_SRC}
    assert all(a.url == globe.SVS + a.name and a.dest_dir == globe.RAW for a in found)
    assert build_parser().parse_args(["globe"]).cmd == "globe"
    assert build_parser().parse_args(["fetch", "--group", "globe"]).group == ["globe"]
