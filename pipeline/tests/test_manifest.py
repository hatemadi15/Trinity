import hashlib
import json
from pathlib import Path

import pytest

from lunar_pipeline import config, manifest
from lunar_pipeline.cli import build_parser


def _write(root: Path, rel: str, data: bytes = b"x") -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


@pytest.fixture
def sources(tmp_path: Path):
    """A small repository: committed data/, generated data_out/ (tiles, terrain and globe) and a mirror filled from both."""
    data, out, web = tmp_path / "data", tmp_path / "data_out", tmp_path / "web"
    for rel in ("sites.json", "sites_derived.json", "ephemeris/table.f32", "masks/south_pole.json", "sky/stars.bin",
                "validation/horizons.json", "fixtures/horizons/a.json"):
        _write(data, rel, rel.encode())
    for rel in ("tiles/manifest.json", "tiles/L0/0_0.bin", "tiles/L0/0_1.bin", "terrain/manifest.json", "terrain/south_pole.u16",
                "globe/manifest.json", "globe/moon.jpg"):
        _write(out, rel, rel.encode())
    for src in (data, out):
        for path in src.rglob("*"):
            if path.is_file():
                _write(web, path.relative_to(src).as_posix(), path.read_bytes())
    return data, out, web


def _build(sources, previous=None):
    data, out, web = sources
    return manifest.build(data_dir=data, out_dir=out, mirror=web, previous=previous, today="2026-11-14")


def _remove(root: Path, group: str) -> None:
    for path in sorted((root / group).iterdir()):
        path.unlink()
    (root / group).rmdir()


def test_the_manifest_lists_every_file_with_its_size_hash_and_group(sources):
    _, out, web = sources
    _remove(out, "terrain")
    _remove(web, "terrain")
    doc = _build(sources)
    groups = {g["id"]: g for g in doc["groups"]}
    assert list(groups) == ["core", "sky", "validation", "tiles", "terrain", "globe", "fixtures"]
    assert [f["path"] for f in groups["core"]["files"]] == ["ephemeris/table.f32", "masks/south_pole.json", "sites.json", "sites_derived.json"]
    entry = groups["tiles"]["files"][0]
    assert entry == {"path": "tiles/L0/0_0.bin", "bytes": len(b"tiles/L0/0_0.bin"), "sha256": hashlib.sha256(b"tiles/L0/0_0.bin").hexdigest()}
    # Each group says whether the app needs it, where it comes from, and what the app does without it.
    assert groups["core"]["required"] is True and groups["tiles"]["required"] is False
    assert groups["terrain"]["files"] == []  # not built here, and no earlier manifest to keep it from
    for g in doc["groups"]:
        assert g["title"] and g["get"] and g["without"]
    assert doc["format"] == 1
    assert doc["data_version"] == f"2026-11-14-{doc['content_sha256'][:8]}"


def test_the_version_changes_only_when_a_file_changes(sources):
    first = _build(sources)
    assert _build(sources, previous=first) == first  # rewritten the next day with nothing changed: the same bytes
    data, _, _ = sources
    _write(data, "sites.json", b"another catalogue")
    second = manifest.build(data_dir=data, out_dir=sources[1], mirror=sources[2], previous=first, today="2026-11-15")
    assert second["content_sha256"] != first["content_sha256"]
    assert second["data_version"].startswith("2026-11-15-")


def test_a_generated_group_is_listed_as_the_app_reads_it_from_the_mirror(sources):
    _, out, web = sources
    # A terrain window built for a site this checkout's catalogue does not have yet, and never synced: not listed.
    _write(out, "terrain/another_site.u16")
    terrain = next(g for g in _build(sources)["groups"] if g["id"] == "terrain")
    assert [f["path"] for f in terrain["files"]] == ["terrain/manifest.json", "terrain/south_pole.u16"]
    # Without a mirror of the group, data_out stands in.
    _remove(web, "terrain")
    terrain = next(g for g in _build(sources)["groups"] if g["id"] == "terrain")
    assert "terrain/another_site.u16" in [f["path"] for f in terrain["files"]]


def test_a_group_that_is_not_built_here_keeps_its_entries_from_the_earlier_manifest(sources, tmp_path):
    first = _build(sources)
    data, out, web = sources
    _remove(out, "globe")
    _remove(web, "globe")
    again = manifest.build(data_dir=data, out_dir=out, mirror=web, previous=first, today="2026-11-14")
    assert again == first


