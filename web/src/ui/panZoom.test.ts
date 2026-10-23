// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { HOME, MAX_ZOOM, attachPanZoom, clampView, panBy, zoomAt } from './panZoom';

describe('zoomAt', () => {
  it('keeps the point under the cursor fixed', () => {
    const v = zoomAt(HOME, 2, 0.25, 0.75);
    expect(v).toEqual({ zoom: 2, x: -0.25, y: -0.75 });
    expect((0.25 - v.x) / v.zoom).toBeCloseTo(0.25);
  });

  it('never zooms out past the whole map or in past the limit', () => {
    expect(zoomAt(HOME, 0.5, 0.5, 0.5)).toEqual(HOME);
    expect(zoomAt(HOME, 100, 0.5, 0.5).zoom).toBe(MAX_ZOOM);
  });
});

describe('panBy / clampView', () => {
  it('pans while zoomed but keeps the map covering the pane', () => {
    const z = { zoom: 2, x: -0.5, y: -0.5 };
    expect(panBy(z, 0.2, -0.1)).toEqual({ zoom: 2, x: -0.3, y: -0.6 });
    expect(panBy(z, 5, -5)).toEqual({ zoom: 2, x: 0, y: -1 });
  });

  it('cannot pan at zoom 1', () => {
    expect(panBy(HOME, 0.3, 0.3)).toEqual(HOME);
    expect(clampView({ zoom: 0.5, x: 1, y: 1 })).toEqual(HOME);
  });
});

describe('attachPanZoom', () => {
  const setup = () => {
    const pane = document.createElement('div');
    pane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400 }) as DOMRect;
    const onChange = vi.fn();
    const pz = attachPanZoom(pane, onChange);
    return { pane, onChange, pz };
  };

  it('zooms in on wheel up around the cursor', () => {
    const { pane, onChange, pz } = setup();
    pane.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: 100, clientY: 100, cancelable: true }));
    expect(pz.view().zoom).toBeGreaterThan(1);
    expect(onChange).toHaveBeenCalledWith(pz.view());
  });

  it('zooms and pans from the keyboard and resets with 0', () => {
    const { pane, pz } = setup();
    pane.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    expect(pz.view().zoom).toBeCloseTo(1.5);
    const before = pz.view().x;
    pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(pz.view().x).toBeLessThan(before);
    pane.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }));
    expect(pz.view()).toEqual(HOME);
  });

  it('exposes zoom buttons through zoomBy and reset', () => {
    const { pz } = setup();
    pz.zoomBy(2);
    expect(pz.view().zoom).toBe(2);
    pz.reset();
    expect(pz.view()).toEqual(HOME);
  });

  it('ignores input while disabled', () => {
    const { pane, pz } = setup();
    pz.setEnabled(false);
    pane.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    expect(pz.view()).toEqual(HOME);
  });
  it('does not start a drag on a button inside the pane', () => {
    const { pane } = setup();
    const button = document.createElement('button');
    pane.append(button);
    pane.setPointerCapture = vi.fn();
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(pane.setPointerCapture).not.toHaveBeenCalled();
    expect(pane.classList.contains('is-dragging')).toBe(false);
  });
});
