"""Validation artifacts: four kinds of evidence, each saying what it establishes, its criteria, its coverage and its limits.

horizons.json   Sun and Earth directions against JPL Horizons: geometry and ephemeris, not terrain.
mazarico.json   Terrain illumination against the LOLA average-visibility maps, with the definitions matched.
power.json      Numerical verification of the power model: the battery sums against worked answers.
backcasts.json  Historical mission context: predicted sunsets beside reported mission ends (not a check).

`uv run python -m lunar_pipeline.cli validate` writes all four; it downloads any input that is missing.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import statistics
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import spiceypy as spice

from . import config
from .ephemeris import ABCORR, FRAME, interp_vectors, load_table
from .fetch import LOLA_NODE_ILLUM, LOLA_NODE_POLAR, Asset, assets, download, make_session
from .fixtures import power_fixture
from .geometry import azel_from_body_vectors, site_vector_km
from .horizon import Band, horizon_mask, mask_at_azimuth, site_height_m
from .illumination import disk_fraction, hourly_series, sun_radius_deg
from .lola import LolaGrid
from .masks import _first_missing_distance_m, load_grids, load_mask, mask_for_site
from .power import PowerConfig, power_budget
from .sites import Site, all_sites
from .spice_env import spice_kernels, utc_to_et

OUT_DIR = config.DATA_DIR / "validation"
COMMAND = "cd pipeline && uv run python -m lunar_pipeline.cli validate"
FULL_START = "2024-01-01T00:00:00"

# The reference maps (Mazarico et al. 2011 method, 2016 release, labels revised 2023-10-13).
MAZARICO_PRODUCT = "avgvisib_85s_060m_201608"
EARTH_PRODUCT = MAZARICO_PRODUCT + "_earth"
LABEL_URL = LOLA_NODE_ILLUM + "{}.LBL"
SOURCES = [
    "https://pgda.gsfc.nasa.gov/products/69",
    "http://imbrium.mit.edu/EXTRAS/ILLUMINATION/README_ILLUMINATION_2016.TXT",
    "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/release_2014/readme_illumination_2014.txt",
    "Mazarico et al. 2011, Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030",
    "Barker et al. 2021, Planetary and Space Science 203, 105119, doi:10.1016/j.pss.2020.105119",
]

# One lunar nodal precession cycle (18.6 years), hourly from the start of the app's table.
CYCLE_START = FULL_START
CYCLE_DAYS = 6798
EARTH_RADIUS_KM = 6371.0
# The 60 m terrain of the matched comparison: 3 x 3 means of LOLA's 20 m map down to 85 S.
MATCHED_DEM = "ldem_85s_20m"
MATCHED_BLOCK = 3
MATCHED_R0_M = 60.0  # the first sample one 60 m post from the observer
MATCHED_STEP_M = 30.0  # half a post

# The four pixels a bilinear read uses, as (column, row) offsets, in the order of their weights.
CORNERS = ((0, 0), (1, 0), (0, 1), (1, 1))

AGREE_POINTS = 5.0  # a site agrees with the map when within this many percentage points
DIRECTIONS_TARGET_DEG = 0.01
POWER_TOLERANCE = 1e-6

EVIDENCE: dict[str, dict] = {
    "directions": {
        "kind": "check",
        "title": "Sun and Earth directions against JPL Horizons",
        "establishes": (
            "Our hourly DE440 table (MOON_ME frame, light time and stellar aberration) and our conversion to "
            "azimuth and elevation reproduce JPL Horizons' apparent, airless azimuth and elevation of the Sun and "
            "Earth for the same surface coordinates."
        ),
        "criteria": {
            "rule": "Every row within 0.01 degrees in elevation and in azimuth times cos(elevation).",
            "max_abs_delta_el_deg": DIRECTIONS_TARGET_DEG,
            "max_abs_delta_az_cos_el_deg": DIRECTIONS_TARGET_DEG,
        },
        "limitations": [
            "Geometry only: no terrain, no skyline and no sunlight are involved.",
            "Both sides rest on JPL's DE4xx ephemerides and lunar orientation, so this checks how we use them, not the ephemerides themselves.",
            "Every stored moment falls on a whole hour of the table, so interpolation between hours is not exercised here; the pipeline's tests check it against SPICE at half hours (under 0.0001 degrees).",
            "Observers sit at 0 m on the 1737.4 km sphere; terrain height enters only the skyline.",
            "Six sites and 2025 to 2026 only, while the table runs from 2024 to 2036.",
        ],
    },
    "terrain": {
        "kind": "check",
        "title": "Terrain illumination against the LOLA average-visibility maps",
        "establishes": (
            "With the definitions matched (an observer on the ground, any part of the disc counting, hourly over a "
            "full 18.6-year cycle, 60 m terrain read at the map's pixel centres), our skyline method and geometry "
            "reproduce the LOLA team's average Sun and Earth visibility at the covered polar sites."
        ),
        "criteria": {
            "rule": (
                "The median gap over the covered sites is 5 percentage points or less, for the Sun map and for the "
                "Earth map; a site agrees when its gap is 5 points or less."
            ),
            "max_median_abs_gap_points": AGREE_POINTS,
            "site_agreement_points": AGREE_POINTS,
        },
        "limitations": [
            "Both sides are models built from LOLA altimetry with similar skyline methods, so errors the two share (in the elevation data, for example) cancel; agreement is not a ground observation.",
            "Averages over 18.6 years can hide errors in the hour of single sunrises and sunsets.",
            "The app's own numbers use a 2 m mast, finer terrain and 2024 to 2036; the matched comparison changes these on purpose, and the rows show how much each one moves the result.",
            "The map is a square around the pole that reaches 85 degrees south on every side (about 83 at its corners): IM-1, Nobile Rim 2 and the peak near Cabeus B lie outside it and are not compared.",
        ],
    },
    "sums": {
        "kind": "check",
        "title": "Numerical verification of the power model",
        "establishes": (
            "The power and battery arithmetic (panel geometry, irradiance, the hourly battery walk, brownouts) gives "
            "the answers worked out by hand formula, in the pipeline's model and in the app's own engine."
        ),
        "criteria": {
            "rule": "Every worked case within 0.000001 W and 0.000001 Wh, with brownout hours and the first brownout hour exactly equal.",
            "tolerance_w": POWER_TOLERANCE,
            "tolerance_wh": POWER_TOLERANCE,
        },
        "limitations": [
            "It checks the sums, not real hardware: no panel heating, dust, ageing, wiring or battery losses, no heaters and no real lander's loads.",
            "The worked answers come from the same documented formulas, so a wrong formula would pass; the formulas themselves are a model choice, stated in docs/method.md.",
            "The inputs are made-up hours; the recorded site runs only show that the pipeline and the app still agree on real skylines.",
        ],
    },
    "missions": {
        "kind": "context",
        "title": "Historical mission context",
        "establishes": (
            "Nothing on its own: it sets our predicted local sunset after each CLPS landing beside the end of the "
            "mission its operator reported."
        ),
        "criteria": None,
        "can_tell": [
            "Whether our predicted sunset comes before or after a reported end, when the operator says the lander ran into the night (Blue Ghost Mission 1).",
            "That the Sun was still up when IM-1 and IM-2 ended, so their ends had other causes.",
        ],
        "cannot_tell": [
            "The hour of sunset: reported ends are announcements, two of them without a published hour.",
            "Whether a battery would last a night, or anything about a lander's power system.",
            "How often the forecast is right: one lander that ran to sunset is one case, not a sample.",
        ],
        "limitations": [
            "Mission end times are reported events, not observed sunsets.",
            "They are not battery-survival validation: a lander's end depends on its attitude, power system, temperatures and operations.",
            "Blue Ghost's site is far from the pole and uses a flat horizon, which puts our sunset about 2.5 hours after the one Firefly reported.",
        ],
    },
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _evidence(kind: str, **extra) -> dict:
    return {**EVIDENCE[kind], **extra, "command": COMMAND}


# --- inputs -------------------------------------------------------------------------------------

def validation_assets() -> list[Asset]:
    """Every download the validation reads: the kernels, the LOLA grids, the illumination maps and the 20 m map to 85 S."""
    out = [a for a in assets() if a.group in ("kernels", "lola", "illumination")]
    for ext in (".lbl", ".img"):
        name = MATCHED_DEM + ext
        out.append(Asset(name, LOLA_NODE_POLAR + name.upper(), config.LOLA_DIR, "validation"))
    return out


def ensure_inputs() -> list[Path]:
    """Download the missing inputs (about 1 GB on a fresh checkout); files already present are kept as they are."""
    session = make_session()
    paths = []
    for asset in validation_assets():
        path = asset.dest_dir / asset.name
        if not path.exists():
            print(f"[validate] fetching {asset.name}", flush=True)
            path = download(asset, session)
        paths.append(path)
    return paths


# --- PDS3 labels --------------------------------------------------------------------------------

_KEYWORD = re.compile(r"^\s*([\^A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$")


def read_label(text: str) -> dict[str, dict[str, str]]:
    """The keywords of a PDS3 label by object ("" for the top level); multi-line values are joined with single spaces."""
    out: dict[str, dict[str, str]] = {"": {}}
    stack: list[str] = []
    lines = text.replace("\r", "").split("\n")
    i = 0
    while i < len(lines):
        m = _KEYWORD.match(lines[i])
        i += 1
        if not m:
            continue
        key, value = m.group(1), m.group(2)
        # A quoted string or a set runs on until its closing quote or brace.
        while (value.startswith('"') and value.count('"') % 2 == 1) or (value.startswith("{") and "}" not in value):
            if i >= len(lines):
                break
            value += " " + lines[i].strip()
            i += 1
        value = re.sub(r"\s+", " ", value).strip()
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1].strip()
        if value.startswith("{"):
            value = re.sub(r"\s*,\s*", ",", value)
        if key == "OBJECT":
            stack.append(value)
            out.setdefault(value, {})
        elif key == "END_OBJECT":
            if stack:
                stack.pop()
        else:
            out.setdefault(stack[-1] if stack else "", {}).setdefault(key, value)
    return out


def label_summary(lbl_path: Path) -> dict:
    """The fields of an illumination map's label that the comparison depends on, with checksums of the label and image."""
    lab = read_label(lbl_path.read_text(encoding="latin-1"))
    top, image, proj = lab.get("", {}), lab.get("IMAGE", {}), lab.get("IMAGE_MAP_PROJECTION", {})
    img = lbl_path.with_suffix(".img")
    return {
        "file": lbl_path.name.upper(),
        "url": LABEL_URL.format(lbl_path.stem.upper()),
        "product_id": top.get("PRODUCT_ID"),
        "product_version_id": top.get("PRODUCT_VERSION_ID"),
        "product_creation_time": top.get("PRODUCT_CREATION_TIME"),
        "data_set_id": top.get("DATA_SET_ID"),
        "start_time": top.get("START_TIME"),
        "stop_time": top.get("STOP_TIME"),
        "description": top.get("DESCRIPTION"),
        "image_name": image.get("NAME"),
        "image_description": image.get("DESCRIPTION"),
        "lines": image.get("LINES"),
        "line_samples": image.get("LINE_SAMPLES"),
        "sample_type": image.get("SAMPLE_TYPE"),
        "scaling_factor": image.get("SCALING_FACTOR"),
        "offset": image.get("OFFSET"),
        "derived_maximum": image.get("DERIVED_MAXIMUM"),
        "map_projection_type": proj.get("MAP_PROJECTION_TYPE"),
        "map_scale": proj.get("MAP_SCALE"),
        "map_resolution": proj.get("MAP_RESOLUTION"),
        "center_latitude": proj.get("CENTER_LATITUDE"),
        "center_longitude": proj.get("CENTER_LONGITUDE"),
        "maximum_latitude": proj.get("MAXIMUM_LATITUDE"),
        "minimum_latitude": proj.get("MINIMUM_LATITUDE"),
        "line_projection_offset": proj.get("LINE_PROJECTION_OFFSET"),
        "sample_projection_offset": proj.get("SAMPLE_PROJECTION_OFFSET"),
        "a_axis_radius": proj.get("A_AXIS_RADIUS"),
        "keyword_latitude_type": proj.get("KEYWORD_LATITUDE_TYPE"),
        "coordinate_system_name": proj.get("COORDINATE_SYSTEM_NAME"),
        "label_sha256": _sha256(lbl_path),
        "image_sha256": _sha256(img) if img.exists() else None,
    }


