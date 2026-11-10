/// <reference path="../pb_data/types.d.ts" />
// 계정 삭제는 재가입 차단 행을 남기는 /api/dazbeat/account 로만 하고, 가입은 차단 목록을 확인하는
// Google OAuth 로만 한다. 표준 users 삭제와 직접 가입은 차단 목록을 우회하므로 닫는다.
const USERS_DELETE_RULE = 'id = @request.auth.id';
const USERS_CREATE_INVARIANT = '@request.context = "oauth2"';

// JSVM 은 null 이 아닌 규칙을 JS 문자열이 아니라 문자열 래퍼 객체로 넘긴다.
function readRule(rule) {
  return rule === null ? null : String(rule);
}

function appendInvariant(rule, invariant) {
  const current = readRule(rule);
  if (current === null) {
    return null;
  }
  if (current === '') {
    return invariant;
  }
  return `(${current}) && ${invariant}`;
}

function removeInvariant(rule, invariant) {
  const current = readRule(rule);
  if (current === null) {
    return null;
  }
  if (current === invariant) {
    return '';
  }
  const suffix = `) && ${invariant}`;
  if (current.startsWith('(') && current.endsWith(suffix)) {
    return current.slice(1, -suffix.length);
  }
  throw new Error(`Cannot remove "${invariant}" from users rule: ${current}`);
}

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const deleteRule = readRule(users.deleteRule);
    // 예상과 다른 규칙을 추측해 바꾸면 운영자가 정한 삭제 권한을 모르고 덮어쓴다.
    if (deleteRule !== USERS_DELETE_RULE) {
      throw new Error(`Unexpected users delete rule: ${deleteRule}`);
    }
    users.deleteRule = null;
    users.createRule = appendInvariant(users.createRule, USERS_CREATE_INVARIANT);
    app.save(users);

    // superuser 와 서버 훅만 다룬다.
    const deletedAccountIdentities = new Collection({
      type: 'base',
      name: 'deleted_account_identities',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'provider', type: 'text', required: true },
        { name: 'identityDigest', type: 'text', required: true },
        { name: 'keyId', type: 'text', required: true },
        { name: 'deletedAt', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_deleted_account_identities_identity ON deleted_account_identities (provider, identityDigest)',
        'CREATE INDEX idx_deleted_account_identities_key ON deleted_account_identities (keyId)',
      ],
    });
    app.save(deletedAccountIdentities);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('deleted_account_identities'));

    const users = app.findCollectionByNameOrId('users');
    users.createRule = removeInvariant(users.createRule, USERS_CREATE_INVARIANT);
    const deleteRule = readRule(users.deleteRule);
    if (deleteRule !== null) {
      throw new Error(`Unexpected users delete rule: ${deleteRule}`);
    }
    users.deleteRule = USERS_DELETE_RULE;
    app.save(users);
  },
);
