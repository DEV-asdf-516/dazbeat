import { requireDefined } from '../../../src/invariant.js';
import type { DbApp, JsvmRuntime, JsvmSecurity, TransactionalApp } from '../jsvm.js';
import type { RejoinBlockKeys } from './dto.js';
import {
  deleteUser,
  hasUnknownKeyRows,
  isIdentityBlocked,
  readGoogleProviderId,
  findUserRecord,
  saveDeletedIdentity,
} from './repository.js';

const KEY_ID_TEXT = 'dazbeat:rejoin-block-key-id';
const GOOGLE_PROVIDER = 'google';

type CheckRuntime = Pick<JsvmRuntime, 'DynamicModel' | 'arrayOf' | 'dbx'> & {
  readonly security: JsvmSecurity;
};
type DeletionRuntime = CheckRuntime & Pick<JsvmRuntime, 'Record'>;

export type AccountDeletion =
  | { readonly kind: 'deleted' }
  | {
      readonly kind: 'rejected';
      readonly code: 'rejoin_block_unavailable' | 'account_identity_missing' | 'account_not_found';
    };

export type RejoinCheck =
  | { readonly kind: 'allowed' }
  | {
      readonly kind: 'rejected';
      readonly code:
        'rejoin_block_unavailable' | 'account_identity_missing' | 'account_rejoin_blocked';
    };

function keyIdOf(security: JsvmSecurity, key: string): string {
  return security.hs256(KEY_ID_TEXT, key);
}

// 설정에 없는 키로 만든 행은 차단 여부를 확인할 수 없으므로, 그런 행이 있으면 차단 목록 전체를 쓸 수 없다고 본다.
function hasUnknownKeys(runtime: CheckRuntime, app: DbApp, keys: RejoinBlockKeys): boolean {
  return hasUnknownKeyRows(
    runtime,
    app,
    [keys.current, ...keys.retired].map((key) => keyIdOf(runtime.security, key)),
  );
}

export function deleteAccount(
  runtime: DeletionRuntime,
  app: TransactionalApp,
  keys: RejoinBlockKeys,
  userId: string,
): AccountDeletion {
  let deletion: AccountDeletion | undefined;
  app.runInTransaction((tx) => {
    // 사용자와 연결을 트랜잭션 안에서 다시 읽어야 동시 중복 삭제가 account_not_found 로 끝나고 OAuth 확인과 직렬화된다.
    if (hasUnknownKeys(runtime, tx, keys)) {
      deletion = {
        kind: 'rejected',
        code: 'rejoin_block_unavailable',
      };
      return;
    }
    const user = findUserRecord(tx, userId);
    if (user === undefined) {
      deletion = {
        kind: 'rejected',
        code: 'account_not_found',
      };
      return;
    }
    const providerId = readGoogleProviderId(runtime, tx, userId);
    if (providerId === undefined) {
      deletion = {
        kind: 'rejected',
        code: 'account_identity_missing',
      };
      return;
    }
    saveDeletedIdentity(runtime, tx, {
      provider: GOOGLE_PROVIDER,
      identityDigest: runtime.security.hs256(`${GOOGLE_PROVIDER}:${providerId}`, keys.current),
      keyId: keyIdOf(runtime.security, keys.current),
    });
    // 종속 기록과 외부 인증 연결은 PocketBase cascade 가 같은 트랜잭션에서 지운다.
    deleteUser(tx, user);
    deletion = { kind: 'deleted' };
  });
  return requireDefined(deletion, 'Account deletion transaction did not decide', userId);
}

// 트랜잭션은 e.next() 를 함께 묶는 훅이 연다. 확인과 가입이 한 트랜잭션이어야 삭제와 끼어들지 않는다.
export function checkRejoin(
  runtime: CheckRuntime,
  tx: DbApp,
  keys: RejoinBlockKeys,
  identity: { readonly provider: string; readonly providerId: string },
): RejoinCheck {
  if (hasUnknownKeys(runtime, tx, keys)) {
    return {
      kind: 'rejected',
      code: 'rejoin_block_unavailable',
    };
  }
  if (identity.providerId === '') {
    return {
      kind: 'rejected',
      code: 'account_identity_missing',
    };
  }
  const digests = [keys.current, ...keys.retired].map((key) =>
    runtime.security.hs256(`${identity.provider}:${identity.providerId}`, key),
  );
  if (isIdentityBlocked(runtime, tx, identity.provider, digests)) {
    return {
      kind: 'rejected',
      code: 'account_rejoin_blocked',
    };
  }
  return { kind: 'allowed' };
}