# --- geometry for the matched comparison --------------------------------------------------------

def coarser_grid(grid: LolaGrid, block: int) -> LolaGrid:
    """Means of block x block pixels: each coarse post sits at the centre of its block (heights in the grid's own units)."""
    rows, cols = grid.label.lines // block, grid.label.samples // block
    out = np.empty((rows, cols), dtype=np.float32)
    for b0 in range(0, rows, 256):  # in strips, so a 460 MB map is never copied whole
        b1 = min(rows, b0 + 256)
        strip = np.asarray(grid.data[block * b0 : block * b1, : block * cols], dtype=np.float32)
        out[b0:b1] = strip.reshape(b1 - b0, block, cols, block).mean(axis=(1, 3))
    half = (block - 1) / 2.0
    label = replace(
        grid.label,
        lines=rows,
        samples=cols,
        map_scale_m=grid.label.map_scale_m * block,
        line_offset_px=(grid.label.line_offset_px - half) / block,
        sample_offset_px=(grid.label.sample_offset_px - half) / block,
    )
    return LolaGrid(label, out)


def matched_grid() -> LolaGrid:
    """LOLA's 20 m map down to 85 S as 60 m posts, aligned with the pixel centres of the 60 m illumination maps."""
    g = coarser_grid(LolaGrid.from_pds(config.LOLA_DIR / f"{MATCHED_DEM}.lbl"), MATCHED_BLOCK)
    sun_map = LolaGrid.from_pds(config.ILLUM_DIR / f"{MAZARICO_PRODUCT}.lbl").label
    shift = g.label.sample_offset_px - sun_map.sample_offset_px
    if g.label.map_scale_m != sun_map.map_scale_m or abs(shift - round(shift)) > 1e-9:
        raise ValueError(f"the 60 m posts do not fall on the map's pixel centres (shift {shift} px)")
    return g


