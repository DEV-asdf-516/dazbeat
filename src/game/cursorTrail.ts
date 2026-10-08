/** 포인터가 지나간 자리에 남는 성운 잔상 한 덩이. 위치·크기는 CSS px, 시간은 ms 다. */
export interface TrailPuff {
  readonly xPx: number;
  readonly yPx: number;
  readonly driftXPxPerMs: number;
  readonly driftYPxPerMs: number;
  readonly radiusPx: number;
  readonly ageMs: number;
  readonly lifeMs: number;
  /** 몇 덩이에만 작은 별빛 점을 함께 그린다. */
  readonly hasSpark: boolean;
}

export interface PointPx {
  readonly xPx: number;
  readonly yPx: number;
}

/** 그리기 시점의 모양. 퍼질수록 커지고 옅어져 연기처럼 흩어진다. */
export interface PuffLook {
  readonly radiusPx: number;
  readonly alpha: number;
}

/** 덩이 사이 거리. 넓게 두어 구슬 꿰듯 이어 보이지 않게 한다. */
const PUFF_SPACING_PX = 14;
const MAX_PUFFS_PER_MOVE = 6;
export const MAX_TRAIL_PUFFS = 90;
/** 지나간 선에서 이 반지름 안으로 흩뿌린다. */
export const SCATTER_PX = 12;
const MIN_LIFE_MS = 450;
const LIFE_SPREAD_MS = 300;
const MIN_RADIUS_PX = 16;
const RADIUS_SPREAD_PX = 14;
/** 움직인 반대쪽으로 흘러가는 빠르기. 꼬리에서 뒤로 풀려 나가는 느낌을 만든다. */
const MIN_BACK_DRIFT_PX_PER_MS = 0.01;
const BACK_DRIFT_SPREAD_PX_PER_MS = 0.02;
/** 진행 방향의 옆으로 퍼지는 최대 빠르기 */
const MAX_SIDE_DRIFT_PX_PER_MS = 0.025;
/** 흐름은 이 시간 상수로 잦아든다. 처음엔 풀려 나가고 끝엔 그 자리에 머물며 흩어진다. */
const DRIFT_DECAY_MS = 400;
const SPARK_CHANCE = 0.06;
/** 겹쳐 더해져도 배경을 덮지 않을 만큼 아주 옅게 둔다. */
const PEAK_ALPHA = 0.085;
/** 수명의 이 비율 동안 서서히 나타난다. 태어나는 순간 덩이가 툭 생기지 않게 한다. */
const FADE_IN_PROGRESS = 0.2;
/** 수명이 끝날 때 처음 반지름의 몇 배까지 번지는지. */
const SPREAD_SCALE = 2.6;

/**
 * from → to 로 움직인 거리만큼 덩이를 더한다. 멈춰 있으면 그대로 돌려준다.
 * 덩이는 선 위가 아니라 선 둘레에 흩뿌리고, 움직인 반대쪽과 옆으로 흘려 보낸다.
 * random 은 [0, 1) 값을 주는 함수로, 테스트에서 고정값을 넣는다.
 */
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
  // 진행 방향 단위 벡터와 그 수직
  const dirX = deltaXPx / distancePx;
  const dirY = deltaYPx / distancePx;
  const added: TrailPuff[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    // 원 안에 고르게 퍼지도록 반지름에 제곱근을 쓴다.
    const scatterAngle = random() * Math.PI * 2;
    const scatterPx = Math.sqrt(random()) * SCATTER_PX;
    const backPxPerMs = MIN_BACK_DRIFT_PX_PER_MS + random() * BACK_DRIFT_SPREAD_PX_PER_MS;
    const sidePxPerMs = (random() * 2 - 1) * MAX_SIDE_DRIFT_PX_PER_MS;
    added.push({
      xPx: from.xPx + deltaXPx * t + Math.cos(scatterAngle) * scatterPx,
      yPx: from.yPx + deltaYPx * t + Math.sin(scatterAngle) * scatterPx,
      driftXPxPerMs: -dirX * backPxPerMs - dirY * sidePxPerMs,
      driftYPxPerMs: -dirY * backPxPerMs + dirX * sidePxPerMs,
      radiusPx: MIN_RADIUS_PX + random() * RADIUS_SPREAD_PX,
      ageMs: 0,
      lifeMs: MIN_LIFE_MS + random() * LIFE_SPREAD_MS,
      hasSpark: random() < SPARK_CHANCE,
    });
  }
  // 넘치면 가장 오래된 덩이부터 버린다.
  return [...puffs, ...added].slice(-MAX_TRAIL_PUFFS);
}

/** elapsedMs 만큼 나이를 먹이고 흘려 보낸다. 흐름은 점점 잦아든다. 수명이 다한 덩이는 뺀다. */
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

/** 서서히 나타났다가 번지며 천천히 사라진다. */
export function getPuffLook(puff: TrailPuff): PuffLook {
  const progress = Math.min(1, puff.ageMs / puff.lifeMs);
  const fadeIn = Math.min(1, progress / FADE_IN_PROGRESS);
  const fadeOut = (1 - progress) * (1 - progress);
  return {
    radiusPx: puff.radiusPx * (1 + (SPREAD_SCALE - 1) * progress),
    alpha: PEAK_ALPHA * fadeIn * fadeOut,
  };
}
