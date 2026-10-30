/// <reference path="../pb_data/types.d.ts" />
// PocketHost 뒤에서 실제 클라이언트 IP 가 어느 헤더에 실리는지 운영자가 확인하게 해,
// IP 기반 rate limit 을 켜기 전에 trusted proxy 설정을 맞출 수 있게 한다.
routerAdd(
  'GET',
  '/api/dazbeat/diagnostics/client-ip',
  (e) => {
    const header = (name) => e.request.header.get(name);
    return e.json(200, {
      remoteIP: e.remoteIP(),
      realIP: e.realIP(),
      headers: {
        'X-Forwarded-For': header('X-Forwarded-For'),
        'X-Real-IP': header('X-Real-IP'),
        'CF-Connecting-IP': header('CF-Connecting-IP'),
        'X-PocketHost-Client-IP': header('X-PocketHost-Client-IP'),
      },
    });
  },
  $apis.requireSuperuserAuth(),
);
