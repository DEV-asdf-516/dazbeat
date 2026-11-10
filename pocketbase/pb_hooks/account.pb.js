/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'DELETE',
  '/api/dazbeat/account',
  (e) => {
    const { parseRejoinBlockKeys, InvalidRejoinBlockKeysError, ACCOUNT_REJECTIONS } = require(
      `${__hooks}/lib/account/dto.cjs`,
    );
    const { deleteAccount } = require(`${__hooks}/lib/account/service.cjs`);
    const { HTTP_STATUS } = require(`${__hooks}/lib/pbQuery.cjs`);
    const reject = (code) =>
      e.json(ACCOUNT_REJECTIONS[code].status, {
        status: ACCOUNT_REJECTIONS[code].status,
        code,
        message: ACCOUNT_REJECTIONS[code].message,
      });

    let keys;
    try {
      keys = parseRejoinBlockKeys(
        $os.getenv('DAZBEAT_REJOIN_BLOCK_HMAC_KEY'),
        $os.getenv('DAZBEAT_REJOIN_BLOCK_HMAC_RETIRED_KEYS'),
      );
    } catch (error) {
      if (error instanceof InvalidRejoinBlockKeysError) {
        return reject(error.code);
      }
      throw error;
    }
    const deletion = deleteAccount(
      { Record, DynamicModel, arrayOf, dbx: $dbx, security: $security },
      e.app,
      keys,
      e.auth.id,
    );
    if (deletion.kind === 'rejected') {
      return reject(deletion.code);
    }
    return e.noContent(HTTP_STATUS.noContent);
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096),
);

// 기존 로그인, 이메일로 기존 계정에 연결, 신규 가입 모두 이 확인을 지난다. 확인과 e.next() 를 한
// 트랜잭션에 두어 계정 삭제와 끼어들지 못하게 한다.
onRecordAuthWithOAuth2Request((e) => {
  const { parseRejoinBlockKeys, InvalidRejoinBlockKeysError, ACCOUNT_REJECTIONS } = require(
    `${__hooks}/lib/account/dto.cjs`,
  );
  const { checkRejoin } = require(`${__hooks}/lib/account/service.cjs`);
  const reject = (code) =>
    e.json(ACCOUNT_REJECTIONS[code].status, {
      status: ACCOUNT_REJECTIONS[code].status,
      code,
      message: ACCOUNT_REJECTIONS[code].message,
    });

  let keys;
  try {
    keys = parseRejoinBlockKeys(
      $os.getenv('DAZBEAT_REJOIN_BLOCK_HMAC_KEY'),
      $os.getenv('DAZBEAT_REJOIN_BLOCK_HMAC_RETIRED_KEYS'),
    );
  } catch (error) {
    if (error instanceof InvalidRejoinBlockKeysError) {
      return reject(error.code);
    }
    throw error;
  }
  let check;
  e.app.runInTransaction((txApp) => {
    check = checkRejoin({ DynamicModel, arrayOf, dbx: $dbx, security: $security }, txApp, keys, {
      provider: e.providerName,
      providerId: e.oAuth2User.id,
    });
    if (check.kind !== 'allowed') {
      return;
    }
    e.app = txApp;
    e.next();
  });
  if (check.kind === 'rejected') {
    return reject(check.code);
  }
}, 'users');

// 연결을 풀면 그 Google 계정을 차단 이력 없이 다른 계정에 붙일 수 있다. 사용자 삭제 때의 연결 정리는
// 요청 훅을 거치지 않는다.
onRecordDeleteRequest((e) => {
  if (e.hasSuperuserAuth()) {
    e.next();
    return;
  }
  const { ACCOUNT_REJECTIONS } = require(`${__hooks}/lib/account/dto.cjs`);
  const { status, message } = ACCOUNT_REJECTIONS.external_auth_locked;
  return e.json(status, { status, code: 'external_auth_locked', message });
}, '_externalAuths');
