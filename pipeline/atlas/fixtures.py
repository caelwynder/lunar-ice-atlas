import json
from pathlib import Path

from atlas.constants import ROOT
from atlas.crs import Pole, lonlat_to_ps

POINTS: list[tuple[Pole, float, float]] = [
    ("south", -90.0, 0.0), ("south", -80.0, 0.0), ("south", -84.2, 60.7), ("south", -87.5, -150.0),
    ("north", 90.0, 0.0), ("north", 80.0, 0.0), ("north", 85.0, 120.0), ("north", 82.0, -45.0),
]
FIXTURE_PATH = ROOT / "web" / "src" / "geo" / "__fixtures__" / "ps_points.json"


def write_ps_fixtures(path: Path) -> None:
    rows = []
    for pole, lat, lon in POINTS:
        x, y = lonlat_to_ps(lon, lat, pole)
        rows.append({"pole": pole, "lat": lat, "lon": lon, "x": float(x), "y": float(y)})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, indent=2))


if __name__ == "__main__":
    write_ps_fixtures(FIXTURE_PATH)
