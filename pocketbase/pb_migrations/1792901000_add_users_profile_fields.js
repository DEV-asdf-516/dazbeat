/// <reference path="../pb_data/types.d.ts" />
// nickname 과 featuredAchievement 는 정규화, 중복 검사, 소유 확인을 하는 /api/dazbeat/profile
// 라우트로만 바뀌므로 기본 users API 로는 설정도 변경도 할 수 없다.
const USERS_CREATE_INVARIANT =
  '@request.body.nickname:isset = false && @request.body.featuredAchievement:isset = false';
const USERS_UPDATE_INVARIANT =
  '@request.body.nickname:changed = false && @request.body.featuredAchievement:changed = false';
const NICKNAME_INDEX = 'idx_users_nickname_nocase';
// 마이그레이션은 스냅샷이라 profileRequest.ts 를 import 할 수 없어 기본 닉네임 규칙을 여기 복사한다.
// 접두사에 쓰이지 않은 숫자를 붙이고, 모든 값이 찼을 때만 자릿수를 하나 늘린다.
const DEFAULT_NICKNAME_PREFIX = '과즙이';
const DEFAULT_NICKNAME_MIN_DIGITS = 4;
const DEFAULT_NICKNAME_MAX_DIGITS = 13;

function pickDefaultNickname(used) {
  for (
    let digits = DEFAULT_NICKNAME_MIN_DIGITS;
    digits <= DEFAULT_NICKNAME_MAX_DIGITS;
    digits += 1
  ) {
    const pattern = new RegExp(`^${DEFAULT_NICKNAME_PREFIX}(\\d{${digits}})$`);
    const usedNumbers = [];
    used.forEach((nickname) => {
      const match = pattern.exec(nickname);
      if (match !== null) {
        usedNumbers.push(Number(match[1]));
      }
    });
    usedNumbers.sort((a, b) => a - b);
    const freeCount = Math.pow(10, digits) - usedNumbers.length;
    if (freeCount > 0) {
      let value = Math.floor(Math.random() * freeCount);
      usedNumbers.forEach((usedNumber) => {
        if (usedNumber <= value) {
          value += 1;
        }
      });
      return `${DEFAULT_NICKNAME_PREFIX}${String(value).padStart(digits, '0')}`;
    }
  }
  throw new Error('No default nickname is left');
}

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
    users.fields.add(new TextField({ name: 'nickname' }));
    users.fields.add(new TextField({ name: 'featuredAchievement' }));
    app.save(users);

    const used = new Set();
    app.findAllRecords('users').forEach((user) => {
      const nickname = pickDefaultNickname(used);
      used.add(nickname);
      user.set('nickname', nickname);
      app.save(user);
    });

    users.fields.getByName('nickname').required = true;
    users.addIndex(NICKNAME_INDEX, true, 'nickname COLLATE NOCASE', '');
    users.createRule = appendInvariant(users.createRule, USERS_CREATE_INVARIANT);
    users.updateRule = appendInvariant(users.updateRule, USERS_UPDATE_INVARIANT);
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.createRule = removeInvariant(users.createRule, USERS_CREATE_INVARIANT);
    users.updateRule = removeInvariant(users.updateRule, USERS_UPDATE_INVARIANT);
    users.removeIndex(NICKNAME_INDEX);
    users.fields.removeByName('nickname');
    users.fields.removeByName('featuredAchievement');
    app.save(users);
  },
);
