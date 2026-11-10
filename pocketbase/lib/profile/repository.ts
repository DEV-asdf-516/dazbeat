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
  // 닉네임 유니크 인덱스가 NOCASE 라 비교도 NOCASE 여야 인덱스로 찾는다. NOCASE 는 ASCII 만 접는데,
  // 닉네임에서 대소문자가 있는 글자는 ASCII 영문뿐이다. 저장 여부는 유니크 인덱스가 판정한다.
  const { total } = selectRow(
    runtime,
    { total: 'int' },
    app
      .db()
      .select('COUNT(*) AS total')
      .from(USERS.name)
      .where(dbx.exp(`${column(USERS, 'nickname')} COLLATE NOCASE = {:nickname}`, { nickname }))
      .andWhere(dbx.not(dbx.hashExp({ [column(USERS, 'id')]: userId }))),
  );
  return total > 0;
}

export function readTakenNicknames(
  runtime: QueryRuntime,
  app: DbApp,
  candidates: readonly string[],
): ReadonlySet<string> {
  const params = Object.fromEntries(
    candidates.map((nickname, index) => [`candidate${index}`, nickname]),
  );
  const takenRows = selectRows(
    runtime,
    { nickname: 'text' },
    app
      .db()
      .select(column(USERS, 'nickname'))
      .from(USERS.name)
      .where(
        runtime.dbx.exp(
          `${column(USERS, 'nickname')} COLLATE NOCASE IN (${Object.keys(params)
            .map((name) => `{:${name}}`)
            .join(', ')})`,
          params,
        ),
      ),
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
  const nicknameColumn = column(USERS, 'nickname');
  // GLOB 은 NOCASE 인덱스를 쓰지 못해, 같은 자릿수 번호의 범위로 인덱스를 좁힌 뒤 GLOB 으로 거른다.
  // 정렬도 NOCASE 여야 인덱스 순서로 읽는다. 거른 행은 접두어가 같고 뒤가 숫자뿐이라 순서는 BINARY 와 같다.
  return selectRows(
    runtime,
    { nickname: 'text' },
    app
      .db()
      .select(nicknameColumn)
      .from(USERS.name)
      .where(
        runtime.dbx.exp(
          `${nicknameColumn} COLLATE NOCASE BETWEEN {:lowest} AND {:highest} AND ${nicknameColumn} GLOB {:pattern}`,
          {
            lowest: `${prefix}${'0'.repeat(digits)}`,
            highest: `${prefix}${'9'.repeat(digits)}`,
            pattern: `${prefix}${'[0-9]'.repeat(digits)}`,
          },
        ),
      )
      // dbx 는 orderBy 문자열을 열 이름 하나로 인용하므로 [[ ]] 로 열만 감싼다.
      .orderBy(`[[${nicknameColumn}]] COLLATE NOCASE`),
  ).map(({ nickname }) => nickname);
}
