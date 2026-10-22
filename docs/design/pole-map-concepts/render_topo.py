import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
matplotlib.rcParams['contour.negative_linestyle'] = 'solid'
from matplotlib.colors import ListedColormap, BoundaryNorm

data, out = Path(sys.argv[1]), Path(sys.argv[2])
shapes = json.loads(Path(sys.argv[3]).read_text())['shapes']
BOX = (214, 19, 2223, 2028)
S = 900
RAMP = ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb']
BG = '#000000'
MINOR, INDEX = '#3d4454', '#7a8396'

def grid(path, dtype, nodata):
    a = np.fromfile(path, dtype=dtype).reshape(640, 640).astype(np.float32)
    ok = a != nodata
    return a, ok

def to_view(a, mode=Image.BICUBIC):
    big = np.asarray(Image.fromarray(a, mode='F').resize((2560, 2560), mode))
    crop = big[BOX[1]:BOX[3], BOX[0]:BOX[2]]
    return np.asarray(Image.fromarray(crop.astype(np.float32), mode='F').resize((S, S), Image.BILINEAR))

h, _ = grid(data / 'south/height.i16.bin', '<i2', -32768)
elev = to_view(h)
raw, ok = grid(data / 'south/pred.u8.bin', np.uint8, 255)
pred = np.clip(to_view(np.where(ok, raw / 254.0, 0).astype(np.float32)), 0, 1)
valid = to_view(ok.astype(np.float32), Image.BILINEAR) > 0.5
smooth = np.clip(np.asarray(Image.fromarray(pred.astype(np.float32), mode='F').resize((S // 9, S // 9), Image.BOX).resize((S, S), Image.BICUBIC)), 0, 1)

def hexrgb(c): return np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)]) / 255

def base():
    fig = plt.figure(figsize=(S / 100, S / 100), dpi=100, facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_facecolor(BG); ax.axis('off')
    lo, hi = np.percentile(elev, [1, 99])
    tint = 0.035 + 0.06 * np.clip((elev - lo) / (hi - lo), 0, 1)
    ax.imshow(np.repeat(tint[..., None], 3, 2), interpolation='bilinear')
    return fig, ax

def topo(ax, alpha=1.0):
    lv = np.arange(-7000, 7001, 500)
    minor = [v for v in lv if v % 2000]
    major = [v for v in lv if not v % 2000]
    ax.contour(elev, levels=minor, colors=MINOR, linewidths=0.6, alpha=alpha)
    ax.contour(elev, levels=major, colors=INDEX, linewidths=1.0, alpha=alpha)

def regions(ax):
    for s in shapes:
        pts = np.array([[float(v) for v in p.split()] for p in s['d'][1:-2].split(' L')])
        ax.plot(np.r_[pts[:, 0], pts[0, 0]], np.r_[pts[:, 1], pts[0, 1]], color='#ffffff', lw=1.6, solid_joinstyle='round')

def finish(fig, ax, name):
    ax.set_xlim(0, S); ax.set_ylim(S, 0)
    fig.savefig(out / name, dpi=100, facecolor=BG, pil_kwargs={'quality': 90}); plt.close(fig)

# A — glow over topo
fig, ax = base(); topo(ax)
a = np.where(valid, np.clip((smooth - 0.2) / 0.55, 0, 1) ** 1.4 * 0.8, 0)
rgba = np.zeros((S, S, 4)); x = np.clip(smooth, 0, 1) * 5; i = np.clip(np.floor(x).astype(int), 0, 4); t = (x - i)[..., None]
ramp = np.array([hexrgb(c) for c in RAMP]); rgba[..., :3] = ramp[i] * (1 - t) + ramp[i + 1] * t; rgba[..., 3] = a
ax.imshow(rgba, interpolation='bilinear'); topo(ax, 0.6); regions(ax); finish(fig, ax, 'A2-topo-glow.jpg')

# B — bands over topo (contours drawn on top so terrain stays readable)
fig, ax = base()
cm = ListedColormap([RAMP[1], RAMP[3], RAMP[5]]); norm = BoundaryNorm([0.4, 0.6, 0.8, 1.0001], cm.N)
ax.contourf(np.where(valid, smooth, np.nan), levels=[0.4, 0.6, 0.8, 1.0001], cmap=cm, norm=norm, alpha=0.8)
topo(ax, 0.9)
ax.contour(np.where(valid, smooth, np.nan), levels=[0.4, 0.6, 0.8], colors=[RAMP[2], RAMP[4], '#ffffff'], linewidths=1.3); regions(ax); finish(fig, ax, 'B2-topo-bands.jpg')

# C — hexes over topo with gaps so contours show through
fig, ax = base(); topo(ax)
yy, xx = np.mgrid[0:S, 0:S]; sel = valid.ravel()
hc = ListedColormap(['#00000000', '#00000000', RAMP[1], RAMP[3], RAMP[5]])
ax.hexbin(xx.ravel()[sel], yy.ravel()[sel], C=smooth.ravel()[sel], reduce_C_function=np.mean, gridsize=46, cmap=hc,
          norm=BoundaryNorm([0, 0.2, 0.4, 0.6, 0.8, 1], hc.N), edgecolors=BG, linewidths=3.0, mincnt=20, alpha=0.85)
regions(ax); finish(fig, ax, 'C2-topo-hex.jpg')

# D — hotspots on topo
fig, ax = base(); topo(ax)
thr = float(np.percentile(smooth[valid], 85))
ax.contourf(np.where(valid, smooth, np.nan), levels=[thr, 1.0001], colors=['#cde2fb'], alpha=0.95)
ax.contour(np.where(valid, smooth, np.nan), levels=[thr], colors=['#9ec5f4'], linewidths=1.0)
regions(ax); finish(fig, ax, 'D2-topo-hotspots.jpg')
print('top15 threshold', round(thr, 3))
