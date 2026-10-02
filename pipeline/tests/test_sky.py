import numpy as np
import pytest

from lunar_pipeline import sky

SAMPLE = """line[1] = ads ads_comp alt_name bii bv_color bv_uncert cdec cdec_1950 class cra cra_1950 dec dec_1900 dec_1950 dm_cat dm_num fk5 glat glon hd hr ir_flag lii m_cnt m_id m_mdiff m_sep multiple name note par_code parallax pmdec pmra ra ra_1900 ra_1950 radvel radvel_comm ri_code ri_color rotvel rotvel_comm rotvel_uncert sao spect_code spect_type ub_color ub_uncert var_id vmag vmag_code vmag_uncert
<DATA>
||Sig Oct|-27.7134|0.27||-885723|-890818|2403|210846.2|201510.6|-88.9564|-89.25000000047|-89.1383|CP|-89   47|923|-27.71|303.91|177482|7228||303.905||||||HR 7228|*|||0.005|0.023|317.1925|284.9337499936|303.7943|12||||108|||258857||F0III|0.13||Sig Oct|5.47|||
5423||9Alp CMa|-8.8903|0||-164258|-163947|2315|064508.9|064254.8|-16.7161|-16.56666666789|-16.663|BD|-16 1591|257|-8.88|227.22|48915|2491|I|227.23|4|AB|10.3|11.2||HR 2491|*||0.375|-1.205|-0.553|101.2871|100.185833327|100.7283|-8|SBO||-0.03|13|||151881||A1Vm|-0.05|||-1.46|||
<END>
"""


def test_parses_the_catalogue_rows_by_their_named_columns():
    rows = sky.parse_bsc5p(SAMPLE)
    assert [r['name'] for r in rows] == ['HR 7228', 'HR 2491']
    assert rows[1]['vmag'] == pytest.approx(-1.46)
    assert rows[1]['ra'] == pytest.approx(101.2871)
    assert rows[1]['dec'] == pytest.approx(-16.7161)
    assert rows[0]['bv'] == pytest.approx(0.27)


def test_star_table_is_unit_vectors_sorted_by_magnitude():
    table = sky.star_table(sky.parse_bsc5p(SAMPLE), max_vmag=6.5)
    assert table.shape == (2, 5)
    assert table[0, 3] == pytest.approx(-1.46)  # Sirius first
    assert np.allclose(np.linalg.norm(table[:, :3], axis=1), 1.0, atol=1e-6)


def test_quaternions_round_trip_and_keep_one_hemisphere():
    rng = np.random.default_rng(1)
    mats = []
    for _ in range(5):
        q = rng.normal(size=4); q /= np.linalg.norm(q)
        mats.append(sky.quat_to_matrix(q))
    qs = sky.matrices_to_quats(np.array(mats))
    for m, q in zip(mats, qs):
        assert np.allclose(sky.quat_to_matrix(q), m, atol=1e-6)
    flipped = sky.matrices_to_quats(np.array([mats[0], mats[0]]))
    assert np.dot(flipped[0], flipped[1]) > 0
