/// <reference path="../pb_data/types.d.ts" />
// Google OAuth2 클라이언트는 DB 에만 있어 새 로컬 데이터 폴더에는 없다. 마이그레이션은 한 번만,
// 그것도 변수가 설정되기 전에 돌 수 있어 대신 시작할 때마다 실행한다. 변수가 없으면(PocketHost)
// 대시보드 설정을 건드리지 않는다.
onBootstrap((e) => {
  e.next();
  const clientId = $os.getenv('DAZBEAT_GOOGLE_CLIENT_ID');
  const clientSecret = $os.getenv('DAZBEAT_GOOGLE_CLIENT_SECRET');
  if (clientId === '' || clientSecret === '') {
    return;
  }
  const users = e.app.findCollectionByNameOrId('users');
  const current = users.oauth2.providers.find((provider) => provider.name === 'google');
  if (
    current !== undefined &&
    current.clientId === clientId &&
    current.clientSecret === clientSecret
  ) {
    return;
  }

  unmarshal({ oauth2: { providers: [{ name: 'google', clientId, clientSecret }] } }, users);
  e.app.save(users);
});
