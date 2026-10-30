import { describe, expect, it } from 'vitest';
import { parseNicknameRequest } from '../../../pocketbase/lib/profile/dto.js';

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
