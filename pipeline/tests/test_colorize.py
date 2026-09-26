import numpy as np
import pytest

from atlas.colorize import ICE_RAMP, block_nanmean, quantize_u8, ramp_rgba, stripe_rgba


def test_ramp_endpoints_and_nan_transparent() -> None:
    out = ramp_rgba(np.array([[0.0, 1.0, np.nan]], np.float32), ICE_RAMP, 0.0, 1.0, (90, 230))
    assert tuple(out[0, 0]) == (0x18, 0x4F, 0x95, 90)
    assert tuple(out[0, 1]) == (0xCD, 0xE2, 0xFB, 230)
    assert out[0, 2, 3] == 0


def test_ramp_clamps_out_of_range() -> None:
    out = ramp_rgba(np.array([[-5.0, 5.0]]), ICE_RAMP, 0.0, 1.0, (0, 255))
    assert tuple(out[0, 0, :3]) == (0x18, 0x4F, 0x95)
    assert tuple(out[0, 1, :3]) == (0xCD, 0xE2, 0xFB)


def test_ramp_does_not_mutate_input() -> None:
    v = np.array([[0.5, np.nan]], np.float32)
    before = v.copy()
    ramp_rgba(v, ICE_RAMP, 0.0, 1.0, (0, 255))
    assert np.array_equal(v, before, equal_nan=True)


def test_quantize_reserves_255_for_nodata() -> None:
    assert quantize_u8(np.array([0.0, 1.0, np.nan, 0.5]), 0.0, 1.0).tolist() == [0, 254, 255, 127]


def test_block_nanmean_ignores_nan() -> None:
    assert block_nanmean(np.array([[1, np.nan], [3, 5]], np.float32), 2)[0, 0] == 3.0


def test_block_nanmean_all_nan_block_is_nan_without_warning() -> None:
    out = block_nanmean(np.full((2, 2), np.nan, np.float32), 2)
    assert np.isnan(out[0, 0])


def test_block_nanmean_rejects_indivisible_shape() -> None:
    with pytest.raises(ValueError, match="not divisible"):
        block_nanmean(np.zeros((3, 4), np.float32), 2)


def test_stripes_are_secondary_encoding() -> None:
    on = stripe_rgba(np.ones((8, 8), bool), "#9ec5f4", period=4)
    off = stripe_rgba(np.zeros((2, 2), bool), "#9ec5f4")
    assert len(set(on[..., 3].ravel().tolist())) == 2
    assert off[..., 3].max() == 0
