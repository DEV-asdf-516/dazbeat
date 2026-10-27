import { isString } from '../typeGuards.js';

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 16;
const NICKNAME_CHARACTERS = /^[A-Za-z0-9_\-가-힣ㄱ-ㅎㅏ-ㅣ]*$/;

declare const nicknameBrand: unique symbol;
// parseNickname 을 거친 문자열만 이 타입이 되어, 받는 쪽이 다시 검사하지 않는다.
export type Nickname = string & { readonly [nicknameBrand]: true };

export function parseNickname(input: string): Nickname | undefined {
  const nickname = input.normalize('NFC').trim();
  const length = Array.from(nickname).length;
  return length >= NICKNAME_MIN_LENGTH &&
    length <= NICKNAME_MAX_LENGTH &&
    NICKNAME_CHARACTERS.test(nickname)
    ? (nickname as Nickname)
    : undefined;
}

export function isNickname(value: unknown): value is Nickname {
  return isString(value) && parseNickname(value) === value;
}
