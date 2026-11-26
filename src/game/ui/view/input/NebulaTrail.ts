import { advanceTrail, emitTrail, getPuffLook } from '../../state/cursorTrail.js';
import type { PointPx, TrailPuff } from '../../state/cursorTrail.js';
import { lerp } from '../../../../range.js';
import { getEffectStepMs } from '../../../../time.js';
import { CURSOR_TAIL_OFFSET_PX } from './cursor.js';
import { rgba } from '../textures/lightTextures.js';

/** 흰 심이 없어야 연기처럼 흐리다. */
const NEBULA_STOPS = [
  {
    offset: 0,
    color: 0xf0e6ff,
  },
  {
    offset: 0.45,
    color: 0xc4a2ff,
  },
  {
    offset: 1,
    color: 0x7650c4,
  },
] as const;
const SPARK_COLOR = 0xfaf6ff;
const SPARK_RADIUS_PX = 0.9;
/** 덩이 alpha 가 아주 옅으므로 별빛 점은 그 몇 배로 밝혀 겨우 보이게 한다. */
const SPARK_ALPHA_SCALE = 7;

export class NebulaTrail {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private puffs: readonly TrailPuff[] = [];
  private last: PointPx | null = null;
  private frameId: number | null = null;
  private advancedAtMs = 0;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'nebula-trail';
    const context = this.canvas.getContext('2d');
    if (context === null) {
      throw new Error('2D canvas context is unavailable');
    }
    this.context = context;
    parent.append(this.canvas);
    this.fitToWindow();
    window.addEventListener('resize', () => this.fitToWindow());
    window.addEventListener('pointermove', (event) => this.onPointerMove(event));
    document.addEventListener('pointerleave', () => {
      this.last = null;
    });
    document.addEventListener('visibilitychange', (event) => this.onVisibilityChange(event));
  }

  private onVisibilityChange(event: Event): void {
    if (document.hidden) {
      this.last = null;
      if (this.frameId !== null) {
        cancelAnimationFrame(this.frameId);
        this.frameId = null;
      }
      return;
    }
    // 숨김으로 취소된 프레임이 지우지 못한 캔버스를 덩이가 없어도 복귀 첫 프레임이 지운다.
    this.start(event.timeStamp);
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') {
      return;
    }
    const point = {
      xPx: event.clientX + CURSOR_TAIL_OFFSET_PX.xPx,
      yPx: event.clientY + CURSOR_TAIL_OFFSET_PX.yPx,
    };
    if (this.last !== null) {
      this.advance(event.timeStamp);
      const next = emitTrail(this.puffs, this.last, point, Math.random);
      if (next === this.puffs) {
        return;
      }
      this.puffs = next;
      this.start(event.timeStamp);
    }
    this.last = point;
  }

  // 이벤트 시각이 직전 프레임 시각보다 이를 수 있어, 시계를 되돌리면 그 구간을 두 번 센다.
  private advance(atMs: number): void {
    this.puffs = advanceTrail(this.puffs, getEffectStepMs(this.advancedAtMs, atMs));
    this.advancedAtMs = Math.max(this.advancedAtMs, atMs);
  }

  private start(atMs: number): void {
    if (this.frameId !== null) {
      return;
    }
    this.advancedAtMs = Math.max(this.advancedAtMs, atMs);
    this.frameId = requestAnimationFrame((frameAtMs) => this.frame(frameAtMs));
  }

  private frame(atMs: number): void {
    this.advance(atMs);
    this.draw();
    this.frameId =
      this.puffs.length > 0 ? requestAnimationFrame((frameAtMs) => this.frame(frameAtMs)) : null;
  }

  private draw(): void {
    const { context } = this;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    context.globalCompositeOperation = 'lighter';
    for (const puff of this.puffs) {
      const { radiusPx, alpha } = getPuffLook(puff);
      const gradient = context.createRadialGradient(
        puff.xPx,
        puff.yPx,
        0,
        puff.xPx,
        puff.yPx,
        radiusPx,
      );
      for (const stop of NEBULA_STOPS) {
        gradient.addColorStop(stop.offset, rgba(stop.color, lerp(alpha, 0, stop.offset)));
      }
      context.fillStyle = gradient;
      context.fillRect(puff.xPx - radiusPx, puff.yPx - radiusPx, radiusPx * 2, radiusPx * 2);
      if (puff.hasSpark) {
        context.fillStyle = rgba(SPARK_COLOR, Math.min(1, alpha * SPARK_ALPHA_SCALE));
        context.beginPath();
        context.arc(puff.xPx, puff.yPx, SPARK_RADIUS_PX, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  private fitToWindow(): void {
    const ratio = window.devicePixelRatio;
    this.canvas.width = Math.round(window.innerWidth * ratio);
    this.canvas.height = Math.round(window.innerHeight * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }
}
