/// <reference path="../pb_data/types.d.ts" />
// PocketHost cannot change `serve --origins`, so cross-origin browser requests are rejected here,
// before the default CORS middleware (priority -1041) can attach allow headers. Requests without an
// Origin header pass: rules, auth and rate limits protect them. JSVM handlers cannot see the outer
// scope, so the allow list is read inside the handler on every request.
routerUse(
  new Middleware(
    (e) => {
      const origin = e.request.header.get('Origin');
      if (origin === '') {
        return e.next();
      }
      const allowedOrigins = $os
        .getenv('DAZBEAT_ALLOWED_ORIGINS')
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');
      const host = e.request.host;
      if (
        allowedOrigins.includes(origin) ||
        origin === `http://${host}` ||
        origin === `https://${host}`
      ) {
        return e.next();
      }
      return e.json(403, {
        status: 403,
        code: 'origin_not_allowed',
        message: 'Requests from this origin are not allowed.',
      });
    },
    -1100,
    'dazbeatOrigins',
  ),
);
