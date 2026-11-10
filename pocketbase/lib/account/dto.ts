import { HTTP_STATUS } from '../../../src/httpStatus.js';

export type AccountRejectionCode =
  | 'rejoin_block_unavailable'
  | 'account_identity_missing'
  | 'account_not_found'
  | 'account_rejoin_blocked'
  | 'external_auth_locked';

export const ACCOUNT_REJECTIONS: Record<AccountRejectionCode, { status: number; message: string }> =
  {
    rejoin_block_unavailable: {
      status: HTTP_STATUS.serviceUnavailable,
      message: 'The rejoin block list is not available.',
    },
    account_identity_missing: {
      status: HTTP_STATUS.conflict,
      message: 'The account has no linked Google identity.',
    },
    account_not_found: {
      status: HTTP_STATUS.notFound,
      message: 'The account does not exist.',
    },
    account_rejoin_blocked: {
      status: HTTP_STATUS.forbidden,
      message: 'This Google account was deleted and cannot sign up again.',
    },
    external_auth_locked: {
      status: HTTP_STATUS.forbidden,
      message: 'Linked sign-in accounts cannot be removed.',
    },
  };

const MIN_REJOIN_BLOCK_KEY_LENGTH = 32;

export interface RejoinBlockKeys {
  readonly current: string;
  readonly retired: readonly string[];
}

export class InvalidRejoinBlockKeysError extends Error {
  override readonly name = 'InvalidRejoinBlockKeysError';
  readonly code = 'rejoin_block_unavailable';

  constructor() {
    super(ACCOUNT_REJECTIONS.rejoin_block_unavailable.message);
  }
}

export function parseRejoinBlockKeys(currentText: string, retiredText: string): RejoinBlockKeys {
  const current = currentText.trim();
  const retired = retiredText
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key !== '');
  if ([current, ...retired].some((key) => key.length < MIN_REJOIN_BLOCK_KEY_LENGTH)) {
    throw new InvalidRejoinBlockKeysError();
  }
  return {
    current,
    retired,
  };
}
