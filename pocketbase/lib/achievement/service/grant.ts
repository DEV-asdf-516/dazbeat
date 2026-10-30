import type { AchievementId } from '../../../../src/data/achievements.js';
import type { Zodiac } from '../../../../src/data/songs.js';
import { requireDefined } from '../../../../src/invariant.js';
import { EARNED_CHART_MARKS, PLAY_RESULTS } from '../../../../src/pbCollections.js';
import type {
  Difficulty,
  FinishedGameplayResult,
  LaneCount,
} from '../../../../src/rhythm/types.js';
import type { JsvmApp, JsvmRuntime, TransactionalApp } from '../../jsvm.js';
import type { AutoplayCheck } from '../../session/service/verify.js';
import type { ProfileAchievements, StoredMark, UserAchievements } from '../dto.js';
import {
  readEarnedState,
  readAchievements,
  readAlbumNames,
  readPublishedSongs,
  readMarks,
  saveRecord,
  saveUserAchievements,
} from '../repository.js';
import { evaluateAchievements, getPlayMarks } from './evaluate.js';

export function recordVerifiedPlay(
  runtime: JsvmRuntime,
  tx: JsvmApp,
  play: {
    readonly userId: string;
    readonly sessionId: string;
    readonly song: {
      readonly id: string;
      readonly constellation: Zodiac;
      /** 이 트랜잭션에서 읽은 곡의 현재 공개 여부. */
      readonly isPublished: boolean;
    };
    readonly chart: {
      readonly id: string;
      readonly difficulty: Difficulty;
      readonly laneCount: LaneCount;
      /** 이 트랜잭션에서 읽은 채보의 현재 revision. */
      readonly currentRevision: string;
    };
    // 소비한 세션의 revision 이다. 증거는 실제로 검증한 채보만 증명해야 해서 scores 의 현재 revision 을 쓰지 않는다.
    readonly sessionChartRevision: string;
    readonly result: FinishedGameplayResult;
    readonly autoplayCheck: AutoplayCheck;
  },
): readonly AchievementId[] {
  const { userId, song, chart, sessionChartRevision, result, autoplayCheck } = play;
  saveRecord(runtime, tx, PLAY_RESULTS.name, {
    user: userId,
    session: play.sessionId,
    song: song.id,
    chart: chart.id,
    difficulty: chart.difficulty,
    laneCount: chart.laneCount,
    chartRevision: sessionChartRevision,
    constellation: song.constellation,
    score: result.score,
    accuracy: result.accuracy,
    maxCombo: result.maxCombo,
    counts: result.counts,
    cleared: result.cleared,
    autoplayCheck: autoplayCheck.kind,
    autoplayReasons: autoplayCheck.reasons,
    inputStats: autoplayCheck.stats,
  });
  const marks = readMarks(runtime, tx, userId);
  const existingKinds = new Set(
    marks
      .filter(
        (mark) =>
          mark.chart === chart.id &&
          mark.chartRevision === sessionChartRevision &&
          mark.constellation === song.constellation,
      )
      .map((mark) => mark.kind),
  );
  const playMarks = getPlayMarks(result)
    .filter((kind) => !existingKinds.has(kind))
    .map((kind) => {
      const stored = {
        kind,
        song: song.id,
        difficulty: chart.difficulty,
        chart: chart.id,
        chartRevision: sessionChartRevision,
        constellation: song.constellation,
      };
      saveRecord(runtime, tx, EARNED_CHART_MARKS.name, {
        ...stored,
        user: userId,
        source: 'play',
      });
      return {
        ...stored,
        isCurrent: sessionChartRevision === chart.currentRevision && song.isPublished,
      };
    });
  return saveUserAchievements(
    runtime,
    tx,
    userId,
    evaluateUserAchievements(runtime, tx, userId, [...marks, ...playMarks]),
  ).newAchievements;
}

// 소급된 기록이나 콘텐츠 변경으로 새로 증명된 업적을 조회 때 지급해, 돌려준 업적에 방금 쓴 것이
// 항상 반영된다. 대부분의 조회는 지급할 것이 없으므로, 새 것이 있을 때만 쓰기 트랜잭션을 잡고
// 그 안에서 다시 평가한다.
export function grantUserAchievements(
  runtime: JsvmRuntime,
  app: TransactionalApp,
  userId: string,
): UserAchievements {
  const evaluated = evaluateUserAchievements(runtime, app, userId, readMarks(runtime, app, userId));
  if (evaluated.newSongMarks.length === 0 && evaluated.newAchievements.length === 0) {
    return evaluated;
  }
  let granted = evaluated;
  app.runInTransaction((tx) => {
    granted = saveUserAchievements(
      runtime,
      tx,
      userId,
      evaluateUserAchievements(runtime, tx, userId, readMarks(runtime, tx, userId)),
    );
  });
  return granted;
}

export function loadProfileAchievements(
  runtime: JsvmRuntime,
  app: TransactionalApp,
  userId: string,
  featuredKey: string,
): ProfileAchievements {
  const { stats, newAchievements, progress, earnedAtMsById, achievements } = grantUserAchievements(
    runtime,
    app,
    userId,
  );
  const byKey = new Map(
    achievements.map((achievement) => [achievement.definition.id, achievement]),
  );
  return {
    stats,
    newAchievements,
    progress: progress.map(({ id, current, target }) => ({
      achievement: requireDefined(byKey.get(id), 'Evaluated achievement is not loaded', id),
      earnedAtMs: earnedAtMsById.get(id) ?? null,
      current,
      target,
    })),
    retired: achievements.filter(({ definition }) => definition.isRetired),
    // 지워졌거나 무효가 된 대표 업적은 장착 없음으로 본다.
    featured: byKey.get(featuredKey) ?? null,
    albumNames: readAlbumNames(runtime, app),
  };
}

function evaluateUserAchievements(
  runtime: JsvmRuntime,
  app: JsvmApp,
  userId: string,
  marks: readonly StoredMark[],
): UserAchievements {
  const { playCount, songMarks, earnedAtMsById } = readEarnedState(runtime, app, userId);
  const achievements = readAchievements(runtime, app);
  const evaluation = evaluateAchievements({
    playCount,
    marks,
    songMarks,
    earned: new Set(earnedAtMsById.keys()),
    publishedSongs: readPublishedSongs(runtime, app),
    definitions: achievements.map(({ definition }) => definition),
  });
  return {
    ...evaluation,
    earnedAtMsById,
    achievements,
  };
}