def matched_mask(lat: float, lon: float, g60: LolaGrid, grids: dict[str, LolaGrid], n_az: int = 720) -> np.ndarray:
    """The skyline seen from the ground on 60 m terrain, then LOLA 80 m where the 60 m map ends and 240 m from 100 to 220 km."""
    near = Band(g60, MATCHED_R0_M, 100_000.0, MATCHED_STEP_M)
    bands = [near]
    edge = _first_missing_distance_m(lat, lon, near, n_az, MATCHED_STEP_M)
    if edge is not None:
        bands.append(Band(grids["L1"], edge, 100_000.0, 40.0))
    bands.append(Band(grids["L2"], 100_000.0, 220_000.0, 120.0))
    return horizon_mask(lat, lon, bands, n_az=n_az, mast_m=0.0, site_height_m_=site_height_m(lat, lon, [g60]))


def pixel_weights(grid: LolaGrid, lat: float, lon: float) -> tuple[tuple[int, int], list[float]]:
    """The map's corner pixel (column, row) below a point and the bilinear weights of the four CORNERS, as LolaGrid reads them."""
    col, row = grid.pixel_from_latlon(lat, lon)
    c0, r0 = int(np.floor(col)), int(np.floor(row))
    fc, fr = float(col) - c0, float(row) - r0
    return (c0, r0), [(1 - fc) * (1 - fr), fc * (1 - fr), (1 - fc) * fr, fc * fr]


def earth_any_part(above_deg, radius_deg) -> np.ndarray:
    """Any part of Earth's disc clears the skyline: its centre is less than one radius below it (the LOLA maps' rule)."""
    return np.asarray(above_deg) > -np.asarray(radius_deg)


def earth_centre(above_deg) -> np.ndarray:
    """Earth's centre clears the skyline (the app's rule for contact with Earth, at a minimum elevation of 0)."""
    return np.asarray(above_deg) > 0.0


def cycle_vectors(start_utc: str = CYCLE_START, days: int = CYCLE_DAYS) -> tuple[np.ndarray, np.ndarray]:
    """Sun and Earth from the Moon's centre (km, MOON_ME, light time and stellar aberration), hourly from start_utc."""
    with spice_kernels():
        ets = utc_to_et(start_utc) + np.arange(days * 24) * 3600.0
        sun = np.asarray(spice.spkpos("SUN", ets, FRAME, ABCORR, "MOON")[0], dtype=np.float64)
        earth = np.asarray(spice.spkpos("EARTH", ets, FRAME, ABCORR, "MOON")[0], dtype=np.float64)
    return sun, earth


def shares(lat: float, lon: float, mask: np.ndarray, sun_km: np.ndarray, earth_km: np.ndarray) -> dict:
    """Shares of hours: any part of the Sun above the skyline, the mean visible fraction of its disc, and Earth by both rules."""
    az, el = azel_from_body_vectors(sun_km, lat, lon, 0.0)
    f = disk_fraction(el - mask_at_azimuth(mask, az), sun_radius_deg(np.linalg.norm(sun_km, axis=1)))
    eaz, eel = azel_from_body_vectors(earth_km, lat, lon, 0.0)
    above = eel - mask_at_azimuth(mask, eaz)
    radius = np.degrees(np.arcsin(EARTH_RADIUS_KM / np.linalg.norm(earth_km - site_vector_km(lat, lon), axis=1)))
    return {
        "sun_any": float(np.mean(f > 0.0)),
        "sun_disc_mean": float(np.mean(f)),
        "earth_any": float(np.mean(earth_any_part(above, radius))),
        "earth_centre": float(np.mean(earth_centre(above))),
    }


# --- 1. directions against JPL Horizons ---------------------------------------------------------

