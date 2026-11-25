import Phaser from 'phaser';
import { isShallowEqual } from '../../../../shallowEqual.js';
import { isBoolean, isFiniteNumber } from '../../../../typeGuards.js';
import { rgba } from '../textures/lightTextures.js';

// Phaser 4.2.1 gameobjects/graphics/Commands.js 의 값이다. Phaser 가 이 표를 타입·네임스페이스로 내보내지 않는다.
const COMMANDS = {
  ARC: 0,
  BEGIN_PATH: 1,
  CLOSE_PATH: 2,
  FILL_RECT: 3,
  LINE_TO: 4,
  MOVE_TO: 5,
  LINE_STYLE: 6,
  FILL_STYLE: 7,
  FILL_PATH: 8,
  STROKE_PATH: 9,
  FILL_TRIANGLE: 10,
  STROKE_TRIANGLE: 11,
  SAVE: 14,
  RESTORE: 15,
  TRANSLATE: 16,
  SCALE: 17,
  ROTATE: 18,
  GRADIENT_FILL_STYLE: 21,
  GRADIENT_LINE_STYLE: 22,
} as const;

// 같은 Graphics.js 가 명령 번호 뒤에 붙이는 값의 이름과 순서다. 다음 명령은 그만큼 건너뛴 자리에 있다.
const ARGUMENTS = {
  ARC: ['xPx', 'yPx', 'radiusPx', 'startAngle', 'endAngle', 'anticlockwise', 'overshoot'],
  LINE_STYLE: ['lineWidthPx', 'color', 'alpha'],
  FILL_STYLE: ['color', 'alpha'],
  GRADIENT_FILL_STYLE: [
    'alphaTopLeft',
    'alphaTopRight',
    'alphaBottomLeft',
    'alphaBottomRight',
    'colorTopLeft',
    'colorTopRight',
    'colorBottomLeft',
    'colorBottomRight',
  ],
  GRADIENT_LINE_STYLE: [
    'lineWidthPx',
    'alpha',
    'colorTopLeft',
    'colorTopRight',
    'colorBottomLeft',
    'colorBottomRight',
  ],
  FILL_RECT: ['xPx', 'yPx', 'widthPx', 'heightPx'],
  FILL_TRIANGLE: ['x0Px', 'y0Px', 'x1Px', 'y1Px', 'x2Px', 'y2Px'],
  STROKE_TRIANGLE: ['x0Px', 'y0Px', 'x1Px', 'y1Px', 'x2Px', 'y2Px'],
  LINE_TO: ['xPx', 'yPx'],
  MOVE_TO: ['xPx', 'yPx'],
  TRANSLATE: ['xPx', 'yPx'],
  SCALE: ['x', 'y'],
  ROTATE: ['radians'],
} as const;
const COMMAND_ID_LENGTH = 1;
const GRADIENT_STYLE_LENGTH = COMMAND_ID_LENGTH + ARGUMENTS.GRADIENT_FILL_STYLE.length;
const TRIANGLE_LENGTH = COMMAND_ID_LENGTH + ARGUMENTS.FILL_TRIANGLE.length;

// GRADIENT_FILL_STYLE → FILL_TRIANGLE → GRADIENT_FILL_STYLE → FILL_TRIANGLE 이 이어지는 칸 한 개에서 각 명령의 위치다.
const SLICE = {
  firstTriangle: GRADIENT_STYLE_LENGTH,
  secondStyle: GRADIENT_STYLE_LENGTH + TRIANGLE_LENGTH,
  secondTriangle: GRADIENT_STYLE_LENGTH * 2 + TRIANGLE_LENGTH,
  length: (GRADIENT_STYLE_LENGTH + TRIANGLE_LENGTH) * 2,
} as const;
const MIN_DETERMINANT = 1e-9;
const MIN_GRADIENT_LENGTH_SQ = 1e-12;

interface GradientFill {
  color: number;
  alphaTopLeft: number;
  alphaTopRight: number;
  alphaBottomLeft: number;
  alphaBottomRight: number;
}

interface AlphaPoint {
  xPx: number;
  yPx: number;
  alpha: number;
}

interface Point {
  xPx: number;
  yPx: number;
}

interface Rect {
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
}

type Triangle = readonly [Point, Point, Point];

