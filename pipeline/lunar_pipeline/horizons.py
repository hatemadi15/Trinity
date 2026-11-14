"""JPL Horizons cross-check: Sun/Earth az/el seen from lunar surface sites."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

import numpy as np

from . import config
from .ephemeris import interp_vectors, load_table
from .fetch import make_session
from .geometry import azel_from_body_vectors
from .sites import all_sites
from .spice_env import spice_kernels, utc_to_et

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
BODY_IDS = {"SUN": 10, "EARTH": 399}
FIXTURE_SITES = ["south_pole", "shackleton_center", "de_gerlache_center", "im1_odysseus", "im2_athena", "blue_ghost_m1"]


def horizons_url(lat: float, lon: float, alt_km: float, body_id: int, start: str, stop: str, step: str) -> str:
    params = {
        "format": "json",
        "COMMAND": f"'{body_id}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},{alt_km}'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{step}'",
        "QUANTITIES": "'4'",
        "APPARENT": "'AIRLESS'",
        "CSV_FORMAT": "'YES'",
        "TIME_TYPE": "'UT'",
    }
    return API + "?" + urlencode(params)


_ROW = re.compile(r"^\s*(\d{4}-[A-Za-z]{3}-\d{2} \d{2}:\d{2})")


def parse_horizons_csv(text: str) -> list[dict]:
    if "$$SOE" not in text or "$$EOE" not in text:
        raise ValueError("Horizons result has no $$SOE/$$EOE block: " + text[:200])
    body = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows = []
    for line in body.strip().splitlines():
        m = _ROW.match(line)
        if not m:
            continue
        fields = [f.strip() for f in line.split(",")]
        numeric = [f for f in fields[1:] if re.fullmatch(r"[-+]?\d+(\.\d+)?", f)]
        az, el = float(numeric[-2]), float(numeric[-1])
        utc = datetime.strptime(m.group(1), "%Y-%b-%d %H:%M").strftime("%Y-%m-%dT%H:%M:%S")
        rows.append({"utc": utc, "az": az, "el": el})
    if not rows:
        raise ValueError("Horizons result contained no ephemeris rows")
    return rows


def fetch_fixtures(
    site_ids: list[str] | None = None,
    start: str = "2025-01-01",
    stop: str = "2027-01-01",
    step: str = "30d",
    out_dir: Path = config.DATA_DIR / "fixtures" / "horizons",
) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    sites = {s.id: s for s in all_sites()}
    paths: list[Path] = []
    for sid in site_ids or FIXTURE_SITES:
        site = sites[sid]
        for body, body_id in BODY_IDS.items():
            url = horizons_url(site.lat, site.lon, 0.0, body_id, start, stop, step)
            r = make_session().get(url, timeout=120)
            if r.status_code != 200:
                raise RuntimeError(f"Horizons HTTP {r.status_code} for {url}")
            result = r.json().get("result", "")
            rows = parse_horizons_csv(result)
            doc = {"site_id": sid, "body": body, "lat": site.lat, "lon": site.lon, "alt_km": 0.0,
                   "query_url": url, "rows": rows}
            path = out_dir / f"{sid}_{body.lower()}.json"
            path.write_text(json.dumps(doc, indent=1) + "\n")
            print(f"[horizons] {path.name}: {len(rows)} rows", flush=True)
            paths.append(path)
    return paths


def compare_all(fixtures_dir: Path = config.DATA_DIR / "fixtures" / "horizons", out: Path | None = None) -> dict:
    """Compares our directions with each Horizons fixture and writes the summary to `out` (by default beside the
    fixtures, which is what the horizons-compare command commits; the tests pass a temporary file)."""
    table, header = load_table()
    per_file = []
    worst_el = worst_az = 0.0
    n_rows = 0
    with spice_kernels():
        for path in sorted(fixtures_dir.glob("*_sun.json")) + sorted(fixtures_dir.glob("*_earth.json")):
            doc = json.loads(path.read_text())
            row_index = 0 if doc["body"] == "SUN" else 1
            d_el = d_az = 0.0
            for row in doc["rows"]:
                et = utc_to_et(row["utc"])
                vec = interp_vectors(table, header["t0_et"], header["step_s"], et)[row_index]
                az, el = azel_from_body_vectors(vec, doc["lat"], doc["lon"], 0.0)
                daz = (float(az) - row["az"] + 180.0) % 360.0 - 180.0
                d_az = max(d_az, abs(daz * np.cos(np.radians(row["el"]))))
                d_el = max(d_el, abs(float(el) - row["el"]))
                n_rows += 1
            per_file.append({"file": path.name, "max_abs_delta_el_deg": d_el, "max_abs_delta_az_cos_el_deg": d_az})
            worst_el, worst_az = max(worst_el, d_el), max(worst_az, d_az)
    summary = {"n_rows": n_rows, "max_abs_delta_el_deg": worst_el, "max_abs_delta_az_cos_el_deg": worst_az,
               "files": per_file}
    (out or fixtures_dir / "summary.json").write_text(json.dumps(summary, indent=1) + "\n", encoding="utf-8", newline="\n")
    return summary
