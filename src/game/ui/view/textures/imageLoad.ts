import type Phaser from 'phaser';
import { warnOnLoadError } from './loadWarning.js';

export function queueImageLoads(
  scene: Phaser.Scene,
  images: readonly { key: string; url: string }[],
  label: string,
  onError?: (key: string) => void,
): void {
  const missing = images.filter(({ key }) => !scene.textures.exists(key));
  if (missing.length === 0) {
    return;
  }
  missing.forEach(({ key, url }) => scene.load.image(key, url));
  warnOnLoadError(
    scene,
    missing.map(({ key }) => key),
    label,
    onError,
  );
}
