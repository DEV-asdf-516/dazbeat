import type { AchievementId } from '../../../../src/data/achievements.js';
import { requireDefined } from '../../../../src/invariant.js';
import type { FinishedGameplayResult } from '../../../../src/rhythm/types.js';
import { recordVerifiedPlay } from '../../achievement/service/grant.js';
import type { JsvmRuntime, DbApp, TransactionalApp } from '../../jsvm.js';
import { SessionRejectedError } from '../dto.js';
import {
  deletePlaySessions,
  readBestScore,
  readCurrentChart,
  readOwnSession,
  saveBestScore,
} from '../repository.js';
import type { AutoplayCheck } from './verify.js';

/**
 * 제출 입력을 검증하기 전에 세션을 한 트랜잭션에서 읽고 소비해, 같은 세션을 동시에 제출해도 하나만
 * 검증까지 간다. 세션의 채보와 곡도 같은 쿼리로 가져온다.
 */
export function consumePlaySession(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>,
  app: { runInTransaction(run: (tx: DbApp) => void): void },
  sessionId: string,
  userId: string,
) {
  let played = undefined as ReturnType<typeof readOwnSession> | undefined;
  app.runInTransaction((tx) => {
    played = readOwnSession(runtime, tx, sessionId, userId);
    if (played !== undefined) {
      deletePlaySessions(runtime, tx, { id: sessionId });
    }
  });
  if (played === undefined) {
    throw new SessionRejectedError('session_not_found');
  }
  return played;
}

/** 제출 입력을 검증하는 사이 채보가 지워졌으면 거절한다. */
function loadCurrentChart(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>,
  tx: DbApp,
  chartId: string,
) {
  const chart = readCurrentChart(runtime, tx, chartId);
  if (chart === undefined) {
    throw new SessionRejectedError('chart_not_found');
  }
  return chart;
}

export function recordPlayResult(
  runtime: JsvmRuntime,
  app: TransactionalApp,
  play: {
    readonly userId: string;
    readonly sessionId: string;
    readonly played: ReturnType<typeof consumePlaySession>;
    readonly result: FinishedGameplayResult;
    readonly autoplayCheck: AutoplayCheck;
  },
): { readonly bestScore: number; readonly newAchievements: readonly AchievementId[] } {
  const { userId, sessionId, played, result, autoplayCheck } = play;
  let recorded: { bestScore: number; newAchievements: readonly AchievementId[] } | undefined;
  app.runInTransaction((tx) => {
    // 최고 점수는 이 트랜잭션에서 읽은 제출 시점의 현재 채보 revision 으로 순위에 올려,
    // 스냅샷으로 통과한 플레이가 현재 랭킹에 보이게 한다.
    // 곡 공개 여부도 같은 시점에 읽어, 플레이 중 비공개로 바뀐 곡의 증거를 현재 증거에서 뺀다.
    const { revision: currentRevision, isPublished } = loadCurrentChart(runtime, tx, played.chart);
    const key = {
      user: userId,
      chart: played.chart,
      chartRevision: currentRevision,
    };
    const best = readBestScore(tx, key);
    if (best === null || result.score > best) {
      saveBestScore(runtime, tx, key, result);
    }
    recorded = {
      bestScore: best === null ? result.score : Math.max(best, result.score),
      // 최고 점수 트랜잭션 안에서 기록해, 최고 점수를 넘지 못한 경우에도 검증된 플레이는
      // 전부 기록되거나 전혀 기록되지 않는다.
      newAchievements: recordVerifiedPlay(runtime, tx, {
        userId,
        sessionId,
        song: {
          id: played.song,
          constellation: played.constellation,
          isPublished,
        },
        chart: {
          id: played.chart,
          difficulty: played.difficulty,
          laneCount: played.laneCount,
          currentRevision,
        },
        sessionChartRevision: played.chartRevision,
        result,
        autoplayCheck,
      }),
    };
  });
  return requireDefined(recorded, 'Play result transaction did not record', sessionId);
}
