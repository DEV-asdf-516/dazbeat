import type { Judgment, JudgmentEvent } from '../../rhythm/types.js';

export type LaneEffectId = 'R32' | 'R33' | 'R34' | 'R35' | 'R36';

// LaneFx 가 이 순서로 sprite 를 만들므로 같은 depth 의 겹침 순서가 이 순서를 따른다.
export const LANE_EFFECT_IDS: readonly LaneEffectId[] = ['R34', 'R35', 'R36', 'R32', 'R33'];

const HIT_EFFECT_IDS: Record<Judgment, readonly LaneEffectId[]> = {
  perfect: ['R34', 'R35', 'R36'],
  great: ['R34', 'R35'],
  good: ['R34'],
  bad: [],
  miss: [],
};

/** 판정 하나가 lane 에 재생할 celestial 효과. 반환 순서가 재생 순서다. */
export function getLaneEffectIds(
  event: Pick<JudgmentEvent, 'kind' | 'judgment'>,
): readonly LaneEffectId[] {
  const { kind, judgment } = event;
  const ids = [...HIT_EFFECT_IDS[judgment]];
  if (judgment === 'miss') {
    return ids;
  }
  if (kind === 'tap' || kind === 'holdStart') {
    ids.push('R33');
  }
  if (kind === 'holdStart') {
    ids.push('R32');
  }
  return ids;
}

const HIT_BLOOM_INTENSITY: Record<Judgment, number> = {
  perfect: 1,
  great: 0.75,
  good: 0.45,
  bad: 0,
  miss: 0,
};

/** 타격 빛 번짐의 세기(0~1). 0 이면 번짐을 띄우지 않는다. */
export function getHitBloomIntensity(judgment: Judgment): number {
  return HIT_BLOOM_INTENSITY[judgment];
}

export function hasJudgmentShimmer(judgment: Judgment): boolean {
  return judgment !== 'bad' && judgment !== 'miss';
}

/** 판정을 반영한 뒤 플레이 중이던 판이 실패로 끝나는지. 이미 끝난 판은 다시 전이하지 않는다. */
export function shouldFailPlay(isPlaying: boolean, isSessionFailed: boolean): boolean {
  return isPlaying && isSessionFailed;
}
