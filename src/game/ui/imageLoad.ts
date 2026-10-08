import Phaser from 'phaser';

/** 아직 없는 텍스처만 로드 큐에 넣는다. 실패한 이미지는 경고만 하고 씬은 계속 진행한다. */
export function queueImageLoads(
  scene: Phaser.Scene,
  images: readonly { key: string; url: string }[],
  label: string,
): void {
  const missing = images.filter(({ key }) => !scene.textures.exists(key));
  if (missing.length === 0) {
    return;
  }
  missing.forEach(({ key, url }) => scene.load.image(key, url));
  const onError = (file: Phaser.Loader.File): void => {
    console.warn(`Failed to load ${label}`, file.key, file.url);
  };
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
  });
}
