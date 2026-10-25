import type { Judgment, JudgmentEvent } from '../../rhythm/types.js';
import type { CelestialAtlasId } from '../celestial/celestialCatalog.js';
import type { SoundEffect } from '../ui/soundEffects.js';

export const LANE_EFFECT_IDS = [
  'R32',
  'R33',
  'R34',
  'R35',
  'R36',
] as const satisfies readonly CelestialAtlasId[];
export type LaneEffectId = (typeof LANE_EFFECT_IDS)[number];

const HIT_EFFECT_IDS: Record<Judgment, readonly LaneEffectId[]> = {
  perfect: ['R34', 'R35', 'R36'],
  great: ['R34', 'R35'],
  good: ['R34'],
  bad: [],
  miss: [],
};

// 반환 순서가 재생 순서다.
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

// 레인을 칠 때마다 타격음이 나므로 PERFECT·GREAT 는 판정음을 더하지 않는다.
const JUDGMENT_SOUND_EFFECTS: Record<Judgment, SoundEffect | null> = {
  perfect: null,
  great: null,
  good: 'judgeGood',
  bad: 'judgeBad',
  miss: 'judgeMiss',
};

export function getJudgmentSoundEffect(
  event: Pick<JudgmentEvent, 'kind' | 'judgment'>,
): SoundEffect | null {
  return event.kind === 'holdEnd' ? null : JUDGMENT_SOUND_EFFECTS[event.judgment];
}

const HIT_BLOOM_INTENSITY: Record<Judgment, number> = {
  perfect: 1,
  great: 0.75,
  good: 0.45,
  bad: 0,
  miss: 0,
};

export function getHitBloomIntensity(judgment: Judgment): number {
  return HIT_BLOOM_INTENSITY[judgment];
}

export const JUDGMENT_SHIMMER_ID = 'R38' satisfies CelestialAtlasId;

export function hasJudgmentShimmer(judgment: Judgment): boolean {
  return judgment !== 'bad' && judgment !== 'miss';
}

const JUDGMENT_POP_SCALE: Record<Judgment, number> = {
  perfect: 1.18,
  great: 1.08,
  good: 1,
  bad: 1,
  miss: 1,
};

export function getJudgmentPopScale(judgment: Judgment): number {
  return JUDGMENT_POP_SCALE[judgment];
}

// 뒤의 빛은 PERFECT·GREAT 에만 공기처럼 옅게 남긴다.
const JUDGMENT_GLOW_MIN_INTENSITY = 0.75;

export function hasJudgmentGlow(judgment: Judgment): boolean {
  return getHitBloomIntensity(judgment) >= JUDGMENT_GLOW_MIN_INTENSITY;
}