def horizons_doc(fixtures_dir: Path = config.DATA_DIR / "fixtures" / "horizons") -> dict:
    """Every stored Horizons row next to our own az/el, with the worst differences per file and overall."""
    table, header = load_table()
    names = {s.id: s.name for s in all_sites()}
    sites, worst_el, worst_az, n, epochs = [], 0.0, 0.0, 0, set()
    with spice_kernels():
        for path in sorted(fixtures_dir.glob("*_sun.json")) + sorted(fixtures_dir.glob("*_earth.json")):
            doc = json.loads(path.read_text())
            idx = 0 if doc["body"] == "SUN" else 1
            rows, d_el, d_az = [], 0.0, 0.0
            for r in doc["rows"]:
                vec = interp_vectors(table, header["t0_et"], header["step_s"], utc_to_et(r["utc"]))[idx]
                az, el = azel_from_body_vectors(vec, doc["lat"], doc["lon"], 0.0)
                az, el = float(az), float(el)
                daz = (az - r["az"] + 180.0) % 360.0 - 180.0
                d_az = max(d_az, abs(daz * np.cos(np.radians(r["el"]))))
                d_el = max(d_el, abs(el - r["el"]))
                rows.append({"utc": r["utc"], "az_jpl": r["az"], "el_jpl": r["el"], "az_ours": round(az, 6), "el_ours": round(el, 6)})
                epochs.add(r["utc"])
            n += len(rows)
            worst_el, worst_az = max(worst_el, d_el), max(worst_az, d_az)
            sites.append({
                "site_id": doc["site_id"], "name": names.get(doc["site_id"], doc["site_id"]), "lat": doc["lat"], "lon": doc["lon"],
                "body": doc["body"], "query_url": doc["query_url"], "n_rows": len(rows),
                "max_abs_delta_el_deg": d_el, "max_abs_delta_az_cos_el_deg": d_az, "rows": rows,
            })
    stamps = sorted(epochs)
    coverage = {
        "rows": n,
        "sites": sorted({s["site_id"] for s in sites}),
        "bodies": sorted({s["body"] for s in sites}),
        "epochs": len(stamps),
        "first_utc": stamps[0] if stamps else None,
        "last_utc": stamps[-1] if stamps else None,
        "step": "30 days, at 00:00 UTC",
        "on_whole_hours": all(s.endswith(":00:00") for s in stamps),
    }
    return {
        "generated_utc": _now(),
        "n_rows": n,
        "max_abs_delta_el_deg": worst_el,
        "max_abs_delta_az_cos_el_deg": worst_az,
        "evidence": _evidence(
            "directions",
            coverage=coverage,
            meets_criteria=bool(worst_el < DIRECTIONS_TARGET_DEG and worst_az < DIRECTIONS_TARGET_DEG),
            reference={
                "name": "JPL Horizons API",
                "url": "https://ssd.jpl.nasa.gov/api/horizons.api",
                "settings": "CENTER=coord@301, COORD_TYPE=GEODETIC at 0 km, QUANTITIES=4 (apparent azimuth and elevation), APPARENT=AIRLESS, TIME_TYPE=UT",
            },
            ours={"table": "data/ephemeris/moon_me_2024_2036_1h.f32", "frame": header["frame"], "abcorr": header["abcorr"],
                  "kernels": [k["name"] for k in header["kernels"]], "interpolation": header["interpolation"]},
        ),
        "sites": sites,
    }


# --- 2. terrain illumination against the LOLA maps ----------------------------------------------

def _map_value(grid: LolaGrid, c: int, r: int) -> float:
    return float(grid.data[r, c]) * grid.label.scaling_factor


def zero_pixel(map_px: list[float], ours_px: list[float]) -> int | None:
    """The corner where the map reads 0 while its other corners and our value there are clearly lit, if any."""
    for k, v in enumerate(map_px):
        others = [x for j, x in enumerate(map_px) if j != k]
        if v == 0.0 and ours_px[k] >= 0.05 and min(others) >= 0.05:
            return k
    return None


def _signed(x: float) -> str:
    """A signed figure to one decimal with a true minus sign, as the page writes them."""
    return f"{x:+.1f}".replace("-", "\u2212")


def gap_without(map_px: list[float], ours_px: list[float], weights: list[float], k: int) -> float:
    """Our value minus the map's in points, over the other three corners with their weights scaled back to a whole."""
    w = [x for j, x in enumerate(weights) if j != k]
    total = sum(w)
    ours = sum(wi * v for wi, v in zip(w, (x for j, x in enumerate(ours_px) if j != k))) / total
    theirs = sum(wi * v for wi, v in zip(w, (x for j, x in enumerate(map_px) if j != k))) / total
    return (ours - theirs) * 100.0


