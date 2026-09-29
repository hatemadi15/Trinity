from pathlib import Path

import pytest

from lunar_pipeline.publish_r2 import CACHE_CONTROL, etag_of, plan_uploads, publish


def make_tree(root: Path) -> None:
    (root / "ephemeris").mkdir(parents=True)
    (root / "ephemeris" / "table.f32").write_bytes(b"\x00" * 16)
    (root / "ephemeris" / "table.json").write_text('{"n": 1}\n', encoding="utf-8")
    (root / "tiles").mkdir()
    (root / "tiles" / "L0_0_0.u16").write_bytes(b"\x01" * 8)
    (root / "terrain").mkdir()
    (root / "terrain" / "globe.jpg").write_bytes(b"\xff\xd8\xff")
    (root / "notes.weird").write_bytes(b"?")


def test_plan_lists_every_file_with_a_key_type_and_immutable_cache(tmp_path: Path):
    make_tree(tmp_path)
    plan = plan_uploads(tmp_path, prefix="data")
    assert [u.key for u in plan] == [
        "data/ephemeris/table.f32",
        "data/ephemeris/table.json",
        "data/notes.weird",
        "data/terrain/globe.jpg",
        "data/tiles/L0_0_0.u16",
    ]
    types = {u.key: u.content_type for u in plan}
    assert types["data/ephemeris/table.f32"] == "application/octet-stream"
    assert types["data/ephemeris/table.json"] == "application/json"
    assert types["data/tiles/L0_0_0.u16"] == "application/octet-stream"
    assert types["data/terrain/globe.jpg"] == "image/jpeg"
    assert types["data/notes.weird"] == "application/octet-stream"
    assert all(u.cache_control == CACHE_CONTROL == "public, max-age=31536000, immutable" for u in plan)
    assert {u.key: u.size for u in plan}["data/ephemeris/table.f32"] == 16


def test_dry_run_prints_the_plan_without_a_client(tmp_path: Path, capsys):
    make_tree(tmp_path)
    done = publish(tmp_path, prefix="data", dry_run=True, env={}, client=None)
    assert len(done) == 5
    out = capsys.readouterr().out
    assert "data/ephemeris/table.f32" in out
    assert "application/octet-stream" in out
    assert "5 files" in out


class FakeClient:
    def __init__(self, existing: dict[str, str]):
        self.existing = existing  # key -> etag
        self.uploaded: list[tuple[str, str, dict]] = []

    def head_object(self, Bucket: str, Key: str):
        if Key not in self.existing:
            raise KeyError(Key)
        return {"ETag": f'"{self.existing[Key]}"', "ContentLength": 16}

    def upload_file(self, Filename: str, Bucket: str, Key: str, ExtraArgs: dict):
        self.uploaded.append((Filename, Key, ExtraArgs))


def test_publish_skips_unchanged_files_and_uploads_the_rest_with_headers(tmp_path: Path):
    make_tree(tmp_path)
    unchanged = etag_of(tmp_path / "ephemeris" / "table.f32")
    client = FakeClient({"data/ephemeris/table.f32": unchanged, "data/tiles/L0_0_0.u16": "stale"})
    done = publish(tmp_path, prefix="data", dry_run=False, env={"R2_BUCKET": "earthrise"}, client=client)
    keys = [k for _, k, _ in client.uploaded]
    assert "data/ephemeris/table.f32" not in keys
    assert set(keys) == {"data/ephemeris/table.json", "data/notes.weird", "data/terrain/globe.jpg", "data/tiles/L0_0_0.u16"}
    by_key = {k: (f, extra) for f, k, extra in client.uploaded}
    filename, extra = by_key["data/terrain/globe.jpg"]
    assert Path(filename) == tmp_path / "terrain" / "globe.jpg"
    assert extra == {"ContentType": "image/jpeg", "CacheControl": CACHE_CONTROL}
    assert len(done) == 4


def test_publish_without_credentials_fails_before_touching_the_network(tmp_path: Path):
    make_tree(tmp_path)
    with pytest.raises(RuntimeError, match="R2_ACCOUNT_ID"):
        publish(tmp_path, prefix="data", dry_run=False, env={}, client=None)