def test_write_puts_one_file_on_each_line_and_keeps_the_file_when_nothing_changed(sources, tmp_path):
    data, out, web = sources
    path = tmp_path / "manifest.json"
    manifest.write(path, data_dir=data, out_dir=out, mirror=web, today="2026-11-14")
    text = path.read_text(encoding="utf-8")
    assert '{"path": "tiles/L0/0_0.bin", "bytes": 16, "sha256": "' in text
    assert b"\r\n" not in path.read_bytes()
    assert json.loads(text)["groups"][3]["id"] == "tiles"
    before = path.read_bytes()
    manifest.write(path, data_dir=data, out_dir=out, mirror=web, today="2026-12-01")
    assert path.read_bytes() == before


def test_check_says_every_part_is_complete_when_the_mirror_matches(sources):
    doc = _build(sources)
    _, _, web = sources
    report = manifest.check(web, doc)
    states = {g["id"]: g["state"] for g in report["groups"]}
    assert states == {"core": "complete", "sky": "complete", "validation": "complete", "tiles": "complete", "terrain": "complete", "globe": "complete", "fixtures": "complete"}
    assert report["ok"] is True and report["extra"] == []


def test_check_names_a_missing_optional_part_and_its_fallback_and_still_passes(sources):
    doc = _build(sources)
    _, _, web = sources
    for rel in ("globe/manifest.json", "globe/moon.jpg"):
        (web / rel).unlink()
    report = manifest.check(web, doc)
    globe = next(g for g in report["groups"] if g["id"] == "globe")
    assert globe["state"] == "missing" and globe["missing"] == 2
    assert report["ok"] is True
    words = manifest.words(report)
    assert "Missing (optional): the Moon from space for the home page's arrival" in words
    assert "still pictures" in words  # what the app does without it
    # And how to get it: the commands in order, each a line that pastes into any shell.
    cli = "    uv run python -m lunar_pipeline.cli"
    assert f"To get it, from pipeline/:\n{cli} fetch --group lola --group globe\n{cli} tiles\n{cli} globe\n{cli} sync-local --tiles\n" in words
    assert "Every page opens" in words


def test_check_fails_when_a_required_file_is_missing_or_differs(sources):
    doc = _build(sources)
    _, _, web = sources
    (web / "sites.json").unlink()
    _write(web, "validation/horizons.json", b"edited by hand")
    report = manifest.check(web, doc)
    states = {g["id"]: g for g in report["groups"]}
    assert states["core"]["state"] == "partial" and states["core"]["missing_files"] == ["sites.json"]
    assert states["validation"]["state"] == "differs" and states["validation"]["differing_files"] == ["validation/horizons.json"]
    assert report["ok"] is False
    words = manifest.words(report)
    assert "Not ready" in words and "sync-local" in words


def test_check_reports_a_part_with_files_missing_and_files_it_does_not_know(sources):
    doc = _build(sources)
    _, _, web = sources
    (web / "tiles" / "L0" / "0_1.bin").unlink()
    _write(web, "notes.txt")
    report = manifest.check(web, doc)
    tiles = next(g for g in report["groups"] if g["id"] == "tiles")
    assert tiles["state"] == "partial" and tiles["present"] == 2 and tiles["missing"] == 1
    assert report["extra"] == ["notes.txt"]
    assert report["ok"] is True  # the tiles are optional
    assert "1 of 3 files missing" in manifest.words(report)


def test_check_on_an_empty_folder_says_what_to_run_first(tmp_path, sources):
    doc = _build(sources)
    report = manifest.check(tmp_path / "nothing", doc)
    assert report["ok"] is False
    assert "uv run python -m lunar_pipeline.cli sync-local" in manifest.words(report)


def test_the_committed_manifest_lists_the_committed_data_as_it_is():
    """After any change to data/, run `uv run python -m lunar_pipeline.cli manifest` and commit data/manifest.json."""
    committed = json.loads(manifest.MANIFEST.read_text(encoding="utf-8"))
    fresh = manifest.build(previous=committed, generated=False)
    stale = [g["id"] for g, c in zip(fresh["groups"], committed["groups"]) if g != c]
    assert stale == [], f"data/manifest.json is out of date for {stale}: run the manifest command in pipeline/ and commit it"
    assert fresh == committed


def test_the_cli_offers_the_manifest_and_the_check():
    assert build_parser().parse_args(["manifest"]).cmd == "manifest"
    args = build_parser().parse_args(["check-data", "--json"])
    assert args.cmd == "check-data" and args.json is True and args.root == config.REPO_ROOT / "web" / "public" / "data"