def mazarico_rows(days: int | None = None, cycle_days: int = CYCLE_DAYS, site_ids: list[str] | None = None) -> list[dict]:
    """Every polar site against the LOLA Sun and Earth maps, step by step from the app's numbers to the map's definitions.

    app: as the app computes (2 m mast, 20/80/240 m terrain, hourly 2024 to 2036, or `days` from 2024-01-01).
    surface: the observer on the ground. cycle: hourly over `cycle_days` (one 18.6-year cycle by default).
    matched: 60 m terrain at the map's four pixel centres, combined with the map's bilinear weights.
    """
    table, header = load_table()
    sun_map = LolaGrid.from_pds(config.ILLUM_DIR / f"{MAZARICO_PRODUCT}.lbl")
    earth_map = LolaGrid.from_pds(config.ILLUM_DIR / f"{EARTH_PRODUCT}.lbl")
    hours = int(header["n"]) if days is None else days * 24
    sites = [s for s in all_sites() if s.polar and (site_ids is None or s.id in site_ids)]
    if not any(bool(sun_map.covers(s.lat, s.lon)) for s in sites):
        return [{"site_id": s.id, "name": s.name, "lat": s.lat, "lon": s.lon, "covered": False} for s in sites]
    grids = load_grids()
    g60 = matched_grid()
    cyc_sun, cyc_earth = cycle_vectors(CYCLE_START, cycle_days)
    tab_sun = table[:hours, 0, :].astype(np.float64)
    tab_earth = table[:hours, 1, :].astype(np.float64)
    rows = []
    for site in sites:
        covered = bool(sun_map.covers(site.lat, site.lon))
        row: dict = {"site_id": site.id, "name": site.name, "lat": site.lat, "lon": site.lon, "covered": covered}
        if not covered:
            rows.append(row)
            continue
        series = hourly_series(site, load_mask(site.id), table, header, FULL_START, hours)
        app_sun = float(np.mean(np.asarray(series["sun_fraction"]) > 0.0))
        app_earth = float(np.mean(np.asarray(series["earth_visible"], dtype=bool)))
        ground = np.asarray(mask_for_site(site, grids, mast_m=0.0)["elevation_deg"], dtype=np.float64)
        surface = shares(site.lat, site.lon, ground, tab_sun, tab_earth)
        cycle = shares(site.lat, site.lon, ground, cyc_sun, cyc_earth)
        (c0, r0), weights = pixel_weights(sun_map, site.lat, site.lon)
        px = []
        for dc, dr in CORNERS:
            plat, plon = (float(v) for v in sun_map.latlon_from_pixel(c0 + dc, r0 + dr))
            px.append(shares(plat, plon, matched_mask(plat, plon, g60, grids), cyc_sun, cyc_earth))
        sun_px = [_map_value(sun_map, c0 + dc, r0 + dr) for dc, dr in CORNERS]
        earth_px = [_map_value(earth_map, c0 + dc, r0 + dr) for dc, dr in CORNERS]

        def bil(key: str, weights=weights, px=px) -> float:
            return float(sum(w * p[key] for w, p in zip(weights, px)))

        map_sun, map_earth = float(sun_map.value_at(site.lat, site.lon)), float(earth_map.value_at(site.lat, site.lon))
        matched_sun, matched_earth = bil("sun_any"), bil("earth_any")
        row.update({
            # The app's own share against the map, as before (the home page's figure reads these three).
            "ours_fraction": app_sun,
            "map_fraction": map_sun,
            "delta_points": (app_sun - map_sun) * 100.0,
            "sun": {
                "app": app_sun,
                "surface": surface["sun_any"],
                "cycle": cycle["sun_any"],
                "matched": matched_sun,
                "matched_disc_mean": bil("sun_disc_mean"),
                "map": map_sun,
                "gap_points": (matched_sun - map_sun) * 100.0,
                "app_gap_points": (app_sun - map_sun) * 100.0,
                "map_pixels": sun_px,
                "matched_pixels": [p["sun_any"] for p in px],
            },
            "earth": {
                "app_centre": app_earth,
                "matched_any": matched_earth,
                "matched_centre": bil("earth_centre"),
                "map": map_earth,
                "gap_points": (matched_earth - map_earth) * 100.0,
                "app_gap_points": (app_earth - map_earth) * 100.0,
                "map_pixels": earth_px,
                "matched_pixels": [p["earth_any"] for p in px],
            },
            "pixel_weights": weights,
        })
        k = zero_pixel(sun_px, row["sun"]["matched_pixels"])
        if k is not None:
            lit = [v for j, v in enumerate(sun_px) if j != k]
            sun_without = gap_without(sun_px, row["sun"]["matched_pixels"], weights, k)
            row["zero_pixel"] = {"corner": k, "sun_gap_points": sun_without}
            also = ""
            if zero_pixel(earth_px, row["earth"]["matched_pixels"]) == k:
                earth_without = gap_without(earth_px, row["earth"]["matched_pixels"], weights, k)
                row["zero_pixel"]["earth_gap_points"] = earth_without
                also = f" and {_signed(earth_without)} for Earth"
            row["note"] = (
                f"One of the four map pixels here reads 0 % where its neighbours read {min(lit) * 100:.0f} to "
                f"{max(lit) * 100:.0f} % and we find {row['sun']['matched_pixels'][k] * 100:.0f} %"
                f"{', in the Earth map as in the Sun map' if also else ''}; near the pole the maps have such zero pixels "
                f"next to lit ones. Leaving that pixel out, the gap is {_signed(sun_without)} points for sunlight{also}."
            )
        rows.append(row)
        print(f"[validate] {site.id}: map {map_sun:.3f}, matched {matched_sun:.3f}, app {app_sun:.3f}", flush=True)
    return rows


def _median(xs: list[float]) -> float | None:
    return float(statistics.median(xs)) if xs else None


def mazarico_summary(rows: list[dict]) -> dict:
    covered = [r for r in rows if r.get("covered") and "sun" in r]
    out: dict = {"sites": len(covered)}
    for body, alt, alt_name in (("sun", "matched_disc_mean", "disc_mean_median_gap_points"), ("earth", "matched_centre", "centre_median_gap_points")):
        gaps = [abs(r[body]["gap_points"]) for r in covered]
        worst = max(covered, key=lambda r: abs(r[body]["gap_points"])) if covered else None
        lit = [r for r in covered if r[body]["map"] >= 0.05]
        out[body] = {
            "median_abs_gap_points": _median(gaps),
            "within_agreement": sum(1 for g in gaps if g <= AGREE_POINTS),
            "within_2_points": sum(1 for g in gaps if g <= 2.0),
            "worst_site_id": worst["site_id"] if worst else None,
            "worst_gap_points": worst[body]["gap_points"] if worst else None,
            "app_median_abs_gap_points": _median([abs(r[body]["app_gap_points"]) for r in covered]),
            # The other rule, over the sites the map shows lit at least 5 % of the time: which rule the map follows.
            alt_name: _median([(r[body][alt] - r[body]["map"]) * 100.0 for r in lit]),
        }
    out["sun"]["span_effect_max_points"] = max((abs(r["sun"]["cycle"] - r["sun"]["surface"]) * 100.0 for r in covered), default=None)
    out["sun"]["mast_effect_median_points"] = _median([(r["sun"]["app"] - r["sun"]["surface"]) * 100.0 for r in covered])
    out["meets_criteria"] = bool(covered) and all(
        out[b]["median_abs_gap_points"] is not None and out[b]["median_abs_gap_points"] <= AGREE_POINTS for b in ("sun", "earth")
    )
    return out


