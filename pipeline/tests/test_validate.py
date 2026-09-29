import numpy as np
import pytest

from lunar_pipeline import validate as va
from tests.conftest import needs_illum, needs_kernels


def test_sunset_sunrise_from_flags():
    # hours 0-4 lit, 5-9 dark, 10-12 lit
    lit = np.array([1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1], dtype=bool)
    assert va.first_transition(lit, start=0, to_dark=True) == 5
    assert va.first_transition(lit, start=5, to_dark=False) == 10
    assert va.first_transition(np.ones(4, dtype=bool), start=0, to_dark=True) is None


@pytest.mark.data
@needs_kernels
def test_backcast_for_a_non_polar_site_uses_a_flat_skyline():
    row = va.backcast_row_for("blue_ghost_m1")
    assert row["skyline"] == "flat"
    assert row["sunset_utc"].startswith("2025-03-1")
    assert 300 < row["daylight_hours_after_landing"] < 360
    assert abs(row["end_minus_sunset_h"]) < 12


@pytest.mark.data
@needs_kernels
def test_backcast_im1_ended_before_its_predicted_sunset():
    # Odysseus landed on its side with the panels tilted away and lost power as the Sun got low,
    # about three days before local sunset at the planned site.
    row = va.backcast_row_for("im1_odysseus")
    assert row["skyline"] == "lola"
    assert -96 < row["end_minus_sunset_h"] < 0


@pytest.mark.data
@needs_illum
def test_mazarico_rows_skip_uncovered_sites():
    rows = va.mazarico_rows(days=30)
    by_id = {r["site_id"]: r for r in rows}
    assert by_id["im1_odysseus"]["covered"] is False and "map_fraction" not in by_id["im1_odysseus"]
    assert by_id["shackleton_center"]["covered"] is True
    assert by_id["shackleton_center"]["map_fraction"] < 0.02
