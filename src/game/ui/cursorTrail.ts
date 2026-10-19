import { getProgress, lerp } from '../../range.js';

export interface TrailPuff {
  readonly xPx: number;
  readonly yPx: number;
  readonly driftXPxPerMs: number;
  readonly driftYPxPerMs: number;
  readonly radiusPx: number;
  readonly ageMs: number;
  readonly lifeMs: number;
  readonly hasSpark: boolean;
}

export interface PointPx {
  readonly xPx: number;
  readonly yPx: number;
}

export interface PuffLook {
  readonly radiusPx: number;
  readonly alpha: number;
}

/** 넓게 두어 구슬 꿰듯 이어 보이지 않게 한다. */
const PUFF_SPACING_PX = 14;
const MAX_PUFFS_PER_MOVE = 6;
const MAX_TRAIL_PUFFS = 90;
const SCATTER_PX = 12;
const MIN_LIFE_MS = 450;
const MAX_LIFE_MS = 750;
const MIN_RADIUS_PX = 16;
const MAX_RADIUS_PX = 30;
const MIN_BACK_DRIFT_PX_PER_MS = 0.01;
const MAX_BACK_DRIFT_PX_PER_MS = 0.03;
const MAX_SIDE_DRIFT_PX_PER_MS = 0.025;
const DRIFT_DECAY_MS = 400;
const SPARK_CHANCE = 0.06;
/** 겹쳐 더해져도 배경을 덮지 않을 만큼 아주 옅게 둔다. */
const PEAK_ALPHA = 0.085;
/** 태어나는 순간 덩이가 툭 생기지 않게 한다. */
const FADE_IN_PROGRESS = 0.2;
const SPREAD_SCALE = 2.6;

export function emitTrail(
  puffs: readonly TrailPuff[],
  from: PointPx,
  to: PointPx,
  random: () => number,
): readonly TrailPuff[] {
  const deltaXPx = to.xPx - from.xPx;
  const deltaYPx = to.yPx - from.yPx;
  const distancePx = Math.hypot(deltaXPx, deltaYPx);
  const count = Math.min(MAX_PUFFS_PER_MOVE, Math.floor(distancePx / PUFF_SPACING_PX));
  if (count === 0) {
    return puffs;
  }
  const dirX = deltaXPx / distancePx;
  const dirY = deltaYPx / distancePx;
  const added: TrailPuff[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    // 원 안에 고르게 퍼지도록 반지름에 제곱근을 쓴다.
    const scatterAngle = random() * Math.PI * 2;
    const scatterPx = Math.sqrt(random()) * SCATTER_PX;
    const backPxPerMs = lerp(MIN_BACK_DRIFT_PX_PER_MS, MAX_BACK_DRIFT_PX_PER_MS, random());
    const sidePxPerMs = lerp(-MAX_SIDE_DRIFT_PX_PER_MS, MAX_SIDE_DRIFT_PX_PER_MS, random());
    added.push({
      xPx: lerp(from.xPx, to.xPx, t) + Math.cos(scatterAngle) * scatterPx,
      yPx: lerp(from.yPx, to.yPx, t) + Math.sin(scatterAngle) * scatterPx,
      driftXPxPerMs: -dirX * backPxPerMs - dirY * sidePxPerMs,
      driftYPxPerMs: -dirY * backPxPerMs + dirX * sidePxPerMs,
      radiusPx: lerp(MIN_RADIUS_PX, MAX_RADIUS_PX, random()),
      ageMs: 0,
      lifeMs: lerp(MIN_LIFE_MS, MAX_LIFE_MS, random()),
      hasSpark: random() < SPARK_CHANCE,
    });
  }
  return [...puffs, ...added].slice(-MAX_TRAIL_PUFFS);
}

export function advanceTrail(puffs: readonly TrailPuff[], elapsedMs: number): readonly TrailPuff[] {
  const decay = Math.exp(-elapsedMs / DRIFT_DECAY_MS);
  const next: TrailPuff[] = [];
  for (const puff of puffs) {
    const ageMs = puff.ageMs + elapsedMs;
    if (ageMs >= puff.lifeMs) {
      continue;
    }
    next.push({
      ...puff,
      ageMs,
      xPx: puff.xPx + puff.driftXPxPerMs * elapsedMs,
      yPx: puff.yPx + puff.driftYPxPerMs * elapsedMs,
      driftXPxPerMs: puff.driftXPxPerMs * decay,
      driftYPxPerMs: puff.driftYPxPerMs * decay,
    });
  }
  return next;
}

export function getPuffLook(puff: TrailPuff): PuffLook {
  const progress = getProgress(puff.ageMs, 0, puff.lifeMs);
  const fadeIn = getProgress(progress, 0, FADE_IN_PROGRESS);
  const fadeOut = (1 - progress) * (1 - progress);
  return {
    radiusPx: puff.radiusPx * lerp(1, SPREAD_SCALE, progress),
    alpha: PEAK_ALPHA * fadeIn * fadeOut,
  };
}
