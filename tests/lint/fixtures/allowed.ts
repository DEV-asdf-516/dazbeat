import Phaser from 'phaser';

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
