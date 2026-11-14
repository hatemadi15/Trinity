"""Command-line entry point: python -m lunar_pipeline.cli <command>."""

from __future__ import annotations

import argparse
import json


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="lunar_pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="download NASA source files")
    f.add_argument("--group", action="append", choices=["kernels", "lola", "illumination", "textures", "sky", "globe"])
    sub.add_parser("ephemeris", help="build the hourly MOON_ME Sun/Earth table")
    sub.add_parser("sky", help="build data/sky: stars, the Moon's orientation, Earth maps")
    sub.add_parser("globe", help="resample the CGI Moon Kit into data_out/globe for the home page's arrival")
    sub.add_parser("tiles", help="cut DEM tiles into data_out/tiles")
    sub.add_parser("terrain", help="cut 3D terrain rasters into data_out/terrain")
    sub.add_parser("sites-derive", help="derive crater-rim high points")
    m = sub.add_parser("masks", help="compute per-site horizon masks")
    m.add_argument("--site", action="append")
    sub.add_parser("horizons-fetch", help="download JPL Horizons fixtures")
    sub.add_parser("horizons-compare", help="compare our az/el against Horizons fixtures")
    r = sub.add_parser("report", help="illumination / Earth-visibility metrics for a site")
    r.add_argument("--site", required=True)
    r.add_argument("--start", default="2025-01-01")
    r.add_argument("--days", type=int, default=730)
    ft = sub.add_parser("fixture-time", help="write UTC->ET golden pairs for the TS port")
    ft.add_argument("--n", type=int, default=50)
    fm = sub.add_parser("fixture-metrics", help="write a metrics golden fixture for a site")
    fm.add_argument("--site", required=True)
    fm.add_argument("--start", default="2025-01-01T00:00:00")
    fm.add_argument("--days", type=int, default=730)
    fp = sub.add_parser("fixture-power", help="write a power-budget golden fixture for a site")
    fp.add_argument("--site", required=True)
    fp.add_argument("--start", default="2025-01-01T00:00:00")
    fp.add_argument("--days", type=int, default=60)
    fp.add_argument("--panel", default="vertical_tracking", choices=["horizontal", "vertical", "vertical_tracking", "full_tracking"])
    fl = sub.add_parser("fixture-landing", help="write a best-landing-date golden fixture for a site")
    fl.add_argument("--site", required=True)
    fl.add_argument("--start", default="2027-01-01T00:00:00")
    fl.add_argument("--days", type=int, default=30)
    sub.add_parser("fixture-shadow", help="write golden shadow-sweep fixtures for the TS port")
    sub.add_parser("fixture-sky", help="write SPICE fixtures for the web's sky maths")
    sub.add_parser("validate", help="write the evidence tables (Horizons, LOLA maps, power sums, mission context) into data/validation")
    sl = sub.add_parser("sync-local", help="copy artifacts into web/public/data")
    sl.add_argument("--tiles", action="store_true")
    sub.add_parser("home-assets", help="render the home page picture, the relief map and home.json into web/")
    pr = sub.add_parser("publish-r2", help="upload web/public/data to the Cloudflare R2 bucket named by R2_BUCKET")
    pr.add_argument("--dry-run", action="store_true", help="print the upload plan and exit")
    pr.add_argument("--prefix", default="data", help="key prefix inside the bucket (default: data)")
    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    if args.cmd == "fetch":
        from .fetch import fetch_all
        fetch_all(set(args.group) if args.group else None)
    elif args.cmd == "ephemeris":
        from .ephemeris import write_table
        print(write_table())
    elif args.cmd == "sky":
        from . import sky

        for path in sky.build():
            print(path)
    elif args.cmd == "globe":
        from . import globe

        print(globe.build())
    elif args.cmd == "tiles":
        from .tiles import write_all
        print(write_all())
    elif args.cmd == "fixture-shadow":
        from . import config
        from .shadow import write_fixtures

        for path in write_fixtures(config.DATA_DIR / "fixtures" / "shadow"):
            print(path)
    elif args.cmd == "fixture-sky":
        from . import sky
        from .sites import all_sites

        sites = [s for s in all_sites() if s.id in ("de_gerlache_rim_2", "blue_ghost_m1")]
        for path in sky.fixtures(sites):
            print(path)
    elif args.cmd == "terrain":
        from .terrain3d import write_all
        print(write_all())
    elif args.cmd == "sites-derive":
        from .sites import write_derived
        print(write_derived())
    elif args.cmd == "masks":
        from .masks import write_masks
        for path in write_masks(args.site):
            print(path)
    elif args.cmd == "horizons-fetch":
        from .horizons import fetch_fixtures
        fetch_fixtures()
    elif args.cmd == "horizons-compare":
        from .horizons import compare_all
        print(json.dumps(compare_all(), indent=1))
    elif args.cmd == "report":
        from .illumination import report
        print(json.dumps(report(args.site, args.start, args.days), indent=1))
    elif args.cmd == "fixture-time":
        from .fixtures import write_time_fixture
        print(write_time_fixture(n=args.n))
    elif args.cmd == "fixture-metrics":
        from .fixtures import write_metrics_fixture
        print(write_metrics_fixture(args.site, args.start, args.days))
    elif args.cmd == "fixture-power":
        from .fixtures import write_power_fixture

        print(write_power_fixture(args.site, args.start, args.days, args.panel))
    elif args.cmd == "fixture-landing":
        from .landing import write_landing_fixture

        print(write_landing_fixture(args.site, args.start, args.days))
    elif args.cmd == "validate":
        from .validate import write_all

        for path in write_all():
            print(path)
    elif args.cmd == "publish-r2":
        from .publish_r2 import publish
        publish(prefix=args.prefix, dry_run=args.dry_run)
    elif args.cmd == "sync-local":
        from .sync_local import sync
        for path in sync(tiles=args.tiles):
            print(path)
    elif args.cmd == "home-assets":
        from .home_assets import write_all

        for path in write_all():
            print(path)


if __name__ == "__main__":
    main()
