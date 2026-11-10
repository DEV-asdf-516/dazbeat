import type { AchievementId } from '../../../../src/data/achievements.js';
import type { Zodiac } from '../../../../src/data/songs.js';
import { requireDefined } from '../../../../src/invariant.js';
import { EARNED_CHART_MARKS } from '../../../../src/pbCollections.js';
import type { Difficulty, FinishedGameplayResult } from '../../../../src/rhythm/types.js';
import type { JsvmApp, JsvmRuntime, TransactionalApp } from '../../jsvm.js';
import type { ProfileAchievements, StoredMark, UserAchievements } from '../dto.js';
import {
  readEarnedState,
  readAchievements,
  readAlbums,
  readPublishedSongs,
  readMarks,
  saveRecord,
  saveUserAchievements,
} from '../repository.js';
import { evaluateAchievements, getPlayMarks } from './evaluate.js';

export function recordApprovedPlay(
  runtime: JsvmRuntime,
  tx: JsvmApp,
  play: {
    readonly userId: string;
    readonly song: {
      readonly id: string;
      readonly constellation: Zodiac;
    };
    readonly chart: {
      readonly id: string;
      readonly difficulty: Difficulty;
      /** 이 트랜잭션에서 읽은 채보의 현재 revision 과 곡 공개 여부. 채보가 지워졌으면 null. */
      readonly current: { readonly revision: string; readonly isPublished: boolean } | null;
    };
    // 증거는 실제로 검증한 채보만 증명해야 해서 채보의 현재 revision 이 아니라 플레이의 revision 을 쓴다.
    readonly chartRevision: string;
    readonly result: FinishedGameplayResult;
  },
): readonly AchievementId[] {
  const { userId, song, chart, chartRevision, result } = play;
  const marks = readMarks(runtime, tx, userId);
  const existingKinds = new Set(
    marks
      .filter(
        (mark) =>
          mark.chart === chart.id &&
          mark.chartRevision === chartRevision &&
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
        chartRevision,
        constellation: song.constellation,
      };
      saveRecord(runtime, tx, EARNED_CHART_MARKS.name, {
        ...stored,
        user: userId,
        source: 'play',
      });
      return {
        ...stored,
        isCurrent:
          chart.current !== null &&
          chartRevision === chart.current.revision &&
          chart.current.isPublished,
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
    albums: readAlbums(runtime, app),
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
