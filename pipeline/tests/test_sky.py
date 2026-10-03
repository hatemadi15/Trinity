import json
import math

import numpy as np
import pytest

from lunar_pipeline import sky

SAMPLE = """line[1] = ads ads_comp alt_name bii bv_color bv_uncert cdec cdec_1950 class cra cra_1950 dec dec_1900 dec_1950 dm_cat dm_num fk5 glat glon hd hr ir_flag lii m_cnt m_id m_mdiff m_sep multiple name note par_code parallax pmdec pmra ra ra_1900 ra_1950 radvel radvel_comm ri_code ri_color rotvel rotvel_comm rotvel_uncert sao spect_code spect_type ub_color ub_uncert var_id vmag vmag_code vmag_uncert
<DATA>
||Sig Oct|-27.7134|0.27||-885723|-890818|2403|210846.2|201510.6|-88.9564|-89.25000000047|-89.1383|CP|-89   47|923|-27.71|303.91|177482|7228||303.905||||||HR 7228|*|||0.005|0.023|317.1925|284.9337499936|303.7943|12||||108|||258857||F0III|0.13||Sig Oct|5.47|||
5423||9Alp CMa|-8.8903|0||-164258|-163947|2315|064508.9|064254.8|-16.7161|-16.56666666789|-16.663|BD|-16 1591|257|-8.88|227.22|48915|2491|I|227.23|4|AB|10.3|11.2||HR 2491|*||0.375|-1.205|-0.553|101.2871|100.185833327|100.7283|-8|SBO||-0.03|13|||151881||A1Vm|-0.05|||-1.46|||
<END>
"""
# Four real rows: Acrux's two components, which the catalogue numbers (Alp1Cru, Alp2Cru), and Gacrux with its
# 6th-magnitude companion, which share "Gam Cru" and differ only in their ADS component letter (A, B).
CRUX = SAMPLE.split('<DATA>')[0] + """<DATA>
|A|Alp1Cru|-0.3627|-0.24||-630557|-624921|2204|122635.9|122347.8|-63.0992|-62.53333333447|-62.8224|CP|-62 2745|462|-0.36|300.13|108248|4730||300.127|3|AB|0.4|4.4|W|HR 4730|*|D|0.008|-0.012|-0.036|186.6496|185.2583333333|185.9493|-11|SBO|||117|||251904||B0.5IV|-1.03|||1.33|||
|B|Alp2Cru|-0.3629|-0.26||-630558|-624922|2215|122636.5|122348.4|-63.0994|-62.53333333453|-62.8227|CP|-62 2745||-0.36|300.13|108249|4731||300.128|3|AB|0.4|4.4|W|HR 4731|*|D|0.008|-0.007|-0.034|186.6521|185.2604166667|185.9518|-1||||197|||||B1V|-0.95|||1.73|||
|A|Gam Cru|5.6497|1.59||-570648|-565014|2733|123109.9|122822.8|-57.1133|-56.55000000033|-56.8373|CP|-56 5272|468|5.65|300.17|108903|4763|I|300.169|3|AB|5.1|110.6|W|HR 4763|*|||-0.262|0.023|187.7912|186.4041666667|187.0952|21|||1.41||||240019||M3.5III|1.78||5672|1.63|||
|B|Gam Cru|5.683|0.16||-570452|-564818|2335|123116.7|122829.6|-57.0811|-56.51666666783|-56.805|CP|-56 5274||5.68|300.18|108925|4764||300.182|3|AB|5.1|110.6|W|HR 4764||||0|0.002|187.8196|186.432916673|187.1234|2|||||||240022||A3V||||6.42|||
<END>
"""
NAMES_JSON = sky.OUT / 'star_names.json'


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


def test_parse_keeps_the_bayer_and_flamsteed_name_and_the_component_letter():
    assert [r['alt'] for r in sky.parse_bsc5p(SAMPLE)] == ['Sig Oct', '9Alp CMa']
    rows = sky.parse_bsc5p(CRUX)
    assert [(r['name'], r['alt'], r['comp']) for r in rows] == [
        ('HR 4730', 'Alp1Cru', 'A'), ('HR 4731', 'Alp2Cru', 'B'), ('HR 4763', 'Gam Cru', 'A'), ('HR 4764', 'Gam Cru', 'B')]


def _star(hr: int, alt: str, vmag: float, dec: float = 0.0) -> dict:
    return {'name': f'HR {hr}', 'alt': alt, 'comp': '', 'ra': 0.0, 'dec': dec, 'vmag': vmag, 'bv': None}


