import numpy as np
import pytest

from lunar_pipeline import power as pw


def test_panel_cosines():
    assert pw.panel_cosine("horizontal", 0, 90, 30)[()] == pytest.approx(np.sin(np.radians(30)))
    assert pw.panel_cosine("vertical", 45, 45, 10)[()] == pytest.approx(np.cos(np.radians(10)))
    assert pw.panel_cosine("vertical", 45, 135, 10)[()] == pytest.approx(0.0, abs=1e-12)
    assert pw.panel_cosine("vertical", 0, 180, 10)[()] == 0.0
    assert pw.panel_cosine("vertical_tracking", 0, 200, 10)[()] == pytest.approx(np.cos(np.radians(10)))
    assert pw.panel_cosine("full_tracking", 0, 200, 10)[()] == 1.0
    assert pw.panel_cosine("horizontal", 0, 0, -1)[()] == 0.0
    with pytest.raises(ValueError):
        pw.panel_cosine("sail", 0, 0, 10)


def test_irradiance():
    assert pw.irradiance_wm2(1.0, 1.0)[()] == 1361.0
    assert pw.irradiance_wm2(2.0, 1.0)[()] == pytest.approx(340.25)
    assert pw.irradiance_wm2(1.0, 0.0)[()] == 0.0


def test_battery_discharge_and_brownout():
    cfg = pw.PowerConfig(load_w=100.0, battery_wh=1000.0, initial_soc_fraction=1.0)
    r = pw.simulate_battery(np.zeros(20), cfg)
    assert r["energy_wh"][0] == 900.0 and r["energy_wh"][9] == 0.0
    assert r["soc_min"] == 0.0 and r["first_brownout_hour"] == 10 and r["brownout_hours"] == 10
    assert r["survives"] is False


def test_battery_clamps_at_capacity():
    cfg = pw.PowerConfig(load_w=100.0, battery_wh=1000.0, initial_soc_fraction=0.5)
    r = pw.simulate_battery(np.full(5, 500.0), cfg)
    assert list(r["energy_wh"]) == [900.0, 1000.0, 1000.0, 1000.0, 1000.0]
    assert r["soc_min"] == pytest.approx(0.5) and r["survives"] is True and r["mean_power_w"] == 500.0


def test_zero_capacity_battery():
    r = pw.simulate_battery(np.full(2, 500.0), pw.PowerConfig(battery_wh=0.0))
    assert r["soc_min"] == 0.0 and r["survives"] is True


def test_config_dict_round_trips_defaults():
    d = pw.config_dict(pw.PowerConfig())
    assert d["panel"] == "vertical_tracking" and d["area_m2"] == 4.0 and d["battery_wh"] == 2000.0
