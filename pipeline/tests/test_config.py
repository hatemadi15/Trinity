from lunar_pipeline import config


def test_constants_and_paths():
    assert config.R_MOON_M == 1737400.0
    # The root is the folder that holds pipeline/ and data/, whatever the clone is called: a GitHub ZIP unpacks to
    # Trinity-main, and a second checkout can have any name.
    assert (config.REPO_ROOT / "pipeline" / "lunar_pipeline" / "config.py").is_file()
    assert (config.REPO_ROOT / "data" / "sites.json").is_file()
    assert config.DATA_DIR == config.REPO_ROOT / "data"
    assert config.KERNEL_DIR == config.REPO_ROOT / "data_raw" / "kernels"
