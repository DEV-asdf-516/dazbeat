/// <reference path="../pb_data/types.d.ts" />
// 닉네임과 대표 업적은 이제 기본 users API 로 바뀐다. 형식·획득 검사는 users 업데이트 요청 훅이,
// 닉네임 중복은 idx_users_nickname_nocase 가 맡으므로 두 필드의 직접 변경 금지 조건만 뗀다.
const USERS_UPDATE_INVARIANT =
  '@request.body.nickname:changed = false && @request.body.featuredAchievement:changed = false';

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

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const current = readRule(users.updateRule);
    const suffix = `) && ${USERS_UPDATE_INVARIANT}`;
    // null 이나 조건만 있는 규칙을 추측해 고치면 관리자 전용 규칙이 열리거나 공개 규칙이 될 수 있다.
    if (current === null || !current.startsWith('(') || !current.endsWith(suffix)) {
      throw new Error(`Cannot remove "${USERS_UPDATE_INVARIANT}" from users rule: ${current}`);
    }
    users.updateRule = current.slice(1, -suffix.length);
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.updateRule = appendInvariant(users.updateRule, USERS_UPDATE_INVARIANT);
    app.save(users);
  },
);
