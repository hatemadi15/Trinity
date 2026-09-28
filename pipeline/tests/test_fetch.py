import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from lunar_pipeline.fetch import Asset, assets, download


@pytest.fixture
def served_dir(tmp_path):
    root = tmp_path / "srv"
    root.mkdir()
    (root / "blob.bin").write_bytes(bytes(range(256)) * 4000)  # 1,024,000 bytes
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    yield root, f"http://127.0.0.1:{srv.server_port}/"
    srv.shutdown()


def _asset(url_base, dest: Path):
    return Asset("blob.bin", url_base + "blob.bin", dest, "test")


def test_download_writes_exact_bytes(served_dir, tmp_path):
    root, base = served_dir
    out = download(_asset(base, tmp_path / "dl"))
    assert out.read_bytes() == (root / "blob.bin").read_bytes()
    assert not out.with_name("blob.bin.part").exists()


def test_complete_file_is_not_redownloaded(served_dir, tmp_path):
    root, base = served_dir
    out = download(_asset(base, tmp_path / "dl"))
    mtime = out.stat().st_mtime_ns
    download(_asset(base, tmp_path / "dl"))
    assert out.stat().st_mtime_ns == mtime


def test_size_mismatch_triggers_redownload(served_dir, tmp_path):
    root, base = served_dir
    dest = tmp_path / "dl" / "blob.bin"
    dest.parent.mkdir(parents=True)
    dest.write_bytes(b"short")
    out = download(_asset(base, tmp_path / "dl"))
    assert out.stat().st_size == 1_024_000


def test_partial_without_range_support_restarts(served_dir, tmp_path):
    # SimpleHTTPRequestHandler ignores Range headers (answers 200), so a leftover .part must be replaced.
    root, base = served_dir
    part = tmp_path / "dl" / "blob.bin.part"
    part.parent.mkdir(parents=True)
    part.write_bytes(b"\xff" * 10)
    out = download(_asset(base, tmp_path / "dl"))
    assert out.read_bytes() == (root / "blob.bin").read_bytes()


def test_manifest_lists_required_files():
    names = {a.name for a in assets()}
    for required in [
        "naif0012.tls", "pck00011.tpc", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf",
        "de440s.bsp", "ldem_875s_20m.img", "ldem_875s_20m.lbl", "ldem_80s_80m.img",
        "ldem_60s_240m.img", "avgvisib_85s_060m_201608.img", "avgvisib_85s_060m_201608_earth.img",
        "lpsr_85s_060m_201608.img",
    ]:
        assert required in names
    assert {a.group for a in assets()} == {"kernels", "lola", "illumination"}
