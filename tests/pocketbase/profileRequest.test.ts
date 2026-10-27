import { describe, expect, it } from 'vitest';
import {
  parseFeaturedRequest,
  parseNicknameRequest,
  pickDefaultNickname,
} from '../../pocketbase/verification/profileRequest.js';
import type { JsvmRuntime } from '../../pocketbase/verification/jsvm.js';

const PREFIX = '과즙이';
const ALL_FOUR_DIGITS = Array.from({ length: 10_000 }, (_, index) => index);

const runtime: Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf'> = {
  // 대역 쿼리가 행을 직접 넣으므로 모델 모양은 쓰지 않는다.
  DynamicModel: class {} as unknown as JsvmRuntime['DynamicModel'],
  arrayOf: () => [],
};

function nicknamesOf(digits: number, numbers: readonly number[]): string[] {
  return numbers.map((number) => `${PREFIX}${String(number).padStart(digits, '0')}`);
}

// users 테이블 대역: 닉네임 조회는 nickname 파라미터, 후보 묶음 조회는 users_nickname_0… 파라미터, 자릿수별 사용 번호 조회는 GLOB pattern 파라미터로 답한다.
function usersWith(nicknames: readonly string[]) {
  const taken = new Set(nicknames);
  return {
    db: () => ({
      newQuery: () => ({
        bind: (params: Readonly<Record<string, string>>) => ({
          all: (rows: object[]) => {
            if (params.nickname !== undefined) {
              if (taken.has(params.nickname)) {
                rows.push({ id: 'other' });
              }
              return;
            }
            const candidates = Object.entries(params).flatMap(([name, value]) =>
              /^users_nickname_\d+$/.test(name) ? [value] : [],
            );
            if (candidates.length > 0) {
              candidates
                .filter((nickname) => taken.has(nickname))
                .forEach((nickname) => rows.push({ nickname }));
              return;
            }
            const digits = (params.pattern ?? '').split('[0-9]').length - 1;
            const pattern = new RegExp(`^${PREFIX}\\d{${digits}}$`);
            nicknames
              .filter((nickname) => pattern.test(nickname))
              .sort()
              .forEach((nickname) => rows.push({ nickname }));
          },
        }),
      }),
    }),
  };
}

describe('parseNicknameRequest', () => {
  it.each([
    ['two characters', '가나', '가나'],
    ['sixteen characters', 'abcdefghij가나다라마바', 'abcdefghij가나다라마바'],
    ['surrounding spaces trimmed', '  Star_-9  ', 'Star_-9'],
    ['jamo only', 'ㄱㄴ', 'ㄱㄴ'],
    ['a decomposed syllable composed by NFC', '\u1100\u1161\u1102\u1161', '가나'],
  ])('accepts %s', (_case, nickname, expected) => {
    expect(parseNicknameRequest({ nickname })).toBe(expected);
  });

  it.each([
    ['one character', '가'],
    ['seventeen characters', 'abcdefghij가나다라마바사'],
    ['one character after trimming', ' a '],
    ['a space inside', 'a b'],
    ['a symbol outside _ and -', 'star!'],
  ])('rejects %s as an invalid nickname', (_case, nickname) => {
    expect(() => parseNicknameRequest({ nickname })).toThrow(
      expect.objectContaining({ code: 'invalid_nickname' }),
    );
  });

  it.each([
    ['a missing nickname', {}],
    ['a non-string nickname', { nickname: 42 }],
    ['a non-object body', 'nickname'],
    ['a null body', null],
  ])('rejects %s as a malformed request', (_case, body) => {
    expect(() => parseNicknameRequest(body)).toThrow(
      expect.objectContaining({ code: 'invalid_request' }),
    );
  });
});

describe('parseFeaturedRequest', () => {
  it('reads null as clearing the featured achievement', () => {
    expect(parseFeaturedRequest({ achievement: null })).toBeNull();
  });

  it('reads a catalog ID', () => {
    expect(parseFeaturedRequest({ achievement: 'FIRST_CLEAR' })).toBe('FIRST_CLEAR');
  });

  it.each([
    ['an unknown ID', { achievement: 'NOT_AN_ACHIEVEMENT' }],
    ['a missing achievement', {}],
    ['a non-string achievement', { achievement: 1 }],
    ['a non-object body', null],
  ])('rejects %s', (_case, body) => {
    expect(() => parseFeaturedRequest(body)).toThrow(
      expect.objectContaining({ code: 'invalid_request' }),
    );
  });
});

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
