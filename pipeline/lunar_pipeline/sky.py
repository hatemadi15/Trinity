"""The sky for the stand view: the Yale Bright Star Catalogue with everyday names for 30 of its brightest stars,
the Moon's orientation every 6 hours (SPICE, the same kernels as the ephemeris), NASA's Earth maps, and SPICE
fixtures for the web's sky maths."""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import re
import shutil
from pathlib import Path

import numpy as np
import spiceypy as sp

from . import config
from .spice_env import KERNEL_ORDER, spice_kernels

BSC5P_URL = 'https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_bsc5p.tdat.gz'
EARTH_DAY_URL = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_2048.jpg'
EARTH_CLOUDS_URL = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg'
RAW = config.RAW_DIR / 'sky'
OUT = config.DATA_DIR / 'sky'
FIXTURES = config.DATA_DIR / 'fixtures' / 'sky'
START_UTC, END_UTC, STEP_H = '2024-01-01T00:00:00', '2037-01-01T00:00:00', 6
# The stars the stand view labels, by Bayer designation as the catalogue writes it: Greek letter, the component digit
# where the catalogue numbers the stars of a pair (Alp1 Cen), constellation. A trailing letter is the catalogue's ADS
# component, for the one designation it gives to two stars: Gam Cru A is Gacrux, Gam Cru B (HR 4764, V 6.4) its companion.
NAMED_STARS = {
    'Sirius': 'Alp CMa', 'Canopus': 'Alp Car', 'Alpha Centauri': 'Alp1 Cen', 'Arcturus': 'Alp Boo', 'Vega': 'Alp Lyr',
    'Capella': 'Alp Aur', 'Rigel': 'Bet Ori', 'Procyon': 'Alp CMi', 'Achernar': 'Alp Eri', 'Betelgeuse': 'Alp Ori',
    'Hadar': 'Bet Cen', 'Altair': 'Alp Aql', 'Acrux': 'Alp1 Cru', 'Aldebaran': 'Alp Tau', 'Antares': 'Alp Sco',
    'Spica': 'Alp Vir', 'Pollux': 'Bet Gem', 'Fomalhaut': 'Alp PsA', 'Deneb': 'Alp Cyg', 'Mimosa': 'Bet Cru',
    'Regulus': 'Alp Leo', 'Adhara': 'Eps CMa', 'Shaula': 'Lam Sco', 'Gacrux': 'Gam Cru A', 'Alnair': 'Alp Gru',
    'Peacock': 'Alp Pav', 'Miaplacidus': 'Bet Car', 'Atria': 'Alp TrA', 'Avior': 'Eps Car', 'Polaris': 'Alp UMi', 'Imai': 'Del Cru',
}
# Flamsteed number (ignored), Greek letter, component digit, constellation, ADS letter: "9Alp CMa", "Alp1Cen", "Mu 1Sco", "Gam Cru A".
_BAYER = re.compile(r'\d*\s*([A-Z][a-z]{1,2})\s*(\d?)\s*([A-Z][A-Za-z]{2})(?:\s+([A-Z]))?')


def parse_bsc5p(text: str) -> list[dict]:
    """Rows of HEASARC's tdat file as dicts of name, alt (Flamsteed and Bayer name, '' when blank), comp (ADS component
    letter, '' when blank), ra, dec (J2000 degrees), vmag and bv (None when blank)."""
    cols, rows, data = None, [], False
    for line in text.splitlines():
        if line.startswith('line[1] = '):
            cols = line[len('line[1] = '):].split()
        elif line.startswith('<DATA>'):
            data = True
        elif line.startswith('<END>'):
            break
        elif data and cols and '|' in line:
            f = dict(zip(cols, line.split('|')))
            num = lambda k: float(f[k]) if f.get(k, '').strip() else None
            if num('ra') is None or num('dec') is None or num('vmag') is None:
                continue
            rows.append({'name': f['name'].strip(), 'alt': f.get('alt_name', '').strip(), 'comp': f.get('ads_comp', '').strip(),
                         'ra': num('ra'), 'dec': num('dec'), 'vmag': num('vmag'), 'bv': num('bv_color')})
    return rows


def kept_rows(rows: list[dict], max_vmag: float = 6.5) -> list[dict]:
    """The rows `star_table` keeps, in its order (brightest first, ties in catalogue order): row i is the table's row i."""
    return sorted((r for r in rows if r['vmag'] <= max_vmag), key=lambda r: r['vmag'])