type ArgumentCommand = keyof typeof ARGUMENTS;
type ArgumentName<C extends ArgumentCommand> = (typeof ARGUMENTS)[C][number];
type PointCommand = 'ARC' | 'FILL_RECT' | 'LINE_TO' | 'MOVE_TO' | 'TRANSLATE';
type TriangleCommand = 'FILL_TRIANGLE' | 'STROKE_TRIANGLE';

function readBufferArgument<C extends ArgumentCommand>(
  buffer: readonly unknown[],
  index: number,
  command: C,
  name: ArgumentName<C>,
): unknown {
  const names: readonly string[] = ARGUMENTS[command];
  return buffer[index + COMMAND_ID_LENGTH + names.indexOf(name)];
}

function readBufferNumber<C extends ArgumentCommand>(
  buffer: readonly unknown[],
  index: number,
  command: C,
  name: ArgumentName<C>,
): number {
  const value = readBufferArgument(buffer, index, command, name);
  if (!isFiniteNumber(value)) {
    throw new Error(`Graphics ${command} ${name} is not a number at ${index}`);
  }
  return value;
}

function readBufferPoint(buffer: readonly unknown[], index: number, command: PointCommand): Point {
  return {
    xPx: readBufferNumber(buffer, index, command, 'xPx'),
    yPx: readBufferNumber(buffer, index, command, 'yPx'),
  };
}

function readBufferRect(buffer: readonly unknown[], index: number): Rect {
  return {
    ...readBufferPoint(buffer, index, 'FILL_RECT'),
    widthPx: readBufferNumber(buffer, index, 'FILL_RECT', 'widthPx'),
    heightPx: readBufferNumber(buffer, index, 'FILL_RECT', 'heightPx'),
  };
}

function readBufferTriangle(
  buffer: readonly unknown[],
  index: number,
  command: TriangleCommand,
): Triangle {
  return [
    {
      xPx: readBufferNumber(buffer, index, command, 'x0Px'),
      yPx: readBufferNumber(buffer, index, command, 'y0Px'),
    },
    {
      xPx: readBufferNumber(buffer, index, command, 'x1Px'),
      yPx: readBufferNumber(buffer, index, command, 'y1Px'),
    },
    {
      xPx: readBufferNumber(buffer, index, command, 'x2Px'),
      yPx: readBufferNumber(buffer, index, command, 'y2Px'),
    },
  ];
}

function traceTriangle(ctx: CanvasRenderingContext2D, [p0, p1, p2]: Triangle): void {
  ctx.beginPath();
  ctx.moveTo(p0.xPx, p0.yPx);
  ctx.lineTo(p1.xPx, p1.yPx);
  ctx.lineTo(p2.xPx, p2.yPx);
  ctx.closePath();
}

// 그라데이션을 쓰는 곳(trapezoidFill, titleBackdrop)은 네 모서리를 같은 색으로 두고 alpha 만 바꾸므로 왼쪽 위 색 하나만 읽는다.
function readBufferGradient(buffer: readonly unknown[], index: number): GradientFill {
  const command = 'GRADIENT_FILL_STYLE';
  return {
    alphaTopLeft: readBufferNumber(buffer, index, command, 'alphaTopLeft'),
    alphaTopRight: readBufferNumber(buffer, index, command, 'alphaTopRight'),
    alphaBottomLeft: readBufferNumber(buffer, index, command, 'alphaBottomLeft'),
    alphaBottomRight: readBufferNumber(buffer, index, command, 'alphaBottomRight'),
    color: readBufferNumber(buffer, index, command, 'colorTopLeft'),
  };
}

