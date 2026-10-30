import Phaser from 'phaser';

export function warnOnLoadError(
  scene: Phaser.Scene,
  keys: readonly string[],
  label: string,
  onError?: (key: string) => void,
): void {
  const requestedKeys = new Set(keys);
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
