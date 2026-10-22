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
BOX, S = (214, 19, 2223, 2028), 900
LEVELS = [0.4, 0.6, 0.8, 1.0001]
THEMES = {
    'dark': dict(bg='#000000', tint=(0.035, 0.095), minor='#3d4454', index='#7a8396', topo_alpha=0.9,
                 bands=['#256abf', '#6da7ec', '#cde2fb'], band_alpha=0.8, edges=['#3987e5', '#9ec5f4', '#ffffff'], edge_w=1.3, halo=None),
    'moon': dict(bg='#c9c5bd', tint=(0.74, 0.83), minor='#a29d94', index='#7d776e', topo_alpha=1.0,
                 bands=['#3987e5', '#256abf', '#184f95'], band_alpha=1.0, edges=['#0f2a52', '#0f2a52', '#0f2a52'], edge_w=1.1, halo='#f5f3ef'),
}

def view(a, mode=Image.BICUBIC):
    big = np.asarray(Image.fromarray(a, mode='F').resize((2560, 2560), mode))[BOX[1]:BOX[3], BOX[0]:BOX[2]]
    return np.asarray(Image.fromarray(big.astype(np.float32), mode='F').resize((S, S), Image.BILINEAR))

elev = view(np.fromfile(data / 'south/height.i16.bin', dtype='<i2').reshape(640, 640).astype(np.float32))
raw = np.fromfile(data / 'south/pred.u8.bin', dtype=np.uint8).reshape(640, 640)
ok = raw != 255
pred = np.clip(view(np.where(ok, raw / 254.0, 0).astype(np.float32)), 0, 1)
valid = view(ok.astype(np.float32), Image.BILINEAR) > 0.5
smooth = np.clip(np.asarray(Image.fromarray(pred.astype(np.float32), mode='F').resize((S // 9, S // 9), Image.BOX).resize((S, S), Image.BICUBIC)), 0, 1)
field = np.where(valid, smooth, np.nan)

def render(theme, with_regions):
    t = THEMES[theme]
    fig = plt.figure(figsize=(S / 100, S / 100), dpi=100, facecolor=t['bg'])
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_facecolor(t['bg']); ax.axis('off')
    lo, hi = np.percentile(elev, [1, 99])
    a, b = t['tint']
    ax.imshow(np.repeat((a + (b - a) * np.clip((elev - lo) / (hi - lo), 0, 1))[..., None], 3, 2), interpolation='bilinear')
    lv = np.arange(-7000, 7001, 500)
    ax.contour(elev, levels=[v for v in lv if v % 2000], colors=t['minor'], linewidths=0.6, alpha=t['topo_alpha'])
    ax.contour(elev, levels=[v for v in lv if not v % 2000], colors=t['index'], linewidths=1.0, alpha=t['topo_alpha'])
    cm = ListedColormap(t['bands'])
    ax.contourf(field, levels=LEVELS, cmap=cm, norm=BoundaryNorm(LEVELS, cm.N), alpha=t['band_alpha'])
    if t['halo']:
        ax.contour(field, levels=LEVELS[:3], colors=t['halo'], linewidths=3.2)
    ax.contour(field, levels=LEVELS[:3], colors=t['edges'], linewidths=t['edge_w'])
    if with_regions:
        for s in shapes:
            p = np.array([[float(v) for v in q.split()] for q in s['d'][1:-2].split(' L')])
            ax.plot(np.r_[p[:, 0], p[0, 0]], np.r_[p[:, 1], p[0, 1]], color='#ffffff' if theme == 'dark' else '#000000', lw=1.6)
    ax.set_xlim(0, S); ax.set_ylim(S, 0)
    name = f"B-{theme}{'' if with_regions else '-noregions'}.jpg"
    fig.savefig(out / name, dpi=100, facecolor=t['bg'], pil_kwargs={'quality': 92}); plt.close(fig)
    return name

for th in THEMES:
    for wr in (True, False):
        print(render(th, wr))
