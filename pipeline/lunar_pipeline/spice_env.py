"""Load and unload the fixed kernel set."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path

import spiceypy as spice

from . import config

KERNEL_ORDER = [
    "naif0012.tls",
    "pck00011.tpc",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf",
    "de440s.bsp",
]


@contextmanager
def spice_kernels(kernel_dir: Path = config.KERNEL_DIR):
    paths = [kernel_dir / k for k in KERNEL_ORDER]
    missing = [p.name for p in paths if not p.exists()]
    if missing:
        raise FileNotFoundError(f"missing kernels {missing}; run the fetch command first")
    for p in paths:
        spice.furnsh(str(p))
    try:
        yield paths
    finally:
        spice.kclear()


def utc_to_et(iso_utc: str) -> float:
    """ISO 8601 UTC string -> TDB seconds past J2000. Kernels must be loaded."""
    return spice.str2et(iso_utc)
