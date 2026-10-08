import type { CelestialSequenceStep } from '../celestial/celestialCatalog.js';

export type FinishAnchor = 'node' | 'rank' | 'jacket' | 'score';

export interface FinishCue {
  readonly step: CelestialSequenceStep;
  readonly anchor: FinishAnchor;
  readonly playAtMs: number;
  readonly isNodeIgnite: boolean;
}

export const RESULT_NODE_ID = 'R18';
const SCORE_SHIMMER_ID = 'R40';

/** 점수 카운트업이 끝나는 시각에 score-shimmer 가 오도록 constellation-finish 재생 계획을 만든다. */
export function planResultFinish(
  isCleared: boolean,
  steps: readonly CelestialSequenceStep[],
  scoreSettledAtMs: number,
): readonly FinishCue[] {
  if (!isCleared) {
    return [];
  }
  const scoreShimmer = steps.find((step) => step.presentationId === SCORE_SHIMMER_ID);
  if (scoreShimmer === undefined) {
    throw new Error(`constellation-finish has no ${SCORE_SHIMMER_ID} step`);
  }
  const finishStartMs = scoreSettledAtMs - scoreShimmer.startMs;
  return steps.map((step) => ({
    step,
    anchor: getFinishAnchor(step.presentationId),
    playAtMs: finishStartMs + step.startMs,
    // ignite 와 정적 node 가 동시에 그려지지 않도록 정적 node 는 ignite 가 끝나야 보인다.
    isNodeIgnite: step.presentationId === RESULT_NODE_ID,
  }));
}

function getFinishAnchor(presentationId: string): FinishAnchor {
  switch (presentationId) {
    case RESULT_NODE_ID:
    case 'R42':
      return 'node';
    case 'R39':
      return 'rank';
    case 'R41':
      return 'jacket';
    case SCORE_SHIMMER_ID:
      return 'score';
    default:
      throw new Error(`Unexpected constellation-finish step: ${presentationId}`);
  }
}