def mazarico_doc(days: int | None = None, cycle_days: int = CYCLE_DAYS) -> dict:
    _table, header = load_table()
    hours = int(header["n"]) if days is None else days * 24
    last = datetime.fromisoformat(FULL_START) + timedelta(hours=hours - 1)
    cycle_last = datetime.fromisoformat(CYCLE_START) + timedelta(hours=cycle_days * 24 - 1)
    rows = mazarico_rows(days, cycle_days)
    summary = mazarico_summary(rows)
    span = [FULL_START, last.strftime("%Y-%m-%dT%H:%M:%S")]
    cycle_span = [CYCLE_START, cycle_last.strftime("%Y-%m-%dT%H:%M:%S")]
    sun_label = label_summary(config.ILLUM_DIR / f"{MAZARICO_PRODUCT}.lbl")
    earth_label = label_summary(config.ILLUM_DIR / f"{EARTH_PRODUCT}.lbl")
    span_effect = summary["sun"]["span_effect_max_points"] or 0.0
    unmatched = [
        f"Averaging window: the map averages hourly steps over 18.6 years, but its dates are not stated; ours runs hourly from {cycle_span[0]} to {cycle_span[1]} UTC ({cycle_days} days). The app's own 2024 to 2036 span (13 years, two thirds of the cycle) moves the shares by at most {span_effect:.1f} points at these sites.",
        "Terrain: the map was computed on LDEM_85S_060M, which the archive no longer holds; we use 60 m posts made from 3 x 3 means of today's LDEM_85S_20M, then LOLA 80 m where the 60 m map ends and 240 m from 100 to 220 km. How far the map's skylines reach beyond its own grid is not stated.",
        "Frame (matched): the label names the MEAN EARTH/POLAR AXIS OF DE421 frame; our MOON_ME is MOON_ME_DE440_ME421, which NAIF's frame kernel aligns with it to 5.8e-7 rad (about 1 m on the ground) over 1900 to 2051. Ephemeris (not matched): the map's is not stated; ours is DE440, whose Sun and Earth directions differ from DE421's by far less than the width of their discs.",
        "Skyline method: both take 720 directions (0.5 degrees) and cut the disc with a straight skyline at its centre's direction (Barker et al. 2021 describe the map's method); our march starts one 60 m post from the observer in 30 m steps, and the map's own steps are not described at that level.",
        "Limb darkening: the map's team models it; for 'any part of the disc' it does not matter, for the mean visible fraction of the disc it does, and we do not model it.",
        f"Earth: any part of a {EARTH_RADIUS_KM:,.0f} km sphere's disc; the product page says any part of the disc counts but not which radius.",
        "Sampling: ours at the map's four pixel centres around each site, combined with the map's bilinear weights; on steep rims one 60 m pixel can differ from the next by tens of points, so a site's value depends on its exact position.",
        "Map artefacts: within about 1 km of the pole the map has zero pixels next to lit ones (the release notes warn of artefacts from the elevation data); the row of the pole says what this does there.",
        "Label metadata: START_TIME and STOP_TIME (2009-07-13 to 2013-07-18) are the span of the altimetry, not the averaging period; the Earth label gives MINIMUM_LATITUDE as 90 for a south polar map and says 'sunlit' for Earth; the 2016 release label gave CENTER_LONGITUDE as 180 and INT32, corrected to 0 and INT16 in the label read here.",
    ]
    configurations = {
        "app": {
            "observer_m": 2.0,
            "terrain": "LOLA 20 m to 6 km south of 87.55 S (80 m from 40 m elsewhere), 80 m to 100 km, 240 m to 220 km, at the site",
            "span": span,
            "hours": hours,
            "sun_rule": "any part of the disc above the skyline",
            "earth_rule": "Earth's centre above the skyline",
        },
        "surface": {"observer_m": 0.0, "terrain": "as the app", "span": span, "hours": hours, "sun_rule": "any part of the disc"},
        "cycle": {"observer_m": 0.0, "terrain": "as the app", "span": cycle_span, "hours": cycle_days * 24, "sun_rule": "any part of the disc"},
        "matched": {
            "observer_m": 0.0,
            "terrain": f"60 m posts (3 x 3 means of {MATCHED_DEM.upper()}) from {MATCHED_R0_M:.0f} m in {MATCHED_STEP_M:.0f} m steps; LOLA 80 m where they end; 240 m from 100 to 220 km",
            "span": cycle_span,
            "hours": cycle_days * 24,
            "sun_rule": "any part of the disc above the skyline (also given: the mean visible fraction of the disc)",
            "earth_rule": f"any part of Earth's disc ({EARTH_RADIUS_KM:,.0f} km) above the skyline (also given: its centre)",
            "sampling": "at the map's four pixel centres around the site, combined with the map's bilinear weights",
        },
    }
    coverage = {
        "sites": summary["sites"],
        "polar_sites": len(rows),
        "outside_map": [r["site_id"] for r in rows if not r.get("covered")],
        "app_span": span,
        "app_hours": hours,
        "matched_span": cycle_span,
        "matched_hours": cycle_days * 24,
        "points_per_site": len(CORNERS),
    }
    return {
        "generated_utc": _now(),
        "period": span,
        "product": MAZARICO_PRODUCT,
        "evidence": _evidence("terrain", coverage=coverage, meets_criteria=summary["meets_criteria"], unmatched=unmatched),
        "reference": {
            "sun": sun_label,
            "earth": earth_label,
            "definition": "The share of hourly steps in which any part of the disc is above the terrain skyline (the label's DESCRIPTION; the product page says the same for Earth).",
            "averaging": "Hourly steps over 18.6 years, one lunar precession cycle (PGDA product 69; the 2014 release notes say the same of the earlier 240 m maps); the dates are not stated. The 2011 paper's abstract also describes runs over several cycles at 6 h steps.",
            "observer": "On the lunar surface (the 2014 release notes, of the earlier 240 m maps); the product page leaves height above the surface to further analysis.",
            "terrain": "LDEM_85S_060M, 60 m per pixel (the label).",
            "method": "Mazarico et al. 2011: skyline elevations in 720 directions; the disc cut by a straight skyline at its centre's direction (as Barker et al. 2021 describe it).",
            "sources": SOURCES,
        },
        "configurations": configurations,
        "summary": summary,
        "rows": rows,
    }


