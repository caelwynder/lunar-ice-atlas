import re

from atlas.crs import Pole

PATCH_RE = re.compile(r"^(patch_\d{4}_\d{4}(?:_S)?_80[NS])_")


def parse_patch_id(filename: str) -> str:
    match = PATCH_RE.match(filename)
    if match is None:
        raise ValueError(f"not a patch file: {filename}")
    return match.group(1)


def pole_of(patch_id: str) -> Pole:
    return "south" if patch_id.endswith("_80S") else "north"
