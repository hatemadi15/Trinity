import json
from pathlib import Path

from lunar_pipeline import config
from lunar_pipeline.sync_local import CATALOGUE_FIELDS, write_catalogue


def test_write_catalogue_merges_the_site_files_with_compact_fields(tmp_path: Path):
    out = tmp_path / "catalogue.json"
    written = write_catalogue(out)
    assert written == out
    doc = json.loads(out.read_text(encoding="utf-8"))
    sites = json.loads((config.DATA_DIR / "sites.json").read_text(encoding="utf-8"))["sites"]
    derived = json.loads((config.DATA_DIR / "sites_derived.json").read_text(encoding="utf-8"))["sites"]
    assert [s["id"] for s in doc["sites"]] == [s["id"] for s in sites + derived]
    assert set(doc["sites"][0].keys()) == set(CATALOGUE_FIELDS)
    assert "mission_end_source" not in doc["sites"][0]
    assert out.read_bytes().count(b"\r\n") == 0
