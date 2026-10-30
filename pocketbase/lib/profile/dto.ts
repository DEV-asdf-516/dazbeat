import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  parseNickname,
} from '../../../src/data/nickname.js';
import type { Nickname } from '../../../src/data/nickname.js';
import { HTTP_STATUS } from '../../../src/httpStatus.js';
import { isRecord, isString } from '../../../src/typeGuards.js';

type ProfileRejectionCode = 'invalid_request' | 'invalid_nickname' | 'achievement_not_earned';

export const PROFILE_REJECTIONS: Record<ProfileRejectionCode, { status: number }> = {
  invalid_request: { status: HTTP_STATUS.badRequest },
  invalid_nickname: { status: HTTP_STATUS.badRequest },
  achievement_not_earned: { status: HTTP_STATUS.badRequest },
};

export class InvalidProfileRequestError extends Error {
  override readonly name = 'InvalidProfileRequestError';

  constructor(
    readonly code: 'invalid_request',
    message: string,
  ) {
    super(message);
  }
}

export class InvalidProfileFieldError extends Error {
  override readonly name = 'InvalidProfileFieldError';

  constructor(
    readonly field: 'nickname' | 'featuredAchievement',
    readonly code: 'invalid_nickname' | 'achievement_not_earned',
    message: string,
  ) {
    super(message);
  }
}

export function parseNicknameRequest(body: unknown): Nickname {
  if (!isRecord(body) || !isString(body.nickname)) {
    throw new InvalidProfileRequestError('invalid_request', 'nickname must be a string.');
  }
  return parseNicknameField(body.nickname);
}

export function parseNicknameField(value: string): Nickname {
  const nickname = parseNickname(value);
  if (nickname === undefined) {
    throw new InvalidProfileFieldError(
      'nickname',
      'invalid_nickname',
      `A nickname must be ${NICKNAME_MIN_LENGTH} to ${NICKNAME_MAX_LENGTH} letters, digits, Hangul syllables, _ or -.`,
    );
  }
  return nickname;
}
