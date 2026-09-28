"""Paths and physical constants shared by every pipeline module."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"  # committed, small outputs
RAW_DIR = REPO_ROOT / "data_raw"  # gitignored downloads
OUT_DIR = REPO_ROOT / "data_out"  # gitignored generated tiles

KERNEL_DIR = RAW_DIR / "kernels"
LOLA_DIR = RAW_DIR / "lola"
ILLUM_DIR = RAW_DIR / "illumination"

R_MOON_M = 1737400.0  # LOLA reference sphere radius, metres
AU_KM = 149_597_870.7
SUN_RADIUS_KM = 695_700.0
