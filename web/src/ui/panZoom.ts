export interface View {
  zoom: number;
  x: number;
  y: number;
}
export interface PanZoom {
  view(): View;
  zoomBy(factor: number): void;
  reset(): void;
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

export const HOME: View = { zoom: 1, x: 0, y: 0 };
export const MAX_ZOOM = 8;
const WHEEL_RATE = 0.0015;
const KEY_ZOOM = 1.5;
const KEY_PAN = 0.1;
const DBLCLICK_ZOOM = 2;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const tidy = (v: number): number => Math.round(v * 1e9) / 1e9 || 0;

/** Offsets are fractions of the pane size; the map covers the pane at every zoom. */
export function clampView({ zoom, x, y }: View): View {
  const z = clamp(zoom, 1, MAX_ZOOM);
  return { zoom: z, x: tidy(clamp(x, 1 - z, 0)), y: tidy(clamp(y, 1 - z, 0)) };
}

export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const zoom = clamp(v.zoom * factor, 1, MAX_ZOOM);
  const k = zoom / v.zoom;
  return clampView({ zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
}

export const panBy = (v: View, dx: number, dy: number): View => clampView({ ...v, x: v.x + dx, y: v.y + dy });

const KEY_PANS: Record<string, [number, number]> = {
  ArrowLeft: [KEY_PAN, 0],
  ArrowRight: [-KEY_PAN, 0],
  ArrowUp: [0, KEY_PAN],
  ArrowDown: [0, -KEY_PAN],
};

export function attachPanZoom(pane: HTMLElement, onChange: (v: View) => void): PanZoom {
  let view = HOME;
  let enabled = true;
  const pointers = new Map<number, { x: number; y: number }>();
  const set = (next: View): void => {
    view = next;
    onChange(view);
  };
  const local = (clientX: number, clientY: number): [number, number] => {
    const r = pane.getBoundingClientRect();
    return [(clientX - r.left) / (r.width || 1), (clientY - r.top) / (r.height || 1)];
  };
  const side = (): number => pane.getBoundingClientRect().width || 1;
  const centroid = (): { x: number; y: number; d: number } => {
    const pts = [...pointers.values()];
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const [a, b] = pts;
    return { x, y, d: a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0 };
  };

  const wheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    set(zoomAt(view, Math.exp(-ev.deltaY * WHEEL_RATE), ...local(ev.clientX, ev.clientY)));
  };
  const down = (ev: PointerEvent): void => {
    if (ev.button !== 0 || (ev.target instanceof Element && ev.target.closest('button'))) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    pane.setPointerCapture(ev.pointerId);
    pane.classList.add('is-dragging');
  };
  const move = (ev: PointerEvent): void => {
    if (!pointers.has(ev.pointerId)) return;
    const before = centroid();
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const after = centroid();
    let next = panBy(view, (after.x - before.x) / side(), (after.y - before.y) / side());
    if (pointers.size === 2 && before.d > 0) next = zoomAt(next, after.d / before.d, ...local(after.x, after.y));
    set(next);
  };
  const up = (ev: PointerEvent): void => {
    pointers.delete(ev.pointerId);
    if (pointers.size === 0) pane.classList.remove('is-dragging');
  };
  const dblclick = (ev: MouseEvent): void => set(zoomAt(view, DBLCLICK_ZOOM, ...local(ev.clientX, ev.clientY)));
  const key = (ev: KeyboardEvent): void => {
    const pan = KEY_PANS[ev.key];
    if (pan) set(panBy(view, ...pan));
    else if (ev.key === '+' || ev.key === '=') set(zoomAt(view, KEY_ZOOM, 0.5, 0.5));
    else if (ev.key === '-' || ev.key === '_') set(zoomAt(view, 1 / KEY_ZOOM, 0.5, 0.5));
    else if (ev.key === '0') set(HOME);
    else return;
    ev.preventDefault();
  };

  const listeners: [string, EventListener, AddEventListenerOptions?][] = [
    ['wheel', wheel as EventListener, { passive: false }],
    ['pointerdown', down as EventListener],
    ['pointermove', move as EventListener],
    ['pointerup', up as EventListener],
    ['pointercancel', up as EventListener],
    ['dblclick', dblclick as EventListener],
    ['keydown', key as EventListener],
  ];
  const guarded = listeners.map(([type, fn, opts]): [string, EventListener, AddEventListenerOptions?] => [
    type,
    (ev) => enabled && fn(ev),
    opts,
  ]);
  for (const [type, fn, opts] of guarded) pane.addEventListener(type, fn, opts);
  return {
    view: () => view,
    zoomBy: (factor) => set(zoomAt(view, factor, 0.5, 0.5)),
    reset: () => set(HOME),
    setEnabled: (on) => {
      enabled = on;
      pointers.clear();
    },
    dispose: () => {
      for (const [type, fn] of guarded) pane.removeEventListener(type, fn);
    },
  };
}
