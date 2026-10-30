import { describe, expect, it } from 'vitest';
import { pickDefaultNickname } from '../../../pocketbase/lib/profile/service.js';
import type { DbApp, DbxExpression, JsvmRuntime } from '../../../pocketbase/lib/jsvm.js';
import { isString } from '../../../src/typeGuards.js';

const PREFIX = '과즙이';
const ALL_FOUR_DIGITS = Array.from({ length: 10_000 }, (_, index) => index);

// 대역 쿼리는 where 에 넘긴 식만 보고 답한다. 후보 묶음 조회는 in 의 값, 자릿수별 사용 번호 조회는 GLOB pattern 파라미터다.
interface FakeExpression {
  readonly values?: readonly string[];
  readonly params?: Readonly<Record<string, unknown>> | undefined;
}

const fake = (expression: FakeExpression) => expression as unknown as DbxExpression;

const runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'> = {
  // 대역 쿼리가 행을 직접 넣으므로 모델 모양은 쓰지 않는다.
  DynamicModel: class {} as unknown as JsvmRuntime['DynamicModel'],
  arrayOf: () => [],
  dbx: {
    exp: (_sql, params) => fake({ params }),
    hashExp: (params) => fake({ params }),
    not: (expression) => expression,
    in: (_column, ...values) => fake({ values }),
  },
};

function nicknamesOf(digits: number, numbers: readonly number[]): string[] {
  return numbers.map((number) => `${PREFIX}${String(number).padStart(digits, '0')}`);
}

function usersWith(nicknames: readonly string[]): DbApp {
  const taken = new Set(nicknames);
  const queryWhere = (where: FakeExpression | null) => {
    const query = {
      from: () => query,
      where: (expression: DbxExpression) => queryWhere(expression as unknown as FakeExpression),
      orderBy: () => query,
      all: (rows: object[]) => {
        if (where?.values !== undefined) {
          where.values
            .filter((nickname) => taken.has(nickname))
            .forEach((nickname) => rows.push({ nickname }));
          return;
        }
        const pattern = where?.params?.['pattern'];
        if (!isString(pattern)) {
          throw new Error('Unexpected users query');
        }
        const digits = pattern.split('[0-9]').length - 1;
        const numbered = new RegExp(`^${PREFIX}\\d{${digits}}$`);
        nicknames
          .filter((nickname) => numbered.test(nickname))
          .sort()
          .forEach((nickname) => rows.push({ nickname }));
      },
    };
    return query;
  };
  return {
    db: () => ({
      select: () => queryWhere(null),
      delete: () => ({ execute: () => undefined }),
    }),
  } as unknown as DbApp;
}

describe('pickDefaultNickname', () => {
  it('picks four digits for the first user', () => {
    expect(pickDefaultNickname(runtime, usersWith([]), () => 4_829)).toBe(`${PREFIX}4829`);
  });

  it('draws again when a random value is taken', () => {
    const draws = [0, 1, 2];
    const users = usersWith(nicknamesOf(4, [0, 1]));
    expect(pickDefaultNickname(runtime, users, () => draws.shift() ?? 0)).toBe(`${PREFIX}0002`);
  });

  it('picks among the unused four-digit values once random draws keep colliding', () => {
    const users = usersWith(
      nicknamesOf(
        4,
        ALL_FOUR_DIGITS.filter((number) => number !== 7_777 && number !== 8_888),
      ),
    );
    expect(pickDefaultNickname(runtime, users, () => 0)).toBe(`${PREFIX}7777`);
    expect(
      pickDefaultNickname(runtime, users, (maxExclusive) => (maxExclusive === 2 ? 1 : 0)),
    ).toBe(`${PREFIX}8888`);
  });

  it('moves to five digits only once every four-digit value is used', () => {
    const users = usersWith([...nicknamesOf(4, ALL_FOUR_DIGITS), ...nicknamesOf(5, [0])]);
    expect(pickDefaultNickname(runtime, users, () => 0)).toBe(`${PREFIX}00001`);
  });
});
