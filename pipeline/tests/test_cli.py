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


def test_the_error_model_and_the_terrain_versions_have_commands_of_their_own():
    assert build_parser().parse_args(["error-model"]).cmd == "error-model"
    args = build_parser().parse_args(["ensemble", "--site", "connecting_ridge", "--versions", "8"])
    assert args.cmd == "ensemble" and args.site == ["connecting_ridge"] and args.versions == 8
    assert build_parser().parse_args(["ensemble"]).versions == 32


def test_terrain_takes_named_sites_and_runs_them_alone(monkeypatch):
    from lunar_pipeline import cli, terrain3d

    assert build_parser().parse_args(["terrain"]).site is None
    assert build_parser().parse_args(["terrain", "--site", "a", "--site", "b"]).site == ["a", "b"]
    called = {}
    monkeypatch.setattr(terrain3d, "write_sites", lambda ids: called.setdefault("ids", ids))
    monkeypatch.setattr(terrain3d, "write_all", lambda: called.setdefault("all", True))
    cli.main(["terrain", "--site", "chandrayaan3_vikram"])
    assert called == {"ids": ["chandrayaan3_vikram"]}