// alpha 가 세 점을 지나는 평면(위치의 1차식)이면, 같은 색에 최소·최대 alpha 두 정지점을 둔 선형 그라데이션과 같다.
// 기울기 방향으로 bounds 의 최소 alpha 점에서 최대 alpha 점까지 잇는다. 세 점이 한 줄이면 칠하지 않는다.
function alphaPlaneStyle(
  ctx: CanvasRenderingContext2D,
  color: number,
  points: readonly [AlphaPoint, AlphaPoint, AlphaPoint],
  bounds: readonly Point[],
): string | CanvasGradient | null {
  const [p0, p1, p2] = points;
  const determinant = (p1.xPx - p0.xPx) * (p2.yPx - p0.yPx) - (p2.xPx - p0.xPx) * (p1.yPx - p0.yPx);
  if (Math.abs(determinant) < MIN_DETERMINANT) {
    return null;
  }
  const gx =
    ((p1.alpha - p0.alpha) * (p2.yPx - p0.yPx) - (p2.alpha - p0.alpha) * (p1.yPx - p0.yPx)) /
    determinant;
  const gy =
    ((p2.alpha - p0.alpha) * (p1.xPx - p0.xPx) - (p1.alpha - p0.alpha) * (p2.xPx - p0.xPx)) /
    determinant;
  const lengthSq = gx * gx + gy * gy;
  if (lengthSq < MIN_GRADIENT_LENGTH_SQ) {
    return rgba(color, p0.alpha);
  }
  const alphas = bounds.map(
    (point) => p0.alpha + gx * (point.xPx - p0.xPx) + gy * (point.yPx - p0.yPx),
  );
  const lowAlpha = Math.min(...alphas);
  const highAlpha = Math.max(...alphas);
  const startShift = (lowAlpha - p0.alpha) / lengthSq;
  const startXPx = p0.xPx + gx * startShift;
  const startYPx = p0.yPx + gy * startShift;
  const span = (highAlpha - lowAlpha) / lengthSq;
  const gradient = ctx.createLinearGradient(
    startXPx,
    startYPx,
    startXPx + gx * span,
    startYPx + gy * span,
  );
  gradient.addColorStop(0, rgba(color, lowAlpha));
  gradient.addColorStop(1, rgba(color, highAlpha));
  return gradient;
}

function fillGradientTriangle(
  ctx: CanvasRenderingContext2D,
  color: number,
  points: readonly [AlphaPoint, AlphaPoint, AlphaPoint],
): void {
  const style = alphaPlaneStyle(ctx, color, points, points);
  if (style === null) {
    return;
  }
  traceTriangle(ctx, points);
  ctx.fillStyle = style;
  ctx.fill();
}

function fillGradientRect(
  ctx: CanvasRenderingContext2D,
  gradient: GradientFill,
  { xPx, yPx, widthPx, heightPx }: Rect,
): void {
  const { color, alphaTopLeft, alphaTopRight, alphaBottomLeft, alphaBottomRight } = gradient;
  if (alphaTopLeft === alphaTopRight && alphaBottomLeft === alphaBottomRight) {
    const style = ctx.createLinearGradient(0, yPx, 0, yPx + heightPx);
    style.addColorStop(0, rgba(color, alphaTopLeft));
    style.addColorStop(1, rgba(color, alphaBottomLeft));
    ctx.fillStyle = style;
    ctx.fillRect(xPx, yPx, widthPx, heightPx);
    return;
  }
  const topLeft = {
    xPx,
    yPx,
    alpha: alphaTopLeft,
  };
  const topRight = {
    xPx: xPx + widthPx,
    yPx,
    alpha: alphaTopRight,
  };
  const bottomLeft = {
    xPx,
    yPx: yPx + heightPx,
    alpha: alphaBottomLeft,
  };
  const bottomRight = {
    xPx: xPx + widthPx,
    yPx: yPx + heightPx,
    alpha: alphaBottomRight,
  };
  fillGradientTriangle(ctx, color, [topLeft, topRight, bottomLeft]);
  fillGradientTriangle(ctx, color, [topRight, bottomRight, bottomLeft]);
}

