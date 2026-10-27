/// <reference path="../pb_data/types.d.ts" />
// Every account gets a non-identifying nickname before it is saved, whether it signs in with
// Google for the first time or a superuser creates it.
onRecordCreate((e) => {
  if (e.record.getString('nickname') !== '') {
    e.next();
    return;
  }
  const { pickDefaultNickname } = require(`${__hooks}/lib/profileRequest.cjs`);
  // PocketBase writes through a single connection, so picking and inserting in one transaction
  // makes concurrent sign-ups take turns instead of picking the same free number.
  e.app.runInTransaction((txApp) => {
    e.record.set(
      'nickname',
      pickDefaultNickname({ DynamicModel, arrayOf }, txApp, (maxExclusive) =>
        Math.floor(Math.random() * maxExclusive),
      ),
    );
    e.app = txApp;
    e.next();
  });
}, 'users');
