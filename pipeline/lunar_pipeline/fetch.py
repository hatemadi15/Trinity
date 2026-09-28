"""Download NASA source files with resume and size verification."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import requests

from . import config

NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
PDS_POLAR = (
    "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/"
    "data/lola_gdr/polar/img/"
)
PDS_ILLUM = (
    "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/"
    "extras/illumination/img/"
)

KERNELS = [
    ("naif0012.tls", "lsk/"),
    ("pck00011.tpc", "pck/"),
    ("moon_pa_de440_200625.bpc", "pck/"),
    ("moon_de440_250416.tf", "fk/satellites/"),
    ("de440s.bsp", "spk/planets/"),
]
LOLA_STEMS = ["ldem_875s_20m", "ldem_80s_80m", "ldem_60s_240m"]
ILLUM_STEMS = [
    "avgvisib_85s_060m_201608",
    "avgvisib_85s_060m_201608_earth",
    "lpsr_85s_060m_201608",
]


@dataclass(frozen=True)
class Asset:
    name: str
    url: str
    dest_dir: Path
    group: str


def assets() -> list[Asset]:
    out: list[Asset] = []
    for name, sub in KERNELS:
        out.append(Asset(name, NAIF + sub + name, config.KERNEL_DIR, "kernels"))
    for stem in LOLA_STEMS:
        for ext in (".lbl", ".img"):
            out.append(Asset(stem + ext, PDS_POLAR + stem + ext, config.LOLA_DIR, "lola"))
    for stem in ILLUM_STEMS:
        for ext in (".lbl", ".img"):
            out.append(Asset(stem + ext, PDS_ILLUM + stem + ext, config.ILLUM_DIR, "illumination"))
    return out


def remote_size(url: str, session: requests.Session) -> int | None:
    r = session.head(url, allow_redirects=True, timeout=60)
    r.raise_for_status()
    length = r.headers.get("Content-Length")
    return int(length) if length else None


def download(asset: Asset, session: requests.Session | None = None, chunk: int = 1 << 20) -> Path:
    """Download one asset into asset.dest_dir. Resumes a .part file when the server supports Range."""
    session = session or requests.Session()
    dest = asset.dest_dir / asset.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    size = remote_size(asset.url, session)
    if dest.exists() and (size is None or dest.stat().st_size == size):
        return dest

    part = dest.with_name(dest.name + ".part")
    have = part.stat().st_size if part.exists() else 0
    if size is not None and have >= size:
        part.unlink()
        have = 0
    headers = {"Range": f"bytes={have}-"} if have else {}
    with session.get(asset.url, headers=headers, stream=True, timeout=120) as r:
        r.raise_for_status()
        resumed = bool(have) and r.status_code == 206
        with open(part, "ab" if resumed else "wb") as f:
            for block in r.iter_content(chunk):
                f.write(block)
    got = part.stat().st_size
    if size is not None and got != size:
        raise OSError(f"{asset.name}: expected {size} bytes, got {got} (url {asset.url})")
    part.replace(dest)
    return dest


def fetch_all(groups: set[str] | None = None) -> list[Path]:
    session = requests.Session()
    session.headers["User-Agent"] = "trinity-lunar-pipeline/0.1 (Space Apps 2026)"
    done: list[Path] = []
    for asset in assets():
        if groups and asset.group not in groups:
            continue
        print(f"[fetch] {asset.group}/{asset.name}", flush=True)
        done.append(download(asset, session))
    return done