def test_star_names_find_stars_by_bayer_designation_at_their_row_of_the_star_table():
    rows = [_star(5460, 'Alp2Cen', 1.33), _star(15, '21Alp And', 2.06), _star(5459, 'Alp1Cen', -0.01), _star(2491, '9Alp CMa', -1.46)]
    names = {'Sirius': 'Alp CMa', 'Rigil Kentaurus': 'Alp1 Cen'}
    assert sky.star_names(rows, sky.kept_rows(rows), names) == [
        {'index': 0, 'name': 'Sirius', 'vmag': -1.46}, {'index': 1, 'name': 'Rigil Kentaurus', 'vmag': -0.01}]
    with pytest.raises(ValueError, match='Vega.*no star'):
        sky.star_names(rows, sky.kept_rows(rows), {**names, 'Vega': 'Alp Lyr'})
    with pytest.raises(ValueError, match='Alpha Centauri.*2 stars'):  # without its digit it names both stars of the pair
        sky.star_names(rows, sky.kept_rows(rows), {'Alpha Centauri': 'Alp Cen'})


def test_star_names_tell_a_pair_apart_by_digit_or_letter_and_refuse_an_ambiguous_designation():
    rows = sky.parse_bsc5p(CRUX)
    assert sky.star_names(rows, sky.kept_rows(rows), {'Acrux': 'Alp1 Cru', 'Gacrux': 'Gam Cru A'}) == [
        {'index': 0, 'name': 'Acrux', 'vmag': 1.33}, {'index': 1, 'name': 'Gacrux', 'vmag': 1.63}]
    with pytest.raises(ValueError, match='Gacrux.*2 stars'):  # "Gam Cru" alone is Gacrux and its companion
        sky.star_names(rows, sky.kept_rows(rows), {'Gacrux': 'Gam Cru'})


def test_star_names_point_at_the_named_star_where_magnitudes_tie():
    rows = [_star(7924, '50Alp Cyg', 1.25, dec=45.2803), _star(4853, 'Bet Cru', 1.25, dec=-59.6886), _star(2491, '9Alp CMa', -1.46)]
    table = sky.star_table(rows)
    for n in sky.star_names(rows, sky.kept_rows(rows), {'Deneb': 'Alp Cyg', 'Mimosa': 'Bet Cru'}):
        dec = {'Deneb': 45.2803, 'Mimosa': -59.6886}[n['name']]
        assert table[n['index'], 2] == pytest.approx(math.sin(math.radians(dec)), abs=1e-6), n['name']


@pytest.mark.skipif(not NAMES_JSON.exists(), reason='run: uv run python -m lunar_pipeline.cli sky')
def test_star_names_json_labels_30_bright_stars_at_their_rows_of_stars_bin():
    names = json.loads(NAMES_JSON.read_text(encoding='utf-8'))['names']
    table = np.frombuffer((sky.OUT / 'stars.bin').read_bytes(), dtype='<f4').reshape(-1, 5)
    by_name = {n['name']: n for n in names}
    assert len(names) == 31 and set(by_name) == set(sky.NAMED_STARS)
    assert len({n['index'] for n in names}) == 31
    # The fourth star of the Southern Cross, for its lines.
    assert by_name['Imai']['vmag'] < 3
    assert [n['index'] for n in names] == sorted(n['index'] for n in names)  # brightest first, as in stars.bin
    assert by_name['Sirius']['index'] == 0 and by_name['Sirius']['vmag'] == pytest.approx(-1.46)
    for n in names:
        assert table[n['index'], 3] == pytest.approx(n['vmag'], abs=0.01), n['name']
    for name in ('Canopus', 'Achernar', 'Alpha Centauri'):
        assert by_name[name]['vmag'] < 1, name
    assert by_name['Acrux']['vmag'] < 1.5  # the catalogue keeps Acrux's two stars apart: 1.33 and 1.73 (0.76 together)
    # Where magnitudes tie (Mimosa and Deneb 1.25, Acrux and Alpha Cen B 1.33, Gacrux and Shaula 1.63), the named star's row.
    for name, dec in {'Deneb': 45.2803, 'Mimosa': -59.6886, 'Acrux': -63.0992, 'Gacrux': -57.1133, 'Shaula': -37.1039}.items():
        assert table[by_name[name]['index'], 2] == pytest.approx(math.sin(math.radians(dec)), abs=1e-4), name


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