def star_table(rows: list[dict], max_vmag: float = 6.5) -> np.ndarray:
    """float32 [x, y, z, vmag, bv] per star of `kept_rows` (J2000 unit vectors), brightest first; a missing B-V counts as 0.6."""
    keep = kept_rows(rows, max_vmag)
    out = np.zeros((len(keep), 5), dtype=np.float32)
    for i, r in enumerate(keep):
        a, d = math.radians(r['ra']), math.radians(r['dec'])
        out[i] = [math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d), r['vmag'], 0.6 if r['bv'] is None else r['bv']]
    return out


def _bayer(text: str) -> tuple[str, str, str, str] | None:
    """(Greek letter, component digit, constellation, ADS letter) of a designation, '' for a part it leaves out."""
    m = _BAYER.fullmatch(text.strip())
    return (m[1], m[2], m[3], m[4] or '') if m else None


def star_names(rows: list[dict], table_rows: list[dict], names: dict[str, str] = NAMED_STARS) -> list[dict]:
    """[{index, name, vmag}] per named star, brightest first; `index` is the star's row in the star table, whose rows in
    order are `table_rows` (`kept_rows(rows)`). Each designation must name exactly one star of the catalogue `rows` (a part
    it leaves out, such as the Flamsteed number or the component digit, matches any) and that star must be in the table."""
    parsed = [(_bayer(r.get('alt', '')), r) for r in rows]
    row_of = {id(r): i for i, r in enumerate(table_rows)}
    out, taken = [], {}
    for name, designation in names.items():
        want = _bayer(designation)
        if want is None:
            raise ValueError(f'{name}: {designation!r} is not a Bayer designation')
        greek, digit, con, letter = want
        hits = [r for b, r in parsed if b and b[0] == greek and b[2] == con
                and (not digit or b[1] == digit) and (not letter or r.get('comp') == letter)]
        if not hits:
            raise ValueError(f'{name} ({designation}): no star in the catalogue has this designation')
        if len(hits) > 1:
            raise ValueError(f'{name} ({designation}): {len(hits)} stars in the catalogue have this designation: '
                             + ', '.join(f"{r['name']} {r['alt']} {r.get('comp', '')}".strip() for r in hits))
        star = hits[0]
        if id(star) not in row_of:
            raise ValueError(f"{name} ({designation}): {star['name']} is fainter than the star table keeps")
        i = row_of[id(star)]
        if i in taken:
            raise ValueError(f'{name} and {taken[i]} name the same star')
        taken[i] = name
        out.append({'index': i, 'name': name, 'vmag': star['vmag']})
    return sorted(out, key=lambda n: n['index'])


def quat_to_matrix(q: np.ndarray) -> np.ndarray:
    w, x, y, z = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ])


