import Phaser from 'phaser';
import type { Song } from '../../../../data/songs.js';
import { requireDefined } from '../../../../invariant.js';
import { getCenteredSquare } from '../../state/jacketCrop.js';
import { queueImageLoads } from '../textures/imageLoad.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from '../textures/lightTextures.js';
import { COLORS, MOTION, RADIUS } from '../theme.js';

const SQUARE_FRAME = 'square';
const PLACEHOLDER_GLOW_ALPHA = 0.3;
const JACKET_KEY_PREFIX = 'jacket:';

function jacketTextureKey(songId: string): string {
  return `${JACKET_KEY_PREFIX}${songId}`;
}

export function queueJacketLoads(
  scene: Phaser.Scene,
  songs: readonly Song[],
  onError?: (song: Song) => void,
): void {
  queueImageLoads(
    scene,
    songs.map((song) => ({
      key: jacketTextureKey(song.id),
      url: song.jacketUrl,
    })),
    'jacket',
    onError === undefined
      ? undefined
      : (key) =>
          onError(
            requireDefined(
              songs.find((song) => jacketTextureKey(song.id) === key),
              'Unknown jacket key',
              key,
            ),
          ),
  );
}

export function getLoadedJacketSongIds(scene: Phaser.Scene): string[] {
  return scene.textures
    .getTextureKeys()
    .filter((key) => key.startsWith(JACKET_KEY_PREFIX))
    .map((key) => key.slice(JACKET_KEY_PREFIX.length));
}

export function removeJacketTextures(scene: Phaser.Scene, songIds: readonly string[]): void {
  songIds.forEach((songId) => scene.textures.remove(jacketTextureKey(songId)));
}

abstract class SongCrossfade extends Phaser.GameObjects.Container {
  private front: Phaser.GameObjects.Container;
  private back: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, xPx: number, yPx: number) {
    super(scene, xPx, yPx);
    this.front = scene.add.container(0, 0);
    this.back = scene.add.container(0, 0);
    this.add([this.back, this.front]);
    scene.add.existing(this);
  }

  setSong(song: Song | null, transition = false): this {
    [this.front, this.back] = [this.back, this.front];
    this.front.removeAll(true);
    if (song !== null) {
      this.front.add(this.createContent(song));
    }
    this.moveAbove(this.front, this.back);
    crossfade(this.scene, this.front, this.back, transition);
    return this;
  }

  refreshTexture(song: Song, transition = false): this {
    if (getJacketSongIds(this.front).length > 0 || !this.hasTexture(song)) {
      return this;
    }
    return this.setSong(song, transition);
  }

  /** 지금 곡과 사라지는 중인 직전 곡의 재킷 텍스처는 지우지 않게 둘 다 돌려준다. */
  get shownSongIds(): readonly string[] {
    return [...getJacketSongIds(this.front), ...getJacketSongIds(this.back)];
  }

  protected abstract hasTexture(song: Song): boolean;

  protected abstract createContent(song: Song): Phaser.GameObjects.GameObject[];
}

export class JacketView extends SongCrossfade {
  private readonly sizePx: number;

  constructor(scene: Phaser.Scene, xPx: number, yPx: number, sizePx: number) {
    super(scene, xPx, yPx);
    this.sizePx = sizePx;
    ensureLightTextures(scene);
  }

  protected hasTexture(song: Song): boolean {
    return this.scene.textures.exists(jacketTextureKey(song.id));
  }

  protected createContent(song: Song): Phaser.GameObjects.GameObject[] {
    const scene = this.scene;
    const key = jacketTextureKey(song.id);
    if (this.hasTexture(song)) {
      ensureSquareFrame(scene, key);
      return [
        scene.add
          .image(0, 0, key, SQUARE_FRAME)
          .setOrigin(0, 0)
          .setDisplaySize(this.sizePx, this.sizePx),
      ];
    }
    const center = this.sizePx / 2;
    return [
      scene.add
        .rectangle(0, 0, this.sizePx, this.sizePx, COLORS.surface)
        .setOrigin(0, 0)
        .setRounded(RADIUS.mediumPx),
      addLight(scene, LIGHT_TEXTURES.glow, center, center)
        .setDisplaySize(this.sizePx, this.sizePx)
        .setTint(song.accentColor)
        .setAlpha(PLACEHOLDER_GLOW_ALPHA),
    ];
  }
}

function getJacketSongIds(container: Phaser.GameObjects.Container): string[] {
  return container.list.flatMap((child) =>
    child instanceof Phaser.GameObjects.Image && child.texture.key.startsWith(JACKET_KEY_PREFIX)
      ? [child.texture.key.slice(JACKET_KEY_PREFIX.length)]
      : [],
  );
}

function ensureSquareFrame(scene: Phaser.Scene, key: string): void {
  const texture = scene.textures.get(key);
  if (texture.has(SQUARE_FRAME)) {
    return;
  }
  const source = texture.getSourceImage();
  const { x, y, size } = getCenteredSquare(source.width, source.height);
  texture.add(SQUARE_FRAME, 0, x, y, size, size);
}

function crossfade(
  scene: Phaser.Scene,
  incoming: Phaser.GameObjects.Container,
  outgoing: Phaser.GameObjects.Container,
  transition: boolean,
): void {
  scene.tweens.killTweensOf([incoming, outgoing]);
  if (!transition) {
    incoming.setAlpha(1);
    outgoing.setAlpha(0);
    return;
  }
  incoming.setAlpha(0);
  scene.tweens.add({
    targets: incoming,
    alpha: 1,
    duration: MOTION.mediumMs,
  });
  scene.tweens.add({
    targets: outgoing,
    alpha: 0,
    duration: MOTION.mediumMs,
  });
}
