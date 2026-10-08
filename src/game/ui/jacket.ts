import Phaser from 'phaser';
import type { Song } from '../../data/songs.js';
import { getCenteredSquare } from './jacketCrop.js';
import { queueImageLoads } from './imageLoad.js';
import { LIGHT_TEXTURES, addLight, ensureLightTextures } from './lightTextures.js';
import { COLORS, MOTION, RADIUS } from './theme.js';

const SQUARE_FRAME = 'square';
const PLACEHOLDER_GLOW_ALPHA = 0.3;

export function jacketTextureKey(song: Song): string {
  return `jacket:${song.id}`;
}

export function queueJacketLoads(scene: Phaser.Scene, songs: readonly Song[]): void {
  queueImageLoads(
    scene,
    songs.map((song) => ({ key: jacketTextureKey(song), url: song.jacketUrl })),
    'jacket',
  );
}

/** 곡이 바뀌면 새 내용을 앞 레이어에 그려 이전 내용 위로 crossfade 한다. */
abstract class SongCrossfade extends Phaser.GameObjects.Container {
  private front: Phaser.GameObjects.Container;
  private back: Phaser.GameObjects.Container;
  private song: Song | null = null;

  constructor(scene: Phaser.Scene, xPx: number, yPx: number) {
    super(scene, xPx, yPx);
    this.front = scene.add.container(0, 0);
    this.back = scene.add.container(0, 0);
    this.add([this.back, this.front]);
    scene.add.existing(this);
  }

  setSong(song: Song | null, transition = false): this {
    if (song === this.song) {
      return this;
    }
    this.song = song;
    [this.front, this.back] = [this.back, this.front];
    this.front.removeAll(true);
    if (song !== null) {
      this.front.add(this.createContent(song));
    }
    this.moveAbove(this.front, this.back);
    crossfade(this.scene, this.front, this.back, transition);
    return this;
  }

  protected abstract createContent(song: Song): Phaser.GameObjects.GameObject[];
}

export class JacketView extends SongCrossfade {
  private readonly sizePx: number;

  constructor(scene: Phaser.Scene, xPx: number, yPx: number, sizePx: number) {
    super(scene, xPx, yPx);
    this.sizePx = sizePx;
    ensureLightTextures(scene);
  }

  protected createContent(song: Song): Phaser.GameObjects.GameObject[] {
    const scene = this.scene;
    const key = jacketTextureKey(song);
    if (scene.textures.exists(key)) {
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
  scene.tweens.add({ targets: incoming, alpha: 1, duration: MOTION.mediumMs });
  scene.tweens.add({ targets: outgoing, alpha: 0, duration: MOTION.mediumMs });
}
