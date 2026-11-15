"""The Accuracy page's worked example: one LRO camera picture beside the app's shadows for the same moment.

Writes two small pictures to web/public/validation/: the Wide Angle Camera's frame of the peak near Shackleton on
23 September 2009 (the typical picture of the check, data/validation/images.json: 92 % called alike), and the app's
shadow map gathered into the same 100 m pixels, with the ground the two call differently in orange.
Run from pipeline/: uv run python scratch/accuracy_example.py
"""

import numpy as np
import rasterio

from lunar_pipeline import config, images
from lunar_pipeline.geometry import ps_south_xy_m
from lunar_pipeline.masks import load_grids
from lunar_pipeline.sites import all_sites

PICTURE, SITE = "WAC_MOVIE_S20090923T1216", "peak_near_shackleton"
SCALE = 3  # each 100 m pixel of the picture is drawn as 3 by 3
OUT = config.REPO_ROOT / "web" / "public" / "validation"


def main() -> None:
    site = {s.id: s for s in all_sites()}[SITE]
    grids = load_grids()
    levels = images.app_levels(site, grids, images.south_cap(grids))
    sx, sy = (float(v) for v in ps_south_xy_m(site.lat, site.lon))
    rows, _ = images.site_rows(site, levels, images.level_box(levels[-1], sx, sy))
    row = next(r for r in rows if r["picture"] == PICTURE)
    maps = row["_maps"]
    values, share, seen, usable = maps["values"], maps["share"], maps["seen"], maps["usable"]
    differ = usable & ((share >= 0.5) != seen)
    print(PICTURE, "agree", row["agree"], "Sun", row["sun_el_deg"], "differ", round(float(differ.sum() / usable.sum()), 4), values.shape)

    grey = np.clip(np.nan_to_num(values) / np.nanpercentile(values, 99.5), 0, 1) ** 0.6
    camera = (grey * 255)[..., None]
    # The app's map: sunlit ground pale and shadow a dark grey, the ground the two call differently in orange.
    lit = np.clip(np.nan_to_num(share), 0, 1)[..., None]
    app = np.array([30.0, 32.0, 38.0]) + lit * np.array([200.0, 196.0, 186.0])
    app[differ] = (240, 138, 36)
    for name, arr in (("shadows-camera.jpg", camera), ("shadows-app.jpg", app)):
        big = np.kron(arr, np.ones((SCALE, SCALE, 1))).round().astype(np.uint8)
        with rasterio.open(OUT / name, "w", driver="JPEG", width=big.shape[1], height=big.shape[0], count=big.shape[2], dtype="uint8", QUALITY=75) as dst:
            dst.write(np.moveaxis(big, -1, 0))
        (OUT / f"{name}.aux.xml").unlink(missing_ok=True)
        print(name, big.shape, (OUT / name).stat().st_size)


if __name__ == "__main__":
    main()
