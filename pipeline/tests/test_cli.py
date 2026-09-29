import pytest

from lunar_pipeline.cli import build_parser


def test_cli_has_all_subcommands():
    parser = build_parser()
    for cmd in [
        "fetch", "ephemeris", "tiles", "terrain", "sites-derive", "masks", "horizons-fetch", "horizons-compare",
        "report", "fixture-time", "fixture-metrics", "fixture-power", "validate", "sync-local",
    ]:
        args = parser.parse_args([cmd] + (["--site", "x"] if cmd in ("report", "fixture-metrics", "fixture-power") else []))
        assert args.cmd == cmd


def test_report_requires_site():
    with pytest.raises(SystemExit):
        build_parser().parse_args(["report"])
