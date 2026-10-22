import Phaser from 'phaser';

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
  const requestedKeys = new Set(missing.map(({ key }) => key));
  const handleError = (file: Phaser.Loader.File): void => {
    if (!requestedKeys.has(file.key)) {
      return;
    }
    console.warn(`Failed to load ${label}`, file.key, file.url);
    onError?.(file.key);
  };
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, handleError);
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, handleError);
  });
}
