import json
from pathlib import Path

from lunar_pipeline import config
from lunar_pipeline.sync_local import CATALOGUE_FIELDS, sync, write_catalogue


def test_write_catalogue_merges_the_site_files_with_compact_fields(tmp_path: Path):
    out = tmp_path / "catalogue.json"
    written = write_catalogue(out)
    assert written == out
    doc = json.loads(out.read_text(encoding="utf-8"))
    sites = json.loads((config.DATA_DIR / "sites.json").read_text(encoding="utf-8"))["sites"]
    derived = json.loads((config.DATA_DIR / "sites_derived.json").read_text(encoding="utf-8"))["sites"]
    assert [s["id"] for s in doc["sites"]] == [s["id"] for s in sites + derived]
    assert set(doc["sites"][0].keys()) == set(CATALOGUE_FIELDS)
    assert {"label", "blurb", "kind"} <= set(CATALOGUE_FIELDS)
    assert all(s["label"] and s["blurb"] for s in doc["sites"])
    assert "mission_end_source" not in doc["sites"][0]
    assert out.read_bytes().count(b"\r\n") == 0


def test_sync_with_tiles_copies_the_terrain_when_it_was_built_and_never_a_globe(tmp_path: Path, monkeypatch):
    data, out, web = tmp_path / "data", tmp_path / "out", tmp_path / "web"
    data.mkdir()
    (out / "tiles").mkdir(parents=True)
    (out / "tiles" / "index.json").write_text("{}")
    monkeypatch.setattr(config, "DATA_DIR", data)
    monkeypatch.setattr(config, "OUT_DIR", out)
    # The catalogue goes to the temporary directory too, never over the app's own copy.
    catalogue = tmp_path / "catalogue.json"
    # No terrain built yet: the copy is skipped.
    assert web / "terrain" not in sync(web, tiles=True, catalogue=catalogue)
    assert not (web / "terrain").exists()
    (out / "terrain").mkdir()
    (out / "terrain" / "manifest.json").write_text('{"version": 3}')
    # A globe an older pipeline built stays in data_out: no page reads it.
    (out / "globe").mkdir()
    (out / "globe" / "manifest.json").write_text('{"version": 1}')
    copied = sync(web, tiles=True, catalogue=catalogue)
    assert web / "terrain" in copied
    assert (web / "terrain" / "manifest.json").read_text() == '{"version": 3}'
    assert web / "globe" not in copied and not (web / "globe").exists()


def test_sync_copies_the_uncertainty_budget_for_the_app(tmp_path: Path, monkeypatch):
    data, web = tmp_path / "data", tmp_path / "web"
    (data / "uncertainty").mkdir(parents=True)
    (data / "uncertainty" / "budget.json").write_text('{"version": 1}')
    monkeypatch.setattr(config, "DATA_DIR", data)
    assert web / "uncertainty" in sync(web, catalogue=tmp_path / "catalogue.json")
    assert (web / "uncertainty" / "budget.json").read_text() == '{"version": 1}'

def test_sync_copies_the_asset_manifest_beside_the_data(tmp_path: Path, monkeypatch):
    data, web = tmp_path / "data", tmp_path / "web"
    data.mkdir()
    (data / "manifest.json").write_text('{"format": 1}')
    monkeypatch.setattr(config, "DATA_DIR", data)
    # The published data and the release zip then carry the list of files they should hold.
    assert web / "manifest.json" in sync(web, catalogue=tmp_path / "catalogue.json")
    assert (web / "manifest.json").read_text() == '{"format": 1}'
