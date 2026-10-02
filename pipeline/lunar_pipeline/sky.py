"""The sky for the stand view: the Yale Bright Star Catalogue, the Moon's orientation every 6 hours
(SPICE, the same kernels as the ephemeris), NASA's Earth maps, and SPICE fixtures for the web's sky maths."""
from __future__ import annotations

import gzip
import hashlib
import json
import math
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


def parse_bsc5p(text: str) -> list[dict]:
    """Rows of HEASARC's tdat file as dicts of name, ra, dec (J2000 degrees), vmag and bv (None when blank)."""
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
            rows.append({'name': f['name'].strip(), 'ra': num('ra'), 'dec': num('dec'), 'vmag': num('vmag'), 'bv': num('bv_color')})
    return rows


def star_table(rows: list[dict], max_vmag: float = 6.5) -> np.ndarray:
    """float32 [x, y, z, vmag, bv] per star (J2000 unit vectors), brightest first; a missing B-V counts as 0.6."""
    keep = sorted((r for r in rows if r['vmag'] <= max_vmag), key=lambda r: r['vmag'])
    out = np.zeros((len(keep), 5), dtype=np.float32)
    for i, r in enumerate(keep):
        a, d = math.radians(r['ra']), math.radians(r['dec'])
        out[i] = [math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d), r['vmag'], 0.6 if r['bv'] is None else r['bv']]
    return out


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
    """Writes data/sky: stars, the Moon's orientation table and the Earth maps with their credits."""
    OUT.mkdir(parents=True, exist_ok=True)
    src = RAW / 'heasarc_bsc5p.tdat.gz'
    table = star_table(parse_bsc5p(gzip.open(src, 'rt', encoding='latin-1').read()))
    (OUT / 'stars.bin').write_bytes(table.astype('<f4').tobytes())
    (OUT / 'stars.json').write_text(json.dumps({'count': int(len(table)), 'columns': ['x', 'y', 'z', 'vmag', 'bv'], 'frame': 'J2000',
        'source': 'Yale Bright Star Catalogue, 5th revised ed. (Hoffleit & Warren 1991), NASA HEASARC bsc5p', 'url': BSC5P_URL, 'sha256': _sha256(src)}, indent=1))
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
    return [OUT / n for n in ('stars.bin', 'moon_me_6h.f32', 'earth_day_2048.jpg', 'earth_clouds_2048.jpg')]


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
