from collections.abc import Callable
from pathlib import Path

import numpy as np
import pytest
import rasterio
from affine import Affine

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"

WriteTif = Callable[..., Path]


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if (DATA / "prospectivity_dataset").is_dir():
        return
    skip = pytest.mark.skip(reason="run scripts/fetch_data.sh first")
    for item in items:
        if "data" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def write_tif(tmp_path: Path) -> WriteTif:
    def _write(name: str, arr: np.ndarray, transform: Affine, crs: str, nodata: float | None = None) -> Path:
        path = tmp_path / name
        with rasterio.open(
            path, "w", driver="GTiff", width=arr.shape[1], height=arr.shape[0], count=1,
            dtype=str(arr.dtype), crs=crs, transform=transform, nodata=nodata,
        ) as dst:
            dst.write(arr, 1)
        return path

    return _write