// fillTrapezoid 의 얇은 조각 한 칸은 두 삼각형을 따로 칠하면 맞닿은 대각선·가로 변이 각각 안티에일리어싱돼 이음매가 생긴다.
// 한 칸을 한 경로로 칠하고 가로 변은 정수 px 에 맞춰 이웃 칸과 겹치거나 비지 않게 한다. 칸이 아니면 false 다.
function fillGradientSlice(
  ctx: CanvasRenderingContext2D,
  buffer: readonly unknown[],
  index: number,
): boolean {
  if (
    buffer[index + SLICE.firstTriangle] !== COMMANDS.FILL_TRIANGLE ||
    buffer[index + SLICE.secondStyle] !== COMMANDS.GRADIENT_FILL_STYLE ||
    buffer[index + SLICE.secondTriangle] !== COMMANDS.FILL_TRIANGLE
  ) {
    return false;
  }
  const { color, alphaTopLeft, alphaTopRight, alphaBottomLeft } = readBufferGradient(buffer, index);
  if (readBufferGradient(buffer, index + SLICE.secondStyle).color !== color) {
    return false;
  }
  const [topLeft, topRight, bottomLeft] = readBufferTriangle(
    buffer,
    index + SLICE.firstTriangle,
    'FILL_TRIANGLE',
  );
  const [secondTopRight, bottomRight, secondBottomLeft] = readBufferTriangle(
    buffer,
    index + SLICE.secondTriangle,
    'FILL_TRIANGLE',
  );
  const isSlice =
    isShallowEqual(secondTopRight, topRight) &&
    isShallowEqual(secondBottomLeft, bottomLeft) &&
    topLeft.yPx === topRight.yPx &&
    bottomLeft.yPx === bottomRight.yPx;
  if (!isSlice) {
    return false;
  }
  const topYPx = Math.round(topLeft.yPx);
  const bottomYPx = Math.round(bottomLeft.yPx);
  if (bottomYPx <= topYPx) {
    return true;
  }
  // 첫 삼각형(TL, TR, BL)의 alpha 평면을 칸 전체에 쓴다.
  const style = alphaPlaneStyle(
    ctx,
    color,
    [
      {
        ...topLeft,
        alpha: alphaTopLeft,
      },
      {
        ...topRight,
        alpha: alphaTopRight,
      },
      {
        ...bottomLeft,
        alpha: alphaBottomLeft,
      },
    ],
    [topLeft, topRight, bottomRight, bottomLeft],
  );
  if (style === null) {
    return true;
  }
  ctx.beginPath();
  ctx.moveTo(topLeft.xPx, topYPx);
  ctx.lineTo(topRight.xPx, topYPx);
  ctx.lineTo(bottomRight.xPx, bottomYPx);
  ctx.lineTo(bottomLeft.xPx, bottomYPx);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
  return true;
}

