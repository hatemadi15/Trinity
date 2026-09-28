"""Hourly Sun and Earth position table in the MOON_ME body-fixed frame."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import spiceypy as spice

from . import config
from .spice_env import KERNEL_ORDER, spice_kernels

T0_UTC = "2024-01-01T00:00:00"
STEP_S = 3600.0
N_STEPS = 113_952  # hourly through 2036-12-31T23:00 UTC
BODIES = ("SUN", "EARTH")
FRAME = "MOON_ME"
ABCORR = "LT+S"
TABLE_NAME = "moon_me_2024_2036_1h.f32"
HEADER_NAME = "moon_me_2024_2036_1h.json"


def build_table(n_steps: int = N_STEPS) -> tuple[np.ndarray, float]:
    """Return (table[n, 2, 3] km float32, t0_et). Row 0 = Sun, row 1 = Earth."""
    table = np.empty((n_steps, 2, 3), dtype=np.float64)
    with spice_kernels():
        t0_et = spice.str2et(T0_UTC)
        for i in range(n_steps):
            et = t0_et + i * STEP_S
            for b, body in enumerate(BODIES):
                pos, _lt = spice.spkpos(body, et, FRAME, ABCORR, "MOON")
                table[i, b, :] = pos
    return table.astype("<f4"), float(t0_et)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def write_table(out_dir: Path = config.DATA_DIR / "ephemeris", n_steps: int = N_STEPS) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    table, t0_et = build_table(n_steps)
    table_path = out_dir / TABLE_NAME
    table.tofile(table_path)
    header = {
        "t0_utc": T0_UTC,
        "t0_et": t0_et,
        "step_s": STEP_S,
        "n": n_steps,
        "bodies": list(BODIES),
        "frame": FRAME,
        "abcorr": ABCORR,
        "observer": "MOON",
        "units": "km",
        "dtype": "<f4",
        "shape": [n_steps, 2, 3],
        "layout": "row-major [step][body][xyz]",
        "interpolation": "cubic Catmull-Rom on the hourly grid",
        "tdb_minus_utc_note": "TDB-UTC = 69.184 s while no new leap second is scheduled",
        "kernels": [{"name": k, "sha256": _sha256(config.KERNEL_DIR / k)} for k in KERNEL_ORDER],
        "table_sha256": _sha256(table_path),
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (out_dir / HEADER_NAME).write_text(json.dumps(header, indent=2) + "\n")
    return table_path


def load_table(dir: Path = config.DATA_DIR / "ephemeris") -> tuple[np.ndarray, dict]:
    header = json.loads((dir / HEADER_NAME).read_text())
    table = np.fromfile(dir / TABLE_NAME, dtype="<f4").reshape(header["shape"])
    return table, header


def interp_vectors(table: np.ndarray, t0_et: float, step_s: float, et: float) -> np.ndarray:
    """Catmull-Rom interpolation of both body vectors at TDB epoch et. Returns (2, 3) km."""
    x = (et - t0_et) / step_s
    n = table.shape[0]
    if not (1.0 <= x <= n - 3):
        raise ValueError(f"epoch outside interpolation range (x={x:.3f}, n={n})")
    i = int(np.floor(x))
    if i > n - 3:
        i = n - 3
    t = x - i
    p0, p1, p2, p3 = (table[i - 1 : i + 3].astype(np.float64))
    return 0.5 * (
        2.0 * p1
        + (-p0 + p2) * t
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t * t * t
    )
