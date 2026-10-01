import numpy as np

from lunar_pipeline.landing import best_landing, powered_from
from lunar_pipeline.power import PowerConfig, power_series

# 1361 W while any Sun shows, 100 W load, 1000 Wh battery: ten hours in the dark.
CFG = PowerConfig(panel="full_tracking", area_m2=1.0, efficiency=1.0, load_w=100.0, battery_wh=1000.0)


def series(sun, earth=None) -> dict:
    sun = np.asarray(sun, dtype=np.float64)
    n = sun.size
    return {
        "sun_az": np.zeros(n),
        "sun_el": np.full(n, 5.0),
        "sun_fraction": sun,
        "sun_au": np.ones(n),
        "earth_visible": np.asarray(earth if earth is not None else np.zeros(n), dtype=bool),
    }


def test_powered_from_counts_the_hours_to_the_first_brownout():
    dark = power_series(series([0] * 30), CFG)
    assert powered_from(dark, CFG, 0, 30) == 10
    assert powered_from(dark, CFG, 0, 6) == 6  # capped at the period
    assert powered_from(dark, CFG, 25, 30) == 5  # capped at the end of the table
    day_then_night = power_series(series([1] * 5 + [0] * 30), CFG)
    assert powered_from(day_then_night, CFG, 0, 35) == 15
    assert powered_from(day_then_night, CFG, 5, 35) == 10


def test_best_landing_is_the_sunlit_hour_with_the_longest_time_with_power():
    s = series([0] * 10 + [1] * 20 + [0] * 30 + [1] * 5 + [0] * 40)
    assert best_landing(s, CFG, 0, 105, 1, 100) == {"hour": 10, "powered_hours": 30, "earth_fraction": 0.0}


def test_ties_go_to_more_contact_with_earth_then_to_the_earlier_hour():
    sun = [1] * 10 + [0] * 30 + [1] * 10 + [0] * 30
    earth = [0] * 40 + [1] * 40
    assert best_landing(series(sun, earth), CFG, 0, 80, 1, 80)["hour"] == 40
    assert best_landing(series(sun), CFG, 0, 80, 1, 80)["hour"] == 0


def test_no_sunlit_hour_means_no_landing_date():
    assert best_landing(series([0] * 50), CFG, 0, 50, 1, 50) is None


def test_time_with_power_is_capped_at_the_period_length():
    assert best_landing(series([1] * 50), CFG, 0, 26, 6, 24) == {"hour": 0, "powered_hours": 24, "earth_fraction": 0.0}