# --- 3. numerical verification of the power model -----------------------------------------------

def _cfg(**kw) -> dict:
    base = {"panel": "full_tracking", "panel_azimuth_deg": 0.0, "area_m2": 4.0, "efficiency": 0.3,
            "load_w": 200.0, "battery_wh": 2000.0, "initial_soc_fraction": 1.0}
    return {**base, **kw}


def _case(cid: str, words: str, hand: str, n: int, cfg: dict, az=0.0, el=10.0, frac=1.0, au=1.0) -> dict:
    def expand(v) -> list[float]:
        return [float(x) for x in v] if isinstance(v, (list, tuple)) else [float(v)] * n

    return {"id": cid, "words": words, "hand": hand,
            "inputs": {"hours": n, "sun_az": expand(az), "sun_el": expand(el), "sun_fraction": expand(frac), "sun_au": expand(au), "config": cfg}}


POWER_CASES = [
    _case("full_sun", "A two-axis panel in full sunshine at 1 AU.", "0.3 x 4 m2 x 1361 W/m2 = 1633.2 W", 3, _cfg()),
    _case("half_disc", "Half of the Sun's disc above the hills.", "1633.2 W x 0.5 = 816.6 W", 3, _cfg(), frac=0.5),
    _case("near_perihelion", "The Sun 0.983 AU away.", "1633.2 W / 0.983^2 = 1690.2 W", 2, _cfg(), au=0.983),
    _case("vertical_side_on", "A vertical panel facing east, the Sun 60 degrees round from it and 5 degrees up.",
          "1633.2 W x cos 5 x cos 60 = 813.5 W", 2, _cfg(panel="vertical", panel_azimuth_deg=90.0), az=150.0, el=5.0),
    _case("vertical_from_behind", "A vertical panel facing east with the Sun behind it.", "cos 180 is below 0, so 0 W",
          2, _cfg(panel="vertical", panel_azimuth_deg=90.0), az=270.0, el=5.0),
    _case("horizontal_low_sun", "A flat panel with the Sun 3 degrees up.", "1633.2 W x sin 3 = 85.5 W",
          2, _cfg(panel="horizontal"), el=3.0),
    _case("below_flat_horizon", "A panel turning to the Sun, which is 1 degree below the flat horizon but above a lower skyline.",
          "1633.2 W x cos 1 = 1633.0 W", 2, _cfg(panel="vertical_tracking"), el=-1.0),
    _case("night_on_a_full_battery", "Twelve hours of night on a full 2000 Wh battery with a 200 W load.",
          "2000 Wh / 200 W = 10 h, then two hours without power", 12, _cfg(), frac=0.0),
    _case("recharge_from_half", "A half-full battery charging with 133.2 W to spare until it is full.",
          "1000 Wh + 7 x 133.2 Wh = 1932.4 Wh, then full at 2000 Wh", 9, _cfg(load_w=1500.0, initial_soc_fraction=0.5)),
]


def worked_answer(inputs: dict) -> dict:
    """The case worked out by hand formula, one hour at a time with the math module (written apart from power.py)."""
    cfg = inputs["config"]
    power = []
    for az, el, frac, au in zip(inputs["sun_az"], inputs["sun_el"], inputs["sun_fraction"], inputs["sun_au"]):
        e = math.radians(el)
        cosine = {
            "horizontal": math.sin(e),
            "vertical": math.cos(e) * math.cos(math.radians(az - cfg["panel_azimuth_deg"])),
            "vertical_tracking": math.cos(e),
            "full_tracking": 1.0,
        }[cfg["panel"]]
        power.append(cfg["efficiency"] * cfg["area_m2"] * 1361.0 / (au * au) * frac * max(0.0, cosine))
    cap = cfg["battery_wh"]
    stored = cfg["initial_soc_fraction"] * cap
    energy, brownouts, first, lowest = [], 0, None, stored / cap
    for hour, watts in enumerate(power):
        stored += watts - cfg["load_w"]  # one hour, so watts are watt-hours
        if stored < 0.0:
            brownouts += 1
            first = hour if first is None else first
            stored = 0.0
        stored = min(stored, cap)
        energy.append(stored)
        lowest = min(lowest, stored / cap)
    return {"power_w": power, "energy_wh": energy, "brownout_hours": brownouts, "first_brownout_hour": first, "soc_min": lowest}


def pipeline_answer(inputs: dict) -> dict:
    """The same case through the pipeline's power model (power.py, NumPy)."""
    series = {k: np.asarray(inputs[k], dtype=np.float64) for k in ("sun_az", "sun_el", "sun_fraction", "sun_au")}
    r = power_budget(series, PowerConfig(**inputs["config"]))
    return {"power_w": [float(x) for x in r["power_w"]], "energy_wh": [float(x) for x in r["energy_wh"]],
            "brownout_hours": r["brownout_hours"], "first_brownout_hour": r["first_brownout_hour"], "soc_min": r["soc_min"]}


def _fixture_rerun(path: Path) -> dict:
    fx = json.loads(path.read_text())
    now = power_fixture(fx["site_id"], fx["start_utc"], fx["days"], PowerConfig(**fx["config"]))
    dw = max(abs(a - b) for a, b in zip(now["samples"]["power_w"], fx["samples"]["power_w"]))
    dwh = max(abs(a - b) for a, b in zip(now["samples"]["energy_wh"], fx["samples"]["energy_wh"]))
    same = (now["summary"]["brownout_hours"], now["summary"]["first_brownout_hour"]) == (fx["summary"]["brownout_hours"], fx["summary"]["first_brownout_hour"])
    return {"file": path.name, "site_id": fx["site_id"], "start_utc": fx["start_utc"], "days": fx["days"], "hours": fx["days"] * 24,
            "panel": fx["config"]["panel"], "sample_hours": len(fx["sample_indexes"]),
            "max_abs_diff_w": dw, "max_abs_diff_wh": dwh, "brownouts_equal": same,
            "agrees": dw <= POWER_TOLERANCE and dwh <= POWER_TOLERANCE and same}


