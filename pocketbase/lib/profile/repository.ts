import type { AchievementId } from '../../../src/data/achievements.js';
import { EARNED_ACHIEVEMENTS, USERS } from '../../../src/pbCollections.js';
import { column } from '../../../src/pbSql.js';
import { selectRow, selectRows } from '../jsvm.js';
import type { DbApp, JsvmRuntime } from '../jsvm.js';

type QueryRuntime = Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'>;

export function hasEarnedAchievement(
  runtime: QueryRuntime,
  app: DbApp,
  userId: string,
  achievementId: AchievementId,
): boolean {
  // (user, achievement) 유니크 인덱스라 개수는 0 아니면 1 이다.
  const { total } = selectRow(
    runtime,
    { total: 'int' },
    app
      .db()
      .select('COUNT(*) AS total')
      .from(EARNED_ACHIEVEMENTS.name)
      .where(
        runtime.dbx.hashExp({
          [column(EARNED_ACHIEVEMENTS, 'user')]: userId,
          [column(EARNED_ACHIEVEMENTS, 'achievement')]: achievementId,
        }),
      ),
  );
  return total > 0;
}

export function isNicknameTaken(
  runtime: QueryRuntime,
  app: DbApp,
  nickname: string,
  userId: string,
): boolean {
  const { dbx } = runtime;
  // NOCASE 는 ASCII 만 접는데, 닉네임에서 대소문자가 있는 글자는 ASCII 영문뿐이다. 저장 여부는 유니크 인덱스가 판정한다.
  const { total } = selectRow(
    runtime,
    { total: 'int' },
    app
      .db()
      .select('COUNT(*) AS total')
      .from(USERS.name)
      .where(dbx.exp(`${column(USERS, 'nickname')} = {:nickname} COLLATE NOCASE`, { nickname }))
      .andWhere(dbx.not(dbx.hashExp({ [column(USERS, 'id')]: userId }))),
  );
  return total > 0;
}

export function readTakenNicknames(
  runtime: QueryRuntime,
  app: DbApp,
  candidates: readonly string[],
): ReadonlySet<string> {
  const takenRows = selectRows(
    runtime,
    { nickname: 'text' },
    app
      .db()
      .select(column(USERS, 'nickname'))
      .from(USERS.name)
      .where(runtime.dbx.in(column(USERS, 'nickname'), ...candidates)),
  );
  return new Set(takenRows.map((row) => row.nickname));
}

// 자릿수가 같은 숫자 문자열이라 닉네임 순서가 곧 번호 순서다.
export function readNumberedNicknames(
  runtime: QueryRuntime,
  app: DbApp,
  prefix: string,
  digits: number,
): string[] {
  return selectRows(
    runtime,
    { nickname: 'text' },
    app
      .db()
      .select(column(USERS, 'nickname'))
      .from(USERS.name)
      .where(
        runtime.dbx.exp(`${column(USERS, 'nickname')} GLOB {:pattern}`, {
          pattern: `${prefix}${'[0-9]'.repeat(digits)}`,
        }),
      )
      .orderBy(column(USERS, 'nickname')),
  ).map(({ nickname }) => nickname);
}
