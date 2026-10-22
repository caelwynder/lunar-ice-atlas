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
S = 900
LEVELS = [0.4, 0.6, 0.8, 1.0001]
THEMES = {
    'dark': dict(bg='#000000', tint=(0.035, 0.095), minor='#3d4454', index='#7a8396', bands=['#256abf', '#6da7ec', '#cde2fb'],
                 band_alpha=0.8, edges=['#3987e5', '#9ec5f4', '#ffffff'], edge_w=1.3, halo=None),
    'moon': dict(bg='#c9c5bd', tint=(0.74, 0.83), minor='#a29d94', index='#7d776e', bands=['#3987e5', '#256abf', '#184f95'],
                 band_alpha=1.0, edges=['#0f2a52'] * 3, edge_w=1.1, halo='#f5f3ef'),
}
meta = json.loads((data / 'north/meta.json').read_text())
g = meta['grid']

def view(a, mode=Image.BICUBIC):
    return np.asarray(Image.fromarray(a, mode='F').resize((S, S), mode))

elev = view(np.fromfile(data / 'north/height.i16.bin', dtype='<i2').reshape(640, 640).astype(np.float32))
raw = np.fromfile(data / 'north/pred.u8.bin', dtype=np.uint8).reshape(640, 640)
ok = raw != 255
vals = raw[ok] / 254.0
pred = np.clip(view(np.where(ok, raw / 254.0, 0).astype(np.float32)), 0, 1)
valid = view(ok.astype(np.float32), Image.BILINEAR) > 0.5
smooth = np.clip(np.asarray(Image.fromarray(pred.astype(np.float32), mode='F').resize((S // 9, S // 9), Image.BOX).resize((S, S), Image.BICUBIC)), 0, 1)
field = np.where(valid, smooth, np.nan)

def render(theme):
    t = THEMES[theme]
    fig = plt.figure(figsize=(S / 100, S / 100), dpi=100, facecolor=t['bg'])
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_facecolor(t['bg']); ax.axis('off')
    lo, hi = np.percentile(elev, [1, 99]); a, b = t['tint']
    ax.imshow(np.repeat((a + (b - a) * np.clip((elev - lo) / (hi - lo), 0, 1))[..., None], 3, 2), interpolation='bilinear')
    lv = np.arange(-7000, 7001, 500)
    ax.contour(elev, levels=[v for v in lv if v % 2000], colors=t['minor'], linewidths=0.6)
    ax.contour(elev, levels=[v for v in lv if not v % 2000], colors=t['index'], linewidths=1.0)
    cm = ListedColormap(t['bands'])
    ax.contourf(field, levels=LEVELS, cmap=cm, norm=BoundaryNorm(LEVELS, cm.N), alpha=t['band_alpha'])
    if t['halo']:
        ax.contour(field, levels=LEVELS[:3], colors=t['halo'], linewidths=3.2)
    ax.contour(field, levels=LEVELS[:3], colors=t['edges'], linewidths=t['edge_w'])
    ax.set_xlim(0, S); ax.set_ylim(S, 0)
    name = f'N-B-{theme}.jpg'
    fig.savefig(out / name, dpi=100, facecolor=t['bg'], pil_kwargs={'quality': 92}); plt.close(fig)
    return name

stats = {
    'mean': float(vals.mean()),
    'p85': float(np.percentile(vals, 85)),
    'frac_ge': {str(k): float((vals >= k).mean()) for k in (0.4, 0.6, 0.8)},
    'km_per_px': g['width'] * g['pixelSize'] / 1000 / S,
    'span_km': g['width'] * g['pixelSize'] / 1000,
}
for th in THEMES:
    print(render(th))
(out / 'north_stats.json').write_text(json.dumps(stats, indent=1))
print(json.dumps(stats))
