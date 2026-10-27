/// <reference path="../pb_data/types.d.ts" />
// nickname and featuredAchievement change only through the /api/dazbeat/profile routes, which
// normalize, check duplicates and check ownership, so the plain users API can neither set nor change them.
const USERS_CREATE_INVARIANT =
  '@request.body.nickname:isset = false && @request.body.featuredAchievement:isset = false';
const USERS_UPDATE_INVARIANT =
  '@request.body.nickname:changed = false && @request.body.featuredAchievement:changed = false';
const NICKNAME_INDEX = 'idx_users_nickname_nocase';
// Migrations are snapshots and cannot import profileRequest.ts, so the default nickname rule is
// copied here: the prefix plus unused digits, with one more digit only once every value is taken.
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

// JSVM hands non-null rules over as string wrapper objects, not JS strings.
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
