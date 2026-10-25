/// <reference path="../pb_data/types.d.ts" />
// PocketHost cannot change `serve --origins`, so cross-origin browser requests are rejected here,
// before the default CORS middleware (priority -1041) can attach allow headers. The allow list is
// read on every request because JSVM handlers cannot see the outer scope.
routerUse(
  new Middleware(
    (e) => {
      const { isOriginAllowed } = require(`${__hooks}/lib/originPolicy.cjs`);
      if (
        isOriginAllowed(
          e.request.header.get('Origin'),
          e.request.host,
          $os.getenv('DAZBEAT_ALLOWED_ORIGINS'),
        )
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
