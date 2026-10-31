import Phaser from 'phaser';
import type { ScreenState } from './state/screenState.js';

interface Look {
  readonly kind: string;
  readonly count: number;
}

type Exit = { readonly kind: 'staying' } | { readonly kind: 'leaving' };

function exitScene(exit: Exit): Exit {
  return exit.kind === 'leaving'
    ? exit
    : {
        kind: 'leaving',
      };
}

export function drawChanges(
  previous: Look | null,
  next: Look,
  choose: (before: Look | null, after: Look) => readonly string[],
): readonly string[] {
  return choose(previous, next);
}

export class GlowBadge {
  glow: Phaser.GameObjects.Image | null = null;
  tweens: readonly Phaser.Tweens.Tween[] = [];

  constructor(
    readonly text: Phaser.GameObjects.Text,
    readonly previousSong: string,
  ) {}

  render(look: Look): void {
    this.text.setText(`${this.previousSong} ${look.count}`);
    this.text.x = look.count;
  }
}

export class SetupScene extends Phaser.Scene {
  label: Phaser.GameObjects.Text | null = null;
  exit: Exit = {
    kind: 'staying',
  };

  create(): void {
    this.label = this.add.text(0, 0, '');
    this.exit = {
      kind: 'staying',
    };
  }

  leave(): void {
    this.exit = exitScene(this.exit);
  }
}

export function paintCanvas(canvas: HTMLCanvasElement, image: ImageData): void {
  canvas.width = image.width;
  image.data[0] = 0;
}

export function layoutTexts(texts: readonly Phaser.GameObjects.Text[]): number {
  let xPx = 0;
  texts.forEach((text) => {
    text.setX(xPx);
    xPx += text.width;
  });
  return xPx;
}

export function placeVertices(mesh: Phaser.GameObjects.Mesh2D): void {
  mesh.vertices[0] = 0;
  const { vertices } = mesh;
  vertices[1] = 0;
}

export function readPreviousField(previous: Look | null, next: Look): number {
  if (previous === null) {
    return next.count;
  }
  return previous.count;
}

export function keepPreviousLook(next: Look): Look {
  const previousLook = next;
  const kept = previousLook;
  return kept;
}

export class CountBadge {
  count = 0;
  shownKind: string | null = null;
  glowProgress = 0;
  private textures = new Map<string, Phaser.Textures.Texture>();

  constructor(
    readonly text: Phaser.GameObjects.Text,
    readonly state: ScreenState,
    private shownCount: number,
  ) {}

  render(look: Look): number {
    this.glowProgress += 0.1;
    this.textures = new Map();
    return look.count + this.shownCount + this.state.count + this.textures.size;
  }
}

export class FieldScene extends Phaser.Scene {
  shownCount = 0;
  onTap = (): void => {
    this.shownCount = 1;
  };

  override update(): void {
    this.shownCount = 1;
    this.shownCount += 1;
  }
}

export function countClicks(button: Phaser.GameObjects.Text): void {
  let clicks = 0;
  button.on(Phaser.Input.Events.POINTER_UP, () => {
    clicks += 1;
    button.setData('clicks', clicks);
  });
}

interface RowView {
  label: string;
}

export function writeRowLabel(row: RowView, items: number[]): void {
  row.label = 'label';
  items.length = 0;
}

interface Strip {
  readonly points: number[];
}

export function writeStripPoints(strip: Strip): void {
  strip.points[0] = 0;
  const { points } = strip;
  points[1] = 0;
}
