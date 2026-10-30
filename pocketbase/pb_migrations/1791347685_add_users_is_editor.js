/// <reference path="../pb_data/types.d.ts" />
// isEditor 는 superuser 만 부여하므로 사용자는 가입 때 설정할 수도, 나중에 바꿀 수도 없다.
const USERS_CREATE_INVARIANT = '@request.body.isEditor:isset = false';
const USERS_UPDATE_INVARIANT = '@request.body.isEditor:changed = false';
const CHARTS_EDITOR_RULE = '@request.auth.id != "" && @request.auth.isEditor = true';

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
    users.fields.add(new BoolField({ name: 'isEditor' }));
    users.createRule = appendInvariant(users.createRule, USERS_CREATE_INVARIANT);
    users.updateRule = appendInvariant(users.updateRule, USERS_UPDATE_INVARIANT);
    app.save(users);

    const charts = app.findCollectionByNameOrId('charts');
    charts.createRule = CHARTS_EDITOR_RULE;
    charts.updateRule = CHARTS_EDITOR_RULE;
    app.save(charts);
  },
  (app) => {
    const charts = app.findCollectionByNameOrId('charts');
    charts.createRule = null;
    charts.updateRule = null;
    app.save(charts);

    const users = app.findCollectionByNameOrId('users');
    users.createRule = removeInvariant(users.createRule, USERS_CREATE_INVARIANT);
    users.updateRule = removeInvariant(users.updateRule, USERS_UPDATE_INVARIANT);
    users.fields.removeByName('isEditor');
    app.save(users);
  },
);
