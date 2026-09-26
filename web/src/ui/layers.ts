import type { LoadedPole } from '../data/load';
import type { RegionsDoc } from '../data/regionsSchema';
import type { AtlasScene } from '../scene/scene';

export interface UiContext {
  scene: AtlasScene;
  poles: LoadedPole[];
  regions: RegionsDoc;
  exaggeration: number;
}

export function mountUi(ctx: UiContext): void {
  ctx.scene.setLayer('pred');
}
