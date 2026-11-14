import pytest

from lunar_pipeline.cli import build_parser


def test_cli_has_all_subcommands():
    parser = build_parser()
    for cmd in [
        "fetch", "ephemeris", "tiles", "terrain", "sites-derive", "masks", "horizons-fetch", "horizons-compare",
        "report", "fixture-time", "fixture-metrics", "fixture-power", "fixture-landing", "validate", "sync-local", "home-assets",
        "sky", "fixture-sky",
    ]:
        args = parser.parse_args([cmd] + (["--site", "x"] if cmd in ("report", "fixture-metrics", "fixture-power", "fixture-landing") else []))
        assert args.cmd == cmd


def test_fetch_takes_the_sky_group():
    assert build_parser().parse_args(["fetch", "--group", "sky"]).group == ["sky"]


def test_report_requires_site():
    with pytest.raises(SystemExit):
        build_parser().parse_args(["report"])


def test_uncertainty_takes_sites_and_a_span_and_pgda90_fetch_needs_nothing():
    args = build_parser().parse_args(["uncertainty", "--site", "connecting_ridge", "--site", "im2_athena", "--days", "30"])
    assert args.cmd == "uncertainty" and args.site == ["connecting_ridge", "im2_athena"] and args.days == 30
    assert args.start == "2025-01-01T00:00:00"
    assert build_parser().parse_args(["pgda90-fetch"]).cmd == "pgda90-fetch"
