// @vitest-environment jsdom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { type RendererLike, createMoonScene } from './moonScene';

const fakeRenderer = (): RendererLike => ({
  setPixelRatio: vi.fn(),
  getPixelRatio: () => 1,
  setSize: vi.fn(),
  render: vi.fn(),
  setAnimationLoop: vi.fn(),
  dispose: vi.fn(),
});

function setup(loadModel: (url: string) => Promise<THREE.Object3D>, reducedMotion = false) {
  const onStatus = vi.fn();
  const scene = createMoonScene(
    document.createElement('canvas'),
    { reducedMotion, onStatus, onPole: vi.fn() },
    { createRenderer: fakeRenderer, loadModel },
  );
  return { scene, onStatus };
}

const sphere = (): THREE.Object3D => new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8));

describe('createMoonScene', () => {
  it('keeps the previous model and reports a readable error when a render fails to load', async () => {
    const loadModel = vi.fn((url: string) =>
      url.includes('grid') ? Promise.reject(new Error('404')) : Promise.resolve(sphere()),
    );
    const { scene, onStatus } = setup(loadModel);
    await scene.setRender('topo');
    const shown = scene.moon.children[0];
    await expect(scene.setRender('grid')).rejects.toThrow();
    expect(onStatus).toHaveBeenLastCalledWith(expect.stringContaining('Could not load'));
    expect(scene.moon.children).toEqual([shown]);
  });

  it('normalises a loaded model to radius 1', async () => {
    const { scene } = setup(() => Promise.resolve(sphere()));
    await scene.setRender('color');
    const box = new THREE.Box3().setFromObject(scene.moon);
    expect(box.getSize(new THREE.Vector3()).x).toBeCloseTo(2, 5);
  });

  it('loads each render only once', async () => {
    const loadModel = vi.fn(() => Promise.resolve(sphere()));
    const { scene } = setup(loadModel);
    await scene.setRender('topo');
    await scene.setRender('grid');
    await scene.setRender('topo');
    expect(loadModel).toHaveBeenCalledTimes(2);
  });

  it('holds rotation and cap opacity still under reduced motion', () => {
    const { scene } = setup(() => Promise.resolve(sphere()), true);
    const opacity = (): number => (scene.caps.south.hit.material as THREE.MeshBasicMaterial).opacity;
    scene.tick(0.3);
    const [r0, o0] = [scene.moon.rotation.y, opacity()];
    scene.tick(1.7);
    expect(scene.moon.rotation.y).toBe(r0);
    expect(opacity()).toBe(o0);
  });

  it('rotates the Moon and pulses the caps with motion allowed', () => {
    const { scene } = setup(() => Promise.resolve(sphere()));
    const opacity = (): number => (scene.caps.north.hit.material as THREE.MeshBasicMaterial).opacity;
    scene.tick(0);
    const [r0, o0] = [scene.moon.rotation.y, opacity()];
    scene.tick(0.8);
    expect(scene.moon.rotation.y).not.toBe(r0);
    expect(opacity()).not.toBe(o0);
  });
});
