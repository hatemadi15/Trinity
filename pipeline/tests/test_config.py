from lunar_pipeline import config


def test_constants_and_paths():
    assert config.R_MOON_M == 1737400.0
    assert config.REPO_ROOT.name == "Trinity"
    assert config.DATA_DIR == config.REPO_ROOT / "data"
    assert config.KERNEL_DIR == config.REPO_ROOT / "data_raw" / "kernels"
