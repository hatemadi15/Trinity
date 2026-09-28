import json

import pytest

from lunar_pipeline import config
from lunar_pipeline.horizons import compare_all, horizons_url, parse_horizons_csv
from tests.conftest import needs_fixtures, needs_kernels

SAMPLE = """API VERSION: 1.2
*******************************************************************************
$$SOE
 2025-Jan-01 00:00,*,m,  123.4567,   -1.2345,
 2025-Jan-31 00:00, ,m,  200.0001,    3.5000,
$$EOE
*******************************************************************************
"""


def test_parse_horizons_csv_rows():
    rows = parse_horizons_csv(SAMPLE)
    assert rows == [
        {"utc": "2025-01-01T00:00:00", "az": 123.4567, "el": -1.2345},
        {"utc": "2025-01-31T00:00:00", "az": 200.0001, "el": 3.5},
    ]


def test_parse_horizons_rejects_missing_soe():
    with pytest.raises(ValueError):
        parse_horizons_csv("No ephemeris for target ... error")


def test_horizons_url_encodes_site_and_body():
    url = horizons_url(-89.66, 129.2, 0.0, 10, "2025-01-01", "2027-01-01", "30d")
    assert "CENTER=%27coord%40301%27" in url and "SITE_COORD=%27129.2%2C-89.66%2C0.0%27" in url
    assert "COMMAND=%2710%27" in url and "QUANTITIES=%274%27" in url and "APPARENT=%27AIRLESS%27" in url


@pytest.mark.data
@needs_kernels
@needs_fixtures
def test_our_azel_matches_horizons_within_tolerance():
    summary = compare_all()
    assert summary["n_rows"] >= 100
    # Achieved ~3e-5 deg; 0.002 deg still catches a UTC-as-TDB slip (9e-3) or dropped aberration (6e-3).
    assert summary["max_abs_delta_el_deg"] < 0.002
    assert summary["max_abs_delta_az_cos_el_deg"] < 0.002
    assert (config.DATA_DIR / "fixtures" / "horizons" / "summary.json").exists()
