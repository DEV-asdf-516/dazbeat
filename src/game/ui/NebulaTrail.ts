import { advanceTrail, emitTrail, getPuffLook } from './cursorTrail.js';
import type { PointPx, TrailPuff } from './cursorTrail.js';
import { CURSOR_TAIL_OFFSET_PX } from './cursor.js';

/** 흰 심이 없어야 연기처럼 흐리다. */
const NEBULA_STOPS = [
  {
    offset: 0,
    rgb: '190, 245, 228',
  },
  {
    offset: 0.45,
    rgb: '96, 212, 196',
  },
  {
    offset: 1,
    rgb: '40, 118, 128',
  },
] as const;
const SPARK_RGB = '224, 255, 244';
const SPARK_RADIUS_PX = 0.9;
/** 덩이 alpha 가 아주 옅으므로 별빛 점은 그 몇 배로 밝혀 겨우 보이게 한다. */
const SPARK_ALPHA_SCALE = 7;
/** 탭 전환 등으로 프레임이 멈췄다 오면 한 번에 다 늙혀 버리지 않도록 자른다. */
const MAX_FRAME_MS = 50;

export class NebulaTrail {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private puffs: readonly TrailPuff[] = [];
  private last: PointPx | null = null;
  private frameId: number | null = null;
  private lastFrameMs = 0;

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
      const next = emitTrail(this.puffs, this.last, point, Math.random);
      if (next === this.puffs) {
        return;
      }
      this.puffs = next;
      this.start();
    }
    this.last = point;
  }

  private start(): void {
    if (this.frameId !== null) {
      return;
    }
    this.lastFrameMs = performance.now();
    this.frameId = requestAnimationFrame((nowMs) => this.frame(nowMs));
  }

  private frame(nowMs: number): void {
    const elapsedMs = Math.min(MAX_FRAME_MS, nowMs - this.lastFrameMs);
    this.lastFrameMs = nowMs;
    this.puffs = advanceTrail(this.puffs, elapsedMs);
    this.draw();
    this.frameId = this.puffs.length > 0 ? requestAnimationFrame((next) => this.frame(next)) : null;
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
        const stopAlpha = stop.offset === 1 ? 0 : alpha * (1 - stop.offset);
        gradient.addColorStop(stop.offset, `rgba(${stop.rgb}, ${stopAlpha})`);
      }
      context.fillStyle = gradient;
      context.fillRect(puff.xPx - radiusPx, puff.yPx - radiusPx, radiusPx * 2, radiusPx * 2);
      if (puff.hasSpark) {
        context.fillStyle = `rgba(${SPARK_RGB}, ${Math.min(1, alpha * SPARK_ALPHA_SCALE)})`;
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
