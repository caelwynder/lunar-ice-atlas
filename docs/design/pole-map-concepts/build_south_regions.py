import json, sys, base64, io
from pathlib import Path
import numpy as np
from PIL import Image
from pyproj import Transformer

data = Path(sys.argv[1])
out = Path(sys.argv[2])
meta = json.loads((data / 'south/meta.json').read_text())
regions = json.loads((data / 'regions.json').read_text())['regions']
c, g = meta['crs'], meta['grid']
proj = f"+proj=stere +lat_0={c['lat0']} +lon_0=0 +k={c['k0']} +x_0={c['falseEasting']} +y_0={c['falseNorthing']} +R={c['radius']} +units=m +no_defs"
to_xy = Transformer.from_crs(f"+proj=longlat +R={c['radius']} +no_defs", proj, always_xy=True)

def to_px(lonlat):
    a = np.asarray(lonlat)
    x, y = to_xy.transform(a[:, 0], a[:, 1])
    return np.stack([(x - g['x0']) / g['pixelSize'], (g['y0'] - y) / g['pixelSize']], 1)

px = {r['id']: to_px(r['outline']) for r in regions}
allp = np.concatenate(list(px.values()))
lo, hi = allp.min(0), allp.max(0)
centre = (lo + hi) / 2
side = (hi - lo).max() * 1.35
x0, y0 = centre - side / 2
box = tuple(int(round(v)) for v in (x0, y0, x0 + side, y0 + side))

hill = np.asarray(Image.open(data / 'south/hillshade.jpg').convert('L').crop(box)).astype(float) / 255
pred = np.asarray(Image.open(data / 'south/pred.webp').convert('RGBA').crop(box)).astype(float) / 255
shade = (0.35 + 0.85 * hill)[..., None]
grey = np.repeat((0.12 + 0.55 * hill)[..., None], 3, 2)
a = pred[..., 3:4]
rgb = np.clip(pred[..., :3] * shade * a + grey * (1 - a), 0, 1)
S = 900
img = Image.fromarray((rgb * 255).astype(np.uint8)).resize((S, S), Image.LANCZOS)
buf = io.BytesIO(); img.save(buf, 'JPEG', quality=88)
img_uri = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

scale = S / side
shapes = []
for r in regions:
    p = (px[r['id']] - [x0, y0]) * scale
    d = 'M' + ' L'.join(f'{a:.1f} {b:.1f}' for a, b in p) + ' Z'
    cx, cy = p.mean(0)
    shapes.append({'id': r['id'], 'name': r['name'], 'd': d, 'cx': float(cx), 'cy': float(cy),
                   'pred': r['stats']['predMean'], 'flat': r['stats']['fracSlopeLt8']})
km = side * g['pixelSize'] / 1000
(out / 'map.json').write_text(json.dumps({'img': img_uri, 'shapes': shapes, 'km': km, 'size': S, 'pole': [float((g['width'] / 2 - x0) * scale), float((g['height'] / 2 - y0) * scale)]}))
print('crop px', box, 'span km', round(km, 1), 'regions', len(shapes))
