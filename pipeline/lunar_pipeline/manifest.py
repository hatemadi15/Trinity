"""The asset manifest: every data file the app reads, by group, with its size and SHA-256, and a check of a data folder against it.

`manifest` writes data/manifest.json, the reference set: the committed groups from data/, the generated groups (tiles,
terrain) as web/public/data holds them (or as data_out/ does, where the mirror has none), and any group not built
on this computer kept from the manifest before. `check-data` compares a folder (web/public/data by default) with it and says, in plain words,
which parts are complete, which are missing or differ, and what the app does without them.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from . import config

MANIFEST = config.DATA_DIR / "manifest.json"
WEB_DATA = config.REPO_ROOT / "web" / "public" / "data"
FORMAT = 1
# What the check never counts as data: the manifest's own copy at the top (sync-local puts it there) and the files a
# desktop leaves behind. The groups' own manifest.json files are data.
OWN_COPY = "manifest.json"
JUNK = {".DS_Store", "Thumbs.db", "desktop.ini"}


def _counted(root: Path, path: Path) -> bool:
    return path.name not in JUNK and path.relative_to(root).as_posix() != OWN_COPY
FULL = "the full data in README step 3"


@dataclass(frozen=True)
class Group:
    id: str
    title: str
    required: bool
    generated: bool
    prefixes: tuple[str, ...]
    get: tuple[str, ...]
    without: str


GROUPS: tuple[Group, ...] = (
    Group("core", "the site catalogue, the hourly Sun and Earth table and the sites' horizon masks", True, False,
          ("sites.json", "sites_derived.json", "ephemeris/", "masks/"), ("sync-local",),
          "No forecast can be shown: Explore, the site list, Compare and the brief say the data could not be loaded."),
    Group("sky", "the sky: the stars, the Moon's turning and Earth's maps", True, False, ("sky/",), ("sync-local",),
          "The view from the site cannot open and the header's band of stars stays empty."),
    Group("validation", "the Accuracy page's tables", True, False, ("validation/",), ("sync-local",),
          "The Accuracy page says the checks could not be loaded."),
    Group("tiles", "the LOLA height tiles", False, True, ("tiles/",), ("fetch --group lola", "tiles", "sync-local --tiles"),
          "The 19 catalogue sites work with the 2 m mast; a point outside the catalogue (Somewhere else) and any other mast height cannot be worked out."),
    Group("terrain", "the terrain around the sites", False, True, ("terrain/",),
          ("fetch --group lola --group textures", "tiles", "terrain", "sync-local --tiles"),
          "Explore's Shadow map and 3D from above tabs say the terrain is missing and the Horizon chart stands in, and the view from the site draws flat ground under the real skyline."),
    Group("fixtures", "the test fixtures", False, False, ("fixtures/",), ("sync-local",),
          "Nothing: the app does not read them (the tests read them from data/fixtures)."),
    Group("uncertainty", "the margins and the terrain versions", False, False, ("uncertainty/", "ensemble/"), ("sync-local",),
          "Explore, the brief, Compare and the Accuracy page show no margins and no terrain versions; every figure itself is the same."),
    Group("coldtraps", "the modelled cold traps near the polar sites (LRO Diviner, PGDA product 90)", False, False, ("coldtraps/",),
          ("coldtraps", "sync-local"),
          "Explore, the brief and the site list leave out the line on modelled cold traps, and the shadow map offers no layer of cold ground."),
)
BY_ID = {g.id: g for g in GROUPS}


def group_of(rel: str) -> Group | None:
    return next((g for g in GROUPS if any(rel == p or (p.endswith("/") and rel.startswith(p)) for p in g.prefixes)), None)


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _files(root: Path, group: Group) -> list[dict]:
    """The group's files under root (a data folder laid out as web/public/data), sorted by path."""
    found = []
    if root.is_dir():
        for path in sorted(p for p in root.rglob("*") if p.is_file()):
            rel = path.relative_to(root).as_posix()
            if _counted(root, path) and group_of(rel) is group:
                found.append({"path": rel, "bytes": path.stat().st_size, "sha256": sha256_of(path)})
    return found


