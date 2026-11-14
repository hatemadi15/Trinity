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


def test_terrain_takes_named_sites_and_runs_them_alone(monkeypatch):
    from lunar_pipeline import cli, terrain3d

    assert build_parser().parse_args(["terrain"]).site is None
    assert build_parser().parse_args(["terrain", "--site", "a", "--site", "b"]).site == ["a", "b"]
    called = {}
    monkeypatch.setattr(terrain3d, "write_sites", lambda ids: called.setdefault("ids", ids))
    monkeypatch.setattr(terrain3d, "write_all", lambda: called.setdefault("all", True))
    cli.main(["terrain", "--site", "chandrayaan3_vikram"])
    assert called == {"ids": ["chandrayaan3_vikram"]}
