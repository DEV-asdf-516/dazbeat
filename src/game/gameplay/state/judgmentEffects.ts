import type { Judgment, JudgmentEvent } from '../../../rhythm/types.js';
import type { CelestialAtlasId } from '../../celestial/state/celestialCatalog.js';
import type { SoundEffect } from '../../ui/view/soundEffects.js';
import { MOTION } from '../../ui/view/theme.js';

export const LANE_EFFECT_IDS = [
  'R32',
  'R33',
  'R34',
  'R35',
  'R36',
] as const satisfies readonly CelestialAtlasId[];
export type LaneEffectId = (typeof LANE_EFFECT_IDS)[number];

export const JUDGMENT_SHIMMER_ID = 'R38' satisfies CelestialAtlasId;

export interface JudgmentEffect {
  readonly intensity: number;
  readonly popScale: number;
  readonly hasHitBloom: boolean;
  readonly hasGlow: boolean;
  readonly hasShimmer: boolean;
  readonly sound: SoundEffect | null;
  readonly hitEffectIds: readonly LaneEffectId[];
  readonly anchorFlash: { readonly alpha: number; readonly recoverMs: number } | null;
  readonly hasMissShade: boolean;
}

const ANCHOR_GOOD_FLASH = {
  alpha: 0.6,
  recoverMs: MOTION.fastMs,
} as const;

const JUDGMENT_EFFECTS: Record<Judgment, JudgmentEffect> = {
  perfect: {
    intensity: 1,
    popScale: 1.18,
    hasHitBloom: true,
    // 뒤의 빛은 PERFECT·GREAT 에만 공기처럼 옅게 남긴다.
    hasGlow: true,
    hasShimmer: true,
    // 레인을 칠 때마다 타격음이 나므로 PERFECT·GREAT 는 판정음을 더하지 않는다.
    sound: null,
    // 배열 순서가 재생 순서다.
    hitEffectIds: ['R34', 'R35', 'R36'],
    anchorFlash: null,
    hasMissShade: false,
  },
  great: {
    intensity: 0.75,
    popScale: 1.08,
    hasHitBloom: true,
    hasGlow: true,
    hasShimmer: true,
    sound: null,
    hitEffectIds: ['R34', 'R35'],
    anchorFlash: null,
    hasMissShade: false,
  },
  good: {
    intensity: 0.45,
    popScale: 1,
    hasHitBloom: true,
    hasGlow: false,
    hasShimmer: true,
    sound: 'judgeGood',
    hitEffectIds: ['R34'],
    anchorFlash: ANCHOR_GOOD_FLASH,
    hasMissShade: false,
  },
  bad: {
    intensity: 0,
    popScale: 1,
    hasHitBloom: false,
    hasGlow: false,
    hasShimmer: false,
    sound: 'judgeBad',
    hitEffectIds: [],
    anchorFlash: ANCHOR_GOOD_FLASH,
    hasMissShade: false,
  },
  miss: {
    intensity: 0,
    popScale: 1,
    hasHitBloom: false,
    hasGlow: false,
    hasShimmer: false,
    sound: 'judgeMiss',
    hitEffectIds: [],
    anchorFlash: {
      alpha: 0,
      recoverMs: 320,
    },
    hasMissShade: true,
  },
};

// 한 프레임 묶음에서는 마지막 판정 하나만 글자로 보인다.
export function getShownJudgment(events: readonly JudgmentEvent[]): JudgmentEvent | undefined {
  return events.at(-1);
}

export function getJudgmentEffect(judgment: Judgment): JudgmentEffect {
  return JUDGMENT_EFFECTS[judgment];
}

// 반환 순서가 재생 순서다.
export function getLaneEffectIds(
  event: Pick<JudgmentEvent, 'kind' | 'judgment'>,
): readonly LaneEffectId[] {
  const { kind, judgment } = event;
  const ids = [...JUDGMENT_EFFECTS[judgment].hitEffectIds];
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

export function getJudgmentSoundEffect(
  event: Pick<JudgmentEvent, 'kind' | 'judgment'>,
): SoundEffect | null {
  return event.kind === 'holdEnd' ? null : JUDGMENT_EFFECTS[event.judgment].sound;
}
