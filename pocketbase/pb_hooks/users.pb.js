/// <reference path="../pb_data/types.d.ts" />
// Google 로 처음 로그인하든 superuser 가 만들든, 모든 계정은 저장 전에 개인을 알 수 없는
// 닉네임을 받는다.
onRecordCreate((e) => {
  if (e.record.getString('nickname') !== '') {
    e.next();
    return;
  }
  const { pickDefaultNickname } = require(`${__hooks}/lib/profile/service.cjs`);
  // PocketBase 는 단일 연결로 쓰므로, 고르기와 삽입을 한 트랜잭션에서 하면 동시 가입이 같은 빈
  // 번호를 고르지 않고 차례를 기다린다.
  e.app.runInTransaction((txApp) => {
    e.record.set(
      'nickname',
      pickDefaultNickname({ Record, DynamicModel, arrayOf, dbx: $dbx }, txApp, (maxExclusive) =>
        Math.floor(Math.random() * maxExclusive),
      ),
    );
    e.app = txApp;
    e.next();
  });
}, 'users');

onRecordUpdateRequest((e) => {
  // 기본 update 는 요청 시점에 읽은 레코드 전체를 저장해, 같은 사용자의 다른 필드 동시 저장이 서로를
  // 옛 값으로 되돌린다. 바뀐 필드만 저장해 이를 막는다. 같은 필드끼리의 동시 저장은 나중 저장이 이기고,
  // 늦은 응답에는 다른 필드의 옛 값이 담길 수 있다(사용자 결정).
  e.record.ignoreUnchangedFields(true);
  if (e.hasSuperuserAuth()) {
    e.next();
    return;
  }
  const { parseNicknameField, InvalidProfileFieldError } = require(
    `${__hooks}/lib/profile/dto.cjs`,
  );
  const { loadFeaturedAchievement } = require(`${__hooks}/lib/profile/service.cjs`);
  const original = e.record.original();
  const changed = (field) => e.record.getString(field) !== original.getString(field);

  try {
    if (changed('nickname')) {
      e.record.set('nickname', parseNicknameField(e.record.getString('nickname')));
    }
    if (changed('featuredAchievement')) {
      const featured = loadFeaturedAchievement(
        { Record, DynamicModel, arrayOf, dbx: $dbx },
        e.app,
        e.record.id,
        e.record.getString('featuredAchievement'),
      );
      e.record.set('featuredAchievement', featured ?? '');
    }
  } catch (error) {
    if (error instanceof InvalidProfileFieldError) {
      throw new BadRequestError(error.message, {
        [error.field]: new ValidationError(error.code, error.message),
      });
    }
    throw error;
  }

  e.next();
}, 'users');
