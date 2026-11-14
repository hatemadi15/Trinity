import json

import pytest

from lunar_pipeline import config
from lunar_pipeline.fixtures import metrics_fixture, time_pairs, write_metrics_fixture, write_time_fixture
from lunar_pipeline.sync_local import sync
from tests.conftest import needs_illum, needs_kernels, needs_lola


@needs_kernels
def test_time_pairs_are_monotonic_and_offset_by_tdb_minus_utc():
    pairs = time_pairs(n=12)
    assert len(pairs) == 12 and all(p["utc"].endswith(":05") or p["utc"][-2:].isdigit() for p in pairs)
    ets = [p["et"] for p in pairs]
    assert ets == sorted(ets)
    # J2000 = 2000-01-01T12:00:00 TDB; for 2024+ dates TDB-UTC = 69.184 s to within 2 ms.
    from datetime import datetime, timezone
    for p in pairs:
        unix = datetime.strptime(p["utc"], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp()
        assert abs((unix - 946728000.0 + 69.184) - p["et"]) < 0.002


@needs_kernels
def test_write_time_fixture(tmp_path):
    path = write_time_fixture(out=tmp_path / "utc_et.json", n=5)
    doc = json.loads(path.read_text())
    assert doc["tdb_minus_utc_s"] == 69.184 and len(doc["pairs"]) == 5


@pytest.mark.data
@needs_kernels
@needs_lola
@needs_illum  # report() reads the LOLA illumination maps beside our own sums
def test_metrics_fixture_matches_report(tmp_path):
    from lunar_pipeline.illumination import report

    doc = metrics_fixture("shackleton_center_rim_high", "2025-01-01T00:00:00", 30)
    assert doc["metrics"] == report("shackleton_center_rim_high", "2025-01-01T00:00:00", 30)["metrics"]
    assert doc["sample_indexes"][:3] == [0, 1, 2] and len(doc["samples"]["sun_az"]) == len(doc["sample_indexes"])
    assert all(0.0 <= az < 360.0 for az in doc["samples"]["sun_az"])
    path = write_metrics_fixture("shackleton_center_rim_high", "2025-01-01T00:00:00", 30, out_dir=tmp_path)
    assert path.name == "shackleton_center_rim_high_2025-01-01_30d.json"


def test_sync_local_copies_small_artifacts(tmp_path):
    from lunar_pipeline.sync_local import CATALOGUE

    bundled = CATALOGUE.stat().st_mtime_ns
    copied = sync(web_data=tmp_path / "public" / "data", tiles=False, catalogue=tmp_path / "catalogue.json")
    # The app's bundled catalogue is left alone: the test's copy goes to the temporary folder.
    assert (tmp_path / "catalogue.json").exists()
    assert CATALOGUE.stat().st_mtime_ns == bundled
    assert (tmp_path / "public" / "data" / "sites.json").exists()
    assert (tmp_path / "public" / "data" / "ephemeris" / "moon_me_2024_2036_1h.json").exists()
    assert (tmp_path / "public" / "data" / "masks" / "south_pole.json").exists()
    assert not (tmp_path / "public" / "data" / "tiles").exists()
    assert copied