def build(
    data_dir: Path | None = None,
    out_dir: Path | None = None,
    mirror: Path | None = None,
    previous: dict | None = None,
    generated: bool = True,
    today: str | None = None,
) -> dict:
    """The manifest as a dict. With `generated=False` the generated groups are taken from `previous` as they are."""
    data_dir, out_dir, mirror = data_dir or config.DATA_DIR, out_dir or config.OUT_DIR, mirror or WEB_DATA
    before = {g["id"]: g["files"] for g in (previous or {}).get("groups", [])}
    groups = []
    for g in GROUPS:
        if not g.generated:
            files = _files(data_dir, g)
        else:
            # As the app reads them: the mirror's copy first, data_out's where the mirror has none.
            built = (_files(mirror, g) or _files(out_dir, g)) if generated else []
            files = built or before.get(g.id, [])
        groups.append({"id": g.id, "title": g.title, "required": g.required, "origin": "made by the pipeline" if g.generated else "committed in data/",
                       "get": list(g.get), "without": g.without, "bytes": sum(f["bytes"] for f in files), "files": files})
    lines = "".join(f"{f['path']} {f['bytes']} {f['sha256']}\n" for g in groups for f in g["files"])
    content = hashlib.sha256(lines.encode()).hexdigest()
    if previous and previous.get("content_sha256") == content and previous.get("format") == FORMAT:
        version, written = previous["data_version"], previous["written_utc"]
    else:
        day = today or datetime.now(UTC).strftime("%Y-%m-%d")
        version, written = f"{day}-{content[:8]}", (f"{day}T00:00:00Z" if today else datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"))
    return {"format": FORMAT, "data_version": version, "content_sha256": content, "written_utc": written,
            "about": "Every data file the app reads, as web/public/data lays them out. Check a folder with: uv run python -m lunar_pipeline.cli check-data",
            "groups": groups}


def dumps(doc: dict) -> str:
    """JSON with one file to a line, so a change to the data reads as a short diff."""
    head = {k: v for k, v in doc.items() if k != "groups"}
    out = ["{"] + [f" {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}," for k, v in head.items()] + [' "groups": [']
    for i, g in enumerate(doc["groups"]):
        meta = {k: v for k, v in g.items() if k != "files"}
        out.append("  {" + ", ".join(f"{json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in meta.items()) + ', "files": [')
        out += [f"   {json.dumps(f)}" + ("," if j < len(g["files"]) - 1 else "") for j, f in enumerate(g["files"])]
        out.append("  ]}" + ("," if i < len(doc["groups"]) - 1 else ""))
    return "\n".join(out + [" ]", "}"]) + "\n"


def write(path: Path = MANIFEST, **kwargs) -> Path:
    previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    text = dumps(build(previous=previous, **kwargs))
    if not path.exists() or path.read_text(encoding="utf-8") != text:
        path.write_text(text, encoding="utf-8", newline="\n")
    return path


def check(root: Path = WEB_DATA, doc: dict | None = None) -> dict:
    """Compares a data folder with the manifest, group by group: complete, partial, missing or differs."""
    doc = doc or json.loads(MANIFEST.read_text(encoding="utf-8"))
    known: set[str] = set()
    groups = []
    for g in doc["groups"]:
        missing, differs = [], []
        for f in g["files"]:
            known.add(f["path"])
            path = root / f["path"]
            if not path.is_file():
                missing.append(f["path"])
            elif path.stat().st_size != f["bytes"] or sha256_of(path) != f["sha256"]:
                differs.append(f["path"])
        n = len(g["files"])
        state = "missing" if n and len(missing) == n else "partial" if missing else "differs" if differs else "complete"
        groups.append({"id": g["id"], "title": g["title"], "required": g["required"], "state": state, "files": n, "present": n - len(missing),
                       "missing": len(missing), "differs": len(differs), "bytes": g["bytes"], "missing_files": missing[:20],
                       "differing_files": differs[:20], "get": g["get"], "without": g["without"]})
    extra = sorted(p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file() and _counted(root, p)) if root.is_dir() else []
    extra = [p for p in extra if p not in known]
    ok = all(g["state"] == "complete" for g in groups if g["required"])
    return {"root": str(root), "data_version": doc["data_version"], "ok": ok, "groups": groups, "extra": extra}


def _mb(n: int) -> str:
    return f"{n / 1e6:.1f} MB" if n >= 1e5 else f"{n / 1e3:.0f} kB"


CLI = "uv run python -m lunar_pipeline.cli"


def words(report: dict) -> str:
    """The report in plain words, for the terminal."""
    lines = [f"Earthrise data in {report['root']}, checked against data/manifest.json (data version {report['data_version']}).", ""]
    for g in report["groups"]:
        need = "required" if g["required"] else "optional"
        if g["state"] == "complete":
            lines.append(f"Complete: {g['title']} ({g['files']} files, {_mb(g['bytes'])}).")
            continue
        if g["state"] == "missing":
            lines.append(f"Missing ({need}): {g['title']} ({g['files']} files, {_mb(g['bytes'])}).")
        elif g["state"] == "partial":
            lines.append(f"Incomplete ({need}): {g['title']}, {g['missing']} of {g['files']} files missing, for example {g['missing_files'][0]}.")
        else:
            lines.append(f"Differs ({need}): {g['title']}, {g['differs']} of {g['files']} files differ from the reference set, for example {g['differing_files'][0]}."
                         + ("" if g["required"] else " Files built on another computer can differ in their bytes; the app reads them all the same."))
        lines.append(f"  Without it: {g['without']}")
        lines.append("  To get it, from pipeline/:")
        lines += [f"    {CLI} {step}" for step in g["get"]]
    if report["extra"]:
        lines += ["", f"Not in the manifest: {len(report['extra'])} files, for example {report['extra'][0]}."]
    lines.append("")
    optional = [g for g in report["groups"] if not g["required"] and g["state"] != "complete" and g["id"] != "fixtures"]
    if report["ok"]:
        lines.append("Every page opens: the required files are all here."
                     + (f" {len(optional)} optional part{'s are' if len(optional) != 1 else ' is'} not complete; the pages named above fall back." if optional else " The full demo is here."))
    else:
        lines.append(f"Not ready: a required part is missing or out of date. In pipeline/, run `{CLI} sync-local`, then check again.")
        lines.append(f"For the optional parts, see {FULL}.")
    return "\n".join(lines)


# The downloads the pipeline's own tests read, by the file whose presence each test looks for (tests/conftest.py).
SOURCES = {"kernels": config.KERNEL_DIR / "de440s.bsp", "lola": config.LOLA_DIR / "ldem_875s_20m.img",
           "illumination": config.ILLUM_DIR / "avgvisib_85s_060m_201608.img"}


def sources_present() -> dict[str, bool]:
    return {name: path.exists() for name, path in SOURCES.items()}
