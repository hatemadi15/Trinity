"""Copy committed artifacts (and optionally the DEM tiles and 3D terrain rasters) into web/public/data for local development."""

from __future__ import annotations

import shutil
from pathlib import Path

from . import config

WEB_DATA = config.REPO_ROOT / "web" / "public" / "data"
SMALL_DIRS = ["ephemeris", "masks", "fixtures", "validation"]
SMALL_FILES = ["sites.json", "sites_derived.json"]


def sync(web_data: Path = WEB_DATA, tiles: bool = False) -> list[Path]:
    copied: list[Path] = []
    web_data.mkdir(parents=True, exist_ok=True)
    for rel in SMALL_DIRS:
        src = config.DATA_DIR / rel
        if src.exists():
            shutil.copytree(src, web_data / rel, dirs_exist_ok=True)
            copied.append(web_data / rel)
    for name in SMALL_FILES:
        src = config.DATA_DIR / name
        if src.exists():
            shutil.copy2(src, web_data / name)
            copied.append(web_data / name)
    if tiles:
        src = config.OUT_DIR / "tiles"
        if not src.exists():
            raise FileNotFoundError(f"{src} missing; run the tiles command first")
        shutil.copytree(src, web_data / "tiles", dirs_exist_ok=True)
        copied.append(web_data / "tiles")
        terrain = config.OUT_DIR / "terrain"
        if terrain.exists():  # heightmap windows, south cap and globe texture from the terrain command
            shutil.copytree(terrain, web_data / "terrain", dirs_exist_ok=True)
            copied.append(web_data / "terrain")
    return copied