def matrices_to_quats(mats: np.ndarray) -> np.ndarray:
    """Unit quaternions [w, x, y, z] for rotation matrices, each on the same hemisphere as the one before (so slerp takes the short way)."""
    out = np.zeros((len(mats), 4))
    for i, m in enumerate(mats):
        t = np.trace(m)
        if t > 0:
            s = math.sqrt(t + 1.0) * 2
            q = [0.25 * s, (m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s]
        elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
            s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
            q = [(m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s]
        elif m[1, 1] > m[2, 2]:
            s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
            q = [(m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s]
        else:
            s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
            q = [(m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s]
        q = np.array(q) / np.linalg.norm(q)
        if i > 0 and np.dot(q, out[i - 1]) < 0:
            q = -q
        out[i] = q
    return out


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build() -> list[Path]:
    """Writes data/sky: stars with the names of 30 of them, the Moon's orientation table and the Earth maps with their credits."""
    OUT.mkdir(parents=True, exist_ok=True)
    src = RAW / 'heasarc_bsc5p.tdat.gz'
    rows = parse_bsc5p(gzip.open(src, 'rt', encoding='latin-1').read())
    table = star_table(rows)
    (OUT / 'stars.bin').write_bytes(table.astype('<f4').tobytes())
    (OUT / 'stars.json').write_text(json.dumps({'count': int(len(table)), 'columns': ['x', 'y', 'z', 'vmag', 'bv'], 'frame': 'J2000',
        'source': 'Yale Bright Star Catalogue, 5th revised ed. (Hoffleit & Warren 1991), NASA HEASARC bsc5p', 'url': BSC5P_URL, 'sha256': _sha256(src)}, indent=1))
    (OUT / 'star_names.json').write_text(json.dumps({'names': star_names(rows, kept_rows(rows))}, indent=1))
    with spice_kernels():
        et0, et1 = sp.str2et(START_UTC.replace('T', ' ') + ' UTC'), sp.str2et(END_UTC.replace('T', ' ') + ' UTC')
        ets = np.arange(et0, et1 + 1, STEP_H * 3600.0)
        quats = matrices_to_quats(np.array([np.array(sp.pxform('J2000', 'MOON_ME', et)) for et in ets]))
    (OUT / 'moon_me_6h.f32').write_bytes(quats.astype('<f4').tobytes())
    (OUT / 'moon_me_6h.json').write_text(json.dumps({'start_utc': START_UTC, 'step_hours': STEP_H, 'count': int(len(quats)),
        'convention': 'q rotates J2000 vectors into MOON_ME; v_me = R(q) v_j2000; [w, x, y, z]', 'kernels': KERNEL_ORDER}, indent=1))
    shutil.copy2(RAW / 'land_shallow_topo_2048.jpg', OUT / 'earth_day_2048.jpg')
    shutil.copy2(RAW / 'cloud_combined_2048.jpg', OUT / 'earth_clouds_2048.jpg')
    (OUT / 'credits.json').write_text(json.dumps({'earth_day': {'title': 'Blue Marble: Land Surface, Shallow Water, and Shaded Topography', 'url': EARTH_DAY_URL, 'credit': 'NASA Goddard Space Flight Center (Reto Stöckli)'},
        'earth_clouds': {'title': 'Blue Marble: Clouds', 'url': EARTH_CLOUDS_URL, 'credit': 'NASA Goddard Space Flight Center'}}, indent=1))
    return [OUT / n for n in ('stars.bin', 'star_names.json', 'moon_me_6h.f32', 'earth_day_2048.jpg', 'earth_clouds_2048.jpg')]


def _enu(lat: float, lon: float):
    la, lo = math.radians(lat), math.radians(lon)
    up = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    east = np.array([-math.sin(lo), math.cos(lo), 0.0])
    return east, np.cross(up, east), up


def fixtures(sites: list) -> list[Path]:
    """SPICE answers the web's sky maths is tested against; `sites` are `sites.Site` records (id, lat, lon)."""
    FIXTURES.mkdir(parents=True, exist_ok=True)
    table = np.frombuffer((OUT / 'stars.bin').read_bytes(), dtype='<f4').reshape(-1, 5)
    picks = [0, 1, 2, 5, 10, 30, 60, 100, 200, 400, 800, 1200, 1600, 2000, 3000, 4000, 5000, 6000, 7000, len(table) - 1]
    times = ['2025-03-02T09:00:00', '2027-01-01T10:00:00', '2027-01-13T12:00:00', '2030-06-15T03:00:00', '2036-12-31T18:00:00']
    cases, off, rot = [], [], []
    with spice_kernels():
        for site in sites:
            east, north, up = _enu(site.lat, site.lon)
            for utc in times:
                m = np.array(sp.pxform('J2000', 'MOON_ME', sp.str2et(utc.replace('T', ' ') + ' UTC')))
                stars = []
                for i in picks:
                    v = m @ table[i, :3].astype(float)
                    stars.append({'index': i, 'az_deg': math.degrees(math.atan2(v @ east, v @ north)) % 360, 'el_deg': math.degrees(math.asin(v @ up))})
                cases.append({'site_id': site.id, 'lat': site.lat, 'lon': site.lon, 'utc': utc, 'stars': stars})
        rng = np.random.default_rng(7)
        et0, et1 = sp.str2et(START_UTC.replace('T', ' ') + ' UTC'), sp.str2et('2036-12-31 00:00:00 UTC')
        for et in rng.uniform(et0, et1, 60):
            off.append({'utc': sp.et2utc(et, 'ISOC', 0), 'matrix': np.array(sp.pxform('J2000', 'MOON_ME', et)).reshape(9).tolist()})
        for et in rng.uniform(et0, et1, 20):
            rot.append({'utc': sp.et2utc(et, 'ISOC', 0), 'matrix': np.array(sp.pxform('IAU_EARTH', 'J2000', et)).reshape(9).tolist()})
    out = []
    for name, doc in [('stars_at_sites.json', {'cases': cases}), ('moon_orientation_offgrid.json', {'cases': off}), ('earth_rotation.json', {'cases': rot})]:
        (FIXTURES / name).write_text(json.dumps(doc, indent=1))
        out.append(FIXTURES / name)
    return out