// Phaser GraphicsCanvasRenderer 는 GRADIENT_FILL_STYLE 을 값 5개만 건너뛰고 칠하지 않아 그라데이션 칠을 더한다.
export function renderGraphicsCanvas(
  renderer: Phaser.Renderer.Canvas.CanvasRenderer,
  src: Phaser.GameObjects.Graphics,
  camera: Phaser.Cameras.Scene2D.Camera,
  parentMatrix?: Phaser.GameObjects.Components.TransformMatrix,
  renderTargetCtx?: CanvasRenderingContext2D,
  isClipAllowed?: boolean,
): void {
  const buffer: readonly unknown[] = src.commandBuffer;
  const ctx = renderTargetCtx ?? renderer.currentContext;
  if (
    buffer.length === 0 ||
    !Phaser.Renderer.Canvas.SetTransform(renderer, ctx, src, camera, parentMatrix)
  ) {
    return;
  }
  camera.addToRenderList(src);
  const canFill = isClipAllowed !== true;
  let gradient: GradientFill | null = null;
  ctx.beginPath();
  for (let index = 0; index < buffer.length; index++) {
    switch (buffer[index]) {
      case COMMANDS.ARC: {
        const command = 'ARC';
        const { xPx, yPx } = readBufferPoint(buffer, index, command);
        const radiusPx = readBufferNumber(buffer, index, command, 'radiusPx');
        const startAngle = readBufferNumber(buffer, index, command, 'startAngle');
        const endAngle = readBufferNumber(buffer, index, command, 'endAngle');
        const anticlockwise = readBufferArgument(buffer, index, command, 'anticlockwise');
        // overshoot 는 Canvas 에서 쓰지 않는다.
        ctx.arc(
          xPx,
          yPx,
          radiusPx,
          startAngle,
          endAngle,
          isBoolean(anticlockwise) && anticlockwise,
        );
        index += ARGUMENTS.ARC.length;
        break;
      }
      case COMMANDS.LINE_STYLE: {
        const command = 'LINE_STYLE';
        const lineWidthPx = readBufferNumber(buffer, index, command, 'lineWidthPx');
        const color = readBufferNumber(buffer, index, command, 'color');
        const alpha = readBufferNumber(buffer, index, command, 'alpha');
        ctx.strokeStyle = rgba(color, alpha);
        ctx.lineWidth = lineWidthPx;
        index += ARGUMENTS.LINE_STYLE.length;
        break;
      }
      case COMMANDS.FILL_STYLE: {
        const command = 'FILL_STYLE';
        const color = readBufferNumber(buffer, index, command, 'color');
        const alpha = readBufferNumber(buffer, index, command, 'alpha');
        gradient = null;
        ctx.fillStyle = rgba(color, alpha);
        index += ARGUMENTS.FILL_STYLE.length;
        break;
      }
      case COMMANDS.GRADIENT_FILL_STYLE:
        if (canFill && fillGradientSlice(ctx, buffer, index)) {
          gradient = readBufferGradient(buffer, index + SLICE.secondStyle);
          index += SLICE.length - 1;
          break;
        }
        gradient = readBufferGradient(buffer, index);
        index += ARGUMENTS.GRADIENT_FILL_STYLE.length;
        break;
      case COMMANDS.GRADIENT_LINE_STYLE:
        index += ARGUMENTS.GRADIENT_LINE_STYLE.length;
        break;
      case COMMANDS.BEGIN_PATH:
        ctx.beginPath();
        break;
      case COMMANDS.CLOSE_PATH:
        ctx.closePath();
        break;
      case COMMANDS.FILL_PATH:
        if (canFill) {
          if (gradient !== null) {
            ctx.fillStyle = rgba(gradient.color, gradient.alphaTopLeft);
          }
          ctx.fill();
        }
        break;
      case COMMANDS.STROKE_PATH:
        if (canFill) {
          ctx.stroke();
        }
        break;
      case COMMANDS.FILL_RECT: {
        const rect = readBufferRect(buffer, index);
        if (!canFill) {
          ctx.rect(rect.xPx, rect.yPx, rect.widthPx, rect.heightPx);
        } else if (gradient === null) {
          ctx.fillRect(rect.xPx, rect.yPx, rect.widthPx, rect.heightPx);
        } else {
          fillGradientRect(ctx, gradient, rect);
        }
        index += ARGUMENTS.FILL_RECT.length;
        break;
      }
      case COMMANDS.FILL_TRIANGLE: {
        const triangle = readBufferTriangle(buffer, index, 'FILL_TRIANGLE');
        if (canFill && gradient !== null) {
          const [p0, p1, p2] = triangle;
          fillGradientTriangle(ctx, gradient.color, [
            {
              ...p0,
              alpha: gradient.alphaTopLeft,
            },
            {
              ...p1,
              alpha: gradient.alphaTopRight,
            },
            {
              ...p2,
              alpha: gradient.alphaBottomLeft,
            },
          ]);
        } else {
          traceTriangle(ctx, triangle);
          if (canFill) {
            ctx.fill();
          }
        }
        index += ARGUMENTS.FILL_TRIANGLE.length;
        break;
      }
      case COMMANDS.STROKE_TRIANGLE:
        traceTriangle(ctx, readBufferTriangle(buffer, index, 'STROKE_TRIANGLE'));
        if (canFill) {
          ctx.stroke();
        }
        index += ARGUMENTS.STROKE_TRIANGLE.length;
        break;
      case COMMANDS.LINE_TO: {
        const { xPx, yPx } = readBufferPoint(buffer, index, 'LINE_TO');
        ctx.lineTo(xPx, yPx);
        index += ARGUMENTS.LINE_TO.length;
        break;
      }
      case COMMANDS.MOVE_TO: {
        const { xPx, yPx } = readBufferPoint(buffer, index, 'MOVE_TO');
        ctx.moveTo(xPx, yPx);
        index += ARGUMENTS.MOVE_TO.length;
        break;
      }
      case COMMANDS.SAVE:
        ctx.save();
        break;
      case COMMANDS.RESTORE:
        ctx.restore();
        break;
      case COMMANDS.TRANSLATE: {
        const { xPx, yPx } = readBufferPoint(buffer, index, 'TRANSLATE');
        ctx.translate(xPx, yPx);
        index += ARGUMENTS.TRANSLATE.length;
        break;
      }
      case COMMANDS.SCALE:
        ctx.scale(
          readBufferNumber(buffer, index, 'SCALE', 'x'),
          readBufferNumber(buffer, index, 'SCALE', 'y'),
        );
        index += ARGUMENTS.SCALE.length;
        break;
      case COMMANDS.ROTATE:
        ctx.rotate(readBufferNumber(buffer, index, 'ROTATE', 'radians'));
        index += ARGUMENTS.ROTATE.length;
        break;
    }
  }
  ctx.restore();
}
