import warnings

import numpy as np

ICE_RAMP = ("#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb")
ERR_RAMP = ("#f4b3b0", "#e66767", "#9a2c2b", "#383835", "#184f95", "#3987e5", "#9ec5f4")
PSR_HEX = "#9ec5f4"
NODATA_U8 = 255
STRIPE_STRONG, STRIPE_WEAK = 230, 110


def hex_to_rgb(color: str) -> tuple[int, int, int]:
    h = color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def ramp_rgba(
    values: np.ndarray, stops: tuple[str, ...], vmin: float, vmax: float, alpha_range: tuple[int, int]
) -> np.ndarray:
    t = np.clip((values - vmin) / (vmax - vmin), 0.0, 1.0)
    t0 = np.nan_to_num(t)
    pos = np.linspace(0.0, 1.0, len(stops))
    rgb = np.array([hex_to_rgb(s) for s in stops], np.float32)
    channels = [np.interp(t0, pos, rgb[:, i]) for i in range(3)]
    alpha = np.where(np.isnan(t), 0, alpha_range[0] + (alpha_range[1] - alpha_range[0]) * t0)
    return np.round(np.stack([*channels, alpha], axis=-1)).astype(np.uint8)


def stripe_rgba(mask: np.ndarray, color: str, period: int = 8) -> np.ndarray:
    rows, cols = np.indices(mask.shape)
    strong = ((rows + cols) // max(1, period // 2)) % 2 == 0
    alpha = np.where(mask, np.where(strong, STRIPE_STRONG, STRIPE_WEAK), 0).astype(np.uint8)
    rgb = np.broadcast_to(np.array(hex_to_rgb(color), np.uint8), (*mask.shape, 3))
    return np.dstack([rgb, alpha])


def quantize_u8(values: np.ndarray, vmin: float, vmax: float) -> np.ndarray:
    t = np.clip((values - vmin) / (vmax - vmin), 0.0, 1.0)
    q = np.floor(np.nan_to_num(t) * 254 + 0.5)
    return np.where(np.isnan(values), NODATA_U8, q).astype(np.uint8)


def block_nanmean(a: np.ndarray, k: int) -> np.ndarray:
    h, w = a.shape
    if h % k or w % k:
        raise ValueError(f"shape {a.shape} not divisible by {k}")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN blocks are expected outside the disk
        return np.nanmean(a.reshape(h // k, k, w // k, k), axis=(1, 3)).astype(np.float32)
