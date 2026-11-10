import type { AchievementId } from '../../../../src/data/achievements.js';
import type { PlayReview } from '../../../../src/data/ranking.js';
import { requireDefined } from '../../../../src/invariant.js';
import type { FinishedGameplayResult } from '../../../../src/rhythm/types.js';
import type { JsvmRuntime, DbApp, TransactionalApp } from '../../jsvm.js';
import { readUserRank } from '../../ranking/repository.js';
import type { ReviewStatus } from '../../review/dto.js';
import { savePlayResult } from '../../review/repository.js';
import { applyApprovedPlay } from '../../review/service/approve.js';
import { deletePlaySessions, readCurrentChart, readOwnSession } from '../repository.js';
import type { AutoplayCheck } from './verify.js';

type PlayedSession = NonNullable<ReturnType<typeof readOwnSession>>;

export type SessionConsumption =
  { readonly kind: 'consumed'; readonly played: PlayedSession } | { readonly kind: 'notFound' };

/**
 * 제출 입력을 검증하기 전에 세션을 한 트랜잭션에서 읽고 소비해, 같은 세션을 동시에 제출해도 하나만
 * 검증까지 간다. 세션의 채보와 곡도 같은 쿼리로 가져온다.
 */
export function consumePlaySession(
  runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>,
  app: { runInTransaction(run: (tx: DbApp) => void): void },
  sessionId: string,
  userId: string,
): SessionConsumption {
  let played = undefined as ReturnType<typeof readOwnSession> | undefined;
  app.runInTransaction((tx) => {
    played = readOwnSession(runtime, tx, sessionId, userId);
    if (played !== undefined) {
      deletePlaySessions(runtime, tx, { id: sessionId });
    }
  });
  return played === undefined
    ? { kind: 'notFound' }
    : {
        kind: 'consumed',
        played,
      };
}

export type PlayRecording =
  | {
      readonly kind: 'recorded';
      readonly review: PlayReview;
      readonly newAchievements: readonly AchievementId[];
    }
  | { readonly kind: 'chartNotFound' };

export function recordPlayResult(
  runtime: JsvmRuntime,
  app: TransactionalApp,
  play: {
    readonly userId: string;
    readonly sessionId: string;
    readonly played: PlayedSession;
    readonly result: FinishedGameplayResult;
    readonly autoplayCheck: AutoplayCheck;
    readonly nowMs: number;
  },
): PlayRecording {
  const { userId, sessionId, played, result, autoplayCheck, nowMs } = play;
  let recorded: PlayRecording | undefined;
  app.runInTransaction((tx) => {
    // 곡 공개 여부와 채보의 현재 revision 을 같은 시점에 읽어, 플레이 중 비공개로 바뀌었거나 수정된
    // 채보의 기록을 현재 순위와 현재 증거에서 뺀다.
    const current = readCurrentChart(runtime, tx, played.current.chart);
    // 제출 입력을 검증하는 사이 채보가 지워졌으면 거절한다.
    if (current === undefined) {
      recorded = { kind: 'chartNotFound' };
      return;
    }
    const reviewStatus: ReviewStatus = autoplayCheck.kind === 'suspicious' ? 'pending' : 'approved';
    // 랭킹·업적은 실제로 검증한 채보에 귀속해야 해서 세션의 revision 을 쓴다.
    const chartRevision = played.verification.chartRevision;
    savePlayResult(runtime, tx, {
      user: userId,
      session: sessionId,
      song: played.current.song,
      chart: played.current.chart,
      difficulty: played.current.difficulty,
      laneCount: played.current.laneCount,
      chartRevision,
      constellation: played.current.constellation,
      score: result.score,
      accuracy: result.accuracy,
      maxCombo: result.maxCombo,
      counts: result.counts,
      cleared: result.cleared,
      autoplayCheck: autoplayCheck.kind,
      autoplayReasons: autoplayCheck.reasons,
      inputStats: autoplayCheck.stats,
      reviewStatus,
      achievedAtMs: nowMs,
    });
    if (reviewStatus === 'pending') {
      recorded = {
        kind: 'recorded',
        review: { kind: 'pending' },
        newAchievements: [],
      };
      return;
    }
    // 플레이 기록과 같은 트랜잭션에서 반영해, 검증된 플레이는 전부 기록되거나 전혀 기록되지 않는다.
    const { isNewBest, newAchievements } = applyApprovedPlay(runtime, tx, {
      userId,
      chart: {
        id: played.current.chart,
        difficulty: played.current.difficulty,
        laneCount: played.current.laneCount,
        current,
      },
      song: {
        id: played.current.song,
        constellation: played.current.constellation,
      },
      chartRevision,
      result,
      achievedAtMs: nowMs,
    });
    // 수정 전 revision 이나 비공개 곡의 기록은 지금 보이는 순위가 없다.
    const ranking =
      chartRevision === current.revision && current.isPublished
        ? {
            rank: requireDefined(
              readUserRank(
                runtime,
                tx,
                {
                  chart: played.current.chart,
                  chartRevision,
                },
                userId,
              ),
              'Approved play has no best score',
              sessionId,
            ).rank,
            isNewBest,
          }
        : null;
    recorded = {
      kind: 'recorded',
      review: {
        kind: 'approved',
        ranking,
      },
      newAchievements,
    };
  });
  return requireDefined(recorded, 'Play result transaction did not record', sessionId);
}