def power_doc(fixtures: bool = True) -> dict:
    cases = []
    for c in POWER_CASES:
        want, got = worked_answer(c["inputs"]), pipeline_answer(c["inputs"])
        dw = max(abs(a - b) for a, b in zip(want["power_w"], got["power_w"]))
        dwh = max(abs(a - b) for a, b in zip(want["energy_wh"], got["energy_wh"]))
        same = (want["brownout_hours"], want["first_brownout_hour"]) == (got["brownout_hours"], got["first_brownout_hour"])
        agrees = dw <= POWER_TOLERANCE and dwh <= POWER_TOLERANCE and same and abs(want["soc_min"] - got["soc_min"]) <= 1e-12
        cases.append({**c, "expected": want, "pipeline": got, "max_abs_diff_w": dw, "max_abs_diff_wh": dwh, "agrees": agrees})
    reruns = [_fixture_rerun(p) for p in sorted((config.DATA_DIR / "fixtures" / "power").glob("*.json"))] if fixtures else []
    coverage = {
        "cases": len(cases),
        "case_hours": sum(c["inputs"]["hours"] for c in cases),
        "panels": sorted({c["inputs"]["config"]["panel"] for c in cases}),
        "recorded_runs": len(reruns),
        "recorded_sites": sorted({r["site_id"] for r in reruns}),
        "recorded_hours": sum(r["hours"] for r in reruns),
        "app_tests": [
            "web/src/lib/engine/power.test.ts: the app's engine against the recorded runs, to 0.000001 W",
            "web/src/lib/viz/checks.ts: the app's engine against the worked cases, in the browser",
        ],
    }
    ok = all(c["agrees"] for c in cases) and all(r["agrees"] for r in reruns)
    return {
        "generated_utc": _now(),
        "evidence": _evidence("sums", coverage=coverage, meets_criteria=ok),
        "summary": {"cases_agreeing": sum(1 for c in cases if c["agrees"]), "runs_agreeing": sum(1 for r in reruns if r["agrees"]),
                    "max_abs_diff_w": max(c["max_abs_diff_w"] for c in cases), "max_abs_diff_wh": max(c["max_abs_diff_wh"] for c in cases)},
        "cases": cases,
        "recorded_runs": reruns,
    }


# --- 4. historical mission context --------------------------------------------------------------

def first_transition(lit, start: int, to_dark: bool) -> int | None:
    """Index of the first hour at or after `start` that is dark (to_dark) or lit (not to_dark); None when it never happens."""
    flags = np.asarray(lit, dtype=bool)
    for h in range(max(0, start), flags.size):
        if flags[h] != to_dark:
            return h
    return None


def _iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def backcast_row_for(site_id: str, days: int = 45) -> dict:
    """Predicted local sunset/sunrise after a landing against the reported end of the mission."""
    site: Site = next(s for s in all_sites() if s.id == site_id)
    if not site.landed_utc:
        raise ValueError(f"{site_id} has no landed_utc")
    table, header = load_table()
    mask_path = config.DATA_DIR / "masks" / f"{site_id}.json"
    skyline = "lola" if mask_path.exists() else "flat"
    mask = load_mask(site_id) if skyline == "lola" else np.zeros(720)
    landed = site.landed_utc.replace("Z", "")
    start = landed[:13] + ":00:00"  # the hour containing the landing
    series = hourly_series(site, mask, table, header, start, days * 24)
    lit = np.asarray(series["sun_fraction"]) > 0.0
    sunset_h = first_transition(lit, 0, to_dark=True)
    sunrise_h = first_transition(lit, sunset_h, to_dark=False) if sunset_h is not None else None
    t0 = datetime.fromisoformat(start)
    end = datetime.fromisoformat(site.mission_end_utc.replace("Z", "")) if site.mission_end_utc else None
    end_minus_sunset = None
    if end is not None and sunset_h is not None:
        end_minus_sunset = (end - (t0 + timedelta(hours=int(sunset_h)))).total_seconds() / 3600.0
    return {
        "site_id": site.id,
        "name": site.name,
        "lat": site.lat,
        "lon": site.lon,
        "landed_utc": site.landed_utc,
        "mission_end_utc": site.mission_end_utc,
        "mission_end_source": site.mission_end_source,
        "mission_note": site.mission_note,
        "skyline": skyline,
        "sun_el_at_landing_deg": float(series["sun_el"][0]),
        "sunset_utc": _iso(t0 + timedelta(hours=int(sunset_h))) if sunset_h is not None else None,
        "sunrise_utc": _iso(t0 + timedelta(hours=int(sunrise_h))) if sunrise_h is not None else None,
        "daylight_hours_after_landing": int(sunset_h) if sunset_h is not None else None,
        "end_minus_sunset_h": end_minus_sunset,
    }


def backcasts_doc() -> dict:
    rows = [backcast_row_for(s.id) for s in all_sites() if s.landed_utc]
    coverage = {
        "missions": len(rows),
        "landed_utc": {r["site_id"]: r["landed_utc"] for r in rows},
        "end_hour_published": {r["site_id"]: "hour not published" not in (r["mission_end_source"] or "") for r in rows},
        "skylines": {r["site_id"]: r["skyline"] for r in rows},
    }
    return {"generated_utc": _now(), "evidence": _evidence("missions", coverage=coverage), "rows": rows}


def _plain(value):
    """NumPy scalars as plain numbers and booleans, for JSON."""
    if isinstance(value, np.generic):
        return value.item()
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def write_all(out_dir: Path = OUT_DIR) -> list[Path]:
    ensure_inputs()
    out_dir.mkdir(parents=True, exist_ok=True)
    docs = {
        "horizons.json": horizons_doc(),
        "mazarico.json": mazarico_doc(),
        "power.json": power_doc(),
        "backcasts.json": backcasts_doc(),
    }
    paths: list[Path] = []
    for name, doc in docs.items():
        p = out_dir / name
        p.write_text(json.dumps(doc, indent=1, default=_plain) + "\n", encoding="utf-8", newline="\n")
        paths.append(p)
    return paths
