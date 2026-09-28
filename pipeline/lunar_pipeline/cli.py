"""Command-line entry point: python -m lunar_pipeline.cli <command>."""

from __future__ import annotations

import argparse
import json


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="lunar_pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="download NASA source files")
    f.add_argument("--group", action="append", choices=["kernels", "lola", "illumination"])
    sub.add_parser("ephemeris", help="build the hourly MOON_ME Sun/Earth table")
    sub.add_parser("tiles", help="cut DEM tiles into data_out/tiles")
    sub.add_parser("sites-derive", help="derive crater-rim high points")
    m = sub.add_parser("masks", help="compute per-site horizon masks")
    m.add_argument("--site", action="append")
    sub.add_parser("horizons-fetch", help="download JPL Horizons fixtures")
    sub.add_parser("horizons-compare", help="compare our az/el against Horizons fixtures")
    r = sub.add_parser("report", help="illumination / Earth-visibility metrics for a site")
    r.add_argument("--site", required=True)
    r.add_argument("--start", default="2025-01-01")
    r.add_argument("--days", type=int, default=730)
    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    if args.cmd == "fetch":
        from .fetch import fetch_all
        fetch_all(set(args.group) if args.group else None)
    elif args.cmd == "ephemeris":
        from .ephemeris import write_table
        print(write_table())
    elif args.cmd == "tiles":
        from .tiles import write_all
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


if __name__ == "__main__":
    main()
