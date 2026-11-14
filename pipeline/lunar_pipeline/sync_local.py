"""Copy committed artifacts (and optionally the DEM tiles, the 3D terrain rasters and the globe) into web/public/data for local development."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from . import config

WEB_DATA = config.REPO_ROOT / "web" / "public" / "data"
SMALL_DIRS = ["ephemeris", "masks", "fixtures", "validation", "sky", "uncertainty"]
SMALL_FILES = ["sites.json", "sites_derived.json"]
# Compact catalogue copy bundled into the web app (the chat route cannot read data/ at runtime on Vercel).
CATALOGUE = config.REPO_ROOT / "web" / "src" / "lib" / "data" / "catalogue.json"
CATALOGUE_FIELDS = ("id", "name", "label", "blurb", "lat", "lon", "category", "polar")


def write_catalogue(path: Path = CATALOGUE) -> Path:
    """Merge sites.json and sites_derived.json into one compact list with the fields the planner needs."""
    sites: list[dict] = []
    for name in SMALL_FILES:
        src = config.DATA_DIR / name
        if src.exists():
            sites.extend(json.loads(src.read_text(encoding="utf-8"))["sites"])
    doc = {"generated_from": SMALL_FILES, "sites": [{k: s[k] for k in CATALOGUE_FIELDS} for s in sites]}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return path


def sync(web_data: Path = WEB_DATA, tiles: bool = False, catalogue: Path = CATALOGUE) -> list[Path]:
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
    manifest = config.DATA_DIR / "manifest.json"
    if manifest.exists():  # the list of every data file, so a copy of the folder can be checked on its own (check-data)
        shutil.copy2(manifest, web_data / "manifest.json")
        copied.append(web_data / "manifest.json")
    copied.append(write_catalogue(catalogue))
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
        globe = config.OUT_DIR / "globe"
        if globe.exists():  # the Moon from space for the home page's arrival (the globe command)
            shutil.copytree(globe, web_data / "globe", dirs_exist_ok=True)
            copied.append(web_data / "globe")
    return copied
