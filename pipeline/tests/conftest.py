import numpy as np
import pytest

from lunar_pipeline import config

needs_kernels = pytest.mark.skipif(
    not (config.KERNEL_DIR / "de440s.bsp").exists(),
    reason="run: uv run python -m lunar_pipeline.cli fetch --group kernels",
)
needs_lola = pytest.mark.skipif(
    not (config.LOLA_DIR / "ldem_875s_20m.img").exists(),
    reason="run: uv run python -m lunar_pipeline.cli fetch --group lola",
)
needs_illum = pytest.mark.skipif(
    not (config.ILLUM_DIR / "avgvisib_85s_060m_201608.img").exists(),
    reason="run: uv run python -m lunar_pipeline.cli fetch --group illumination",
)
needs_fixtures = pytest.mark.skipif(
    not (config.DATA_DIR / "fixtures" / "horizons").exists(),
    reason="run: uv run python -m lunar_pipeline.cli horizons-fetch",
)


@pytest.fixture
def synthetic_grid_factory():
    """Builds an in-memory south-polar grid centred on the pole (0-based pixel centres)."""

    def make(size: int = 1024, scale_m: float = 20.0, fill_dn: int = 0):
        from lunar_pipeline.lola import GridLabel, LolaGrid

        label = GridLabel(
            lines=size,
            samples=size,
            map_scale_m=scale_m,
            line_offset_px=(size - 1) / 2,
            sample_offset_px=(size - 1) / 2,
            scaling_factor=0.5,
            offset=1737400.0,
            max_latitude_deg=-89.0,
        )
        return LolaGrid(label, np.full((size, size), fill_dn, dtype=np.int16))

    return make
