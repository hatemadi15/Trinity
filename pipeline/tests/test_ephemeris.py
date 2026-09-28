import numpy as np
import pytest
import spiceypy as spice

from lunar_pipeline import ephemeris
from lunar_pipeline.spice_env import spice_kernels
from tests.conftest import needs_kernels


@needs_kernels
def test_small_table_is_physical():
    table, t0_et = ephemeris.build_table(n_steps=48)
    assert table.shape == (48, 2, 3) and table.dtype == np.float32
    sun, earth = table[:, 0, :].astype(float), table[:, 1, :].astype(float)
    sun_r = np.linalg.norm(sun, axis=1)
    earth_r = np.linalg.norm(earth, axis=1)
    assert np.all((sun_r > 0.97 * 149_597_870.7) & (sun_r < 1.03 * 149_597_870.7))
    assert np.all((earth_r > 356_000) & (earth_r < 407_000))
    subsolar_lat = np.degrees(np.arcsin(sun[:, 2] / sun_r))
    subearth_lat = np.degrees(np.arcsin(earth[:, 2] / earth_r))
    assert np.all(np.abs(subsolar_lat) < 1.6)
    assert np.all(np.abs(subearth_lat) < 8.0)


@needs_kernels
def test_interp_matches_spice_at_half_steps():
    table, t0_et = ephemeris.build_table(n_steps=12)
    with spice_kernels():
        for i in (2, 5, 8):
            et = t0_et + (i + 0.5) * ephemeris.STEP_S
            got = ephemeris.interp_vectors(table, t0_et, ephemeris.STEP_S, et)
            for row, body in enumerate(("SUN", "EARTH")):
                truth, _ = spice.spkpos(body, et, "MOON_ME", "LT+S", "MOON")
                cos_ang = np.dot(got[row], truth) / (np.linalg.norm(got[row]) * np.linalg.norm(truth))
                assert np.degrees(np.arccos(np.clip(cos_ang, -1, 1))) < 0.002


def test_interp_rejects_out_of_range():
    table = np.zeros((10, 2, 3), dtype=np.float32)
    with pytest.raises(ValueError):
        ephemeris.interp_vectors(table, 0.0, 3600.0, -10.0)
    with pytest.raises(ValueError):
        ephemeris.interp_vectors(table, 0.0, 3600.0, 9 * 3600.0)


@needs_kernels
def test_write_and_load_roundtrip(tmp_path):
    path = ephemeris.write_table(out_dir=tmp_path, n_steps=6)
    table, header = ephemeris.load_table(tmp_path)
    assert path.exists() and table.shape == (6, 2, 3)
    assert header["frame"] == "MOON_ME" and header["n"] == 6 and header["step_s"] == 3600.0
    assert len(header["kernels"]) == 5 and all(len(k["sha256"]) == 64 for k in header["kernels"])
