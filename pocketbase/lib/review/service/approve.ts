import type { AchievementId } from '../../../../src/data/achievements.js';
import type { Zodiac } from '../../../../src/data/songs.js';
import type {
  Difficulty,
  FinishedGameplayResult,
  LaneCount,
} from '../../../../src/rhythm/types.js';
import { recordApprovedPlay } from '../../achievement/service/grant.js';
import type { JsvmApp, JsvmRuntime } from '../../jsvm.js';
import { findScoreRecord, parseScoreRecord, saveBestScore } from '../../session/repository.js';

export interface ApprovedPlay {
  readonly userId: string;
  readonly chart: {
    readonly id: string;
    readonly difficulty: Difficulty;
    readonly laneCount: LaneCount;
    /** 채보가 지워졌으면 null. */
    readonly current: { readonly revision: string; readonly isPublished: boolean } | null;
  };
  readonly song: {
    readonly id: string;
    readonly constellation: Zodiac;
  };
  readonly chartRevision: string;
  readonly result: Pick<
    FinishedGameplayResult,
    'score' | 'accuracy' | 'maxCombo' | 'counts' | 'cleared'
  >;
  readonly achievedAtMs: number;
}

/** 호출자가 연 트랜잭션 안에서, 플레이의 자기 revision 에만 최고 점수와 도장, 업적을 반영한다. */
export function applyApprovedPlay(
  runtime: JsvmRuntime,
  tx: JsvmApp,
  play: ApprovedPlay,
): { readonly isNewBest: boolean; readonly newAchievements: readonly AchievementId[] } {
  const { userId, chart, chartRevision, result } = play;
  let isNewBest = false;
  // 지워진 채보는 scores 의 relation 대상이 없어 최고 점수를 남기지 않는다.
  if (chart.current !== null) {
    const key = {
      user: userId,
      chart: chart.id,
      chartRevision,
    };
    const bestRecord = findScoreRecord(tx, key);
    if (bestRecord === undefined || result.score > parseScoreRecord(bestRecord)) {
      saveBestScore(
        runtime,
        tx,
        {
          key,
          record: bestRecord,
        },
        result,
        play.achievedAtMs,
      );
      isNewBest = true;
    }
  }
  return {
    isNewBest,
    newAchievements: recordApprovedPlay(runtime, tx, {
      userId,
      song: play.song,
      chart: {
        id: chart.id,
        difficulty: chart.difficulty,
        current: chart.current,
      },
      chartRevision,
      // 승인 대상은 끝까지 마친 플레이만 저장된다.
      result: {
        ...result,
        outcome: 'finished',
      },
    }),
  };
}
