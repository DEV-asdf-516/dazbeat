/// <reference path="../pb_data/types.d.ts" />
// Lets an operator see which header carries the real client IP behind PocketHost, so the trusted
// proxy setting can be configured before the IP-based rate limits are enabled.
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
